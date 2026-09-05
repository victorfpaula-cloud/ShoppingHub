"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Recarrega só os dados da página atual (sem sair dela nem piscar a tela) — as páginas do painel
// são renderizadas no servidor e não atualizam sozinhas, então sem isso só dava pra ver números
// novos saindo da tela e voltando.
export function BotaoAtualizar() {
  const router = useRouter();
  const [atualizando, setAtualizando] = useState(false);

  function atualizar() {
    setAtualizando(true);
    router.refresh();
    setTimeout(() => setAtualizando(false), 700);
  }

  return (
    <button
      type="button"
      onClick={atualizar}
      className="flex shrink-0 items-center gap-1.5 rounded-[9px] border border-white/14 px-3 py-2 text-[12px] font-semibold text-neutral-400 transition hover:bg-white/5 hover:text-neutral-200"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={atualizando ? "animate-spin" : ""}
      >
        <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
      </svg>
      Atualizar
    </button>
  );
}
