import { CampoDeTexto } from "@/components/CampoDeTexto";

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

      <h1 className="font-display mt-4 text-[22px] font-bold tracking-tight">Novo shopping</h1>
      <p className="mt-2 text-[13px] text-neutral-400">
        Ao criar, a loja &quot;Geral&quot; já nasce cadastrada automaticamente — dá pra adicionar as outras
        lojas depois.
      </p>

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {searchParams.erro}
        </div>
      )}

      <form action="/api/shoppings" method="POST" className="mt-6 flex flex-col gap-4">
        <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <CampoDeTexto
              label="Nome do shopping"
              type="text"
              name="nome"
              required
              placeholder="Ex: Shopping Exemplo"
            />
            <CampoDeTexto
              label="Identificador (slug — só letras minúsculas, números e hífen)"
              type="text"
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Só letras minúsculas, números e hífen"
              placeholder="Ex: exemplo"
            />
          </div>
        </div>

        <button
          type="submit"
          className="self-start rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong"
        >
          Criar shopping
        </button>
      </form>
    </main>
  );
}
