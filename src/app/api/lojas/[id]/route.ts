import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { paginaDeConfirmacaoDuplicidade } from "@/lib/confirmacaoDuplicidade";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const shoppingId = formData.get("shopping_id")?.toString();
  const nome = formData.get("nome")?.toString().trim() ?? "";

  if (!shoppingId) {
    return NextResponse.redirect(new URL("/shoppings", request.url));
  }

  const destino = `/shoppings/${shoppingId}/lojas/${params.id}`;

  if (!nome) {
    return NextResponse.redirect(
      new URL(
        `${destino}?erro=${encodeURIComponent("Precisa preencher o nome da loja.")}`,
        request.url
      )
    );
  }

  const instagramUsername =
    formData
      .get("instagram_username")
      ?.toString()
      .trim()
      .replace(/^@/, "")
      .toLowerCase() || null;

  const instagramUsername2 =
    formData
      .get("instagram_username_2")
      ?.toString()
      .trim()
      .replace(/^@/, "")
      .toLowerCase() || null;

  const limiteDiarioBruto = formData.get("limite_diario_mencoes")?.toString().trim();
  const limiteDiarioMencoes = limiteDiarioBruto ? parseInt(limiteDiarioBruto, 10) : 10;

  if (Number.isNaN(limiteDiarioMencoes) || limiteDiarioMencoes < 0) {
    return NextResponse.redirect(
      new URL(
        `${destino}?erro=${encodeURIComponent("Limite diário de menções inválido.")}`,
        request.url
      )
    );
  }

  const admin = criarClienteAdmin();

  // Avisa (sem bloquear de vez) se o nome ou algum dos @usuários já pertence a OUTRA loja desse
  // mesmo shopping — nome duplicado é só um alerta (pode ser proposital), mas @usuário duplicado é
  // mais sério: é ele que decide pra qual loja vai cada menção de Story (ver processarMencaoRecebida
  // em mencoes.ts), então duas lojas com o mesmo @usuário deixa esse roteamento ambíguo. De
  // qualquer forma, quem decide se segue mesmo assim é quem está cadastrando.
  if (formData.get("confirmar")?.toString() !== "1") {
    const avisos: string[] = [];

    const { data: lojaComMesmoNome } = await admin
      .from("shoppinghub_lojas")
      .select("id")
      .eq("shopping_id", shoppingId)
      .neq("id", params.id)
      .ilike("nome", nome)
      .maybeSingle();

    if (lojaComMesmoNome) {
      avisos.push(`Já existe outra loja chamada "${nome}" cadastrada nesse shopping.`);
    }

    const usernamesInformados = [instagramUsername, instagramUsername2].filter(
      (u): u is string => Boolean(u)
    );

    if (usernamesInformados.length > 0) {
      const filtroDeUsername = usernamesInformados
        .flatMap((u) => [`instagram_username.eq.${u}`, `instagram_username_2.eq.${u}`])
        .join(",");

      const { data: lojasComMesmoUsername } = await admin
        .from("shoppinghub_lojas")
        .select("nome")
        .eq("shopping_id", shoppingId)
        .neq("id", params.id)
        .or(filtroDeUsername);

      if (lojasComMesmoUsername && lojasComMesmoUsername.length > 0) {
        avisos.push(
          `O @usuário informado já está cadastrado na loja "${lojasComMesmoUsername[0].nome}" desse shopping.`
        );
      }
    }

    if (avisos.length > 0) {
      avisos.push("Tem certeza que deseja salvar mesmo assim?");
      const html = paginaDeConfirmacaoDuplicidade(
        formData,
        `/api/lojas/${params.id}`,
        avisos,
        destino,
        "Salvar mesmo assim"
      );
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
  }

  const { error } = await admin
    .from("shoppinghub_lojas")
    .update({
      nome,
      ativo: formData.get("ativo")?.toString() === "1",
      instagram_username: instagramUsername,
      instagram_username_2: instagramUsername2,
      limite_diario_mencoes: limiteDiarioMencoes,
      endereco: formData.get("endereco")?.toString().trim() || null,
      telefone: formData.get("telefone")?.toString().trim() || null,
      email: formData.get("email")?.toString().trim() || null,
      horario_atendimento: formData.get("horario_atendimento")?.toString().trim() || null,
      responsavel: formData.get("responsavel")?.toString().trim() || null,
      base_conhecimento_texto: formData.get("base_conhecimento_texto")?.toString() ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) {
    console.error("Falha ao salvar loja:", error);
    const mensagem =
      error.code === "23505"
        ? "Já existe uma loja com esse @usuário do Instagram nesse shopping (confira o 1º e o 2º campo)."
        : error.message;
    return NextResponse.redirect(
      new URL(`${destino}?erro=${encodeURIComponent(mensagem)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(`${destino}?salvo=1`, request.url));
}
