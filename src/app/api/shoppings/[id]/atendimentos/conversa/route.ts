import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Transcrição completa de UM cliente específico, buscada sob demanda quando o usuário abre o
// dropdown daquele atendimento na página de Atendimentos — evita carregar o texto de toda mensagem
// de todo cliente (potencialmente milhares de linhas) só pra montar a lista inicial, sendo que a
// esmagadora maioria das conversas fica fechada o tempo todo (mesmo princípio já usado no
// detalhamento diário de Relatórios, ver api/shoppings/[id]/relatorios/dia).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const instagramScopedId = request.nextUrl.searchParams.get("scopedId");

  if (!instagramScopedId) {
    return NextResponse.json({ erro: "Parâmetro 'scopedId' obrigatório." }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { data: contas } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", params.id);

  const contaIds = (contas ?? []).map((c) => c.id);

  const { data: mensagens } =
    contaIds.length > 0
      ? await admin
          .from("shoppinghub_mensagens")
          .select("direcao, texto, loja_id, created_at")
          .in("conta_id", contaIds)
          .eq("instagram_scoped_id", instagramScopedId)
          .order("created_at", { ascending: true })
      : { data: [] as any[] };

  const lojaIds = Array.from(new Set((mensagens ?? []).map((m) => m.loja_id).filter(Boolean)));
  const { data: lojas } =
    lojaIds.length > 0
      ? await admin.from("shoppinghub_lojas").select("id, nome").in("id", lojaIds as string[])
      : { data: [] as { id: string; nome: string }[] };
  const nomePorLoja = Object.fromEntries((lojas ?? []).map((l) => [l.id, l.nome]));

  const mensagensFormatadas = (mensagens ?? []).map((m) => ({
    direcao: m.direcao,
    texto: m.texto,
    dataHoraIso: m.created_at,
    lojaNome: m.loja_id ? nomePorLoja[m.loja_id] ?? null : null,
  }));

  return NextResponse.json({ mensagens: mensagensFormatadas });
}
