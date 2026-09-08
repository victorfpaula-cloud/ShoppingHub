import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Devolve uma conversa pausada (por intervenção manual, ver webhook/instagram/route.ts) de volta
// pro bot — some a trava de shoppinghub_conversas_pausadas pra esse cliente.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const instagramScopedId = formData.get("instagram_scoped_id")?.toString();
  const destino = `/shoppings/${params.id}/atendimentos`;

  if (!instagramScopedId) {
    return NextResponse.redirect(new URL(destino, request.url));
  }

  const admin = criarClienteAdmin();

  const { data: contas } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", params.id);

  const contaIds = (contas ?? []).map((c) => c.id);

  if (contaIds.length > 0) {
    await admin
      .from("shoppinghub_conversas_pausadas")
      .delete()
      .in("conta_id", contaIds)
      .eq("instagram_scoped_id", instagramScopedId);
  }

  return NextResponse.redirect(new URL(destino, request.url));
}
