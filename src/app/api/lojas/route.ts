import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { paginaDeConfirmacaoDuplicidade } from "@/lib/confirmacaoDuplicidade";

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

  // Avisa (sem bloquear de vez) se já existe uma loja com esse mesmo nome nesse shopping — pode
  // ser engano (clicou "criar" duas vezes) ou pode ser mesmo uma segunda loja com nome parecido;
  // quem decide é quem está cadastrando. `ilike` sem "%" já compara ignorando maiúscula/minúscula.
  if (formData.get("confirmar")?.toString() !== "1") {
    const { data: lojaComMesmoNome } = await admin
      .from("shoppinghub_lojas")
      .select("id")
      .eq("shopping_id", shoppingId)
      .ilike("nome", nome)
      .maybeSingle();

    if (lojaComMesmoNome) {
      const html = paginaDeConfirmacaoDuplicidade(
        formData,
        "/api/lojas",
        [
          `Já existe uma loja chamada "${nome}" cadastrada nesse shopping.`,
          "Tem certeza que deseja cadastrar esse lojista novamente?",
        ],
        `/shoppings/${shoppingId}/lojas/novo`,
        "Cadastrar mesmo assim"
      );
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
  }

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
