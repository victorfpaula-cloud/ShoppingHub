import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { processarMencaoRecebida } from "@/lib/mencoes";

export const dynamic = "force-dynamic";

// Sem isso, a Vercel usa o padrão de 10s — insuficiente pra baixar+comprimir um vídeo de menção
// (ver comprimirVideo.ts, chamado dentro de processarMencaoRecebida), o que podia estourar
// silenciosamente e cair como "erro" na fila sem nenhuma pista do motivo real. Mesmo motivo do
// maxDuration que já existia no bridge/sendpulse/webhook.
export const maxDuration = 60;

/**
 * Ponte de menção de Story com o chatbot-direct — substitui o "Global webhook" da SendPulse (ver
 * bridge/sendpulse/webhook, desativado em 07/11/2026). O chatbot-direct já recebe o payload BRUTO
 * da Meta (sem nenhum embrulho) e repassa só o que importa aqui — mais simples que a versão da
 * SendPulse, que precisava desembrulhar o formato dela primeiro.
 *
 * Autenticado por segredo compartilhado (CHATBOTDIRECT_BRIDGE_SECRET) no header, igual ao bridge
 * de mensagem — diferente da SendPulse, o chatbot-direct consegue mandar headers customizados.
 */
export async function POST(request: NextRequest) {
  const segredoRecebido = request.headers.get("x-bridge-secret");
  const segredoEsperado = process.env.CHATBOTDIRECT_BRIDGE_SECRET;

  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo) {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }

  const instagramUserId: string | undefined = corpo.instagram_user_id?.toString();
  const instagramScopedId: string | undefined = corpo.instagram_scoped_id?.toString();
  const username: string | undefined = corpo.username?.toString();
  const urlDaMidia: string | undefined = corpo.url?.toString();
  const idDaMensagem: string | undefined = corpo.mid?.toString();

  if (!instagramUserId || !instagramScopedId || !username || !urlDaMidia) {
    return NextResponse.json(
      { erro: "Faltou instagram_user_id, instagram_scoped_id, username ou url no corpo da requisição." },
      { status: 400 }
    );
  }

  const admin = criarClienteAdmin();

  // Mesma tabela/mecanismo de deduplicação usado no webhook direto e no bridge da SendPulse (ver
  // src/app/api/webhook/instagram/route.ts) — evita processar a mesma menção duas vezes se o
  // chatbot-direct reenviar o mesmo evento.
  if (idDaMensagem) {
    const { error: erroAoRegistrar } = await admin
      .from("shoppinghub_processed_messages")
      .insert({ message_id: idDaMensagem });

    if (erroAoRegistrar) {
      if ((erroAoRegistrar as any).code === "23505") {
        return NextResponse.json({ ok: true, duplicado: true });
      }
      throw erroAoRegistrar;
    }
  }

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id, shopping_id")
    .eq("instagram_user_id", instagramUserId)
    .eq("active", true)
    .maybeSingle();

  if (!conta) {
    console.warn(
      `[ponte chatbot-direct] menção recebida pra uma conta ainda não conectada no sistema (instagram_user_id=${instagramUserId}).`
    );
    return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  }

  // Mesmo prefixo usado no bridge de chat — só pra auditoria, não afeta a lógica de fila.
  await processarMencaoRecebida(admin, conta, `chatbotdirect:${instagramScopedId}`, username, urlDaMidia);

  return NextResponse.json({ ok: true });
}
