import type { SupabaseClient } from "@supabase/supabase-js";

// Bucket PRIVADO — diferente do shoppinghub-mencoes (que precisa ser público pra Meta baixar a
// mídia), os relatórios só são acessados de dentro do painel autenticado, via URL assinada.
export const BUCKET_RELATORIOS = "shoppinghub-relatorios";

const DIAS_ENTRE_EXPORTACOES = 30;

const ROTULO_DO_STATUS: Record<string, string> = {
  pendente: "Pendente",
  publicado: "Publicado",
  descartado_limite: "Descartado (limite diário)",
  erro: "Erro",
};

function formatarDataHoraCSV(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function escaparCampoCSV(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export type MencaoParaCSV = {
  loja_id: string;
  instagram_username: string | null;
  status: string;
  recebido_em: string;
  publicado_em: string | null;
  story_media_id: string | null;
};

// Mesmo resumo que aparece no topo da página de Relatórios (container "Resumo do período") — pedido
// em 06/09/2026 pra também sair no cabeçalho do CSV exportado, calculado em cima do mesmo período
// que já foi filtrado antes de chamar gerarCsv (automático a cada 30 dias, ou manual via
// api/shoppings/[id]/relatorios/exportar).
function gerarLinhasDeResumo(mencoes: MencaoParaCSV[], nomePorLoja: Map<string, string>): string[] {
  const publicados = mencoes.filter((m) => m.status === "publicado");
  const limiteDiario = mencoes.filter((m) => m.status === "descartado_limite").length;
  const erros = mencoes.filter((m) => m.status === "erro").length;
  const lojasAcionadas = new Set(mencoes.map((m) => m.loja_id)).size;

  const publicadosPorLoja = new Map<string, number>();
  for (const m of publicados) {
    publicadosPorLoja.set(m.loja_id, (publicadosPorLoja.get(m.loja_id) ?? 0) + 1);
  }
  const ranking = Array.from(publicadosPorLoja.entries())
    .map(([lojaId, total]) => ({ nome: nomePorLoja.get(lojaId) ?? "Loja removida", total }))
    .sort((a, b) => b.total - a.total);

  const linhas = [
    "Resumo do período",
    `Publicados,${publicados.length}`,
    `Lojistas acionados,${lojasAcionadas}`,
    `Limite diário,${limiteDiario}`,
    `Erro,${erros}`,
  ];

  if (ranking.length > 0) {
    linhas.push("", "Publicações por loja no período");
    for (const linha of ranking) {
      linhas.push([escaparCampoCSV(linha.nome), String(linha.total)].join(","));
    }
  }

  return linhas;
}

export function gerarCsv(mencoes: MencaoParaCSV[], nomePorLoja: Map<string, string>): string {
  const resumo = gerarLinhasDeResumo(mencoes, nomePorLoja);

  const cabecalho = [
    "Loja",
    "Usuario_que_marcou",
    "Recebida_em",
    "Publicada_em",
    "Status",
    "ID_da_Story",
  ];

  const linhas = mencoes.map((m) =>
    [
      nomePorLoja.get(m.loja_id) ?? "Loja removida",
      m.instagram_username ? `@${m.instagram_username}` : "",
      formatarDataHoraCSV(m.recebido_em),
      formatarDataHoraCSV(m.publicado_em),
      ROTULO_DO_STATUS[m.status] ?? m.status,
      m.story_media_id ?? "",
    ]
      .map(escaparCampoCSV)
      .join(",")
  );

  // BOM no início — sem isso o Excel abre acentos quebrados em CSV UTF-8.
  return "﻿" + [...resumo, "", cabecalho.join(","), ...linhas].join("\n");
}

/**
 * Roda a cada chamada do cron de publicar-mencoes (evita precisar de um cron a mais — o plano
 * Hobby da Vercel só permite 2). Pra cada shopping, confere se já passou `DIAS_ENTRE_EXPORTACOES`
 * desde a última exportação (ou desde a criação do shopping, se nunca exportou) e, se sim, gera um
 * CSV com todas as menções recebidas nesse período e salva no Storage + registra em
 * `shoppinghub_exportacoes_mencoes`. Gera a exportação mesmo com zero menções no período — assim
 * o "relógio" sempre avança e não fica tentando de novo a cada execução do cron.
 */
export async function exportarRelatoriosDevidos(admin: SupabaseClient): Promise<number> {
  const { data: shoppings } = await admin
    .from("shoppinghub_shoppings")
    .select("id, created_at");

  let exportacoesGeradas = 0;
  const agora = new Date();

  for (const shopping of shoppings ?? []) {
    const { data: ultimaExportacao } = await admin
      .from("shoppinghub_exportacoes_mencoes")
      .select("periodo_fim")
      .eq("shopping_id", shopping.id)
      .order("periodo_fim", { ascending: false })
      .limit(1)
      .maybeSingle();

    const inicioDoPeriodo = new Date(ultimaExportacao?.periodo_fim ?? shopping.created_at);
    const diasDesdeUltima = (agora.getTime() - inicioDoPeriodo.getTime()) / (24 * 60 * 60 * 1000);

    if (diasDesdeUltima < DIAS_ENTRE_EXPORTACOES) continue;

    try {
      await gerarExportacao(admin, shopping.id, inicioDoPeriodo, agora);
      exportacoesGeradas += 1;
    } catch (erro) {
      console.error(`Falha ao gerar exportação de relatório pro shopping ${shopping.id}:`, erro);
    }
  }

  return exportacoesGeradas;
}

async function gerarExportacao(
  admin: SupabaseClient,
  shoppingId: string,
  periodoInicio: Date,
  periodoFim: Date
): Promise<void> {
  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select("id, nome")
    .eq("shopping_id", shoppingId);

  const idsDasLojas = (lojas ?? []).map((l) => l.id);
  const nomePorLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]));

  const { data: mencoes } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("loja_id, instagram_username, status, recebido_em, publicado_em, story_media_id")
          .in("loja_id", idsDasLojas)
          .gte("recebido_em", periodoInicio.toISOString())
          .lt("recebido_em", periodoFim.toISOString())
          .order("recebido_em", { ascending: true })
      : { data: [] as MencaoParaCSV[] };

  const csv = gerarCsv((mencoes ?? []) as MencaoParaCSV[], nomePorLoja);

  const nomeArquivo = `${periodoInicio.toISOString().slice(0, 10)}_a_${periodoFim
    .toISOString()
    .slice(0, 10)}.csv`;
  const storagePath = `${shoppingId}/${nomeArquivo}`;

  const { error: erroAoSubir } = await admin.storage
    .from(BUCKET_RELATORIOS)
    .upload(storagePath, Buffer.from(csv, "utf-8"), {
      contentType: "text/csv;charset=utf-8",
      upsert: true,
    });

  if (erroAoSubir) {
    throw new Error(`Falha ao subir CSV do relatório pro Storage: ${erroAoSubir.message}`);
  }

  const { error: erroAoRegistrar } = await admin.from("shoppinghub_exportacoes_mencoes").insert({
    shopping_id: shoppingId,
    periodo_inicio: periodoInicio.toISOString(),
    periodo_fim: periodoFim.toISOString(),
    storage_path: storagePath,
    total_mencoes: mencoes?.length ?? 0,
  });

  if (erroAoRegistrar) {
    throw new Error(`Falha ao registrar exportação de relatório: ${erroAoRegistrar.message}`);
  }
}
