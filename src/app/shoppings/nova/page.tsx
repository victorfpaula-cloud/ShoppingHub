export const dynamic = "force-dynamic";

export default function NovoShoppingPage({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <a href="/shoppings" className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pros shoppings
      </a>

      <h1 className="mt-4 text-xl font-semibold">Novo shopping</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Ao criar, a loja "Geral" já nasce cadastrada automaticamente — dá pra adicionar as outras
        lojas depois.
      </p>

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <form action="/api/shoppings" method="POST" className="mt-6 flex flex-col gap-4">
        <div>
          <label className="text-xs text-neutral-400">Nome do shopping</label>
          <input
            type="text"
            name="nome"
            required
            placeholder="Ex: Shopping Exemplo"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400">
            Identificador (slug — só letras minúsculas, números e hífen)
          </label>
          <input
            type="text"
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Só letras minúsculas, números e hífen"
            placeholder="Ex: exemplo"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="mt-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Criar shopping
        </button>
      </form>
    </main>
  );
}
