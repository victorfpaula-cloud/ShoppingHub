import { criarClienteAdmin } from "@/lib/supabase/admin";
import { iniciaisDoNome } from "@/lib/iniciais";
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
    <div>
      <div className="flex items-center justify-between border-b border-white/8 px-6 py-4 lg:px-12">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-shoppinghub.png" alt="" className="h-7 w-7 object-contain" />
          <span className="font-display text-[15px] font-bold tracking-tight">ShoppingHub</span>
        </div>
        <BotaoSair />
      </div>

      <main className="mx-auto max-w-4xl px-6 py-9">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Shoppings</h1>
        <p className="mt-2 text-[13.5px] text-neutral-400">
          Atendimento virtual — cada shopping tem suas próprias lojas e base de conhecimento.
        </p>

        {searchParams.criado && (
          <div className="mt-4 rounded-xl border border-ok/25 bg-ok/10 px-4 py-2.5 text-sm text-ok">
            Shopping criado, com a loja &quot;Geral&quot; já cadastrada.
          </div>
        )}

        {searchParams.erro && (
          <div className="mt-4 break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {searchParams.erro}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(shoppings ?? []).map((shopping, indice) => (
            <a
              key={shopping.id}
              href={`/shoppings/${shopping.id}`}
              className={`flex flex-col rounded-2xl border bg-ink-900 p-5 shadow-[0_20px_44px_-22px_rgba(0,0,0,0.7)] transition hover:-translate-y-0.5 ${
                shopping.ativo ? "border-white/12" : "border-danger/25"
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className="font-display flex h-11 w-11 items-center justify-center rounded-xl text-[17px] font-bold text-white"
                  style={{
                    background:
                      indice % 2 === 0
                        ? "linear-gradient(155deg, #8f82ff, #6a5bde)"
                        : "linear-gradient(155deg, #5fd0c0, #2f9a8d)",
                  }}
                >
                  {iniciaisDoNome(shopping.nome)}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    shopping.ativo ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger"
                  }`}
                >
                  {shopping.ativo ? "ATIVO" : "INATIVO"}
                </span>
              </div>

              <p className="mt-4 line-clamp-2 min-h-[2.5rem] text-[16px] font-bold leading-tight">
                {shopping.nome}
              </p>
              <p className="text-[12px] text-neutral-500">/{shopping.slug}</p>

              <div className="mt-4 border-t border-white/8 pt-3.5">
                <span className="font-display text-[19px] font-bold">
                  {contagemLojasPorShopping.get(shopping.id) ?? 0}
                </span>
                <span className="ml-1.5 text-[11px] font-semibold text-neutral-500">
                  loja(s) cadastrada(s)
                </span>
              </div>
            </a>
          ))}

          <a
            href="/shoppings/nova"
            className="flex min-h-[172px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-white/14 p-5 text-neutral-500 transition hover:border-white/25 hover:text-neutral-300"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink-900 text-neutral-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="text-[12.5px] font-bold">Novo shopping</span>
          </a>
        </div>

        {(shoppings ?? []).length === 0 && (
          <p className="mt-2 text-sm text-neutral-500">Nenhum shopping cadastrado ainda.</p>
        )}
      </main>
    </div>
  );
}
