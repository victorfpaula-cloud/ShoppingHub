import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarRelatoriosPorEmail } from "@/lib/relatorios";

const DIAS_DO_ENVIO_MANUAL = 30;

// Envio manual dos relatórios (menções + atendimentos) por e-mail — pedido em 06/09/2026 pra não
// precisar esperar o ciclo automático de 30 dias. Sempre usa os últimos 30 dias corridos a partir
// de agora, e nunca mexe no registro de `shoppinghub_exportacoes_mencoes` (isso é só do ciclo
// automático, pra controlar o "relógio" de 30 em 30 dias).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = criarClienteAdmin();
  const agora = new Date();
  const desde = new Date(agora.getTime() - DIAS_DO_ENVIO_MANUAL * 24 * 60 * 60 * 1000);

  const destino = `/shoppings/${params.id}/relatorios`;
  const enviado = await enviarRelatoriosPorEmail(admin, params.id, desde, agora);

  return NextResponse.redirect(
    new URL(`${destino}?email=${enviado ? "enviado" : "erro"}`, request.url)
  );
}
