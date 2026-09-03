import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Não deixa excluir a loja "Geral" (eh_geral = true) — ela é o fallback obrigatório de todo
// shopping (o índice único parcial do schema já garante que só existe uma por shopping).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const shoppingId = formData.get("shopping_id")?.toString();

  const admin = criarClienteAdmin();

  const { data: loja } = await admin
    .from("shoppinghub_lojas")
    .select("eh_geral")
    .eq("id", params.id)
    .maybeSingle();

  const destinoLista = shoppingId ? `/shoppings/${shoppingId}` : "/shoppings";
  const destinoLoja = shoppingId ? `/shoppings/${shoppingId}/lojas/${params.id}` : "/shoppings";

  if (loja?.eh_geral) {
    return NextResponse.redirect(
      new URL(
        `${destinoLoja}?erro=${encodeURIComponent("A loja Geral não pode ser excluída.")}`,
        request.url
      )
    );
  }

  const { error } = await admin.from("shoppinghub_lojas").delete().eq("id", params.id);

  if (error) {
    console.error("Falha ao excluir loja:", error);
    return NextResponse.redirect(
      new URL(`${destinoLoja}?erro=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(destinoLista, request.url));
}
