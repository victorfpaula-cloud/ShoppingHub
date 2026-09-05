import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const DURACAO_MAXIMA_SEGUNDOS = 10;

/**
 * Corta o vídeo pros primeiros 10 segundos e recomprime num formato garantidamente compatível
 * (H.264 + AAC, largura limitada a 1080px) antes de guardar/publicar. Feito na hora que a menção
 * chega (não na hora de publicar) — resolve de uma vez: vídeos longos ou muito grandes que a Meta
 * nunca terminava de processar (visto na prática em 05/09/2026, container preso em "IN_PROGRESS"
 * mesmo com quase um minuto de espera), e reduz o espaço ocupado no Storage.
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
      "veryfast",
      "-crf",
      "26",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
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
