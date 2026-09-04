import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — só pra descobrir por que só aparecem 4 Páginas em vez de
// todas (mesmo sintoma que já apareceu no Chatbot Direct). NÃO faz parte do funcionamento normal
// do sistema, é seguro apagar esse arquivo depois que resolvermos o problema. Não expõe token
// nenhum na resposta, só contagens e nomes.
export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

export async function GET() {
  const admin = criarClienteAdmin();

  const { data: pendente, error } = await admin
    .from("shoppinghub_pending_connections")
    .select("fb_user_token, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !pendente) {
    return NextResponse.json(
      {
        erro:
          "Nenhuma conexão pendente encontrada. Tenta conectar uma conta de novo primeiro (só até a tela de escolher a Página, não precisa terminar) e recarrega essa URL.",
      },
      { status: 404 }
    );
  }

  const token = pendente.fb_user_token as string;

  // Passo 1: lista bruta de /me/accounts, sem nenhum filtro.
  const respostaContas = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(
      token
    )}`,
    { cache: "no-store" }
  );

  const dadosContas = await respostaContas.json().catch(() => null);

  if (!respostaContas.ok) {
    return NextResponse.json(
      {
        etapa: "listar /me/accounts",
        statusHttp: respostaContas.status,
        erroDoFacebook: dadosContas?.error ?? dadosContas,
      },
      { status: 200 }
    );
  }

  const paginasBrutas: any[] = Array.isArray(dadosContas?.data) ? dadosContas.data : [];
  const paging = dadosContas?.paging ?? null;

  // Passo 2: pra cada Página, tenta buscar o Instagram vinculado, guardando o motivo exato
  // quando falha (em vez de simplesmente descartar, como o código de produção faz).
  const resultadosInstagram = await Promise.all(
    paginasBrutas.map(async (pagina) => {
      const respostaIg = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${pagina.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(
          pagina.access_token
        )}`,
        { cache: "no-store" }
      );
      const dadosIg = await respostaIg.json().catch(() => null);

      return {
        pagina: pagina.name,
        pageId: pagina.id,
        statusHttp: respostaIg.status,
        temInstagramVinculado: Boolean(dadosIg?.instagram_business_account?.id),
        instagramUsername: dadosIg?.instagram_business_account?.username ?? null,
        erroDoFacebook: !respostaIg.ok ? dadosIg?.error ?? dadosIg : undefined,
      };
    })
  );

  return NextResponse.json({
    conexaoPendenteCriadaEm: pendente.created_at,
    totalDePaginasRetornadasPeloFacebook: paginasBrutas.length,
    temMaisPaginasNaoMostradas: Boolean(paging?.next),
    paginas: resultadosInstagram,
  });
}
