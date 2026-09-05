"use client";

import { useState } from "react";

const ROTULO_DO_STATUS: Record<string, { texto: string; classe: string }> = {
  pendente: { texto: "Pendente", classe: "bg-warn/15 text-warn" },
  publicado: { texto: "Publicado", classe: "bg-ok/15 text-ok" },
  descartado_limite: { texto: "Limite diário", classe: "bg-white/8 text-neutral-400" },
  erro: { texto: "Erro", classe: "bg-danger/15 text-danger" },
};

function formatarHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type Mencao = {
  id: string;
  loja_id: string;
  instagram_username: string | null;
  status: string;
  recebido_em: string;
  publicado_em: string | null;
  story_media_id: string | null;
};

type RespostaDoDia = { mencoes: Mencao[]; nomePorLoja: Record<string, string> };

export function DiaDeMencoesAccordion({
  shoppingId,
  chaveDoDia,
  tituloFormatado,
  totalDeMencoes,
}: {
  shoppingId: string;
  chaveDoDia: string;
  tituloFormatado: string;
  totalDeMencoes: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [comErro, setComErro] = useState(false);
  const [dados, setDados] = useState<RespostaDoDia | null>(null);

  async function alternar() {
    const vaiAbrir = !aberto;
    setAberto(vaiAbrir);
    if (!vaiAbrir || dados || carregando) return;

    setCarregando(true);
    setComErro(false);
    try {
      const resposta = await fetch(
        `/api/shoppings/${shoppingId}/relatorios/dia?data=${chaveDoDia}`
      );
      if (!resposta.ok) throw new Error("Falha ao buscar detalhamento do dia.");
      setDados(await resposta.json());
    } catch {
      setComErro(true);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-ink-900">
      <button
        type="button"
        onClick={alternar}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <p className="text-[13px] font-bold capitalize text-neutral-200">{tituloFormatado}</p>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10.5px] font-semibold text-neutral-300">
            {totalDeMencoes} menç{totalDeMencoes === 1 ? "ão" : "ões"}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-neutral-500 transition-transform duration-200 ${aberto ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {aberto && (
        <div className="border-t border-white/8">
          {carregando && <p className="px-4 py-5 text-center text-xs text-neutral-500">Carregando…</p>}

          {comErro && (
            <p className="px-4 py-5 text-center text-xs text-danger">
              Não deu pra carregar essa data. Tenta abrir de novo.
            </p>
          )}

          {dados && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-neutral-500">
                    <th className="px-4 py-2 font-semibold">Loja</th>
                    <th className="px-2 py-2 font-semibold">@usuário</th>
                    <th className="px-2 py-2 font-semibold">Postado</th>
                    <th className="px-2 py-2 font-semibold">Republicado</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {dados.mencoes.map((m) => {
                    const rotulo = ROTULO_DO_STATUS[m.status] ?? {
                      texto: m.status,
                      classe: "bg-white/8 text-neutral-400",
                    };
                    return (
                      <tr key={m.id}>
                        <td className="px-4 py-2.5 text-neutral-200">
                          {dados.nomePorLoja[m.loja_id] ?? "Loja removida"}
                        </td>
                        <td className="px-2 py-2.5 text-neutral-400">
                          {m.instagram_username ? `@${m.instagram_username}` : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-neutral-400">{formatarHora(m.recebido_em)}</td>
                        <td className="px-2 py-2.5 text-neutral-400">
                          {m.publicado_em ? formatarHora(m.publicado_em) : "—"}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${rotulo.classe}`}>
                            {rotulo.texto.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
