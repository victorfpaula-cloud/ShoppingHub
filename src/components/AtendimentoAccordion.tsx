"use client";

import { useState } from "react";

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type MensagemDoAtendimento = {
  direcao: "recebida" | "enviada";
  texto: string;
  dataHoraIso: string;
  lojaNome: string | null;
};

export function AtendimentoAccordion({
  shoppingId,
  instagramScopedId,
  clienteNome,
  clienteUsername,
  totalMensagens,
  ultimaMensagemEmFormatada,
  pausado,
}: {
  shoppingId: string;
  instagramScopedId: string;
  clienteNome: string;
  clienteUsername: string | null;
  totalMensagens: number;
  ultimaMensagemEmFormatada: string;
  pausado: boolean;
}) {
  const [carregando, setCarregando] = useState(false);
  const [comErro, setComErro] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemDoAtendimento[] | null>(null);

  // Nativo (<details> descontrolado, sem estado de aberto/fechado no React — só usa o evento
  // "toggle" pra saber quando buscar) em vez do padrão com botão+seta usado no detalhamento diário
  // de Relatórios: mantém o visual/comportamento que esse card de atendimento já tinha antes.
  async function aoAlternar(evento: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!evento.currentTarget.open || mensagens || carregando) return;

    setCarregando(true);
    setComErro(false);
    try {
      const resposta = await fetch(
        `/api/shoppings/${shoppingId}/atendimentos/conversa?scopedId=${encodeURIComponent(instagramScopedId)}`
      );
      if (!resposta.ok) throw new Error("Falha ao buscar a conversa.");
      const dados = await resposta.json();
      setMensagens(dados.mensagens);
    } catch {
      setComErro(true);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <details className="rounded-xl border border-white/8 bg-ink-850" onToggle={aoAlternar}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold text-neutral-100">
            {clienteNome}
            {clienteUsername && <span className="text-neutral-500"> @{clienteUsername}</span>}
          </p>
          <p className="mt-0.5 text-[11.5px] text-neutral-500">
            Último contato em {ultimaMensagemEmFormatada}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {pausado && (
            <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[10.5px] font-bold text-warn">
              BOT PAUSADO
            </span>
          )}
          <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10.5px] font-semibold text-neutral-300">
            {totalMensagens} mensagem{totalMensagens === 1 ? "" : "ns"}
          </span>
        </div>
      </summary>

      {pausado && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/8 bg-warn/[0.04] px-4 py-2.5">
          <p className="text-[11.5px] text-warn">
            Alguém respondeu essa conversa direto pelo Instagram — o bot está pausado aqui.
          </p>
          <form action={`/api/shoppings/${shoppingId}/atendimentos/retomar`} method="POST">
            <input type="hidden" name="instagram_scoped_id" value={instagramScopedId} />
            <button
              type="submit"
              className="shrink-0 rounded-[9px] border border-warn/40 bg-transparent px-3 py-1.5 text-xs font-semibold text-warn hover:bg-warn/10"
            >
              Retomar bot
            </button>
          </form>
        </div>
      )}

      {carregando && (
        <p className="border-t border-white/8 px-4 py-4 text-center text-xs text-neutral-500">
          Carregando…
        </p>
      )}

      {comErro && (
        <p className="border-t border-white/8 px-4 py-4 text-center text-xs text-danger">
          Não deu pra carregar essa conversa. Tenta abrir de novo.
        </p>
      )}

      {mensagens && (
        <ul className="divide-y divide-white/8 border-t border-white/8">
          {mensagens.map((m, indice) => (
            <li key={indice} className="flex flex-col gap-0.5 px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span
                  className={
                    m.direcao === "recebida"
                      ? "font-semibold text-neutral-300"
                      : "font-semibold text-accent-strong"
                  }
                >
                  {m.direcao === "recebida" ? "Cliente" : "Atendimento"}
                  {m.lojaNome && <span className="text-neutral-500"> · {m.lojaNome}</span>}
                </span>
                <span className="shrink-0 text-neutral-500">{formatarDataHora(m.dataHoraIso)}</span>
              </div>
              <p className="text-neutral-400">{m.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
