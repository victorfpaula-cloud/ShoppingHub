import sharp from "sharp";
import opentype from "opentype.js";
import path from "node:path";
import { readFile } from "node:fs/promises";

/**
 * Sobrepõe uma faixa semitransparente no rodapé da imagem com o @usuário de quem marcou o
 * shopping no Story, antes de guardar/publicar — dá crédito visível à loja na Story republicada.
 *
 * Só funciona pra IMAGEM: a API de publicação de Stories da Meta não permite editar vídeo (e
 * processar vídeo exigiria ffmpeg, inviável numa function serverless). Vídeo passa direto, sem
 * a faixa — quem chama essa função já lida com esse caso (`ehImagem` abaixo).
 */
export function ehImagem(contentType: string): boolean {
  return contentType.includes("image");
}

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

  const fonte = await carregarFonte();
  const escala = tamanhoFonte / fonte.unitsPerEm;
  const larguraTexto = fonte.getAdvanceWidth(texto, tamanhoFonte);
  const xInicial = (largura - larguraTexto) / 2;
  const centroY = altura - alturaFaixa / 2;
  const baselineY = centroY + ((fonte.ascender + fonte.descender) * escala) / 2;

  const pathDoTexto = fonte.getPath(texto, xInicial, baselineY, tamanhoFonte).toPathData(2);

  const svg = `
    <svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${altura - alturaFaixa}" width="${largura}" height="${alturaFaixa}" fill="black" fill-opacity="0.55" />
      <path d="${pathDoTexto}" fill="white" />
    </svg>
  `;

  const resultado = await imagem
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return { bytes: new Uint8Array(resultado), contentType: "image/jpeg" };
}
