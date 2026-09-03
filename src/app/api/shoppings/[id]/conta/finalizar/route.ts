import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { PaginaComInstagram } from "@/lib/facebookOAuth";

const GRAPH_API_VERSION = "v21.0";

// Sem isso, a Página nunca avisa o Facebook que quer mandar eventos (mensagens de Direct,
// incluindo menções de Story) pro nosso app — mesmo com o webhook configurado certinho no painel
// do Meta, sem essa "inscrição" por Página nenhuma mensagem chega no nosso endpoint (mesma lição
// aprendida no DirectGov/Chatbot Direct).
async function inscreverPaginaNoWebhook(
  pageId: string,
  pageAccessToken: string
): Promise<{ ok: boolean; erro?: string }> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(
      pageAccessToken
    )}`,
    { method: "POST", cache: "no-store" }
  );

  if (resposta.ok) {
    return { ok: true };
  }

  const dados = await resposta.json().catch(() => null);
  const mensagemDoFacebook: string =
    dados?.error?.message ?? `Erro desconhecido (status HTTP ${resposta.status}).`;

  console.error("Falha ao inscrever Página no webhook:", dados?.error ?? dados);

  return { ok: false, erro: mensagemDoFacebook };
}

// Recebe a escolha de qual Página/conta do Instagram conectar (formulário de
// /shoppings/[id]/conta/conectar), grava a conta de verdade em shoppinghub_contas amarrada a esse
// shopping, inscreve a Página no webhook do app, e apaga a conexão pendente.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const formData = await request.formData();
  const idPendente = formData.get("pendente")?.toString();
  const pageIdEscolhido = formData.get("page_id")?.toString();

  const destinoBase = `/shoppings/${params.id}/conta`;

  if (!idPendente || !pageIdEscolhido) {
    return NextResponse.redirect(new URL(`${destinoBase}?erro=escolha_invalida`, request.url));
  }

  const admin = criarClienteAdmin();

  const { data: pendente, error: erroAoBuscar } = await admin
    .from("shoppinghub_pending_connections")
    .select("pages")
    .eq("id", idPendente)
    .maybeSingle();

  if (erroAoBuscar || !pendente) {
    return NextResponse.redirect(new URL(`${destinoBase}?erro=conexao_expirada`, request.url));
  }

  const paginas = pendente.pages as PaginaComInstagram[];
  const paginaEscolhida = paginas.find((p) => p.page_id === pageIdEscolhido);

  if (!paginaEscolhida) {
    return NextResponse.redirect(new URL(`${destinoBase}?erro=pagina_nao_encontrada`, request.url));
  }

  const { error: erroAoSalvarConta } = await admin.from("shoppinghub_contas").upsert(
    {
      shopping_id: params.id,
      instagram_user_id: paginaEscolhida.instagram_user_id,
      page_id: paginaEscolhida.page_id,
      page_name: paginaEscolhida.page_name,
      instagram_username: paginaEscolhida.instagram_username,
      access_token: paginaEscolhida.page_access_token,
      active: true,
    },
    { onConflict: "instagram_user_id" }
  );

  // A conexão pendente só serve uma vez, dá pra apagar mesmo se o passo seguinte falhar.
  await admin.from("shoppinghub_pending_connections").delete().eq("id", idPendente);

  if (erroAoSalvarConta) {
    return NextResponse.redirect(new URL(`${destinoBase}?erro=falha_ao_salvar_conta`, request.url));
  }

  const inscricao = await inscreverPaginaNoWebhook(
    paginaEscolhida.page_id,
    paginaEscolhida.page_access_token
  );

  if (!inscricao.ok) {
    const url = new URL(`${destinoBase}?conectada=1&aviso=falha_ao_inscrever_webhook`, request.url);
    if (inscricao.erro) {
      url.searchParams.set("detalhe", inscricao.erro);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(`${destinoBase}?conectada=1`, request.url));
}
