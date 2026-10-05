import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { publicarStoryNoInstagram, publicarNoFeedInstagram } from "@/lib/metaMessaging";
import { BUCKET_PUBLICACOES } from "@/lib/publicacoesConstantes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chamado de 5 em 5 minutos (mesmo gatilho externo do publicar-mencoes — ver
// .github/workflows/publicar-agendadas.yml) — publica no Instagram (Feed ou Story) toda
// publicação agendada cujo horário já chegou. Story tem período: depois de publicar com sucesso,
// reagenda o PRÓXIMO dia automaticamente (ver finalizarPublicacao), até o fim do período.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!cronSecret || autorizacao !== `Bearer ${cronSecret}`) {
    return new NextResponse("Não autorizado.", { status: 401 });
  }

  const admin = criarClienteAdmin();

  const MAX_TENTATIVAS_AUTOMATICAS = 3;

  // Mesmo "visibility timeout" do publicar-mencoes — ver comentário lá (PRAZO_DE_SEGURANCA_MS).
  const PRAZO_DE_SEGURANCA_MS = 10 * 60 * 1000;
  const limiteDeSeguranca = new Date(Date.now() - PRAZO_DE_SEGURANCA_MS).toISOString();

  // Itens presos em "publicando" além do prazo de segurança e que já esgotaram as tentativas
  // automáticas do disparo atual — provavelmente a Meta nunca respondeu. Vira "erro" pra ação
  // manual (excluir/reagendar) em vez de tentar pra sempre.
  await admin
    .from("shoppinghub_publicacoes")
    .update({ status: "erro", erro_detalhe: "A publicação não foi confirmada a tempo." })
    .eq("status", "publicando")
    .gte("tentativas", MAX_TENTATIVAS_AUTOMATICAS)
    .lt("tentativa_iniciada_em", limiteDeSeguranca);

  const colunas =
    "id, conta_id, tipo, midias, status, proxima_publicacao_em, data_fim_instante, tentativas";
  const agora = new Date().toISOString();

  const [{ data: devidas, error: erroDevidas }, { data: reclamaveis, error: erroReclamaveis }] =
    await Promise.all([
      admin
        .from("shoppinghub_publicacoes")
        .select(colunas)
        .eq("status", "agendado")
        .lte("proxima_publicacao_em", agora),
      admin
        .from("shoppinghub_publicacoes")
        .select(colunas)
        .eq("status", "publicando")
        .lt("tentativa_iniciada_em", limiteDeSeguranca),
    ]);

  if (erroDevidas || erroReclamaveis) {
    console.error("Falha ao buscar publicações agendadas devidas:", erroDevidas ?? erroReclamaveis);
    return NextResponse.json({ ok: false, erro: (erroDevidas ?? erroReclamaveis)?.message }, { status: 500 });
  }

  const fila = [...(devidas ?? []), ...(reclamaveis ?? [])].sort(
    (a, b) => new Date(a.proxima_publicacao_em).getTime() - new Date(b.proxima_publicacao_em).getTime()
  );

  const resultado = { publicadas: 0, falhas: 0, adiadas: 0, emDuvida: 0, total: fila.length };

  const idsDeContas = Array.from(new Set(fila.map((p) => p.conta_id)));
  const { data: contasDaFila } =
    idsDeContas.length > 0
      ? await admin
          .from("shoppinghub_contas")
          .select("id, instagram_user_id, access_token, active")
          .in("id", idsDeContas)
      : { data: [] as { id: string; instagram_user_id: string; access_token: string; active: boolean }[] };
  const contaPorId = new Map((contasDaFila ?? []).map((c) => [c.id, c]));

  // Mesma ideia do publicar-mencoes: vídeo demora bem mais (espera a Meta transcodificar), imagem
  // é rápida — um carrossel com vídeo é o pior caso. Só começa um item novo se sobrar orçamento
  // suficiente pro pior caso dele dentro do maxDuration de 60s da Vercel.
  const inicioDaExecucao = Date.now();
  const TEMPO_TOTAL_DISPONIVEL_MS = 55_000;
  const PRAZO_MS_VIDEO = 48_000;
  const PRAZO_MS_IMAGEM = 15_000;

  for (const publicacao of fila) {
    const midias: { storage_path: string; tipo: "IMAGE" | "VIDEO" }[] = Array.isArray(publicacao.midias)
      ? publicacao.midias
      : [];
    const temVideo = midias.some((m) => m.tipo === "VIDEO");
    const prazoDoItem = temVideo ? PRAZO_MS_VIDEO : PRAZO_MS_IMAGEM;

    if (Date.now() - inicioDaExecucao + prazoDoItem > TEMPO_TOTAL_DISPONIVEL_MS) {
      resultado.adiadas += 1;
      continue;
    }

    const tentativaAtual = publicacao.tentativas + 1;
    const { data: reivindicada } = await admin
      .from("shoppinghub_publicacoes")
      .update({
        status: "publicando",
        tentativa_iniciada_em: new Date().toISOString(),
        tentativas: tentativaAtual,
      })
      .eq("id", publicacao.id)
      .in("status", ["agendado", "publicando"])
      .select("id")
      .maybeSingle();

    if (!reivindicada) continue;

    const controleDeCancelamento = new AbortController();

    try {
      const conta = contaPorId.get(publicacao.conta_id);
      const mediaId = await comPrazo(
        chamarMetaParaPublicar(admin, publicacao, midias, conta, controleDeCancelamento.signal),
        prazoDoItem,
        () => controleDeCancelamento.abort()
      );

      await finalizarPublicacao(admin, publicacao, mediaId);
      resultado.publicadas += 1;
    } catch (erro) {
      console.error(`Falha ao publicar agendamento ${publicacao.id}:`, erro);

      const foiNossoPrazoQueEstourou = erro instanceof Error && erro.message.startsWith("Excedeu o prazo de");

      if (foiNossoPrazoQueEstourou) {
        resultado.emDuvida += 1;
      } else {
        const novoStatus = tentativaAtual < MAX_TENTATIVAS_AUTOMATICAS ? "agendado" : "erro";
        await admin
          .from("shoppinghub_publicacoes")
          .update({
            status: novoStatus,
            erro_detalhe: erro instanceof Error ? erro.message : String(erro),
          })
          .eq("id", publicacao.id)
          .eq("status", "publicando");
        resultado.falhas += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}

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

async function chamarMetaParaPublicar(
  admin: ReturnType<typeof criarClienteAdmin>,
  publicacao: { id: string; tipo: string },
  midias: { storage_path: string; tipo: "IMAGE" | "VIDEO" }[],
  conta: { instagram_user_id: string; access_token: string; active: boolean } | undefined,
  signal: AbortSignal
): Promise<string> {
  if (midias.length === 0) {
    throw new Error("Publicação sem nenhuma mídia.");
  }

  if (!conta || !conta.active) {
    throw new Error("Conta do Instagram não encontrada ou pausada.");
  }

  const midiasComUrl = midias.map((m) => ({
    urlPublica: admin.storage.from(BUCKET_PUBLICACOES).getPublicUrl(m.storage_path).data.publicUrl,
    tipo: m.tipo,
  }));

  if (publicacao.tipo === "story") {
    return publicarStoryNoInstagram(
      conta.access_token,
      conta.instagram_user_id,
      midiasComUrl[0].urlPublica,
      midiasComUrl[0].tipo,
      null,
      signal
    );
  }

  return publicarNoFeedInstagram(conta.access_token, conta.instagram_user_id, midiasComUrl, signal);
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Roda DEPOIS que a Meta já confirmou a publicação — mesma lógica de "não pode mais desistir"
 * documentada em finalizarMencaoPublicada (publicar-mencoes/route.ts): dali em diante só resta
 * registrar o que já aconteceu de verdade.
 *
 * Feed: publicação única, termina aqui (status "publicado").
 * Story: se ainda sobra dia dentro do período (data_fim_instante), reagenda pro dia seguinte, no
 * mesmo horário, e zera as tentativas (elas contam só o disparo DE HOJE, não a campanha toda —
 * senão uma campanha de 10 dias esgotaria as 3 tentativas automáticas já nos 3 primeiros dias,
 * mesmo com cada um tendo dado certo). Sem mais dia no período, marca "concluido".
 */
async function finalizarPublicacao(
  admin: ReturnType<typeof criarClienteAdmin>,
  publicacao: { id: string; tipo: string; proxima_publicacao_em: string; data_fim_instante: string | null },
  mediaId: string
): Promise<void> {
  const agoraISO = new Date().toISOString();

  if (publicacao.tipo === "feed") {
    await admin
      .from("shoppinghub_publicacoes")
      .update({ status: "publicado", ultima_publicacao_em: agoraISO })
      .eq("id", publicacao.id);
    console.log(`Publicação ${publicacao.id} publicada no Feed (mediaId ${mediaId}).`);
    return;
  }

  const proximoDisparo = new Date(new Date(publicacao.proxima_publicacao_em).getTime() + UM_DIA_MS);
  const aindaDentroDoPeriodo =
    publicacao.data_fim_instante && proximoDisparo.getTime() <= new Date(publicacao.data_fim_instante).getTime();

  if (aindaDentroDoPeriodo) {
    await admin
      .from("shoppinghub_publicacoes")
      .update({
        status: "agendado",
        proxima_publicacao_em: proximoDisparo.toISOString(),
        tentativas: 0,
        tentativa_iniciada_em: null,
        ultima_publicacao_em: agoraISO,
      })
      .eq("id", publicacao.id);
    console.log(
      `Story ${publicacao.id} publicado (mediaId ${mediaId}) — reagendado pro próximo dia do período.`
    );
  } else {
    await admin
      .from("shoppinghub_publicacoes")
      .update({ status: "concluido", ultima_publicacao_em: agoraISO })
      .eq("id", publicacao.id);
    console.log(`Story ${publicacao.id} publicado (mediaId ${mediaId}) — período encerrado.`);
  }
}
