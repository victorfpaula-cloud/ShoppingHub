import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_MENCOES } from "@/lib/mencoes";

// Exclui uma menção da fila manualmente — útil pra tirar um teste, uma menção indevida, ou uma
// pendente que não deve mais ser publicada. Se ainda tiver mídia guardada (pendente/erro), apaga
// do Storage também; se já foi publicada de verdade no Instagram, isso só apaga o registro daqui
// (não desfaz a publicação real, que já saiu do ar do nosso lado — ver comentário no cron).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const shoppingId = formData.get("shopping_id")?.toString();

  const destino = shoppingId ? `/shoppings/${shoppingId}/mencoes` : "/shoppings";

  const admin = criarClienteAdmin();

  const { data: mencao } = await admin
    .from("shoppinghub_mencoes")
    .select("storage_path")
    .eq("id", params.id)
    .maybeSingle();

  if (mencao?.storage_path) {
    const { error: erroAoApagarMidia } = await admin.storage
      .from(BUCKET_MENCOES)
      .remove([mencao.storage_path]);

    if (erroAoApagarMidia) {
      console.error("Falha ao apagar mídia da menção excluída:", erroAoApagarMidia);
    }
  }

  const { error } = await admin.from("shoppinghub_mencoes").delete().eq("id", params.id);

  if (error) {
    console.error("Falha ao excluir menção:", error);
    return NextResponse.redirect(
      new URL(`${destino}?erro=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(destino, request.url));
}
