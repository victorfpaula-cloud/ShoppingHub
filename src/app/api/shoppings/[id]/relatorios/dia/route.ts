import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

const FORMATO_DA_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Detalhamento de UM dia específico, buscado sob demanda quando o usuário abre o dropdown daquele
// dia na página de relatórios — evita carregar a lista completa de menções (com usuário, horários
// etc.) de todos os dias de uma vez só, sendo que a esmagadora maioria fica fechada o tempo todo.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const data = request.nextUrl.searchParams.get("data");

  if (!data || !FORMATO_DA_DATA.test(data)) {
    return NextResponse.json({ erro: "Parâmetro 'data' inválido (esperado AAAA-MM-DD)." }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select("id, nome")
    .eq("shopping_id", params.id);

  const idsDasLojas = (lojas ?? []).map((l) => l.id);
  const nomePorLoja = Object.fromEntries((lojas ?? []).map((l) => [l.id, l.nome]));

  // Limites do dia em horário de Brasília (UTC-3, fixo o ano todo), convertidos pra instantes UTC
  // na hora de consultar — evita depender do fuso do servidor.
  const inicioUTC = new Date(`${data}T00:00:00-03:00`).toISOString();
  const fimUTC = new Date(`${data}T23:59:59.999-03:00`).toISOString();

  const { data: mencoes } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("id, loja_id, instagram_username, status, recebido_em, publicado_em, story_media_id")
          .in("loja_id", idsDasLojas)
          .gte("recebido_em", inicioUTC)
          .lte("recebido_em", fimUTC)
          .order("recebido_em", { ascending: true })
      : { data: [] };

  return NextResponse.json({ mencoes: mencoes ?? [], nomePorLoja });
}
