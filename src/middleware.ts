import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Exige login em todo o painel administrativo (shoppings, lojas, guardrails, fila de menções,
 * relatórios). Ficam de fora: o webhook do Instagram, os endpoints de ponte (api/bridge — chamados
 * por serviços externos tipo o SendPulse, protegidos por segredo compartilhado próprio, não por
 * sessão), o endpoint de cron e as ferramentas de manutenção (api/manutencao — protegidas por
 * segredo próprio na URL, feitas pra abrir direto no navegador sem precisar estar logado), e as
 * páginas de Política de Privacidade e Exclusão de Dados (precisam ser públicas — a Meta acessa
 * elas sem login durante o App Review, e qualquer visitante pode precisar delas).
 *
 * Falha "aberta" (deixa passar sem exigir login) só se faltar configurar a variável de ambiente
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` — evita que um esquecimento de configuração derrube o site
 * inteiro com uma tela em branco; ainda assim registra um erro no log pra não passar despercebido.
 *
 * Usa `getSession()` (decodifica o token localmente, sem chamada de rede pro servidor de Auth da
 * Supabase) em vez de `getUser()` (que valida contra o servidor a cada navegação) — pedido em
 * 08/09/2026, mesmo princípio já usado no Chatbot Direct. `getSession()` só faz uma chamada de
 * rede de verdade quando o token de acesso já venceu (pra tentar renovar com o refresh token);
 * fora isso, é decodificação local. Troca consciente de segurança por velocidade: se uma sessão
 * for revogada manualmente (ou a senha trocar) no meio do caminho, o acesso só é cortado quando o
 * token vencer (até ~1h depois), não na hora. Aceitável aqui porque é um painel de uso interno,
 * com poucos administradores de confiança — não seria a escolha certa pra um sistema com muitos
 * usuários externos ou dados mais sensíveis.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveAnonima = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chaveAnonima) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada — login desativado temporariamente."
    );
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, chaveAnonima, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session && request.nextUrl.pathname !== "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    return NextResponse.redirect(destino);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/webhook/instagram|api/bridge|api/cron|api/manutencao|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|privacidade|exclusao-de-dados).*)",
  ],
};
