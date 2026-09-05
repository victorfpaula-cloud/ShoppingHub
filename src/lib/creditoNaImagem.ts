import sharp from "sharp";
import opentype from "opentype.js";
import path from "node:path";
import { readFile } from "node:fs/promises";

/**
 * Sobrepõe uma faixa semitransparente com o @usuário de quem marcou o shopping no Story, antes
 * de guardar/publicar — dá crédito visível à loja na Story republicada.
 *
 * Só funciona pra IMAGEM (usa sharp, biblioteca de imagem raster). Vídeo recebe a mesma faixa,
 * na mesma posição (`POSICAO_Y_CREDITO`, exportada daqui), mas queimada via ffmpeg dentro de
 * `comprimirVideo.ts` — quem chama essa função já lida com esse caso (`ehImagem` abaixo).
 */
export function ehImagem(contentType: string): boolean {
  return contentType.includes("image");
}

// Fração da altura onde fica o CENTRO da faixa e da marcação clicável (user_tags, ver
// metaMessaging.ts) — as duas usam o MESMO valor pra ficarem alinhadas visualmente. Não pode ficar
// muito perto do rodapé (~0.92, testado em 04/09/2026): a Story marcou a página, mas a figurinha
// não ficava clicável — a barra de "responder" que o próprio Instagram desenha por cima da Story
// intercepta o toque nessa faixa inferior (~13% de baixo). 0.80 fica dentro da área seguro (a Meta
// recomenda evitar os ~13% de cima e de baixo da tela pra qualquer elemento interativo).
export const POSICAO_Y_CREDITO = 0.8;

// O texto vira contorno vetorial (path) em vez de <text> no SVG — funções serverless não têm
// nenhuma fonte instalada, então `<text font-family="Arial">` renderiza como "tofu" (quadradinhos
// de glifo não encontrado), como aconteceu na prática em 04/09/2026. Path não depende de fonte
// nenhuma no ambiente de execução. Fonte embutida: a mesma Noto Sans que o próprio Next.js já
// inclui pro @vercel/og — cobre os caracteres que um @usuário do Instagram pode ter
// (letras, números, ponto, underscore).
let fontePromise: Promise<opentype.Font> | null = null;
function carregarFonte(): Promise<opentype.Font> {
  if (!fontePromise) {
    const caminhoFonte = path.join(process.cwd(), "src/assets/fonts/NotoSans-Regular.ttf");
    fontePromise = readFile(caminhoFonte).then((buffer) => opentype.parse(toArrayBuffer(buffer)));
  }
  return fontePromise;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export async function adicionarFaixaDeCredito(
  bytes: Uint8Array,
  username: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const imagem = sharp(Buffer.from(bytes));
  const metadados = await imagem.metadata();
  const largura = metadados.width ?? 1080;
  const altura = metadados.height ?? 1920;

  const alturaFaixa = Math.round(altura * 0.07);
  const tamanhoFonte = Math.round(alturaFaixa * 0.45);
  const texto = `@${username}`;

  const centroY = altura * POSICAO_Y_CREDITO;

  const fonte = await carregarFonte();
  const escala = tamanhoFonte / fonte.unitsPerEm;
  const larguraTexto = fonte.getAdvanceWidth(texto, tamanhoFonte);
  const xInicial = (largura - larguraTexto) / 2;
  const baselineY = centroY + ((fonte.ascender + fonte.descender) * escala) / 2;

  const pathDoTexto = fonte.getPath(texto, xInicial, baselineY, tamanhoFonte).toPathData(2);

  const svg = `
    <svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${centroY - alturaFaixa / 2}" width="${largura}" height="${alturaFaixa}" fill="black" fill-opacity="0.55" />
      <path d="${pathDoTexto}" fill="white" />
    </svg>
  `;

  const resultado = await imagem
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return { bytes: new Uint8Array(resultado), contentType: "image/jpeg" };
}
