"use client";

import { useState } from "react";

// A geração dos PDFs + envio pelo Resend pode levar alguns segundos — sem nenhum feedback visual
// parecia que o clique "não tinha feito nada" (relatado em 06/09/2026). O `disabled` some assim
// que o formulário é enviado de verdade (a navegação troca de página), então esse estado só
// precisa durar até lá — o suficiente pra dar a sensação de "está processando".
export function BotaoEnviarRelatorioPorEmail({ shoppingId }: { shoppingId: string }) {
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      action={`/api/shoppings/${shoppingId}/relatorios/enviar-email`}
      method="POST"
      onSubmit={() => setEnviando(true)}
      className="w-full sm:order-3 sm:w-auto"
    >
      <button
        type="submit"
        disabled={enviando}
        className="flex w-full items-center justify-center gap-1.5 rounded-[9px] bg-accent px-3.5 py-2 text-xs font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-80 sm:w-auto"
      >
        {enviando ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="animate-spin">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Enviando…
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 6l-10 7L2 6" />
              <path d="M2 6h20v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
            </svg>
            Enviar por e-mail (últimos 30 dias)
          </>
        )}
      </button>
    </form>
  );
}
