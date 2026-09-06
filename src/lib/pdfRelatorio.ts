import PDFDocument from "pdfkit";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Pedido em 06/09/2026: em vez do CSV cru, o anexo do e-mail vira um PDF com a cara do painel
// (logo, cores da marca) — fundo claro (bom pra imprimir/ler no e-mail), mas com uma faixa escura
// no topo e o roxo de destaque (accent, ver tailwind.config.ts) nas barras e cartões, pra manter a
// identidade visual sem gastar tinta/ficar pesado num fundo 100% escuro.
const MARGEM = 40;
const ALTURA_CABECALHO = 92;

const COR_FUNDO_CABECALHO = "#07080a";
const COR_TEXTO_CLARO = "#ffffff";
const COR_TEXTO_CLARO_SECUNDARIO = "#c9c4fb";
const COR_TEXTO_PRINCIPAL = "#111318";
const COR_TEXTO_SECUNDARIO = "#6b7280";
const COR_TEXTO_TERCIARIO = "#374151";
const COR_CARTAO_FUNDO = "#f4f4f6";
const COR_BARRA_FUNDO = "#eceafc";
const COR_ACCENT = "#7c6ef2";

type Documento = InstanceType<typeof PDFDocument>;

// O PNG original (256x256, ~65KB) é o corpo inteiro do PDF praticamente sozinho — no cabeçalho ele
// só aparece a 40pt (bem pequeno), então reduzir e converter pra JPEG antes de embutir corta isso
// pra menos de 3KB sem perda visível. O fundo "achatado" usa a mesma cor da faixa escura do
// cabeçalho (ver desenharCabecalho) — como o logo já vai por cima dessa faixa, fica imperceptível.
let logoBufferPromise: Promise<Buffer> | null = null;
function carregarLogo(): Promise<Buffer> {
  if (!logoBufferPromise) {
    logoBufferPromise = readFile(path.join(process.cwd(), "public/logo-shoppinghub.png")).then(
      (original) =>
        sharp(original)
          .resize(96, 96)
          .flatten({ background: COR_FUNDO_CABECALHO })
          .jpeg({ quality: 82 })
          .toBuffer()
    );
  }
  return logoBufferPromise;
}

export type CartaoDeEstatistica = { rotulo: string; valor: string | number; cor: string };
export type LinhaDeRanking = { nome: string; total: number };
export type LinhaDeDetalheDeMencao = {
  loja: string;
  usuario: string | null;
  recebidoEm: string;
  publicadoEm: string | null;
  status: string;
};

const ROTULO_DO_STATUS_PDF: Record<string, { texto: string; cor: string }> = {
  pendente: { texto: "Pendente", cor: "#f59e0b" },
  publicado: { texto: "Publicado", cor: "#059669" },
  descartado_limite: { texto: "Limite diário", cor: "#9ca3af" },
  erro: { texto: "Erro", cor: "#dc2626" },
};

