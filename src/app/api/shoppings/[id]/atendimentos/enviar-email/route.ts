import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarRelatorioDeAtendimentosPorEmail } from "@/lib/relatorios";

const DIAS_DO_ENVIO_MANUAL = 30;

// Igual ao envio manual de Menções (ver api/shoppings/[id]/relatorios/enviar-email) — mesmo
// maxDuration e mesma rede de segurança com try/catch, pelos mesmos motivos.
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const destino = `/shoppings/${params.id}/atendimentos`;

  try {
    const admin = criarClienteAdmin();
    const agora = new Date();
    const desde = new Date(agora.getTime() - DIAS_DO_ENVIO_MANUAL * 24 * 60 * 60 * 1000);

    const enviado = await enviarRelatorioDeAtendimentosPorEmail(admin, params.id, desde, agora);

    return NextResponse.redirect(
      new URL(`${destino}?email=${enviado ? "enviado" : "erro"}`, request.url)
    );
  } catch (erro) {
    console.error("Falha ao enviar relatório de atendimentos por e-mail manualmente:", erro);
    return NextResponse.redirect(new URL(`${destino}?email=erro`, request.url));
  }
}
