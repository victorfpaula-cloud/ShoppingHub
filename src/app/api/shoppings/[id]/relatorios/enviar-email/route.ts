import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarRelatorioDeMencoesPorEmail } from "@/lib/relatorios";

const DIAS_DO_ENVIO_MANUAL = 30;

// Sem isso, a function roda no limite padrão da Vercel (10s) — gerar o PDF (leitura da logo,
// desenho dos cartões/barras) mais a chamada pro Resend pode passar disso, e o usuário via só uma
// tela em branco sem nenhum aviso de erro (relatado em 06/09/2026).
export const maxDuration = 60;

// Envio manual do relatório de Menções/Stories por e-mail — pedido em 06/09/2026 pra não precisar
// esperar o ciclo automático de 30 dias. Sempre usa os últimos 30 dias corridos a partir de agora,
// e nunca mexe no registro de `shoppinghub_exportacoes_mencoes` (isso é só do ciclo automático,
// pra controlar o "relógio" de 30 em 30 dias).
//
// Só o relatório de Menções por enquanto — mandar os dois (menções + atendimentos) juntos num
// e-mail só suspeitou-se de estar pesado demais e ainda deu tela branca mesmo com o maxDuration
// aumentado (06/09/2026). O de Atendimentos ganha o mesmo botão separadamente depois, na aba
// própria, quando esse aqui estiver confirmado funcionando.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const destino = `/shoppings/${params.id}/relatorios`;

  try {
    const admin = criarClienteAdmin();
    const agora = new Date();
    const desde = new Date(agora.getTime() - DIAS_DO_ENVIO_MANUAL * 24 * 60 * 60 * 1000);

    const enviado = await enviarRelatorioDeMencoesPorEmail(admin, params.id, desde, agora);

    return NextResponse.redirect(
      new URL(`${destino}?email=${enviado ? "enviado" : "erro"}`, request.url)
    );
  } catch (erro) {
    // Rede de segurança: qualquer erro inesperado (não só a chamada ao Resend, que já não lança —
    // ver enviarEmailComAnexos) redireciona com aviso em vez de travar numa tela em branco sem
    // resposta nenhuma.
    console.error("Falha ao enviar relatório de menções por e-mail manualmente:", erro);
    return NextResponse.redirect(new URL(`${destino}?email=erro`, request.url));
  }
}