function formatarDataHoraTabela(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function desenharCabecalho(
  doc: Documento,
  opts: { tituloDocumento: string; shoppingNome: string; periodoTexto: string }
): Promise<number> {
  const logo = await carregarLogo();
  const larguraUtil = doc.page.width - MARGEM * 2;

  doc.rect(0, 0, doc.page.width, ALTURA_CABECALHO).fill(COR_FUNDO_CABECALHO);
  doc.image(logo, MARGEM, 26, { width: 40, height: 40 });

  doc
    .fillColor(COR_TEXTO_CLARO)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("ShoppingHub", MARGEM + 52, 30, { lineBreak: false });
  doc
    .fillColor(COR_TEXTO_CLARO_SECUNDARIO)
    .font("Helvetica")
    .fontSize(9.5)
    .text("Relatório automático", MARGEM + 52, 50, { lineBreak: false });

  doc
    .fillColor(COR_TEXTO_CLARO)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(opts.tituloDocumento, MARGEM, 26, { width: larguraUtil, align: "right", lineBreak: false });
  doc
    .fillColor(COR_TEXTO_CLARO_SECUNDARIO)
    .font("Helvetica")
    .fontSize(10)
    .text(`${opts.shoppingNome}  ·  ${opts.periodoTexto}`, MARGEM, 50, {
      width: larguraUtil,
      align: "right",
      lineBreak: false,
    });

  return ALTURA_CABECALHO + 30;
}

function desenharCartoesDeEstatistica(doc: Documento, y: number, cartoes: CartaoDeEstatistica[]): number {
  const larguraUtil = doc.page.width - MARGEM * 2;
  const espaco = 12;
  const larguraCartao = (larguraUtil - espaco * (cartoes.length - 1)) / cartoes.length;
  const altura = 62;

  cartoes.forEach((cartao, indice) => {
    const x = MARGEM + indice * (larguraCartao + espaco);
    doc.roundedRect(x, y, larguraCartao, altura, 8).fill(COR_CARTAO_FUNDO);
    doc.rect(x, y, 4, altura).fill(cartao.cor);
    doc
      .fillColor(COR_TEXTO_SECUNDARIO)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(cartao.rotulo.toUpperCase(), x + 14, y + 12, { width: larguraCartao - 24, lineBreak: false });
    doc
      .fillColor(COR_TEXTO_PRINCIPAL)
      .font("Helvetica-Bold")
      .fontSize(21)
      .text(String(cartao.valor), x + 14, y + 28, { lineBreak: false });
  });

  return y + altura + 34;
}

function desenharRanking(
  doc: Documento,
  y: number,
  titulo: string,
  linhas: LinhaDeRanking[],
  formatarValor: (n: number) => string
): number {
  doc.fillColor(COR_TEXTO_PRINCIPAL).font("Helvetica-Bold").fontSize(12).text(titulo, MARGEM, y, { lineBreak: false });
  let cursor = y + 24;

  if (linhas.length === 0) {
    doc
      .fillColor(COR_TEXTO_SECUNDARIO)
      .font("Helvetica")
      .fontSize(10)
      .text("Nenhum registro nesse período.", MARGEM, cursor, { lineBreak: false });
    return cursor + 24;
  }

  const maior = Math.max(...linhas.map((l) => l.total), 1);
  const larguraTotal = doc.page.width - MARGEM * 2;
  const larguraNome = 160;
  const larguraValor = 100;
  const larguraBarra = larguraTotal - larguraNome - larguraValor - 16;

  for (const linha of linhas) {
    doc
      .fillColor(COR_TEXTO_TERCIARIO)
      .font("Helvetica")
      .fontSize(9.5)
      .text(linha.nome, MARGEM, cursor + 3, {
        width: larguraNome - 8,
        height: 14,
        ellipsis: true,
        lineBreak: false,
      });

    const xBarra = MARGEM + larguraNome;
    doc.roundedRect(xBarra, cursor, larguraBarra, 10, 5).fill(COR_BARRA_FUNDO);
    const larguraPreenchida = Math.max(8, (linha.total / maior) * larguraBarra);
    doc.roundedRect(xBarra, cursor, larguraPreenchida, 10, 5).fill(COR_ACCENT);

    doc
      .fillColor(COR_TEXTO_PRINCIPAL)
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(formatarValor(linha.total), xBarra + larguraBarra + 10, cursor + 1, {
        width: larguraValor,
        lineBreak: false,
      });

    cursor += 22;
  }

  return cursor + 12;
}

// Colunas da tabela detalhada — larguras somam a largura útil da página (A4, margem de 40pt de
// cada lado). Reaproveitadas tanto no cabeçalho quanto em cada linha, e redesenhadas no topo de
// cada página nova (ver desenharTabelaDeMencoes).
function colunasDaTabelaDeMencoes(larguraUtil: number) {
  const larguraLoja = 130;
  const larguraUsuario = 110;
  const larguraData = 88;
  return [
    { titulo: "Loja", largura: larguraLoja },
    { titulo: "@usuário", largura: larguraUsuario },
    { titulo: "Marcado em", largura: larguraData },
    { titulo: "Publicado em", largura: larguraData },
    { titulo: "Status", largura: larguraUtil - larguraLoja - larguraUsuario - larguraData * 2 },
  ];
}

function desenharCabecalhoDeColunas(
  doc: Documento,
  y: number,
  colunas: ReturnType<typeof colunasDaTabelaDeMencoes>,
  larguraUtil: number
): number {
  let x = MARGEM;
  doc.fillColor(COR_TEXTO_SECUNDARIO).font("Helvetica-Bold").fontSize(8);
  for (const coluna of colunas) {
    doc.text(coluna.titulo.toUpperCase(), x, y, { width: coluna.largura - 6, lineBreak: false });
    x += coluna.largura;
  }
  const yLinha = y + 12;
  doc.moveTo(MARGEM, yLinha).lineTo(MARGEM + larguraUtil, yLinha).strokeColor("#e5e7eb").lineWidth(1).stroke();
  return yLinha + 10;
}

/**
 * Tabela linha a linha (uma por menção) — o detalhamento que tinha sumido quando o relatório virou
 * PDF (pedido de volta em 06/09/2026): loja, @usuário, horário em que a Story marcou o lojista,
 * horário em que foi republicada, e status. Pagina sozinha (repete o cabeçalho das colunas em cada
 * página nova) porque um período de 30 dias facilmente passa de uma página de menções.
 */
function desenharTabelaDeMencoes(doc: Documento, y: number, titulo: string, linhas: LinhaDeDetalheDeMencao[]): number {
  doc.fillColor(COR_TEXTO_PRINCIPAL).font("Helvetica-Bold").fontSize(12).text(titulo, MARGEM, y, { lineBreak: false });
  let cursor = y + 24;

  if (linhas.length === 0) {
    doc
      .fillColor(COR_TEXTO_SECUNDARIO)
      .font("Helvetica")
      .fontSize(10)
      .text("Nenhum registro nesse período.", MARGEM, cursor, { lineBreak: false });
    return cursor + 24;
  }

  const larguraUtil = doc.page.width - MARGEM * 2;
  const colunas = colunasDaTabelaDeMencoes(larguraUtil);
  const ALTURA_LINHA = 18;
  const LIMITE_INFERIOR = doc.page.height - 50;

  cursor = desenharCabecalhoDeColunas(doc, cursor, colunas, larguraUtil);

  linhas.forEach((linha, indice) => {
    if (cursor + ALTURA_LINHA > LIMITE_INFERIOR) {
      doc.addPage();
      cursor = desenharCabecalhoDeColunas(doc, MARGEM, colunas, larguraUtil);
    }

    if (indice % 2 === 1) {
      doc.rect(MARGEM, cursor - 3, larguraUtil, ALTURA_LINHA).fill("#f9fafb");
    }

    let x = MARGEM;
    doc
      .fillColor(COR_TEXTO_TERCIARIO)
      .font("Helvetica")
      .fontSize(8.5)
      .text(linha.loja, x, cursor, { width: colunas[0].largura - 6, height: 12, ellipsis: true, lineBreak: false });
    x += colunas[0].largura;

    doc
      .fillColor(COR_TEXTO_SECUNDARIO)
      .text(linha.usuario ? `@${linha.usuario}` : "—", x, cursor, {
        width: colunas[1].largura - 6,
        height: 12,
        ellipsis: true,
        lineBreak: false,
      });
    x += colunas[1].largura;

    doc
      .fillColor(COR_TEXTO_TERCIARIO)
      .text(formatarDataHoraTabela(linha.recebidoEm), x, cursor, { width: colunas[2].largura - 6, lineBreak: false });
    x += colunas[2].largura;

    doc.text(formatarDataHoraTabela(linha.publicadoEm), x, cursor, { width: colunas[3].largura - 6, lineBreak: false });
    x += colunas[3].largura;

    const rotulo = ROTULO_DO_STATUS_PDF[linha.status] ?? { texto: linha.status, cor: "#9ca3af" };
    doc.circle(x + 3, cursor + 4, 3).fill(rotulo.cor);
    doc
      .fillColor(COR_TEXTO_TERCIARIO)
      .font("Helvetica-Bold")
      .text(rotulo.texto, x + 12, cursor, { width: colunas[4].largura - 12, lineBreak: false });

    cursor += ALTURA_LINHA;
  });

  return cursor + 16;
}

function desenharRodape(doc: Documento) {
  const y = doc.page.height - 40;
  const larguraUtil = doc.page.width - MARGEM * 2;
  const geradoEm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  doc
    .fillColor("#9ca3af")
    .font("Helvetica")
    .fontSize(8)
    .text(`Gerado automaticamente pelo ShoppingHub em ${geradoEm}`, MARGEM, y, {
      width: larguraUtil,
      align: "center",
      lineBreak: false,
    });
}

function finalizarPdf(doc: Documento): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = [];
    doc.on("data", (pedaco: Buffer) => pedacos.push(pedaco));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function gerarPdfDeMencoes(opts: {
  shoppingNome: string;
  periodoTexto: string;
  publicados: number;
  lojasAcionadas: number;
  limiteDiario: number;
  erros: number;
  ranking: LinhaDeRanking[];
  detalhes: LinhaDeDetalheDeMencao[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });

  let y = await desenharCabecalho(doc, {
    tituloDocumento: "Relatório de Menções",
    shoppingNome: opts.shoppingNome,
    periodoTexto: opts.periodoTexto,
  });

  y = desenharCartoesDeEstatistica(doc, y, [
    { rotulo: "Publicados", valor: opts.publicados, cor: "#34d399" },
    { rotulo: "Lojistas acionados", valor: opts.lojasAcionadas, cor: "#7c6ef2" },
    { rotulo: "Limite diário", valor: opts.limiteDiario, cor: "#9ca3af" },
    { rotulo: "Erro", valor: opts.erros, cor: "#f87171" },
  ]);

  y = desenharRanking(doc, y, "Publicações por loja no período", opts.ranking, (n) => `${n} stor${n === 1 ? "y" : "ies"}`);
  desenharTabelaDeMencoes(doc, y, "Detalhamento — todas as menções do período", opts.detalhes);
  desenharRodape(doc);

  return finalizarPdf(doc);
}

// Sem o ranking por loja dessa vez (pedido em 06/09/2026) — só o resumo em cartões mesmo, o
// detalhamento mensagem a mensagem continua só no CSV (ver gerarCsvDeAtendimentos).
export async function gerarPdfDeAtendimentos(opts: {
  shoppingNome: string;
  periodoTexto: string;
  recebidas: number;
  respondidas: number;
  clientesUnicos: number;
  lojasAcionadas: number;
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });

  const y = await desenharCabecalho(doc, {
    tituloDocumento: "Relatório de Atendimentos",
    shoppingNome: opts.shoppingNome,
    periodoTexto: opts.periodoTexto,
  });

  desenharCartoesDeEstatistica(doc, y, [
    { rotulo: "Recebidas", valor: opts.recebidas, cor: "#7c6ef2" },
    { rotulo: "Respondidas", valor: opts.respondidas, cor: "#34d399" },
    { rotulo: "Clientes únicos", valor: opts.clientesUnicos, cor: "#9ca3af" },
    { rotulo: "Lojistas acionados", valor: opts.lojasAcionadas, cor: "#9c90ff" },
  ]);
  desenharRodape(doc);

  return finalizarPdf(doc);
}
