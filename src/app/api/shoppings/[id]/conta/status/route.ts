import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Pausa/reativa uma conta — o webhook (src/app/api/webhook/instagram/route.ts) já só responde
// contas com `active = true`, então pausar por aqui já é suficiente pra deixar o bot em silêncio
// total nessa conta (e o cron de publicação de menções também confere isso).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const contaId = formData.get("conta_id")?.toString();
  const ativar = formData.get("ativar")?.toString() === "1";

  const destino = `/shoppings/${params.id}/conta`;

  if (!contaId) {
    return NextResponse.redirect(new URL(destino, request.url));
  }

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("shoppinghub_contas")
    .update({ active: ativar, updated_at: new Date().toISOString() })
    .eq("id", contaId);

  if (error) {
    console.error("Falha ao pausar/reativar conta:", error);
    return NextResponse.redirect(new URL(`${destino}?erro=falha_ao_pausar`, request.url));
  }

  return NextResponse.redirect(new URL(destino, request.url));
}
