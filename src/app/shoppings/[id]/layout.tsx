import type { ReactNode } from "react";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ShoppingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const admin = criarClienteAdmin();
  const { data: shopping } = await admin
    .from("shoppinghub_shoppings")
    .select("id, nome, slug")
    .eq("id", params.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <a href="/shoppings" className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pros shoppings
      </a>

      {shopping ? (
        <>
          <div className="mt-4">
            <h1 className="text-2xl font-semibold">{shopping.nome}</h1>
            <p className="mt-1 text-sm text-neutral-400">/{shopping.slug}</p>
          </div>

          <nav className="mt-6 flex flex-wrap gap-2 border-b border-neutral-800 pb-3">
            <a
              href={`/shoppings/${shopping.id}`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Lojas
            </a>
            <a
              href={`/shoppings/${shopping.id}/conta`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Conta do Instagram
            </a>
            <a
              href={`/shoppings/${shopping.id}/mencoes`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Fila de menções
            </a>
            <a
              href={`/shoppings/${shopping.id}/atendimentos`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Atendimentos
            </a>
            <a
              href={`/shoppings/${shopping.id}/guardrails`}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Guardrails
            </a>
          </nav>

          <div className="mt-6">{children}</div>
        </>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">Shopping não encontrado.</p>
      )}
    </main>
  );
}
