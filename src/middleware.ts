import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Exige login em todo o painel administrativo (shoppings, lojas, guardrails, fila de menções,
 * relatórios). Ficam de fora: o webhook do Instagram, os endpoints de ponte (api/bridge — chamados
 * por serviços externos tipo o SendPulse, protegidos por segredo compartilhado próprio, não por
 * sessão) e o endpoint de cron (quem chama eles não é um navegador com sessão — a própria Meta, a
 * Vercel, e o SendPulse, respectivamente), e as páginas de Política de Privacidade e Exclusão de
 * Dados (precisam ser públicas — a Meta acessa elas sem login durante o App Review, e qualquer
 * visitante pode precisar delas).
 *
 * Falha "aberta" (deixa passar sem exigir login) só se faltar configurar a variável de ambiente
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` — evita que um esquecimento de configuração derrube o site
 * inteiro com uma tela em branco; ainda assim registra um erro no log pra não passar despercebido.
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
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname !== "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    return NextResponse.redirect(destino);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/webhook/instagram|api/bridge|api/cron|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|privacidade|exclusao-de-dados).*)",
  ],
};
