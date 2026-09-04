import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { decidirLoja, responderComoLoja, type LojaComConhecimento } from "@/lib/triagem";

const CAMPOS_DA_LOJA =
  "id, nome, eh_geral, endereco, telefone, email, horario_atendimento, responsavel, base_conhecimento_texto";

// Ponte temporária: enquanto o App Review do ShoppingHub não sai, o SendPulse (que já tem acesso
// aprovado pela Meta) recebe a mensagem de verdade e chama esse endpoint pra decidir a resposta —
// o ShoppingHub nunca fala com a Meta nesse fluxo, só devolve o texto pro SendPulse mandar.
// Autenticado por um segredo compartilhado (não dá pra usar a assinatura da Meta aqui, já que
// quem está chamando é o SendPulse, não a Meta).
export async function POST(request: NextRequest) {
  const segredoRecebido = request.headers.get("x-bridge-secret");
  const segredoEsperado = process.env.SENDPULSE_BRIDGE_SECRET;

  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo) {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }

  const shoppingSlug: string | undefined = corpo.shopping_slug;
  const textoDaMensagem: string | undefined = corpo.texto?.toString().trim();
  const contatoId: string | undefined = corpo.contato_id?.toString();
  const username: string | null = corpo.username ? corpo.username.toString().toLowerCase() : null;
  const nomeDoCliente: string | null = corpo.nome ? corpo.nome.toString() : null;

  if (!shoppingSlug || !textoDaMensagem || !contatoId) {
    return NextResponse.json(
      { erro: "Faltou shopping_slug, texto ou contato_id no corpo da requisição." },
      { status: 400 }
    );
  }

  const admin = criarClienteAdmin();

  const { data: shopping } = await admin
    .from("shoppinghub_shoppings")
    .select("id, nome, guardrails_texto")
    .eq("slug", shoppingSlug)
    .maybeSingle();

  if (!shopping) {
    return NextResponse.json({ erro: `Shopping "${shoppingSlug}" não encontrado.` }, { status: 404 });
  }

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", shopping.id)
    .eq("active", true)
    .maybeSingle();

  if (!conta) {
    return NextResponse.json(
      { erro: "Esse shopping não tem conta do Instagram conectada/ativa." },
      { status: 404 }
    );
  }

  // Mesmo prefixo em toda mensagem vinda dessa ponte — evita colidir com o instagram_scoped_id
  // (IGSID) de verdade usado no fluxo direto via Meta, mas mantém tudo na MESMA tabela, então a
  // aba "Atendimentos" do painel mostra as conversas dos dois fluxos juntas, sem distinção.
  const idDoCliente = `sendpulse:${contatoId}`;

  // Ignora completamente mensagem de conta cadastrada como lojista autorizado — mesma regra do
  // fluxo direto (ver src/app/api/webhook/instagram/route.ts).
  if (username) {
    const { data: lojasDoShopping } = await admin
      .from("shoppinghub_lojas")
      .select("instagram_username, instagram_username_2")
      .eq("shopping_id", shopping.id);

    const ehLojistaAutorizado = (lojasDoShopping ?? []).some(
      (l) =>
        l.instagram_username?.toLowerCase() === username ||
        l.instagram_username_2?.toLowerCase() === username
    );

    if (ehLojistaAutorizado) {
      console.log(`[ponte SendPulse] Mensagem de @${username} ignorada — é lojista autorizado.`);
      return NextResponse.json({ ignorado: true });
    }
  }

  const DUAS_HORAS_MS = 2 * 60 * 60 * 1000;
  const { data: mensagensAnteriores } = await admin
    .from("shoppinghub_mensagens")
    .select("direcao, texto")
    .eq("conta_id", conta.id)
    .eq("instagram_scoped_id", idDoCliente)
    .gte("created_at", new Date(Date.now() - DUAS_HORAS_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(10);

  const historicoRecente = (mensagensAnteriores ?? [])
    .map((m) => `${m.direcao === "recebida" ? "Cliente" : "Atendimento"}: ${m.texto}`)
    .join("\n");

  const { data: mensagemRecebida } = await admin
    .from("shoppinghub_mensagens")
    .insert({
      conta_id: conta.id,
      instagram_scoped_id: idDoCliente,
      direcao: "recebida",
      texto: textoDaMensagem,
      cliente_nome: nomeDoCliente,
      cliente_username: username,
    })
    .select("id")
    .single();

  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select(CAMPOS_DA_LOJA)
    .eq("shopping_id", shopping.id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (!lojas || lojas.length === 0) {
    return NextResponse.json({ erro: "Shopping sem lojas ativas." }, { status: 422 });
  }

  const lojaEscolhida = await decidirLoja(lojas as LojaComConhecimento[], historicoRecente, textoDaMensagem);

  if (lojaEscolhida && mensagemRecebida) {
    await admin
      .from("shoppinghub_mensagens")
      .update({ loja_id: lojaEscolhida.id })
      .eq("id", mensagemRecebida.id);
  }

  const respostaGerada = lojaEscolhida
    ? await responderComoLoja(
        lojaEscolhida,
        shopping.nome,
        shopping.guardrails_texto ?? "",
        historicoRecente,
        textoDaMensagem
      )
    : null;

  const respostaFinal =
    respostaGerada ??
    "Recebemos sua mensagem, mas tivemos um problema técnico pra responder agora. Vamos te retornar em breve.";

  await admin.from("shoppinghub_mensagens").insert({
    conta_id: conta.id,
    instagram_scoped_id: idDoCliente,
    direcao: "enviada",
    texto: respostaFinal,
    loja_id: lojaEscolhida?.id ?? null,
  });

  return NextResponse.json({ resposta: respostaFinal });
}
