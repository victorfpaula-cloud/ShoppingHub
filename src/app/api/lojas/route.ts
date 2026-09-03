import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const shoppingId = formData.get("shopping_id")?.toString();
  const nome = formData.get("nome")?.toString().trim() ?? "";

  if (!shoppingId) {
    return NextResponse.redirect(new URL("/shoppings", request.url));
  }

  if (!nome) {
    return NextResponse.redirect(
      new URL(
        `/shoppings/${shoppingId}/lojas/novo?erro=${encodeURIComponent(
          "Precisa preencher o nome da loja."
        )}`,
        request.url
      )
    );
  }

  const admin = criarClienteAdmin();

  // Lojas novas entram no fim da lista de exibição — soma 1 na maior "ordem" já usada nesse
  // shopping (começa em 1 se ainda não tiver nenhuma loja).
  const { data: maiorOrdem } = await admin
    .from("shoppinghub_lojas")
    .select("ordem")
    .eq("shopping_id", shoppingId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("shoppinghub_lojas").insert({
    shopping_id: shoppingId,
    nome,
    ordem: (maiorOrdem?.ordem ?? 0) + 1,
  });

  if (error) {
    console.error("Falha ao criar loja:", error);
    return NextResponse.redirect(
      new URL(
        `/shoppings/${shoppingId}/lojas/novo?erro=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }

  return NextResponse.redirect(new URL(`/shoppings/${shoppingId}`, request.url));
}
