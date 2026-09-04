import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — confere direto no Facebook se a Página conectada de um
// shopping está realmente inscrita no webhook do nosso app (subscribed_apps), já que os logs da
// Vercel mostraram ZERO chamadas em /api/webhook/instagram mesmo depois de uma menção de Story
// ter chegado no Direct de verdade. Segura de apagar depois — não expõe o token de acesso.
export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

export async function GET(request: NextRequest) {
  const shoppingId = request.nextUrl.searchParams.get("shopping_id");

  if (!shoppingId) {
    return NextResponse.json(
      { erro: "Passa ?shopping_id=... na URL (o id do shopping, não da loja)." },
      { status: 400 }
    );
  }

  const admin = criarClienteAdmin();

  const { data: conta, error } = await admin
    .from("shoppinghub_contas")
    .select("page_id, page_name, access_token, active")
    .eq("shopping_id", shoppingId)
    .maybeSingle();

  if (error || !conta) {
    return NextResponse.json(
      { erro: "Nenhuma conta conectada encontrada pra esse shopping_id." },
      { status: 404 }
    );
  }

  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${conta.page_id}/subscribed_apps?access_token=${encodeURIComponent(
      conta.access_token
    )}`,
    { cache: "no-store" }
  );

  const dados = await resposta.json().catch(() => null);

  return NextResponse.json({
    pagina: conta.page_name,
    pageId: conta.page_id,
    contaAtiva: conta.active,
    statusHttp: resposta.status,
    respostaDoFacebook: dados,
  });
}
