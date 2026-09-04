import { NextRequest, NextResponse } from "next/server";

// TEMPORÁRIO — só pra descobrir o formato real do "Global webhook" de incoming_message que a
// SendPulse manda pra menções de Story do Instagram (a documentação só tem exemplo de WhatsApp).
// Não processa nada ainda, só imprime o corpo inteiro no log da Vercel pra gente inspecionar.
// Autenticado por um segredo na própria query string da URL (a tela de Global Webhooks da
// SendPulse só deixa colar uma URL simples, sem campo de cabeçalho customizado).
export async function POST(request: NextRequest) {
  const segredoRecebido = request.nextUrl.searchParams.get("secret");
  const segredoEsperado = process.env.SENDPULSE_BRIDGE_SECRET;

  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const corpo = await request.text();
  console.log("[ponte SendPulse] payload bruto do global webhook:", corpo);

  return NextResponse.json({ ok: true });
}
