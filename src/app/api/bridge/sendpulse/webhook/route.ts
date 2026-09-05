import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { processarMencaoRecebida } from "@/lib/mencoes";

// Ponte de verdade pra menções de Story: o "Global webhook" da SendPulse (Configurações do Bot >
// Webhooks > "Mensagens recebidas") manda TODA mensagem recebida pra cá, fora do construtor de
// fluxo visual — que não deixa encadear nada além de uma resposta única em fluxos de Menção (ver
// histórico). Confirmado em teste real (04/09/2026) que o payload inclui os dados brutos da
// mensagem em `info.message.channel_data.message.attachments`, no mesmo formato que o webhook
// direto da Meta usa (`type: "story_mention"`, `payload.url`) — inclusive pra contas sem nenhum
// papel no App, provando que o RECEBIMENTO nunca dependia de autorização, só a Meta bloqueava
// isso pro nosso próprio App em Standard Access.
//
// Mensagens de texto normais (sem menção de Story) são ignoradas aqui de propósito — essas já são
// respondidas pelo fluxo de chat configurado direto no construtor da SendPulse (ver
// src/app/api/bridge/sendpulse/route.ts), e processar elas aqui também causaria resposta em
// duplicidade.
//
// Autenticado por um segredo na própria query string da URL (a tela de Global Webhooks da
// SendPulse só deixa colar uma URL simples, sem campo de cabeçalho customizado).
//
// Sem isso, a Vercel usa o padrão de 10s — insuficiente pra baixar+comprimir um vídeo de menção
// (ver comprimirVideo.ts, chamado dentro de processarMencaoRecebida), o que podia estourar
// silenciosamente e cair como "erro" na fila sem nenhuma pista do motivo real.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const segredoRecebido = request.nextUrl.searchParams.get("secret");
  const segredoEsperado = process.env.SENDPULSE_BRIDGE_SECRET;

  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const eventos: any[] = Array.isArray(corpo) ? corpo : corpo ? [corpo] : [];

  const admin = criarClienteAdmin();

  for (const evento of eventos) {
    try {
      await processarEvento(admin, evento);
    } catch (erro) {
      console.error("[ponte SendPulse] erro processando evento do global webhook:", erro);
    }
  }

  return NextResponse.json({ ok: true });
}

async function processarEvento(admin: ReturnType<typeof criarClienteAdmin>, evento: any) {
  if (evento?.service !== "instagram" || evento?.title !== "incoming_message") {
    return;
  }

  const mensagem = evento?.info?.message?.channel_data?.message;
  const anexos: any[] = Array.isArray(mensagem?.attachments) ? mensagem.attachments : [];
  const mencaoDeStory = anexos.find((anexo) => anexo?.type === "story_mention");

  if (!mencaoDeStory?.payload?.url) {
    return;
  }

  // Mesma tabela/mecanismo de deduplicação usado no webhook direto (ver
  // src/app/api/webhook/instagram/route.ts) — evita processar a mesma menção duas vezes se a
  // SendPulse reenviar o mesmo evento.
  const idDaMensagem: string | undefined = mensagem?.mid;
  if (idDaMensagem) {
    const { error: erroAoRegistrar } = await admin
      .from("shoppinghub_processed_messages")
      .insert({ message_id: idDaMensagem });

    if (erroAoRegistrar) {
      if ((erroAoRegistrar as any).code === "23505") return;
      throw erroAoRegistrar;
    }
  }

  const idDaContaRecebendo: string | undefined = evento?.bot?.external_id;
  const username: string | undefined = evento?.contact?.username;
  const idDoContatoNaSendPulse: string | undefined = evento?.contact?.id;

  if (!idDaContaRecebendo || !username || !idDoContatoNaSendPulse) {
    console.warn("[ponte SendPulse] menção de Story sem conta/usuário/contato resolvido — descartada.");
    return;
  }

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id, shopping_id")
    .eq("instagram_user_id", idDaContaRecebendo)
    .eq("active", true)
    .maybeSingle();

  if (!conta) {
    console.warn(
      `[ponte SendPulse] menção recebida pra uma conta ainda não conectada no sistema (instagram_user_id=${idDaContaRecebendo}).`
    );
    return;
  }

  // Mesmo prefixo usado no bridge de chat — só pra auditoria, não afeta a lógica de fila.
  await processarMencaoRecebida(
    admin,
    conta,
    `sendpulse:${idDoContatoNaSendPulse}`,
    username,
    mencaoDeStory.payload.url
  );
}
