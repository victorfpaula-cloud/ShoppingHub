import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { publicarStoryNoInstagram } from "@/lib/metaMessaging";
import { BUCKET_MENCOES, tipoDeMidiaPorContentType } from "@/lib/mencoes";
import { limparMensagensAntigas } from "@/lib/retencao";
import { exportarRelatoriosDevidos } from "@/lib/relatorios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chamado de 5 em 5 minutos pelo GitHub Actions (ver .github/workflows/publicar-mencoes.yml) —
// não mais pelo cron da própria Vercel, que no plano Hobby só permite 1x por dia por schedule.
// Publica cada menção de Story pendente como Story da conta do shopping e grava o ID retornado,
// que depois serve pra rotear a resposta do cliente pra loja certa
// (src/app/api/webhook/instagram/route.ts, caso "reply_to.story.id").
//
// Protegido por CRON_SECRET, enviado como "Authorization: Bearer" pelo workflow do GitHub (guardado
// como Secret do repositório) — sem o valor certo, ninguém mais consegue disparar a publicação
// manualmente batendo na URL.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!cronSecret || autorizacao !== `Bearer ${cronSecret}`) {
    return new NextResponse("Não autorizado.", { status: 401 });
  }

  const admin = criarClienteAdmin();

  const { data: mencoesPendentes, error } = await admin
    .from("shoppinghub_mencoes")
    .select("id, conta_id, loja_id, storage_path, instagram_username, tentativas")
    .eq("status", "pendente")
    .not("storage_path", "is", null)
    .order("recebido_em", { ascending: true });

  if (error) {
    console.error("Falha ao buscar menções pendentes:", error);
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  const resultado = {
    publicadas: 0,
    falhas: 0,
    adiadas: 0,
    total: mencoesPendentes?.length ?? 0,
  };

  // Vídeo pode levar até ~40s só esperando a Meta processar (ver aguardarContainerPronto em
  // metaMessaging.ts) — um único item já pode consumir quase o orçamento inteiro sozinho, enquanto
  // imagem processa bem mais rápido (~12s no pior caso). Um limite ÚNICO pra "parar de pegar item
  // novo" não dá pra acertar pros dois casos: 45s deixava passar vídeo demais perto do limite
  // (Vercel Runtime Timeout visto em produção em 05/09/2026), e apertar demais esse limite pra
  // corrigir isso (10s) resolveu o timeout mas criou um problema novo, também visto na prática:
  // como QUALQUER item real (imagem inclusive) já passa de 10s sozinho, sobrava só o PRIMEIRO item
  // da fila por execução — o resto sempre ficava "adiado" mesmo sem nenhum erro.
  //
  // Calcula quanto cada item AINDA POR VIR provavelmente vai precisar (vídeo ou imagem) e só
  // começa se sobrar orçamento suficiente pra esse pior caso.
  const inicioDaExecucao = Date.now();
  const TEMPO_TOTAL_DISPONIVEL_MS = 55_000; // um pouco abaixo dos 60s da Vercel, sobra pra limpeza/exportação do final
  const PRAZO_MS_VIDEO = 48_000;
  const PRAZO_MS_IMAGEM = 15_000;

  // Quantas vezes tenta sozinho antes de desistir e deixar em "erro" pra ação manual (botão de
  // "Tentar novamente" ou "Excluir" na Fila de Menções) — com o cron rodando de 5 em 5 minutos,
  // isso já cobre falha passageira (rede, instabilidade momentânea da Meta) sem martelar pra
  // sempre um item permanentemente quebrado (conta desativada, mídia inválida etc.).
  const MAX_TENTATIVAS_AUTOMATICAS = 3;

  // Publica vários itens ao mesmo tempo em vez de um por um — a maior parte do tempo de um vídeo é
  // espera passiva pela Meta processar (I/O, não CPU nossa), então rodar 3 ao mesmo tempo não
  // demora perto de 3x mais, quase o mesmo tempo de rodar 1 só. Isso importa principalmente com uma
  // fila grande acumulada (relatado em 05/09/2026: fila enorme esvaziando devagar demais, 1 item
  // por execução) — sem concorrência, um vídeo sozinho já consome quase todo o orçamento de 60s da
  // Vercel, limitando a no máximo 1 vídeo "grande" por execução mesmo com várias pendentes.
  const CONCORRENCIA_MAXIMA = 3;
  const filaOrdenada = mencoesPendentes ?? [];
  let proximoIndice = 0;

  async function processarFila(): Promise<void> {
    while (proximoIndice < filaOrdenada.length) {
      const mencao = filaOrdenada[proximoIndice++];
      const prazoDoItem = mencao.storage_path?.endsWith(".mp4") ? PRAZO_MS_VIDEO : PRAZO_MS_IMAGEM;

      if (Date.now() - inicioDaExecucao + prazoDoItem > TEMPO_TOTAL_DISPONIVEL_MS) {
        resultado.adiadas += 1;
        continue;
      }

      try {
        await comPrazo(publicarMencao(admin, mencao), prazoDoItem);
        resultado.publicadas += 1;
      } catch (erro) {
        console.error(`Falha ao publicar menção ${mencao.id}:`, erro);
        const tentativas = mencao.tentativas + 1;
        const novoStatus = tentativas < MAX_TENTATIVAS_AUTOMATICAS ? "pendente" : "erro";
        await admin
          .from("shoppinghub_mencoes")
          .update({ status: novoStatus, tentativas })
          .eq("id", mencao.id);
        resultado.falhas += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA_MAXIMA, filaOrdenada.length) }, () => processarFila())
  );

  // Aproveita essa mesma chamada (já roda de 5 em 5 minutos) pra também limpar mensagens antigas
  // do histórico de atendimento e gerar a exportação mensal de relatórios — evita precisar de mais
  // um agendamento só pra isso.
  const mensagensApagadas = await limparMensagensAntigas(admin);
  const exportacoesGeradas = await exportarRelatoriosDevidos(admin);

  return NextResponse.json({ ok: true, ...resultado, mensagensApagadas, exportacoesGeradas });
}

