"use client";

import { type ReactNode, type SVGProps } from "react";
import { usePathname } from "next/navigation";

function Icone(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="15"
      height="15"
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
const ICONE_VOLTAR = <Icone width={13} height={13} strokeWidth={2.2}><path d="M19 12H5M12 19l-7-7 7-7" /></Icone>;

export function ShoppingTopNav({
  shoppingId,
  nome,
  slug,
}: {
  shoppingId: string;
  nome: string;
  slug: string;
}) {
  const pathname = usePathname() ?? "";

  const base = `/shoppings/${shoppingId}`;
  const itens: { href: string; label: string; labelCurto: string; icone: ReactNode; ativo: boolean }[] = [
    {
      href: base,
      label: "Lojas",
      labelCurto: "Lojas",
      icone: ICONE_LOJAS,
      ativo: pathname === base || pathname.startsWith(`${base}/lojas/`),
    },
    {
      href: `${base}/mencoes`,
      label: "Fila de menções",
      labelCurto: "Menções",
      icone: ICONE_MENCOES,
      ativo: pathname.startsWith(`${base}/mencoes`),
    },
    {
      href: `${base}/relatorios`,
      label: "Relatórios",
      labelCurto: "Relatórios",
      icone: ICONE_RELATORIOS,
      ativo: pathname.startsWith(`${base}/relatorios`),
    },
    {
      href: `${base}/atendimentos`,
      label: "Atendimentos",
      labelCurto: "Atend.",
      icone: ICONE_ATENDIMENTOS,
      ativo: pathname.startsWith(`${base}/atendimentos`),
    },
    {
      href: `${base}/guardrails`,
      label: "Guardrails",
      labelCurto: "Guardrails",
      icone: ICONE_GUARDRAILS,
      ativo: pathname.startsWith(`${base}/guardrails`),
    },
    {
      href: `${base}/conta`,
      label: "Conta do Instagram",
      labelCurto: "Conta IG",
      icone: ICONE_CONTA,
      ativo: pathname.startsWith(`${base}/conta`),
    },
  ];

  return (
    <div className="sticky top-0 z-40 border-b border-white/8 bg-ink-800/95 backdrop-blur">
      <div className="mx-auto max-w-5xl px-6 pt-3.5 lg:px-10">
        <div className="flex items-center justify-between gap-3">
          <a
            href="/shoppings"
            className="flex items-center gap-1.5 text-[11.5px] font-semibold text-neutral-500 transition hover:text-neutral-300"
          >
            {ICONE_VOLTAR}
            Shoppings
          </a>
          <div className="min-w-0 text-right">
            <div className="truncate text-[13px] font-bold leading-tight">{nome}</div>
            <div className="truncate text-[10.5px] text-neutral-500">/{slug}</div>
          </div>
        </div>

        <nav className="mt-3 grid grid-cols-3 gap-1.5 pb-3 sm:flex sm:gap-1 sm:overflow-x-auto sm:pb-0">
          {itens.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-center text-[10.5px] font-semibold leading-tight transition sm:flex-row sm:shrink-0 sm:justify-start sm:gap-2 sm:whitespace-nowrap sm:rounded-t-lg sm:rounded-b-none sm:px-3 sm:py-2 sm:text-[12.5px] ${
                item.ativo
                  ? "bg-ink-900 text-neutral-100 [&_svg]:text-accent-strong"
                  : "bg-white/[0.03] text-neutral-500 hover:bg-white/5 hover:text-neutral-300 sm:bg-transparent"
              }`}
            >
              {item.icone}
              <span className="sm:hidden">{item.labelCurto}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
