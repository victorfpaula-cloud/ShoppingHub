import sharp from "sharp";
import opentype from "opentype.js";
import path from "node:path";
import { readFile } from "node:fs/promises";

/**
 * Sobrepõe um selo discreto com o @usuário de quem marcou o shopping no Story, antes de
 * guardar/publicar — dá crédito visível à loja na Story republicada, e em vídeo também serve pra
 * indicar onde fica a marcação de verdade (user_tags), já que a Meta não desenha nada visível ali
 * sozinha (diferente de imagem, onde ela mostra uma tag nativa — confirmado na prática em
 * 05/09/2026, comparando Stories de foto e de vídeo lado a lado).
 */
export function ehImagem(contentType: string): boolean {
  return contentType.includes("image");
}

// Fração da altura onde fica o CENTRO do selo queimado E da marcação nativa (user_tags, ver
// metaMessaging.ts) — os dois usam o MESMO valor de propósito, pra ficarem alinhados: o selo é só
// um desenho, não é clicável sozinho, então ele precisa marcar visualmente o lugar EXATO onde a
// marcação de verdade responde ao toque (senão vira um botão "mudo" que parece real, mas não é —
// visto na prática em 06/09/2026, quando os dois ficaram temporariamente em posições diferentes).
//
// Não pode ficar muito perto do rodapé (~0.92, testado em 04/09/2026): a barra de "responder" que
// o próprio Instagram desenha por cima da Story intercepta o toque nessa faixa inferior (~13% de
// baixo). 0.80 fica dentro da área segura (a Meta recomenda evitar os ~13% de cima e de baixo da
// tela pra qualquer elemento interativo) — o topo tem essa mesma faixa reservada pro cabeçalho da
// própria Story (foto de perfil, nome da conta, horário, menu, botão de fechar), então mover pra
// lá teria o mesmo problema, só que no sentido inverso.
export const POSICAO_Y_TAG_NATIVA = 0.8;

// Selo pequeno (formato pílula, cantos arredondados) em vez da faixa preta de ponta a ponta que
// tinha antes — achada "exagerada" na prática (relatado em 05/09/2026). Mais parecido com o
// tamanho/estilo discreto de uma marcação nativa do Instagram.
const PROPORCAO_ALTURA_SELO = 0.032; // relativa à LARGURA de referência (ver gerarSeloDeCredito)
const PROPORCAO_FONTE_NO_SELO = 0.5; // relativa à altura do selo
const PROPORCAO_PADDING_HORIZONTAL = 0.85; // relativa à altura do selo, de cada lado do texto
const OPACIDADE_DO_FUNDO = 0.62; // menos transparente que antes (0.45) — pedido em 06/09/2026

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

/**
 * Gera só o selo (PNG com fundo transparente, do tamanho exato do conteúdo — não do tamanho da
 * mídia inteira), pronto pra ser sobreposto tanto numa imagem (sharp `.composite`, ver
 * `adicionarFaixaDeCredito` abaixo) quanto num vídeo (ffmpeg `overlay`, ver comprimirVideo.ts).
 * `larguraDeReferencia` calibra o tamanho do selo — pra imagem é a largura real (metadados do
 * sharp); pra vídeo, que não é sondado por simplicidade, usa 1080 fixo (a largura máxima que a
 * gente já garante via scale em comprimirVideo.ts, e a mais comum em Stories reais).
 */
export async function gerarSeloDeCredito(
  username: string,
  larguraDeReferencia: number
): Promise<{ png: Buffer; largura: number; altura: number }> {
  const fonte = await carregarFonte();

  const alturaSelo = Math.max(16, Math.round(larguraDeReferencia * PROPORCAO_ALTURA_SELO));
  const tamanhoFonte = Math.round(alturaSelo * PROPORCAO_FONTE_NO_SELO);
  const paddingHorizontal = Math.round(alturaSelo * PROPORCAO_PADDING_HORIZONTAL);
  const texto = `@${username}`;

  const escala = tamanhoFonte / fonte.unitsPerEm;
  const larguraTexto = fonte.getAdvanceWidth(texto, tamanhoFonte);
  const larguraSelo = Math.round(larguraTexto + paddingHorizontal * 2);
  const baselineY = (alturaSelo + (fonte.ascender + fonte.descender) * escala) / 2;
  const raio = alturaSelo / 2;

  const pathDoTexto = fonte.getPath(texto, paddingHorizontal, baselineY, tamanhoFonte).toPathData(2);

  const svg = `
    <svg width="${larguraSelo}" height="${alturaSelo}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${larguraSelo}" height="${alturaSelo}" rx="${raio}" ry="${raio}" fill="black" fill-opacity="${OPACIDADE_DO_FUNDO}" />
      <path d="${pathDoTexto}" fill="white" />
    </svg>
  `;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { png, largura: larguraSelo, altura: alturaSelo };
}

export async function adicionarFaixaDeCredito(
  bytes: Uint8Array,
  username: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const imagem = sharp(Buffer.from(bytes));
  const metadados = await imagem.metadata();
  const largura = metadados.width ?? 1080;
  const altura = metadados.height ?? 1920;

  const selo = await gerarSeloDeCredito(username, largura);
  const left = Math.round((largura - selo.largura) / 2);
  const top = Math.round(altura * POSICAO_Y_TAG_NATIVA - selo.altura / 2);

  const resultado = await imagem
    .composite([{ input: selo.png, left, top }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return { bytes: new Uint8Array(resultado), contentType: "image/jpeg" };
}
