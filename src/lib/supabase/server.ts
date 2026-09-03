import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase pra Server Components/Route Handlers, usando a chave pública (anon/publishable)
 * — o mesmo padrão de autenticação por sessão (cookie) que os projetos irmãos já usam. Diferente
 * de `criarClienteAdmin()` (service role, sem sessão de usuário), esse cliente representa quem
 * está logado no navegador.
 */
export function criarClienteServidor() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado de dentro de um Server Component (sem permissão de escrever cookie) — o
            // middleware já renova a sessão a cada requisição, então pode ignorar aqui.
          }
        },
      },
    }
  );
}
