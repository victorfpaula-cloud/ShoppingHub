import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { gerarCsvDeAtendimentos } from "@/lib/atendimentos";

const OPCOES_DE_DIAS_VALIDAS = [15, 30];

// Exportação manual dos atendimentos (pedido em 06/09/2026, substituindo o antigo "Relatório de
// atendimentos" da home em PDF) — mesma função de geração de CSV usada pela exportação automática
// a cada 30 dias (ver exportarRelatoriosDevidos em lib/relatorios.ts).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const diasPedidos = Number(request.nextUrl.searchParams.get("dias"));
  const dias = OPCOES_DE_DIAS_VALIDAS.includes(diasPedidos) ? diasPedidos : 30;

  const admin = criarClienteAdmin();
  const agora = new Date();
  const desde = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);

  const csv = await gerarCsvDeAtendimentos(admin, params.id, desde, agora);
  const nomeArquivo = `atendimentos_ultimos_${dias}_dias_${agora.toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
