import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { gerarSeloDeCredito, POSICAO_X_SELO, POSICAO_Y_SELO } from "./creditoNaImagem";

const execFileAsync = promisify(execFile);

const DURACAO_MAXIMA_SEGUNDOS = 10;

// Vídeo é sempre reduzido a essa largura no máximo (ver filtro de scale abaixo) — usada também
// como referência de tamanho pro selo (ver gerarSeloDeCredito em creditoNaImagem.ts), já que sondar
// a resolução real do vídeo de entrada só pra isso seria complexidade extra sem necessidade: o
// filtro overlay do ffmpeg posiciona o selo pela largura/altura REAIS do vídeo em tempo de
// execução (variáveis main_w/main_h), então só o TAMANHO do selo em si fica calibrado pra 1080 —
// looks right pra qualquer vídeo que já sai nessa largura (a maioria) ou perto dela.
const LARGURA_DE_REFERENCIA_PARA_SELO = 1080;

/**
 * Corta o vídeo pros primeiros 10 segundos, recomprime num formato garantidamente compatível
 * (H.264 + AAC, largura limitada a 1080px) e queima o MESMO selo de crédito usado na imagem (ver
 * creditoNaImagem.ts), na mesma posição vertical (POSICAO_Y_SELO) — tudo numa única passada de
 * ffmpeg, pra não recodificar duas vezes.
 *
 * O selo é necessário porque, diferente de imagem (onde a marcação nativa da Meta, `user_tags`,
 * aparece visível sozinha), em VÍDEO essa mesma marcação fica completamente invisível até o
 * espectador tocar na tela — sem nenhuma pista visual de que existe ou de onde tocar (relatado na
 * prática em 05/09/2026, comparando lado a lado com uma Story de foto onde a marcação aparecia
 * normalmente). O selo dá essa pista.
 */
export async function comprimirVideo(
  bytes: Uint8Array,
  username: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!ffmpegPath) {
    throw new Error("Binário do ffmpeg não encontrado (ffmpeg-static).");
  }

  const pastaTemporaria = await mkdtemp(path.join(os.tmpdir(), "video-mencao-"));
  const caminhoEntrada = path.join(pastaTemporaria, "entrada.mp4");
  const caminhoSelo = path.join(pastaTemporaria, "selo.png");
  const caminhoSaida = path.join(pastaTemporaria, "saida.mp4");

  try {
    await writeFile(caminhoEntrada, Buffer.from(bytes));

    const selo = await gerarSeloDeCredito(username, LARGURA_DE_REFERENCIA_PARA_SELO);
    await writeFile(caminhoSelo, selo.png);

    // `-loop 1` faz o ffmpeg tratar o PNG estático do selo como um vídeo contínuo (sem isso, o
    // overlay só apareceria no primeiro frame) — o `-t` na saída garante que tudo pare nos 10s
    // certos mesmo com essa "duração infinita" do selo.
    const filtro = [
      "[0:v]scale='min(1080,iw)':-2[base]",
      `[base][1:v]overlay=x='main_w*${POSICAO_X_SELO}':y='main_h*${POSICAO_Y_SELO}-overlay_h/2'[saida]`,
    ].join(";");

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      caminhoEntrada,
      "-loop",
      "1",
      "-i",
      caminhoSelo,
      "-t",
      String(DURACAO_MAXIMA_SEGUNDOS),
      "-filter_complex",
      filtro,
      "-map",
      "[saida]",
      "-map",
      "0:a?",
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
