// Fluxo de conexão de conta via Facebook Login — mesmo padrão de duas etapas que o DirectGov já
// usa (OAuth → escolher qual Página conectar), só que gerando um cadastro e um token totalmente
// separados dos que os projetos irmãos guardam.

const GRAPH_API_VERSION = "v21.0";

// Escopos mínimos: enxergar a lista de Páginas do usuário, ler engajamento básico (exigido
// junto com pages_show_list em apps novos), as permissões do Instagram, e o necessário pra
// publicar Stories em nome da conta conectada — usando os nomes "clássicos"
// (instagram_basic / instagram_manage_messages / instagram_content_publish), aceitos pelo diálogo
// clássico do Facebook (facebook.com/dialog/oauth) usado no fluxo "Login do Facebook para
// Empresas".
//
// "pages_messaging" também é obrigatório — sem ele o Facebook recusa a inscrição da Página pra
// receber o campo "messages" no webhook.
const ESCOPOS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_content_publish",
].join(",");

function urlBaseDoApp(): string {
  // Domínio fixo do projeto na Vercel (não muda entre deploys, diferente da URL com hash).
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://shoppinghub.vercel.app";
}

export function urlDeCallback(): string {
  return `${urlBaseDoApp()}/api/auth/facebook/callback`;
}

export function montarUrlDeAutorizacao(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: urlDeCallback(),
    state,
    scope: ESCOPOS,
    response_type: "code",
  });

  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function trocarCodigoPorToken(codigo: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: urlDeCallback(),
    code: codigo,
  });

  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) {
    const corpoDoErro = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao trocar o código pelo token (status ${resposta.status}): ${corpoDoErro}`
    );
  }

  const dados = await resposta.json();
  return dados.access_token as string;
}

export async function trocarPorTokenDeLongaDuracao(tokenCurto: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    fb_exchange_token: tokenCurto,
  });

  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) {
    const corpoDoErro = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao gerar token de longa duração (status ${resposta.status}): ${corpoDoErro}`
    );
  }

  const dados = await resposta.json();
  return dados.access_token as string;
}

export type PaginaComInstagram = {
  page_id: string;
  page_name: string;
  page_access_token: string;
  instagram_user_id: string;
  instagram_username: string | null;
};

/**
 * Busca a conta do Instagram profissional vinculada a UMA Página específica, usando o token da
 * própria Página (não o token do usuário). Separado em duas chamadas — em vez de pedir o campo
 * aninhado "instagram_business_account" já na listagem de /me/accounts — é o jeito que
 * comprovadamente mostra TODAS as Páginas certo, sem sumir com nenhuma (lição herdada do
 * DirectGov/agendador).
 */
async function buscarContaInstagramDaPagina(
  pageId: string,
  pageAccessToken: string
): Promise<{ id: string; username: string | null } | null> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(
      pageAccessToken
    )}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) return null;

  const dados = await resposta.json();
  const conta = dados?.instagram_business_account as { id: string; username?: string } | undefined;
  if (!conta?.id) return null;

  return { id: conta.id, username: conta.username ?? null };
}

/**
 * Lista as Páginas que o usuário administra e, pra cada uma, busca a conta do Instagram
 * profissional vinculada (só entram na lista as Páginas que TÊM uma conta do Instagram
 * conectada — sem isso não tem como receber Direct nem publicar Stories).
 */
export async function listarPaginasComInstagram(
  tokenDeUsuario: string
): Promise<PaginaComInstagram[]> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(
      tokenDeUsuario
    )}`,
    { cache: "no-store" }
  );

  if (!resposta.ok) {
    const corpoDoErro = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao listar Páginas do usuário (status ${resposta.status}): ${corpoDoErro}`
    );
  }

  const dados = await resposta.json();
  const paginas: any[] = Array.isArray(dados?.data) ? dados.data : [];

  const resultados = await Promise.all(
    paginas.map(async (pagina) => {
      const contaInstagram = await buscarContaInstagramDaPagina(pagina.id, pagina.access_token);
      if (!contaInstagram) return null;

      return {
        page_id: pagina.id as string,
        page_name: pagina.name as string,
        page_access_token: pagina.access_token as string,
        instagram_user_id: contaInstagram.id,
        instagram_username: contaInstagram.username,
      };
    })
  );

  return resultados.filter((item): item is PaginaComInstagram => item !== null);
}
