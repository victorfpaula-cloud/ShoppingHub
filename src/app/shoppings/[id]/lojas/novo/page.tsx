import { CampoDeTexto } from "@/components/CampoDeTexto";

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

      <h1 className="font-display mt-4 text-[22px] font-bold tracking-tight">Nova loja</h1>
      <p className="mt-2 text-[13px] text-neutral-400">
        Só o nome é obrigatório aqui — @usuário autorizado, contato e base de conhecimento dá pra
        preencher depois, na tela de edição da loja.
      </p>

      {searchParams.erro && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {searchParams.erro}
        </div>
      )}

      <form action="/api/lojas" method="POST" className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="shopping_id" value={params.id} />

        <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 sm:p-6">
          <CampoDeTexto label="Nome da loja" type="text" name="nome" required placeholder="Ex: Loja Exemplo" />
        </div>

        <button
          type="submit"
          className="self-start rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong"
        >
          Criar loja
        </button>
      </form>
    </div>
  );
}