// Corre em paralelo com a promessa recebida — quem terminar primeiro decide. Sem isso, um item
// travado (por exemplo a Meta nunca respondendo) ficaria preso até a própria Vercel matar a
// function inteira sem aviso (ver comentário acima, no início do arquivo); com isso, vira uma
// falha comum, tratada pelo catch do loop, com uma mensagem de erro clara.
function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => {
      reject(new Error(`Excedeu o prazo de ${ms}ms.`));
    }, ms);

    promessa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(temporizador);
        reject(erro);
      }
    );
  });
}

async function publicarMencao(
  admin: ReturnType<typeof criarClienteAdmin>,
  mencao: {
    id: string;
    conta_id: string;
    loja_id: string;
    storage_path: string | null;
    instagram_username: string | null;
  }
) {
  if (!mencao.storage_path) {
    throw new Error("Menção sem storage_path.");
  }

  const { data: conta, error: erroAoBuscarConta } = await admin
    .from("shoppinghub_contas")
    .select("instagram_user_id, access_token, active")
    .eq("id", mencao.conta_id)
    .maybeSingle();

  if (erroAoBuscarConta || !conta || !conta.active) {
    throw new Error("Conta do Instagram não encontrada ou pausada.");
  }

  const { data: urlPublica } = admin.storage.from(BUCKET_MENCOES).getPublicUrl(mencao.storage_path);

  const contentType = mencao.storage_path.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
  const tipoDeMidia = tipoDeMidiaPorContentType(contentType);

  const storyMediaId = await publicarStoryNoInstagram(
    conta.access_token,
    conta.instagram_user_id,
    urlPublica.publicUrl,
    tipoDeMidia,
    mencao.instagram_username
  );

  console.log(
    `Menção ${mencao.id} publicada (storyMediaId ${storyMediaId}), username pra marcar: ${
      mencao.instagram_username ?? "(nenhum)"
    }`
  );

  await admin
    .from("shoppinghub_mencoes")
    .update({
      status: "publicado",
      publicado_em: new Date().toISOString(),
      story_media_id: storyMediaId,
      storage_path: null,
    })
    .eq("id", mencao.id);

  // Já publicou de verdade (storyMediaId confirma que a Meta recebeu a mídia) — não tem motivo
  // pra continuar guardando o arquivo aqui. O registro em shoppinghub_mencoes (loja, horário,
  // status) já serve de log/auditoria sem precisar acumular mídia no Storage.
  const { error: erroAoApagar } = await admin.storage
    .from(BUCKET_MENCOES)
    .remove([mencao.storage_path]);

  if (erroAoApagar) {
    console.error(`Falha ao apagar mídia publicada (menção ${mencao.id}):`, erroAoApagar);
  }
}
