import type { ReactNode } from "react";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ShoppingSidebar } from "@/components/ShoppingSidebar";

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

  if (!shopping) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <a href="/shoppings" className="text-sm text-neutral-400 hover:text-neutral-300">
          &larr; Voltar pros shoppings
        </a>
        <p className="mt-4 text-sm text-neutral-400">Shopping não encontrado.</p>
      </main>
    );
  }

  return (
    <>
      <ShoppingSidebar shoppingId={shopping.id} nome={shopping.nome} slug={shopping.slug} />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="text-[11px] font-semibold tracking-wide text-neutral-500">
            {shopping.nome.toUpperCase()}
          </div>
          <div className="mt-2">{children}</div>
        </main>
      </div>
    </>
  );
}
