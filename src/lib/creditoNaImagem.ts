import sharp from "sharp";

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
  const textoEscapado = `@${username}`.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  const svg = `
    <svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${altura - alturaFaixa}" width="${largura}" height="${alturaFaixa}" fill="black" fill-opacity="0.55" />
      <text
        x="${largura / 2}"
        y="${altura - alturaFaixa / 2}"
        font-family="Arial, sans-serif"
        font-size="${tamanhoFonte}"
        font-weight="bold"
        fill="white"
        text-anchor="middle"
        dominant-baseline="central"
      >${textoEscapado}</text>
    </svg>
  `;

  const resultado = await imagem
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return { bytes: new Uint8Array(resultado), contentType: "image/jpeg" };
}
