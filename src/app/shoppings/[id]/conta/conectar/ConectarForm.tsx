"use client";

import { useState } from "react";
import type { PaginaComInstagram } from "@/lib/facebookOAuth";

// Formulário de escolha de Página, com um estado de carregamento simples: ao clicar em
// "Conectar", o botão já muda na hora pra "Conectando…" e fica desabilitado — sem isso, o clique
// ficava sem nenhuma resposta visual até o redirecionamento voltar (o servidor ainda faz uma
// chamada pra Meta nesse meio tempo, inscrevendo a Página no webhook, o que leva um segundo ou
// dois). Não impede o envio do formulário, só atualiza a tela enquanto ele acontece.
export default function ConectarForm({
  shoppingId,
  idPendente,
  paginas,
}: {
  shoppingId: string;
  idPendente: string;
  paginas: PaginaComInstagram[];
}) {
  const [paginaEscolhida, setPaginaEscolhida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      action={`/api/shoppings/${shoppingId}/conta/finalizar`}
      method="POST"
      className="mt-6 flex flex-col gap-3"
      onSubmit={() => setEnviando(true)}
    >
      <input type="hidden" name="pendente" value={idPendente} />

      {paginas.map((pagina) => (
        <label
          key={pagina.page_id}
          className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/8 bg-ink-900 px-4 py-3.5 has-[:checked]:border-accent has-[:checked]:bg-accent/8"
        >
          <div>
            <div className="text-[13.5px] font-bold">{pagina.page_name}</div>
            <div className="text-xs text-neutral-400">@{pagina.instagram_username}</div>
          </div>
          <input
            type="radio"
            name="page_id"
            value={pagina.page_id}
            required
            checked={paginaEscolhida === pagina.page_id}
            onChange={() => setPaginaEscolhida(pagina.page_id)}
            className="accent-accent"
          />
        </label>
      ))}

      <button
        type="submit"
        disabled={enviando || !paginaEscolhida}
        className="mt-2 flex items-center justify-center gap-2 rounded-[11px] bg-accent px-4 py-3 text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong disabled:opacity-60"
      >
        {enviando && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        )}
        {enviando ? "Conectando…" : "Conectar"}
      </button>
    </form>
  );
}
