import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { escaparCampoCSV } from "@/lib/relatorios";

const OPCOES_DE_DIAS_VALIDAS = [15, 30];

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

// Exportação manual dos atendimentos (pedido em 06/09/2026, substituindo o antigo "Relatório de
// atendimentos" da home em PDF) — mesmo padrão da exportação de menções: um cabeçalho de resumo do
// período seguido da lista de mensagens, tudo num único CSV.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const diasPedidos = Number(request.nextUrl.searchParams.get("dias"));
  const dias = OPCOES_DE_DIAS_VALIDAS.includes(diasPedidos) ? diasPedidos : 30;

  const admin = criarClienteAdmin();

  const { data: contas } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", params.id);
  const contaIds = (contas ?? []).map((c) => c.id);

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data: mensagens } =
    contaIds.length > 0
      ? await admin
          .from("shoppinghub_mensagens")
          .select("instagram_scoped_id, direcao, texto, loja_id, cliente_nome, cliente_username, created_at")
          .in("conta_id", contaIds)
          .gte("created_at", desde)
          .order("created_at", { ascending: true })
      : { data: [] as MensagemDoAtendimento[] };

  const todasAsMensagens = (mensagens ?? []) as MensagemDoAtendimento[];

  const lojaIds = Array.from(new Set(todasAsMensagens.map((m) => m.loja_id).filter(Boolean)));
  const { data: lojas } =
    lojaIds.length > 0
      ? await admin.from("shoppinghub_lojas").select("id, nome").in("id", lojaIds as string[])
      : { data: [] as { id: string; nome: string }[] };
  const nomePorLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]));

  const recebidas = todasAsMensagens.filter((m) => m.direcao === "recebida");
  const respondidas = todasAsMensagens.filter((m) => m.direcao === "enviada");
  const clientesUnicos = new Set(recebidas.map((m) => m.instagram_scoped_id)).size;
  const lojasAcionadas = new Set(recebidas.map((m) => m.loja_id).filter(Boolean)).size;

  const mensagensPorLoja = new Map<string, number>();
  for (const m of recebidas) {
    if (!m.loja_id) continue;
    mensagensPorLoja.set(m.loja_id, (mensagensPorLoja.get(m.loja_id) ?? 0) + 1);
  }
  const ranking = Array.from(mensagensPorLoja.entries())
    .map(([lojaId, total]) => ({ nome: nomePorLoja.get(lojaId) ?? "Loja removida", total }))
    .sort((a, b) => b.total - a.total);

  const resumo = [
    "Resumo do período",
    `Mensagens recebidas,${recebidas.length}`,
    `Mensagens respondidas,${respondidas.length}`,
    `Clientes únicos,${clientesUnicos}`,
    `Lojistas acionados,${lojasAcionadas}`,
  ];
  if (ranking.length > 0) {
    resumo.push("", "Atendimentos por loja no período");
    for (const linha of ranking) {
      resumo.push([escaparCampoCSV(linha.nome), String(linha.total)].join(","));
    }
  }

  const cabecalho = ["Cliente", "Usuario", "Loja", "Direcao", "Mensagem", "Data_e_hora"];
  const linhas = todasAsMensagens.map((m) =>
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
  const csv = "﻿" + [...resumo, "", cabecalho.join(","), ...linhas].join("\n");

  const nomeArquivo = `atendimentos_ultimos_${dias}_dias_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
