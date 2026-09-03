export const dynamic = "force-dynamic";

export default function NovaLojaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  return (
    <div>
      <a href={`/shoppings/${params.id}`} className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pras lojas
      </a>

      <h2 className="mt-4 text-lg font-semibold">Nova loja</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Só o nome é obrigatório aqui — @usuário autorizado, contato e base de conhecimento dá pra
        preencher depois, na tela de edição da loja.
      </p>

      {searchParams.erro && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <form action="/api/lojas" method="POST" className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="shopping_id" value={params.id} />

        <div>
          <label className="text-xs text-neutral-400">Nome da loja</label>
          <input
            type="text"
            name="nome"
            required
            placeholder="Ex: Loja Exemplo"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="mt-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Criar loja
        </button>
      </form>
    </div>
  );
}
