import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { tipoDeMidiaPorContentType } from "@/lib/mencoesConstantes";
import { BUCKET_PUBLICACOES, MAX_ITENS_CARROSSEL, dataHoraBrasiliaParaISO } from "@/lib/publicacoesConstantes";

// Cria uma publicação agendada (Feed ou Story) — sobe a(s) mídia(s) pro Storage e calcula, a
// partir da data/horário escolhidos (sempre horário de Brasília — ver dataHoraBrasiliaParaISO), o
// instante em que o cron (publicar-agendadas) deve publicar.
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const shoppingId = formData.get("shopping_id")?.toString();

  if (!shoppingId) {
    return NextResponse.redirect(new URL("/shoppings", request.url));
  }

  const tipo = formData.get("tipo")?.toString();
  const horario = formData.get("horario")?.toString();
  const dataInicio = formData.get("data_inicio")?.toString();
  const dataFim = formData.get("data_fim")?.toString() || null;
  const arquivos = formData.getAll("arquivos").filter((v): v is File => v instanceof File && v.size > 0);

  const voltarComErro = (mensagem: string) => {
    const pagina = tipo === "feed" ? "novo-feed" : "nova-story";
    return NextResponse.redirect(
      new URL(
        `/shoppings/${shoppingId}/publicacoes/${pagina}?erro=${encodeURIComponent(mensagem)}`,
        request.url
      )
    );
  };

  if (tipo !== "story" && tipo !== "feed") {
    return voltarComErro("Tipo de publicação inválido.");
  }
  if (!horario || !dataInicio) {
    return voltarComErro("Preencha a data e o horário.");
  }
  if (arquivos.length === 0) {
    return voltarComErro("Escolha pelo menos um arquivo.");
  }
  if (tipo === "story" && arquivos.length > 1) {
    return voltarComErro("Story aceita só um arquivo (imagem ou vídeo) por vez.");
  }
  if (tipo === "feed" && arquivos.length > MAX_ITENS_CARROSSEL) {
    return voltarComErro(`Carrossel aceita no máximo ${MAX_ITENS_CARROSSEL} arquivos.`);
  }
  if (tipo === "story" && !dataFim) {
    return voltarComErro("Preencha o último dia do período.");
  }
  if (tipo === "story" && dataFim! < dataInicio) {
    return voltarComErro("O fim do período não pode ser antes do início.");
  }

  const admin = criarClienteAdmin();

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", shoppingId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conta) {
    return voltarComErro("Conecte uma conta do Instagram antes de agendar uma publicação.");
  }

  // Sobe cada arquivo pro Storage ANTES de inserir a linha — se algum upload falhar no meio, nada
  // fica registrado pela metade (sem publicação "fantasma" apontando pra mídia inexistente).
  const midias: { storage_path: string; tipo: "IMAGE" | "VIDEO" }[] = [];

  for (const arquivo of arquivos) {
    const tipoDeMidia = tipoDeMidiaPorContentType(arquivo.type || "");
    const extensao = tipoDeMidia === "VIDEO" ? "mp4" : arquivo.type.includes("png") ? "png" : "jpg";
    const storagePath = `${conta.id}/${crypto.randomUUID()}.${extensao}`;

    const { error: erroAoSubir } = await admin.storage
      .from(BUCKET_PUBLICACOES)
      .upload(storagePath, await arquivo.arrayBuffer(), {
        contentType: arquivo.type || (tipoDeMidia === "VIDEO" ? "video/mp4" : "image/jpeg"),
        upsert: false,
      });

    if (erroAoSubir) {
      // Desfaz os uploads já feitos nessa mesma tentativa, pra não deixar arquivo órfão no bucket.
      if (midias.length > 0) {
        await admin.storage.from(BUCKET_PUBLICACOES).remove(midias.map((m) => m.storage_path));
      }
      console.error("Falha ao subir mídia de publicação agendada:", erroAoSubir);
      return voltarComErro("Deu um erro subindo o arquivo. Tenta de novo.");
    }

    midias.push({ storage_path: storagePath, tipo: tipoDeMidia });
  }

  const proximaPublicacaoEm = dataHoraBrasiliaParaISO(dataInicio, horario);
  const dataFimInstante = tipo === "story" ? dataHoraBrasiliaParaISO(dataFim!, horario) : null;

  const { error: erroAoInserir } = await admin.from("shoppinghub_publicacoes").insert({
    conta_id: conta.id,
    tipo,
    midias,
    horario,
    data_inicio: dataInicio,
    data_fim: tipo === "story" ? dataFim : null,
    data_fim_instante: dataFimInstante,
    proxima_publicacao_em: proximaPublicacaoEm,
  });

  if (erroAoInserir) {
    await admin.storage.from(BUCKET_PUBLICACOES).remove(midias.map((m) => m.storage_path));
    console.error("Falha ao registrar publicação agendada:", erroAoInserir);
    return voltarComErro("Deu um erro agendando a publicação. Tenta de novo.");
  }

  return NextResponse.redirect(new URL(`/shoppings/${shoppingId}/publicacoes`, request.url));
}
