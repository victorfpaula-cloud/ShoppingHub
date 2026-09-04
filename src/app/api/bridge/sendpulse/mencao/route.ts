import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { processarMencaoRecebida } from "@/lib/mencoes";

// Ponte temporária pra menções de Story: enquanto o App Review do ShoppingHub não sai, o SendPulse
// (que já tem acesso aprovado pela Meta e recebe menção de QUALQUER conta, não só de quem tem
// papel no App) detecta a marcação na aba de Stories dele e chama esse endpoint com o @usuário de
// quem marcou e a URL da mídia. Daqui pra frente é o MESMO fluxo de sempre — loja autorizada,
// limite diário, faixa de crédito, fila — e a publicação em si (feita pelo cron) continua usando o
// token de acesso próprio do ShoppingHub, que nunca foi bloqueado pelo Standard Access da Meta.
// Autenticado pelo mesmo segredo compartilhado do bridge de chat (ver
// src/app/api/bridge/sendpulse/route.ts) — não dá pra usar a assinatura da Meta aqui, já que quem
// está chamando é o SendPulse, não a Meta.
export async function POST(request: NextRequest) {
  const segredoRecebido = request.headers.get("x-bridge-secret");
  const segredoEsperado = process.env.SENDPULSE_BRIDGE_SECRET;

  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo) {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }

  const shoppingSlug: string | undefined = corpo.shopping_slug;
  const contatoId: string | undefined = corpo.contato_id?.toString();
  const username: string | undefined = corpo.username?.toString().trim();
  const urlDaMidia: string | undefined = corpo.media_url?.toString().trim();

  if (!shoppingSlug || !contatoId || !username || !urlDaMidia) {
    return NextResponse.json(
      { erro: "Faltou shopping_slug, contato_id, username ou media_url no corpo da requisição." },
      { status: 400 }
    );
  }

  const admin = criarClienteAdmin();

  const { data: shopping } = await admin
    .from("shoppinghub_shoppings")
    .select("id")
    .eq("slug", shoppingSlug)
    .maybeSingle();

  if (!shopping) {
    return NextResponse.json({ erro: `Shopping "${shoppingSlug}" não encontrado.` }, { status: 404 });
  }

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id, shopping_id")
    .eq("shopping_id", shopping.id)
    .eq("active", true)
    .maybeSingle();

  if (!conta) {
    return NextResponse.json(
      { erro: "Esse shopping não tem conta do Instagram conectada/ativa." },
      { status: 404 }
    );
  }

  // Mesmo prefixo usado no bridge de chat — só pra auditoria, não afeta a lógica de fila.
  const idDoCliente = `sendpulse:${contatoId}`;

  await processarMencaoRecebida(admin, conta, idDoCliente, username, urlDaMidia);

  return NextResponse.json({ ok: true });
}
