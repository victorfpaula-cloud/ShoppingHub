import type { SupabaseClient } from "@supabase/supabase-js";
import { escaparCampoCSV } from "./relatorios";

const ROTULO_DIRECAO: Record<string, string> = {
  recebida: "Cliente",
  enviada: "Atendimento",
};

function formatarDataHoraCSV(iso: string): string {
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
  instagram_scoped_id: string;
  direcao: string;
  texto: string;
  loja_id: string | null;
  cliente_nome: string | null;
  cliente_username: string | null;
  created_at: string;
};

export type ResumoDeAtendimentos = {
  recebidas: number;
  respondidas: number;
  clientesUnicos: number;
  lojasAcionadas: number;
  ranking: { nome: string; total: number }[];
};

async function buscarMensagensDoPeriodo(
  admin: SupabaseClient,
  shoppingId: string,
  desde: Date,
  ate: Date
): Promise<{ mensagens: MensagemDoAtendimento[]; nomePorLoja: Map<string, string> }> {
  const { data: contas } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", shoppingId);
  const contaIds = (contas ?? []).map((c) => c.id);

  const { data: mensagens } =
    contaIds.length > 0
      ? await admin
          .from("shoppinghub_mensagens")
          .select("instagram_scoped_id, direcao, texto, loja_id, cliente_nome, cliente_username, created_at")
          .in("conta_id", contaIds)
          .gte("created_at", desde.toISOString())
          .lt("created_at", ate.toISOString())
          .order("created_at", { ascending: true })
      : { data: [] as MensagemDoAtendimento[] };

  const todasAsMensagens = (mensagens ?? []) as MensagemDoAtendimento[];

  const lojaIds = Array.from(new Set(todasAsMensagens.map((m) => m.loja_id).filter(Boolean)));
  const { data: lojas } =
    lojaIds.length > 0
      ? await admin.from("shoppinghub_lojas").select("id, nome").in("id", lojaIds as string[])
      : { data: [] as { id: string; nome: string }[] };
  const nomePorLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]));

  return { mensagens: todasAsMensagens, nomePorLoja };
}

function calcularResumo(
  mensagens: MensagemDoAtendimento[],
  nomePorLoja: Map<string, string>
): ResumoDeAtendimentos {
  const recebidas = mensagens.filter((m) => m.direcao === "recebida");
  const respondidas = mensagens.filter((m) => m.direcao === "enviada");
  const clientesUnicos = new Set(recebidas.map((m) => m.instagram_scoped_id)).size;
  const lojasAcionadas = new Set(recebidas.map((m) => m.loja_id).filter(Boolean)).size;

  const porLoja = new Map<string, number>();
  for (const m of recebidas) {
    if (!m.loja_id) continue;
    porLoja.set(m.loja_id, (porLoja.get(m.loja_id) ?? 0) + 1);
  }
  const ranking = Array.from(porLoja.entries())
    .map(([lojaId, total]) => ({ nome: nomePorLoja.get(lojaId) ?? "Loja removida", total }))
    .sort((a, b) => b.total - a.total);

  return {
    recebidas: recebidas.length,
    respondidas: respondidas.length,
    clientesUnicos,
    lojasAcionadas,
    ranking,
  };
}

function montarLinhasDeResumo(resumo: ResumoDeAtendimentos): string[] {
  const linhas = [
    "Resumo do período",
    `Mensagens recebidas,${resumo.recebidas}`,
    `Mensagens respondidas,${resumo.respondidas}`,
    `Clientes únicos,${resumo.clientesUnicos}`,
    `Lojistas acionados,${resumo.lojasAcionadas}`,
  ];
  if (resumo.ranking.length > 0) {
    linhas.push("", "Atendimentos por loja no período");
    for (const linha of resumo.ranking) {
      linhas.push([escaparCampoCSV(linha.nome), String(linha.total)].join(","));
    }
  }
  return linhas;
}

/**
 * CSV completo (resumo + mensagem por mensagem) — usado pela exportação manual em
 * api/shoppings/[id]/atendimentos/exportar, pra quem quer o detalhe linha a linha.
 */
export async function gerarCsvDeAtendimentos(
  admin: SupabaseClient,
  shoppingId: string,
  desde: Date,
  ate: Date
): Promise<string> {
  const { mensagens, nomePorLoja } = await buscarMensagensDoPeriodo(admin, shoppingId, desde, ate);
  const resumo = calcularResumo(mensagens, nomePorLoja);

  const cabecalho = ["Cliente", "Usuario", "Loja", "Direcao", "Mensagem", "Data_e_hora"];
  const linhas = mensagens.map((m) =>
    [
      m.cliente_nome ?? "Cliente",
      m.cliente_username ? `@${m.cliente_username}` : "",
      m.loja_id ? nomePorLoja.get(m.loja_id) ?? "Loja removida" : "",
      ROTULO_DIRECAO[m.direcao] ?? m.direcao,
      m.texto,
      formatarDataHoraCSV(m.created_at),
    ]
      .map(escaparCampoCSV)
      .join(",")
  );

  // BOM no início — sem isso o Excel abre acentos quebrados em CSV UTF-8.
  return "﻿" + [...montarLinhasDeResumo(resumo), "", cabecalho.join(","), ...linhas].join("\n");
}

/**
 * Só o resumo (sem a lista de mensagens) — usado pelo PDF que vai por e-mail (ver
 * gerarPdfDeAtendimentos em pdfRelatorio.ts), que mostra só os números e o ranking por loja.
 */
export async function buscarResumoDeAtendimentos(
  admin: SupabaseClient,
  shoppingId: string,
  desde: Date,
  ate: Date
): Promise<ResumoDeAtendimentos> {
  const { mensagens, nomePorLoja } = await buscarMensagensDoPeriodo(admin, shoppingId, desde, ate);
  return calcularResumo(mensagens, nomePorLoja);
}
