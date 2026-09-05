import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { POSICAO_Y_CREDITO } from "./creditoNaImagem";

const execFileAsync = promisify(execFile);

const DURACAO_MAXIMA_SEGUNDOS = 10;

// Mesma fonte embutida usada na faixa de crédito das imagens (ver creditoNaImagem.ts) — sem
// nenhuma fonte instalada no ambiente serverless, o drawtext do ffmpeg simplesmente não desenha
// nada sem um fontfile explícito.
const CAMINHO_FONTE = path.join(process.cwd(), "src/assets/fonts/NotoSans-Regular.ttf");

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
 * Corta o vídeo pros primeiros 10 segundos (se precisar), recomprime num formato garantidamente
 * compatível (H.264 + AAC, largura limitada a 1080px) e queima a MESMA faixa de crédito com o
 * @usuário usada nas imagens (ver creditoNaImagem.ts), na mesma posição vertical
 * (POSICAO_Y_CREDITO) — tudo numa única passada de ffmpeg, pra não recodificar duas vezes.
 *
 * A faixa queimada é necessária porque, ao contrário do que a implementação original assumia,
 * `user_tags` em Stories de vídeo (suportado pela Meta desde 09/07/2025) NÃO desenha nenhuma
 * figurinha/selo visível — a documentação da Content Publishing API é explícita: publicar
 * "stickers" (que é como a Meta classifica a marcação visual) não é suportado, só a menção "sem
 * sticker". Confirmado na prática em 05/09/2026: duas Stories foram publicadas com o container
 * criado sem erro nenhum e o `user_tags` preenchido, e mesmo assim saíram sem nenhuma marcação
 * visível. Sem essa faixa queimada, vídeo saía sem crédito nenhum pra loja.
 *
 * Diferente da versão anterior, processa TODO vídeo (mesmo um que já tenha 10s ou menos) — não dá
 * pra pular a recompressão só porque a duração já está ok, já que a faixa precisa ser desenhada de
 * qualquer forma.
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
  const caminhoSaida = path.join(pastaTemporaria, "saida.mp4");
  const caminhoTexto = path.join(pastaTemporaria, "credito.txt");

  try {
    await writeFile(caminhoEntrada, Buffer.from(bytes));
    await writeFile(caminhoTexto, `@${username}`, "utf8");

    const duracaoAtual = await obterDuracaoSegundos(caminhoEntrada);
    const precisaCortar = duracaoAtual === null || duracaoAtual > DURACAO_MAXIMA_SEGUNDOS;

    // drawbox desenha a faixa semitransparente e drawtext escreve o @usuário por cima, na mesma
    // altura (variáveis "ih"/"h" do ffmpeg = altura do frame nesse ponto da cadeia, já depois do
    // scale). textfile em vez de text= evita ter que escapar aspas/dois-pontos do username dentro
    // da string do filtro.
    const filtroDeVideo = [
      "scale='min(1080,iw)':-2",
      `drawbox=x=0:y='ih*${POSICAO_Y_CREDITO}-ih*0.035':w=iw:h='ih*0.07':color=black@0.55:t=fill`,
      `drawtext=fontfile='${CAMINHO_FONTE}':textfile='${caminhoTexto}':fontcolor=white:fontsize='h*0.0315':x='(w-text_w)/2':y='h*${POSICAO_Y_CREDITO}-text_h/2'`,
    ].join(",");

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      caminhoEntrada,
      ...(precisaCortar ? ["-t", String(DURACAO_MAXIMA_SEGUNDOS)] : []),
      "-vf",
      filtroDeVideo,
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
