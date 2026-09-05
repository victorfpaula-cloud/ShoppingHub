import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_MENCOES } from "@/lib/mencoes";
import { comprimirVideo } from "@/lib/comprimirVideo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ferramenta de uso único (05/09/2026): reprocessa vídeos de menções que já estavam na fila
// (pendentes ou com erro) ANTES da compressão automática existir, sem precisar que o lojista
// poste de novo. Baixa o vídeo já guardado no Storage, corta/recomprime do mesmo jeito que uma
// menção nova recebe hoje (ver src/lib/comprimirVideo.ts), sobrescreve o arquivo no mesmo lugar,
// e reseta pra "pendente" quem tinha ficado "erro". Pode ser apagada depois de usada — não faz
// nada sozinha, só roda quando alguém abre a URL com o segredo certo.
export async function GET(request: NextRequest) {
  const segredoRecebido = request.nextUrl.searchParams.get("secret");
  const segredoEsperado = process.env.CRON_SECRET;

  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const admin = criarClienteAdmin();

  const { data: mencoes, error } = await admin
    .from("shoppinghub_mencoes")
    .select("id, status, storage_path, instagram_username")
    .in("status", ["pendente", "erro"])
    .not("storage_path", "is", null)
    .like("storage_path", "%.mp4");

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  const resultado = {
    processados: 0,
    falhas: 0,
    adiados: 0,
    total: mencoes?.length ?? 0,
    detalhes: [] as string[],
  };

  // Baixar + comprimir + subir de novo cada vídeo demora bem mais que só comprimir (rede de
  // verdade, não o teste local) — com vários vídeos na fila, dava pra estourar os 60s totais que
  // a Vercel permite (relatado em 05/09/2026: "erro de servidor" depois de um tempo). Mesma
  // solução do cron: para de começar itens novos perto do limite, devolve uma resposta normal com
  // o que já deu tempo de fazer, e o resto fica pronto pra próxima vez que essa URL for aberta —
  // reprocessar um vídeo que já foi cortado pra 10s de novo não faz mal nenhum.
  const inicioDaExecucao = Date.now();
  const LIMITE_MS_PARA_NOVOS_ITENS = 45_000;

  for (const mencao of mencoes ?? []) {
    if (Date.now() - inicioDaExecucao > LIMITE_MS_PARA_NOVOS_ITENS) {
      resultado.adiados += 1;
      continue;
    }

    try {
      const { data: arquivo, error: erroDownload } = await admin.storage
        .from(BUCKET_MENCOES)
        .download(mencao.storage_path!);

      if (erroDownload || !arquivo) {
        throw new Error(erroDownload?.message ?? "Falha ao baixar o vídeo original.");
      }

      const bytesOriginais = new Uint8Array(await arquivo.arrayBuffer());
      const comprimido = await comprimirVideo(bytesOriginais, mencao.instagram_username ?? "");

      const { error: erroUpload } = await admin.storage
        .from(BUCKET_MENCOES)
        .upload(mencao.storage_path!, Buffer.from(comprimido.bytes), {
          contentType: comprimido.contentType,
          upsert: true,
        });

      if (erroUpload) {
        throw new Error(erroUpload.message);
      }

      if (mencao.status === "erro") {
        await admin.from("shoppinghub_mencoes").update({ status: "pendente" }).eq("id", mencao.id);
      }

      resultado.processados += 1;
      resultado.detalhes.push(
        `${mencao.id}: ${bytesOriginais.length} -> ${comprimido.bytes.length} bytes`
      );
    } catch (erro) {
      console.error(`Falha ao recomprimir vídeo da menção ${mencao.id}:`, erro);
      resultado.falhas += 1;
      resultado.detalhes.push(`${mencao.id}: falhou (${(erro as Error).message})`);
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
