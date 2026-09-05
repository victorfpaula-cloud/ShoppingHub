import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Reseta uma menção travada em "erro" de volta pra "pendente" (e zera as tentativas) — ela entra
// na próxima chamada automática do cron (de 5 em 5 minutos, ver publicar-mencoes/route.ts) como se
// fosse nova. Usado quando o cron já desistiu sozinho depois de MAX_TENTATIVAS_AUTOMATICAS falhas
// seguidas, mas o problema que causou o erro (token vencido, conta pausada etc.) já foi resolvido.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const shoppingId = formData.get("shopping_id")?.toString();

  const destino = shoppingId ? `/shoppings/${shoppingId}/mencoes` : "/shoppings";

  const admin = criarClienteAdmin();

  const { error } = await admin
    .from("shoppinghub_mencoes")
    .update({ status: "pendente", tentativas: 0 })
    .eq("id", params.id);

  if (error) {
    console.error("Falha ao marcar menção pra tentar novamente:", error);
    return NextResponse.redirect(
      new URL(`${destino}?erro=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(destino, request.url));
}
