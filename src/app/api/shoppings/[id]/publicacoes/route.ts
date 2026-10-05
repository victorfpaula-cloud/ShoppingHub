import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_PUBLICACOES, MAX_ITENS_CARROSSEL, dataHoraBrasiliaParaISO } from "@/lib/publicacoesConstantes";

// Registra uma publicação agendada (Feed ou Story) já com a(s) mídia(s) sobre o Storage — o
// upload em si acontece ANTES, direto do navegador pro Storage via URL assinada (ver
// url-de-upload/route.ts), não passa mais o arquivo por essa function. Corpo pequeno (JSON, sem
// arquivo), chamado via fetch pelo FormularioDePublicacao (componente client).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const corpo = await request.json().catch(() => null);

  const tipo = corpo?.tipo;
  const horario: string | undefined = corpo?.horario;
  const dataInicio: string | undefined = corpo?.data_inicio;
  const dataFim: string | null = corpo?.data_fim || null;
  const midias: { storage_path: string; tipo: "IMAGE" | "VIDEO" }[] = Array.isArray(corpo?.midias)
    ? corpo.midias
    : [];

  if (tipo !== "story" && tipo !== "feed") {
    return NextResponse.json({ erro: "Tipo de publicação inválido." }, { status: 400 });
  }
  if (!horario || !dataInicio) {
    return NextResponse.json({ erro: "Preencha a data e o horário." }, { status: 400 });
  }
  if (midias.length === 0) {
    return NextResponse.json({ erro: "Escolha pelo menos um arquivo." }, { status: 400 });
  }
  if (tipo === "story" && midias.length > 1) {
    return NextResponse.json({ erro: "Story aceita só um arquivo (imagem ou vídeo) por vez." }, { status: 400 });
  }
  if (tipo === "feed" && midias.length > MAX_ITENS_CARROSSEL) {
    return NextResponse.json({ erro: `Carrossel aceita no máximo ${MAX_ITENS_CARROSSEL} arquivos.` }, { status: 400 });
  }
  if (tipo === "story" && !dataFim) {
    return NextResponse.json({ erro: "Preencha o último dia do período." }, { status: 400 });
  }
  if (tipo === "story" && dataFim! < dataInicio) {
    return NextResponse.json({ erro: "O fim do período não pode ser antes do início." }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", params.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conta) {
    return NextResponse.json(
      { erro: "Conecte uma conta do Instagram antes de agendar uma publicação." },
      { status: 400 }
    );
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
    // A mídia já está no Storage (subida pelo navegador antes dessa chamada) — limpa pra não
    // deixar arquivo órfão, já que a publicação não foi registrada.
    await admin.storage.from(BUCKET_PUBLICACOES).remove(midias.map((m) => m.storage_path));
    console.error("Falha ao registrar publicação agendada:", erroAoInserir);
    return NextResponse.json({ erro: "Deu um erro agendando a publicação. Tenta de novo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
