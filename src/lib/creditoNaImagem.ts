import sharp from "sharp";
import opentype from "opentype.js";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { POSICAO_Y_TAG_NATIVA } from "./mencoesConstantes";

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

// Selo pequeno (formato pílula, cantos arredondados) em vez da faixa preta de ponta a ponta que
// tinha antes — achada "exagerada" na prática (relatado em 05/09/2026). Mais parecido com o
// tamanho/estilo discreto de uma marcação nativa do Instagram.
const PROPORCAO_ALTURA_SELO = 0.032; // relativa à LARGURA de referência (ver gerarSeloDeCredito)
const PROPORCAO_FONTE_NO_SELO = 0.5; // relativa à altura do selo
const PROPORCAO_PADDING_HORIZONTAL = 0.85; // relativa à altura do selo, de cada lado do texto
const OPACIDADE_DO_FUNDO = 0.62; // menos transparente que antes (0.45) — pedido em 06/09/2026

// Trava de segurança (08/09/2026): mesmo com a normalização de largura abaixo, um valor absurdo
// aqui nunca deveria virar um selo do tamanho da tela inteira — Math.max já evita ficar pequeno
// demais, isso evita o oposto.
const ALTURA_MAXIMA_DO_SELO = 90;

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

  const alturaSelo = Math.min(
    ALTURA_MAXIMA_DO_SELO,
    Math.max(16, Math.round(larguraDeReferencia * PROPORCAO_ALTURA_SELO))
  );
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

// Canvas fixo de Story — mesma proporção 9:16 que a câmera de Stories do Instagram já usa. Até
// 08/09/2026 a imagem recebida era usada do jeito que chegava, com QUALQUER formato/resolução, e o
// selo era dimensionado em proporção à largura DAQUELA imagem específica. Isso é seguro quando a
// imagem já é 9:16 (o caso comum, Story tirada na hora) — mas quando o lojista posta uma foto já
// existente fora desse formato (muito comum: foto de catálogo/produto QUADRADA, tirada pra
// e-commerce, não pra Story), o Instagram precisa redimensionar essa imagem pra caber na tela
// vertical — e dependendo de como ele encaixa (esticando pela altura em vez de pela largura), o
// selo podia sair ampliado por quase 2x na tela, mesmo calculado "certinho" em cima da imagem
// original. Visto na prática em 08/09/2026: Stories do MESMO lojista, algumas com o selo normal
// (fotos já em formato de Story) e outras com o selo visivelmente maior (fotos de produto fora
// desse formato).
//
// Corrige a partir da raiz: normaliza QUALQUER imagem recebida pra um canvas 1080x1920 fixo antes
// de aplicar o selo, então a Meta nunca mais precisa reformatar nada — o que a gente manda já é
// exatamente do tamanho que ela espera.
const LARGURA_DA_STORY = 1080;
const ALTURA_DA_STORY = 1920;
const PROPORCAO_DA_STORY = LARGURA_DA_STORY / ALTURA_DA_STORY;
const TOLERANCIA_DE_PROPORCAO = 0.02; // já bem perto de 9:16 — não vale reprocessar à toa

/**
 * Encaixa a imagem recebida num canvas 1080x1920, sem nunca cortar nenhum pedaço da foto original
 * (`fit: "contain"`) — quando ela não é 9:16, sobra espaço em cima/embaixo ou nas laterais, que é
 * preenchido com uma versão desfocada e ampliada da própria imagem, do mesmo jeito que o app do
 * Instagram já faz quando alguém sobe uma foto fora do formato de Story.
 */
async function normalizarParaFormatoDeStory(bytes: Uint8Array): Promise<Buffer> {
  const buffer = Buffer.from(bytes);
  const metadados = await sharp(buffer).metadata();
  const largura = metadados.width ?? LARGURA_DA_STORY;
  const altura = metadados.height ?? ALTURA_DA_STORY;

  const jaEhFormatoDeStory = Math.abs(largura / altura - PROPORCAO_DA_STORY) < TOLERANCIA_DE_PROPORCAO;
  if (jaEhFormatoDeStory) {
    // Ainda assim limita a largura, pra manter a referência de tamanho do selo previsível mesmo
    // numa Story 9:16 vinda em resolução bem acima do comum (ex.: 2160x3840).
    return largura > LARGURA_DA_STORY ? sharp(buffer).resize({ width: LARGURA_DA_STORY }).toBuffer() : buffer;
  }

  const fundoDesfocado = await sharp(buffer)
    .resize(LARGURA_DA_STORY, ALTURA_DA_STORY, { fit: "cover" })
    .blur(40)
    .toBuffer();

  const fotoOriginalInteira = await sharp(buffer)
    .resize(LARGURA_DA_STORY, ALTURA_DA_STORY, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(fundoDesfocado).composite([{ input: fotoOriginalInteira }]).jpeg({ quality: 90 }).toBuffer();
}

export async function adicionarFaixaDeCredito(
  bytes: Uint8Array,
  username: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const bytesNormalizados = await normalizarParaFormatoDeStory(bytes);

  const imagem = sharp(bytesNormalizados);
  const metadados = await imagem.metadata();
  const largura = metadados.width ?? LARGURA_DA_STORY;
  const altura = metadados.height ?? ALTURA_DA_STORY;

  // Log temporário de diagnóstico (08/09/2026) — pra confirmar que a normalização acima realmente
  // resolveu o selo gigante em Stories fora do formato 9:16. Tirar depois de confirmar por alguns
  // dias sem o problema voltar a acontecer.
  console.log(`adicionarFaixaDeCredito: imagem normalizada pra ${largura}x${altura}`);

  const selo = await gerarSeloDeCredito(username, largura);
  const left = Math.round((largura - selo.largura) / 2);
  const top = Math.round(altura * POSICAO_Y_TAG_NATIVA - selo.altura / 2);

  const resultado = await imagem
    .composite([{ input: selo.png, left, top }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return { bytes: new Uint8Array(resultado), contentType: "image/jpeg" };
}
