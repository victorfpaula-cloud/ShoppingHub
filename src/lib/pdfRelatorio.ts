import PDFDocument from "pdfkit";
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

let logoBufferPromise: Promise<Buffer> | null = null;
function carregarLogo(): Promise<Buffer> {
  if (!logoBufferPromise) {
    logoBufferPromise = readFile(path.join(process.cwd(), "public/logo-shoppinghub.png"));
  }
  return logoBufferPromise;
}

export type CartaoDeEstatistica = { rotulo: string; valor: string | number; cor: string };
export type LinhaDeRanking = { nome: string; total: number };

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

  desenharRanking(doc, y, "Publicações por loja no período", opts.ranking, (n) => `${n} stor${n === 1 ? "y" : "ies"}`);
  desenharRodape(doc);

  return finalizarPdf(doc);
}

export async function gerarPdfDeAtendimentos(opts: {
  shoppingNome: string;
  periodoTexto: string;
  recebidas: number;
  respondidas: number;
  clientesUnicos: number;
  lojasAcionadas: number;
  ranking: LinhaDeRanking[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });

  let y = await desenharCabecalho(doc, {
    tituloDocumento: "Relatório de Atendimentos",
    shoppingNome: opts.shoppingNome,
    periodoTexto: opts.periodoTexto,
  });

  y = desenharCartoesDeEstatistica(doc, y, [
    { rotulo: "Recebidas", valor: opts.recebidas, cor: "#7c6ef2" },
    { rotulo: "Respondidas", valor: opts.respondidas, cor: "#34d399" },
    { rotulo: "Clientes únicos", valor: opts.clientesUnicos, cor: "#9ca3af" },
    { rotulo: "Lojistas acionados", valor: opts.lojasAcionadas, cor: "#9c90ff" },
  ]);

  desenharRanking(
    doc,
    y,
    "Atendimentos por loja no período",
    opts.ranking,
    (n) => `${n} mensage${n === 1 ? "m" : "ns"}`
  );
  desenharRodape(doc);

  return finalizarPdf(doc);
}
