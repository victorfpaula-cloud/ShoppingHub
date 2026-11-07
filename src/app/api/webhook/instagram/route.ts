import { NextRequest, NextResponse } from "next/server";
import { assinaturaValida } from "@/lib/metaMessaging";

// Esse webhook direto da Meta existia só como contorno enquanto o App do ShoppingHub estava em
// Standard Access (só recebia mensagem de verdade de quem tinha papel de admin/dev/tester no
// App) — ver histórico deste arquivo. Migrado em 07/11/2026 pro chatbot-direct (que já tem Acesso
// Avançado aprovado pela Meta, então recebe de QUALQUER cliente, não só testador) — ver
// src/app/api/bridge/chatbot-direct/* e shoppinghubBridge.ts no chatbot-direct.
//
// NÃO processa mais nada aqui de propósito: a conta da Bebedouro Shopping continuava com papel de
// testador neste App, então as DUAS integrações respondiam a mesma mensagem ao mesmo tempo
// (confirmado em produção em 07/11/2026 — cliente de teste recebeu a mesma saudação 2-3x). Só
// devolve 200 pra Meta não marcar a inscrição do webhook como falha e parar de tentar; o GET
// abaixo segue respondendo a verificação de assinatura por segurança.
export async function GET(request: NextRequest) {
  const modo = request.nextUrl.searchParams.get("hub.mode");
  const tokenRecebido = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const tokenEsperado = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (modo === "subscribe" && tokenEsperado && tokenRecebido === tokenEsperado && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Verificação falhou.", { status: 403 });
}

export async function POST(request: NextRequest) {
  const corpoBruto = await request.text();
  const assinatura = request.headers.get("x-hub-signature-256");

  if (!assinaturaValida(corpoBruto, assinatura)) {
    return new NextResponse("Assinatura inválida.", { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
