import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const DURACAO_MAXIMA_SEGUNDOS = 10;
// Margem sobre o corte de 10s — dá espaço pra pequena imprecisão de arredondamento do ffmpeg sem
// achar que um vídeo já cortado por essa mesma função "ainda precisa" ser reprocessado.
const DURACAO_JA_OK_SEGUNDOS = DURACAO_MAXIMA_SEGUNDOS + 0.5;

/**
 * Lê a duração do vídeo sem precisar do ffprobe (não vem junto com o ffmpeg-static) — truque
 * conhecido: rodar o ffmpeg só com `-i` (sem arquivo de saída) sempre "falha", mas antes de falhar
 * ele imprime os metadados do arquivo (incluindo "Duration: HH:MM:SS.ms") no stderr.
 */
async function obterDuracaoSegundos(caminhoArquivo: string): Promise<number | null> {
  try {
    await execFileAsync(ffmpegPath!, ["-i", caminhoArquivo, "-hide_banner"]);
    return null;
  } catch (erro) {
    const stderr = (erro as { stderr?: string })?.stderr ?? "";
    const encontrado = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!encontrado) return null;
    const [, horas, minutos, segundos] = encontrado;
    return Number(horas) * 3600 + Number(minutos) * 60 + Number(segundos);
  }
}

/**
 * Corta o vídeo pros primeiros 10 segundos e recomprime num formato garantidamente compatível
 * (H.264 + AAC, largura limitada a 1080px) antes de guardar/publicar. Feito na hora que a menção
 * chega (não na hora de publicar) — resolve de uma vez: vídeos longos ou muito grandes que a Meta
 * nunca terminava de processar (visto na prática em 05/09/2026, container preso em "IN_PROGRESS"
 * mesmo com quase um minuto de espera), e reduz o espaço ocupado no Storage.
 *
 * Não queima nenhuma faixa de crédito no vídeo (diferente da imagem, ver creditoNaImagem.ts) — a
 * própria marcação nativa da Meta (`user_tags`, ver metaMessaging.ts) já aparece visível na Story
 * publicada, mostrando o nome da conta marcada, confirmado na prática em 05/09/2026. Chegou a ser
 * testada uma faixa queimada via ffmpeg (drawbox+drawtext) achando que a marcação nativa não
 * aparecia, mas depois de ver a Story de verdade publicada, a marcação nativa já resolve sozinha.
 *
 * Se o vídeo já tem 10s ou menos (por exemplo, já passou por essa função antes — a ferramenta de
 * recomprimir vídeos antigos processa a mesma lista inteira a cada vez que é aberta, já que não
 * guarda "o que já foi feito"), pula a recompressão e devolve os bytes originais direto — sem essa
 * checagem, reprocessar os mesmos vídeos já certos toda hora consumia o tempo todo da execução
 * antes de chegar nos que realmente ainda precisavam (visto na prática em 05/09/2026: os mesmos 5
 * vídeos ficavam de fora em toda tentativa).
 */
export async function comprimirVideo(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!ffmpegPath) {
    throw new Error("Binário do ffmpeg não encontrado (ffmpeg-static).");
  }

  const pastaTemporaria = await mkdtemp(path.join(os.tmpdir(), "video-mencao-"));
  const caminhoEntrada = path.join(pastaTemporaria, "entrada.mp4");
  const caminhoSaida = path.join(pastaTemporaria, "saida.mp4");

  try {
    await writeFile(caminhoEntrada, Buffer.from(bytes));

    const duracaoAtual = await obterDuracaoSegundos(caminhoEntrada);
    if (duracaoAtual !== null && duracaoAtual <= DURACAO_JA_OK_SEGUNDOS) {
      return { bytes, contentType: "video/mp4" };
    }

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      caminhoEntrada,
      "-t",
      String(DURACAO_MAXIMA_SEGUNDOS),
      "-vf",
      "scale='min(1080,iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "21",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      caminhoSaida,
    ]);

    const resultado = await readFile(caminhoSaida);
    return { bytes: new Uint8Array(resultado), contentType: "video/mp4" };
  } finally {
    await rm(pastaTemporaria, { recursive: true, force: true });
  }
}
