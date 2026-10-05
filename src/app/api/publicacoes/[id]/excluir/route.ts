import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_PUBLICACOES } from "@/lib/publicacoesConstantes";

// Cancela/exclui uma publicação agendada — se ainda não publicou (ou é um Story no meio do
// período), apaga a mídia do Storage também; se já publicou de verdade (feed "publicado" ou
// story "concluido"), só apaga o registro (não desfaz a publicação real no Instagram).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const shoppingId = formData.get("shopping_id")?.toString();
  const destino = shoppingId ? `/shoppings/${shoppingId}/publicacoes` : "/shoppings";

  const admin = criarClienteAdmin();

  const { data: publicacao } = await admin
    .from("shoppinghub_publicacoes")
    .select("midias, status")
    .eq("id", params.id)
    .maybeSingle();

  const aindaPrecisaDaMidia =
    publicacao && (publicacao.status === "agendado" || publicacao.status === "publicando");

  if (aindaPrecisaDaMidia && Array.isArray(publicacao.midias) && publicacao.midias.length > 0) {
    const caminhos = publicacao.midias.map((m: { storage_path: string }) => m.storage_path);
    const { error: erroAoApagarMidia } = await admin.storage.from(BUCKET_PUBLICACOES).remove(caminhos);

    if (erroAoApagarMidia) {
      console.error("Falha ao apagar mídia da publicação cancelada:", erroAoApagarMidia);
    }
  }

  const { error } = await admin.from("shoppinghub_publicacoes").delete().eq("id", params.id);

  if (error) {
    console.error("Falha ao excluir publicação agendada:", error);
    return NextResponse.redirect(new URL(`${destino}?erro=${encodeURIComponent(error.message)}`, request.url));
  }

  return NextResponse.redirect(new URL(destino, request.url));
}
