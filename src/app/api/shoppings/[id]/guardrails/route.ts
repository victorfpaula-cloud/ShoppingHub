import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const guardrailsTexto = formData.get("guardrails_texto")?.toString() ?? "";

  const destino = `/shoppings/${params.id}/guardrails`;

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("shoppinghub_shoppings")
    .update({ guardrails_texto: guardrailsTexto, updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) {
    console.error("Falha ao salvar guardrails:", error);
    return NextResponse.redirect(
      new URL(`${destino}?erro=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(`${destino}?salvo=1`, request.url));
}
