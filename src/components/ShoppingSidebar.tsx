"use client";

import { useState, type ReactNode, type SVGProps } from "react";
import { usePathname } from "next/navigation";

function Icone(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

const ICONE_LOJAS = <Icone><path d="M3 9l1-5h16l1 5M4 9v10a1 1 0 0 0 1 1h4v-6h6v6h4a1 1 0 0 0 1-1V9M3 9h18" /></Icone>;
const ICONE_CONTA = <Icone><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" /></Icone>;
const ICONE_MENCOES = (
  <Icone>
    <rect x="3" y="3" width="14" height="14" rx="3" />
    <path d="M7 21h10a2 2 0 0 0 2-2V7" />
  </Icone>
);
const ICONE_RELATORIOS = <Icone><path d="M4 20V10M12 20V4M20 20v-7" /></Icone>;
const ICONE_ATENDIMENTOS = (
  <Icone>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </Icone>
);
const ICONE_GUARDRAILS = <Icone><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></Icone>;
const ICONE_VOLTAR = <Icone width={15} height={15} strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" /></Icone>;
const ICONE_MENU = (
  <Icone width={20} height={20} strokeWidth={2}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icone>
);
const ICONE_FECHAR = (
  <Icone width={18} height={18} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icone>
);

export function ShoppingSidebar({
  shoppingId,
  nome,
  slug,
}: {
  shoppingId: string;
  nome: string;
  slug: string;
}) {
  const pathname = usePathname() ?? "";
  const [aberto, setAberto] = useState(false);

  const base = `/shoppings/${shoppingId}`;
  const itens: { href: string; label: string; icone: ReactNode; ativo: boolean }[] = [
    {
      href: base,
      label: "Lojas",
      icone: ICONE_LOJAS,
      ativo: pathname === base || pathname.startsWith(`${base}/lojas/`),
    },
    {
      href: `${base}/conta`,
      label: "Conta do Instagram",
      icone: ICONE_CONTA,
      ativo: pathname.startsWith(`${base}/conta`),
    },
    {
      href: `${base}/mencoes`,
      label: "Fila de menções",
      icone: ICONE_MENCOES,
      ativo: pathname.startsWith(`${base}/mencoes`),
    },
    {
      href: `${base}/relatorios`,
      label: "Relatórios",
      icone: ICONE_RELATORIOS,
      ativo: pathname.startsWith(`${base}/relatorios`),
    },
    {
      href: `${base}/atendimentos`,
      label: "Atendimentos",
      icone: ICONE_ATENDIMENTOS,
      ativo: pathname.startsWith(`${base}/atendimentos`),
    },
    {
      href: `${base}/guardrails`,
      label: "Guardrails",
      icone: ICONE_GUARDRAILS,
      ativo: pathname.startsWith(`${base}/guardrails`),
    },
  ];

  const navegacao = (
    <>
      <a
        href="/shoppings"
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-300"
      >
        {ICONE_VOLTAR}
        Shoppings
      </a>

      <div className="mt-4 border-t border-white/8 px-3 pt-3.5">
        <div className="truncate text-[14px] font-bold">{nome}</div>
        <div className="mt-0.5 truncate text-[11px] text-neutral-500">/{slug}</div>
      </div>

      <nav className="mt-3.5 flex flex-col gap-0.5">
        {itens.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
              item.ativo
                ? "bg-accent/15 text-neutral-100 [&_svg]:text-accent-strong"
                : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            }`}
          >
            {item.icone}
            {item.label}
          </a>
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* Sidebar fixa — telas grandes */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-white/8 lg:bg-ink-800 lg:px-3.5 lg:py-5">
        <div className="flex items-center gap-2 px-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-shoppinghub.png" alt="" className="h-6 w-6 object-contain" />
          <span className="font-display text-[14px] font-bold tracking-tight">ShoppingHub</span>
        </div>
        {navegacao}
      </div>

      {/* Barra superior + menu gaveta — celular/tablet */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/8 bg-ink-800/95 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/5"
        >
          {ICONE_MENU}
        </button>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-shoppinghub.png" alt="" className="h-5 w-5 object-contain" />
          <span className="font-display text-[13.5px] font-bold tracking-tight">ShoppingHub</span>
        </div>
        <div className="h-9 w-9" />
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setAberto(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col overflow-y-auto border-r border-white/8 bg-ink-800 px-3.5 py-5">
            <div className="flex items-center justify-between px-2.5">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-shoppinghub.png" alt="" className="h-6 w-6 object-contain" />
                <span className="font-display text-[14px] font-bold tracking-tight">ShoppingHub</span>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5"
              >
                {ICONE_FECHAR}
              </button>
            </div>
            {navegacao}
          </div>
        </div>
      )}
    </>
  );
}
