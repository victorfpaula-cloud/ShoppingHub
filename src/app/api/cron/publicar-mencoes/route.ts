import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { publicarStoryNoInstagram } from "@/lib/metaMessaging";
import { BUCKET_MENCOES, tipoDeMidiaPorContentType, gerarThumbnailDeMencao } from "@/lib/mencoes";
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

  // Quantas vezes tenta sozinho antes de desistir e deixar em "erro" pra ação manual (botão de
  // "Tentar novamente" ou "Excluir" na Fila de Menções) — com o cron rodando de 5 em 5 minutos,
  // isso já cobre falha passageira (rede, instabilidade momentânea da Meta) sem martelar pra
  // sempre um item permanentemente quebrado (conta desativada, mídia inválida etc.).
  const MAX_TENTATIVAS_AUTOMATICAS = 3;

  // "Visibility timeout": uma menção em "publicando" só pode ser tentada de novo depois desse
  // prazo — bem mais generoso que qualquer publicação real (pior caso ~48s de vídeo, ver
  // PRAZO_MS_VIDEO abaixo), pra cobrir também a demora de a Vercel congelar/retomar a function.
  // Existe pra evitar publicar a MESMA Story duas vezes: sem isso, uma execução que desiste de
  // esperar uma menção (só localmente — a chamada real pra Meta pode continuar rodando sozinha,
  // ver comPrazo mais abaixo) deixava a menção livre pra ser pega de novo já na PRÓXIMA execução
  // do cron, 5 minutos depois — e se a tentativa antiga acabasse tendo sucesso mais tarde, as
  // duas publicavam de verdade (visto em produção em 06/09/2026, ~1h de intervalo entre as duas
  // publicações da mesma menção, embora só uma tenha ficado registrada no nosso relatório).
  const PRAZO_DE_SEGURANCA_MS = 10 * 60 * 1000;
  const limiteDeSeguranca = new Date(Date.now() - PRAZO_DE_SEGURANCA_MS).toISOString();

  // Itens presos em "publicando" há mais tempo que o prazo de segurança E que já esgotaram as
  // tentativas não devem ser reclamados de novo — a Meta provavelmente nunca respondeu (ou
  // respondeu e não temos como saber), então vira "erro" pra ação manual em vez de tentar pra
  // sempre.
  await admin
    .from("shoppinghub_mencoes")
    .update({ status: "erro" })
    .eq("status", "publicando")
    .gte("tentativas", MAX_TENTATIVAS_AUTOMATICAS)
    .lt("tentativa_iniciada_em", limiteDeSeguranca);

  // Duas buscas separadas (em vez de um único `.or()` com `and()` aninhado) — mais fácil de
  // revisar/confiar do que montar a string de filtro do PostgREST na mão pra algo que decide se a
  // gente publica ou não uma Story de novo.
  const colunas = "id, conta_id, loja_id, storage_path, instagram_username, tentativas, recebido_em";
  const [{ data: pendentes, error: erroPendentes }, { data: reclamaveis, error: erroReclamaveis }] =
    await Promise.all([
      admin.from("shoppinghub_mencoes").select(colunas).eq("status", "pendente").not("storage_path", "is", null),
      admin
        .from("shoppinghub_mencoes")
        .select(colunas)
        .eq("status", "publicando")
        .lt("tentativa_iniciada_em", limiteDeSeguranca)
        .not("storage_path", "is", null),
    ]);

  if (erroPendentes || erroReclamaveis) {
    console.error("Falha ao buscar menções pendentes:", erroPendentes ?? erroReclamaveis);
    return NextResponse.json(
      { ok: false, erro: (erroPendentes ?? erroReclamaveis)?.message },
      { status: 500 }
    );
  }

  const mencoesPendentes = [...(pendentes ?? []), ...(reclamaveis ?? [])].sort(
    (a, b) => new Date(a.recebido_em ?? 0).getTime() - new Date(b.recebido_em ?? 0).getTime()
  );

  const resultado = {
    publicadas: 0,
    falhas: 0,
    adiadas: 0,
    emDuvida: 0,
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

      // "Reivindica" a menção ANTES de chamar a Meta — marca como "publicando" com um guard que só
      // deixa passar se ainda estiver "pendente" (primeira tentativa) ou "publicando" mas já além
      // do prazo de segurança (reclamada de uma tentativa anterior que nunca confirmou o próprio
      // fim). Se 0 linhas forem afetadas, outra execução concorrente já pegou esse item primeiro —
      // pula sem contar como falha. Isso garante que NUNCA duas execuções chamem a Meta pra
      // publicar a mesma menção ao mesmo tempo (ver PRAZO_DE_SEGURANCA_MS acima).
      const tentativaAtual = mencao.tentativas + 1;
      const { data: reivindicada } = await admin
        .from("shoppinghub_mencoes")
        .update({ status: "publicando", tentativa_iniciada_em: new Date().toISOString(), tentativas: tentativaAtual })
        .eq("id", mencao.id)
        .in("status", ["pendente", "publicando"])
        .select("id")
        .maybeSingle();

      if (!reivindicada) continue;

      // Cancela as chamadas HTTP de verdade (não só a espera local) assim que o prazo estourar —
      // ver comentário em publicarStoryNoInstagram (metaMessaging.ts) sobre por que isso importa.
      const controleDeCancelamento = new AbortController();

      try {
        const storyMediaId = await comPrazo(
          chamarMetaParaPublicar(admin, mencao, controleDeCancelamento.signal),
          prazoDoItem,
          () => controleDeCancelamento.abort()
        );

        // A Meta já confirmou a publicação de verdade nesse ponto (storyMediaId em mãos) — daqui
        // pra frente NÃO pode mais ficar sujeito ao prazo do item nem ser abandonado. Antes,
        // gravar isso fazia parte da mesma corrida contra o prazo acima: se o item demorasse perto
        // do limite, o `comPrazo` desistia e seguia pro próximo da fila enquanto a gravação do
        // status "publicado" continuava rodando sozinha, sem ninguém esperar por ela — e se a
        // function da Vercel fosse congelada logo depois de responder (comum quando o prazo já
        // apertou), essa gravação nunca chegava a acontecer. A menção ficava presa em "publicando"
        // com a Story JÁ publicada de verdade, e a reivindicação seguinte (até 3x) publicava tudo
        // de novo — daí as duplicatas, terminando em "erro" mesmo já publicada. Ver
        // finalizarMencaoPublicada abaixo: com o storyMediaId em mãos, ela nunca deixa a menção
        // voltar pra "pendente"/"erro" (o que abriria brecha pra publicar de novo) — na pior das
        // hipóteses (Supabase fora do ar), loga como crítico e mantém "publicando" mesmo.
        await finalizarMencaoPublicada(admin, mencao, storyMediaId);
        resultado.publicadas += 1;
      } catch (erro) {
        console.error(`Falha ao publicar menção ${mencao.id}:`, erro);

        const foiNossoPrazoQueEstourou = erro instanceof Error && erro.message.startsWith("Excedeu o prazo de");

        if (foiNossoPrazoQueEstourou) {
          // Não sabemos com certeza se a chamada cancelada acima realmente parou a tempo do lado
          // da Meta ou não — por segurança, deixa em "publicando" (a tentativa já foi contada na
          // reivindicação acima) em vez de liberar pra tentar de novo imediatamente. Só volta a
          // ficar elegível depois do PRAZO_DE_SEGURANCA_MS, ou vira "erro" direto se essa já foi a
          // última tentativa permitida (ver limpeza no início da função).
          resultado.emDuvida += 1;
        } else {
          // Erro de verdade (não foi timeout nosso) — a Meta respondeu com uma falha real antes do
          // prazo, então é seguro liberar pra tentar de novo já.
          const novoStatus = tentativaAtual < MAX_TENTATIVAS_AUTOMATICAS ? "pendente" : "erro";
          await admin
            .from("shoppinghub_mencoes")
            .update({ status: novoStatus })
            .eq("id", mencao.id)
            .eq("status", "publicando");
          resultado.falhas += 1;
        }
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
function comPrazo<T>(promessa: Promise<T>, ms: number, aoEsgotar?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => {
      aoEsgotar?.();
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

// Só a chamada de verdade pra Meta — a única parte que pode ser cancelada com segurança se
// estourar o prazo do item (ver AbortController em processarFila acima). Nada aqui grava nada:
// se a Meta confirmar a publicação, quem grava é finalizarMencaoPublicada, fora dessa corrida.
async function chamarMetaParaPublicar(
  admin: ReturnType<typeof criarClienteAdmin>,
  mencao: {
    id: string;
    conta_id: string;
    loja_id: string;
    storage_path: string | null;
    instagram_username: string | null;
  },
  signal: AbortSignal
): Promise<string> {
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
    mencao.instagram_username,
    signal
  );

  console.log(
    `Menção ${mencao.id} publicada (storyMediaId ${storyMediaId}), username pra marcar: ${
      mencao.instagram_username ?? "(nenhum)"
    }`
  );

  return storyMediaId;
}

const TENTATIVAS_DE_GRAVACAO = 4;
const ESPERA_BASE_MS_GRAVACAO = 500;

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Roda DEPOIS que a Meta já confirmou a publicação (storyMediaId em mãos) — não recebe prazo nem
// AbortSignal de propósito, porque não há mais nada seguro pra cancelar aqui: cancelar a GRAVAÇÃO
// não desfaz a Story, só faria a gente esquecer que ela já foi publicada. Tenta algumas vezes
// (com pequena espera entre elas) antes de desistir, porque uma falha passageira do Supabase bem
// nessa hora era exatamente o que deixava a menção presa em "publicando" — daí a reivindicação
// seguinte publicava tudo de novo (duplicata) e, depois de esgotar as tentativas automáticas,
// sobrava marcada como "erro" mesmo já publicada de verdade no Instagram.
async function finalizarMencaoPublicada(
  admin: ReturnType<typeof criarClienteAdmin>,
  mencao: { id: string; storage_path: string | null },
  storyMediaId: string
): Promise<void> {
  let ultimoErro: unknown = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS_DE_GRAVACAO; tentativa++) {
    const { error } = await admin
      .from("shoppinghub_mencoes")
      .update({
        status: "publicado",
        publicado_em: new Date().toISOString(),
        story_media_id: storyMediaId,
      })
      .eq("id", mencao.id);

    if (!error) {
      ultimoErro = null;
      break;
    }

    ultimoErro = error;
    console.error(
      `Falha ao gravar status "publicado" da menção ${mencao.id} (tentativa ${tentativa}/${TENTATIVAS_DE_GRAVACAO}):`,
      error
    );
    if (tentativa < TENTATIVAS_DE_GRAVACAO) {
      await aguardar(ESPERA_BASE_MS_GRAVACAO * tentativa);
    }
  }

  if (ultimoErro) {
    // Situação crítica e rara (Supabase indisponível bem nesse instante): a Story já está no
    // Instagram, mas não conseguimos nem registrar isso. Loga bem alto pra alguém perceber e
    // corrigir manualmente, e para por aqui SEM tocar no status — deixar em "publicando" é mais
    // seguro do que devolver pra "pendente"/"erro", que deixaria a menção elegível pra ser
    // publicada de novo (e ela já foi, de verdade).
    console.error(
      `CRÍTICO: menção ${mencao.id} foi publicada na Meta (storyMediaId ${storyMediaId}) mas ` +
        `não foi possível gravar isso no banco após ${TENTATIVAS_DE_GRAVACAO} tentativas. ` +
        `Verificar e corrigir manualmente — NÃO republicar.`,
      ultimoErro
    );
    return;
  }

  // Só chega aqui com o status "publicado" já gravado — o resto (miniatura, limpeza do arquivo
  // grande) é auxiliar. Se falhar, a menção continua corretamente marcada como publicada, só sem
  // miniatura (mostra o ícone genérico na Fila).
  if (!mencao.storage_path) return;

  const thumbnailPath = await gerarThumbnailDeMencao(admin, mencao.id, mencao.storage_path);

  const { error: erroAoAtualizarThumb } = await admin
    .from("shoppinghub_mencoes")
    .update({ storage_path: null, thumbnail_path: thumbnailPath })
    .eq("id", mencao.id);

  if (erroAoAtualizarThumb) {
    console.error(`Falha ao gravar miniatura da menção ${mencao.id}:`, erroAoAtualizarThumb);
  }

  // Já publicou de verdade — não tem motivo pra continuar guardando o arquivo em tamanho real
  // aqui. O registro em shoppinghub_mencoes (loja, horário, status, miniatura pequena) já serve
  // de log/auditoria sem precisar acumular mídia grande no Storage.
  const { error: erroAoApagar } = await admin.storage.from(BUCKET_MENCOES).remove([mencao.storage_path]);

  if (erroAoApagar) {
    console.error(`Falha ao apagar mídia publicada (menção ${mencao.id}):`, erroAoApagar);
  }
}
