import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarResumoDeAtendimentos } from "./atendimentos";
import { enviarEmailComAnexos } from "./email";
import { gerarPdfDeMencoes, gerarPdfDeAtendimentos, type LinhaDeDetalheDeMencao } from "./pdfRelatorio";

const DIAS_ENTRE_EXPORTACOES = 30;

// Pedido em 06/09/2026: em vez de guardar um CSV no Storage a cada ciclo (ninguém baixava, só
// ocupava espaço), a exportação periódica manda os dois relatórios (menções/Stories e
// atendimentos) direto por e-mail, em PDF — o e-mail já é o "arquivo salvo".
const EMAIL_DESTINO_DOS_RELATORIOS = "victorfpaula@gmail.com";

function formatarDataCurtaEmail(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(data);
}

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

type ResumoDeMencoes = {
  publicados: number;
  lojasAcionadas: number;
  limiteDiario: number;
  erros: number;
  ranking: { nome: string; total: number }[];
};

function calcularResumoDeMencoes(
  mencoes: MencaoParaCSV[],
  nomePorLoja: Map<string, string>
): ResumoDeMencoes {
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

  return { publicados: publicados.length, lojasAcionadas, limiteDiario, erros, ranking };
}

// Mesmo resumo que aparece no topo da página de Relatórios (container "Resumo do período") — sai
// também no cabeçalho do CSV exportado manualmente (api/shoppings/[id]/relatorios/exportar).
function gerarLinhasDeResumo(mencoes: MencaoParaCSV[], nomePorLoja: Map<string, string>): string[] {
  const resumo = calcularResumoDeMencoes(mencoes, nomePorLoja);

  const linhas = [
    "Resumo do período",
    `Publicados,${resumo.publicados}`,
    `Lojistas acionados,${resumo.lojasAcionadas}`,
    `Limite diário,${resumo.limiteDiario}`,
    `Erro,${resumo.erros}`,
  ];

  if (resumo.ranking.length > 0) {
    linhas.push("", "Publicações por loja no período");
    for (const linha of resumo.ranking) {
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

async function buscarMencoesDoPeriodo(
  admin: SupabaseClient,
  shoppingId: string,
  desde: Date,
  ate: Date
): Promise<{ mencoes: MencaoParaCSV[]; nomePorLoja: Map<string, string> }> {
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
          .gte("recebido_em", desde.toISOString())
          .lt("recebido_em", ate.toISOString())
          .order("recebido_em", { ascending: true })
      : { data: [] as MencaoParaCSV[] };

  return { mencoes: (mencoes ?? []) as MencaoParaCSV[], nomePorLoja };
}

async function buscarNomeDoShopping(admin: SupabaseClient, shoppingId: string): Promise<string> {
  const { data: shopping } = await admin
    .from("shoppinghub_shoppings")
    .select("nome")
    .eq("id", shoppingId)
    .maybeSingle();
  return shopping?.nome ?? "Shopping";
}

function sufixoDoArquivo(periodoInicio: Date, periodoFim: Date): string {
  return `${periodoInicio.toISOString().slice(0, 10)}_a_${periodoFim.toISOString().slice(0, 10)}.pdf`;
}

/**
 * Manda só o relatório de Menções/Stories por e-mail, em PDF — separado do de atendimentos
 * (pedido em 06/09/2026: mandar os dois juntos num e-mail só suspeitou-se de estar pesado demais
 * pra function, então cada relatório agora é gerado e enviado numa chamada independente, mais leve
 * — usado tanto pelo ciclo automático a cada 30 dias quanto pelo botão "Enviar por e-mail" na
 * página de Relatórios). Nunca lança erro (ver enviarEmailComAnexos) — devolve se deu certo.
 */
export async function enviarRelatorioDeMencoesPorEmail(
  admin: SupabaseClient,
  shoppingId: string,
  periodoInicio: Date,
  periodoFim: Date
): Promise<boolean> {
  const nomeDoShopping = await buscarNomeDoShopping(admin, shoppingId);
  const periodoFormatado = `${formatarDataCurtaEmail(periodoInicio)} a ${formatarDataCurtaEmail(periodoFim)}`;

  const { mencoes, nomePorLoja } = await buscarMencoesDoPeriodo(admin, shoppingId, periodoInicio, periodoFim);
  const resumo = calcularResumoDeMencoes(mencoes, nomePorLoja);
  const detalhes: LinhaDeDetalheDeMencao[] = mencoes.map((m) => ({
    loja: nomePorLoja.get(m.loja_id) ?? "Loja removida",
    usuario: m.instagram_username,
    recebidoEm: m.recebido_em,
    publicadoEm: m.publicado_em,
    status: m.status,
  }));

  const pdf = await gerarPdfDeMencoes({
    shoppingNome: nomeDoShopping,
    periodoTexto: periodoFormatado,
    ...resumo,
    detalhes,
  });

  return enviarEmailComAnexos({
    destinatario: EMAIL_DESTINO_DOS_RELATORIOS,
    assunto: `Relatório de Menções ShoppingHub — ${nomeDoShopping} (${periodoFormatado})`,
    corpoHtml: `
      <p>Relatório de Menções/Stories de <strong>${nomeDoShopping}</strong>, período de ${periodoFormatado}:
      ${resumo.publicados} publicadas.</p>
      <p>Em anexo, em PDF.</p>
    `,
    anexos: [{ nomeArquivo: `mencoes_${sufixoDoArquivo(periodoInicio, periodoFim)}`, conteudo: pdf }],
  });
}

/**
 * Igual ao de cima, só que pro relatório de Atendimentos.
 */
export async function enviarRelatorioDeAtendimentosPorEmail(
  admin: SupabaseClient,
  shoppingId: string,
  periodoInicio: Date,
  periodoFim: Date
): Promise<boolean> {
  const nomeDoShopping = await buscarNomeDoShopping(admin, shoppingId);
  const periodoFormatado = `${formatarDataCurtaEmail(periodoInicio)} a ${formatarDataCurtaEmail(periodoFim)}`;

  const resumo = await buscarResumoDeAtendimentos(admin, shoppingId, periodoInicio, periodoFim);

  const pdf = await gerarPdfDeAtendimentos({
    shoppingNome: nomeDoShopping,
    periodoTexto: periodoFormatado,
    recebidas: resumo.recebidas,
    respondidas: resumo.respondidas,
    clientesUnicos: resumo.clientesUnicos,
    lojasAcionadas: resumo.lojasAcionadas,
  });

  return enviarEmailComAnexos({
    destinatario: EMAIL_DESTINO_DOS_RELATORIOS,
    assunto: `Relatório de Atendimentos ShoppingHub — ${nomeDoShopping} (${periodoFormatado})`,
    corpoHtml: `
      <p>Relatório de Atendimentos de <strong>${nomeDoShopping}</strong>, período de ${periodoFormatado}:
      ${resumo.recebidas} mensagens recebidas.</p>
      <p>Em anexo, em PDF.</p>
    `,
    anexos: [{ nomeArquivo: `atendimentos_${sufixoDoArquivo(periodoInicio, periodoFim)}`, conteudo: pdf }],
  });
}

/**
 * Roda a cada chamada do cron de publicar-mencoes (evita precisar de um cron a mais — o plano
 * Hobby da Vercel só permite 2). Pra cada shopping, confere se já passou `DIAS_ENTRE_EXPORTACOES`
 * desde a última exportação (ou desde a criação do shopping, se nunca exportou) e, se sim, manda os
 * relatórios do período por e-mail (ver enviarRelatoriosPorEmail) e registra o ciclo em
 * `shoppinghub_exportacoes_mencoes` — só pra saber quando foi a última vez (não guarda mais nenhum
 * arquivo). Registra mesmo com zero menções no período — assim o "relógio" sempre avança e não
 * fica tentando de novo a cada execução do cron.
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
  const { mencoes } = await buscarMencoesDoPeriodo(admin, shoppingId, periodoInicio, periodoFim);

  const { error: erroAoRegistrar } = await admin.from("shoppinghub_exportacoes_mencoes").insert({
    shopping_id: shoppingId,
    periodo_inicio: periodoInicio.toISOString(),
    periodo_fim: periodoFim.toISOString(),
    // Nenhum arquivo é guardado mais (os relatórios vão só por e-mail) — coluna mantida só porque é
    // NOT NULL no banco; nada lê esse valor.
    storage_path: "nao-armazenado",
    total_mencoes: mencoes.length,
  });

  if (erroAoRegistrar) {
    throw new Error(`Falha ao registrar exportação de relatório: ${erroAoRegistrar.message}`);
  }

  // E-mail é "melhor esforço" — se falhar, só loga (ver enviarEmailComAnexos): o ciclo já foi
  // registrado acima, então essa exportação não deve ser tentada de novo por causa disso. Dois
  // e-mails separados (não um só com dois anexos) — mais leve por chamada, e um dos dois falhar
  // não impede o outro de sair.
  await enviarRelatorioDeMencoesPorEmail(admin, shoppingId, periodoInicio, periodoFim);
  await enviarRelatorioDeAtendimentosPorEmail(admin, shoppingId, periodoInicio, periodoFim);
}
