import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function LojasDoShoppingPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = criarClienteAdmin();

  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select(
      "id, nome, eh_geral, ativo, instagram_username, instagram_username_2, base_conhecimento_texto"
    )
    .eq("shopping_id", params.id)
    .order("ordem", { ascending: true });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Lojas</h2>
        <a
          href={`/shoppings/${params.id}/lojas/novo`}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-950"
        >
          + Nova loja
        </a>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(lojas ?? []).map((loja) => (
          <a
            key={loja.id}
            href={`/shoppings/${params.id}/lojas/${loja.id}`}
            className={`flex flex-col rounded-xl border bg-neutral-800 px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-lg ${
              loja.ativo ? "border-neutral-700" : "border-red-950/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{loja.nome}</span>
              {loja.eh_geral && (
                <span className="shrink-0 rounded-full border border-sky-900 bg-sky-950 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                  Fallback
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className={`rounded-full border px-2 py-0.5 ${
                  loja.ativo
                    ? "border-green-900 bg-green-950 text-green-300"
                    : "border-red-900 bg-red-950 text-red-400"
                }`}
              >
                {loja.ativo ? "Ativa" : "Inativa"}
              </span>
              <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-400">
                {loja.instagram_username
                  ? [loja.instagram_username, loja.instagram_username_2]
                      .filter(Boolean)
                      .map((u) => `@${u}`)
                      .join(" / ")
                  : "Sem @usuário autorizado"}
              </span>
              <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-400">
                {loja.base_conhecimento_texto?.trim()
                  ? "Com base de conhecimento"
                  : "Sem base de conhecimento ainda"}
              </span>
            </div>
          </a>
        ))}
      </div>

      {(lojas ?? []).length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-700 px-4 py-6 text-center text-sm text-neutral-400">
          Nenhuma loja cadastrada ainda.
        </p>
      )}
    </div>
  );
}
