import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { gerarCsv, type MencaoParaCSV } from "@/lib/relatorios";

const OPCOES_DE_DIAS_VALIDAS = [15, 30];

// Exportação manual sob demanda (pedido em 06/09/2026), separada da exportação automática que já
// roda sozinha a cada 30 dias (ver exportarRelatoriosDevidos em src/lib/relatorios.ts) — reusa a
// mesma função de geração de CSV, só que com o período escolhido na hora pelo usuário.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const diasPedidos = Number(request.nextUrl.searchParams.get("dias"));
  const dias = OPCOES_DE_DIAS_VALIDAS.includes(diasPedidos) ? diasPedidos : 30;

  const admin = criarClienteAdmin();

  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select("id, nome")
    .eq("shopping_id", params.id);

  const idsDasLojas = (lojas ?? []).map((l) => l.id);
  const nomePorLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]));

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data: mencoes } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("loja_id, instagram_username, status, recebido_em, publicado_em, story_media_id")
          .in("loja_id", idsDasLojas)
          .gte("recebido_em", desde)
          .order("recebido_em", { ascending: true })
      : { data: [] as MencaoParaCSV[] };

  const csv = gerarCsv((mencoes ?? []) as MencaoParaCSV[], nomePorLoja);
  const nomeArquivo = `mencoes_ultimos_${dias}_dias_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
