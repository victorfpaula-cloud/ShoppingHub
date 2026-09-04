import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { montarUrlDeAutorizacao } from "@/lib/facebookOAuth";

// Essa rota não lê nada da requisição em tempo de build (só na hora do acesso de verdade), então
// o Next.js tentaria "pré-gerar" ela como se fosse uma página estática em tempo de build — e
// nesse momento as variáveis de ambiente do Supabase ainda não estão disponíveis do jeito certo,
// o que quebrava o build. Isso força ela a rodar só quando alguém acessa de verdade.
export const dynamic = "force-dynamic";

// Chamado quando alguém clica em "Conectar Instagram" em /shoppings/[id]/conta. Gera um "state"
// aleatório (contra CSRF — garante que o retorno do Facebook realmente veio de um login que a
// gente iniciou), guarda ele no banco junto com o shopping que iniciou a conexão (pra saber,
// depois que o Facebook volta, a qual shopping amarrar a conta), e manda o navegador pro
// diálogo de login do Facebook.
export async function GET(request: NextRequest) {
  const shoppingId = request.nextUrl.searchParams.get("shopping_id");

  if (!shoppingId) {
    return new NextResponse("Faltou informar o shopping que está conectando a conta.", {
      status: 400,
    });
  }

  const state = crypto.randomBytes(24).toString("hex");

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("shoppinghub_oauth_states")
    .insert({ state, shopping_id: shoppingId });

  if (error) {
    return new NextResponse("Não foi possível iniciar a conexão. Tenta de novo em instantes.", {
      status: 500,
    });
  }

  const urlDeAutorizacao = montarUrlDeAutorizacao(state);
  console.log("montarUrlDeAutorizacao — URL gerada:", urlDeAutorizacao);

  return NextResponse.redirect(urlDeAutorizacao);
}
