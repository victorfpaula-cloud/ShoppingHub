import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Desconecta (apaga) uma conta permanentemente. Tabelas relacionadas
// (shoppinghub_processed_messages, shoppinghub_mensagens, shoppinghub_mencoes) têm
// `on delete cascade`/`on delete set null` pro conta_id, então apagar a linha em
// shoppinghub_contas já é suficiente.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const contaId = formData.get("conta_id")?.toString();

  const destino = `/shoppings/${params.id}/conta`;

  if (!contaId) {
    return NextResponse.redirect(new URL(destino, request.url));
  }

  const admin = criarClienteAdmin();
  const { error } = await admin.from("shoppinghub_contas").delete().eq("id", contaId);

  if (error) {
    console.error("Falha ao desconectar conta:", error);
    return NextResponse.redirect(new URL(`${destino}?erro=falha_ao_excluir`, request.url));
  }

  return NextResponse.redirect(new URL(`${destino}?excluida=1`, request.url));
}
