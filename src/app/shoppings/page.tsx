import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BotaoSair } from "./BotaoSair";

export const dynamic = "force-dynamic";

export default async function ShoppingsPage({
  searchParams,
}: {
  searchParams: { criado?: string; erro?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: shoppings } = await admin
    .from("shoppinghub_shoppings")
    .select("id, nome, slug, ativo, created_at")
    .order("created_at", { ascending: true });

  // Contagem de lojas por shopping, pra mostrar no cartão — feita em JS a partir de uma busca só
  // (em vez de uma query por shopping) porque o volume é baixo na v1.
  const contagemLojasPorShopping = new Map<string, number>();
  if (shoppings && shoppings.length > 0) {
    const { data: lojas } = await admin.from("shoppinghub_lojas").select("shopping_id");

    for (const loja of lojas ?? []) {
      contagemLojasPorShopping.set(
        loja.shopping_id,
        (contagemLojasPorShopping.get(loja.shopping_id) ?? 0) + 1
      );
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Shoppings</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Atendimento virtual — cada shopping tem suas próprias lojas e base de conhecimento.
          </p>
        </div>

        <BotaoSair />
      </div>

      <a
        href="/relatorios"
        className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-neutral-700 bg-neutral-800 px-5 py-4 shadow-lg shadow-black/30 transition hover:-translate-y-0.5 hover:shadow-xl"
      >
        <div>
          <p className="font-medium text-neutral-100">Relatório de atendimentos</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Filtra por shopping e mês, e exporta em PDF
          </p>
        </div>
        <span className="shrink-0 text-neutral-500">&rarr;</span>
      </a>

      {searchParams.criado && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Shopping criado, com a loja "Geral" já cadastrada.
        </div>
      )}

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(shoppings ?? []).map((shopping) => (
          <a
            key={shopping.id}
            href={`/shoppings/${shopping.id}`}
            className={`group flex flex-col rounded-2xl border bg-neutral-800 p-5 shadow-lg shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl ${
              shopping.ativo ? "border-neutral-700" : "border-red-950/60"
            }`}
          >
            <span
              className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                shopping.ativo
                  ? "border-green-900 bg-green-950 text-green-300"
                  : "border-red-900 bg-red-950 text-red-400"
              }`}
            >
              {shopping.ativo ? "Ativo" : "Inativo"}
            </span>

            <p className="mt-4 line-clamp-2 min-h-[2.5rem] font-medium leading-tight text-neutral-100">
              {shopping.nome}
            </p>
            <p className="text-sm text-neutral-500">/{shopping.slug}</p>

            <p className="mt-3 text-xs text-neutral-400">
              {contagemLojasPorShopping.get(shopping.id) ?? 0} loja(s) cadastrada(s)
            </p>
          </a>
        ))}

        <a
          href="/shoppings/nova"
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-700 p-5 text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-300"
        >
          <span className="mb-1 text-2xl leading-none">+</span>
          <span className="text-sm font-medium">Novo shopping</span>
        </a>
      </div>

      {(shoppings ?? []).length === 0 && (
        <p className="mt-2 text-sm text-neutral-500">Nenhum shopping cadastrado ainda.</p>
      )}
    </main>
  );
}
