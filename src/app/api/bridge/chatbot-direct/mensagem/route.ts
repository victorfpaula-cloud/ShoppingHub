import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { decidirLoja, responderComoLoja, type LojaComConhecimento } from "@/lib/triagem";

const CAMPOS_DA_LOJA =
  "id, nome, eh_geral, endereco, telefone, email, horario_atendimento, responsavel, base_conhecimento_texto";

// Campos leves usados só pra decidirLoja (ver triagem.ts) escolher qual loja deve responder — ver
// mesmo comentário em src/app/api/webhook/instagram/route.ts.
const CAMPOS_DA_LOJA_PARA_TRIAGEM = "id, nome, eh_geral";

// Ponte de chat com o chatbot-direct — substitui a ponte com a SendPulse (ver bridge/sendpulse,
// desativada em 07/11/2026 por causa do plano de automação da SendPulse ter parado de chamar o
// nosso endpoint sem aviso). O chatbot-direct já tem Acesso Avançado aprovado pela Meta pra
// mensageria, então ele mesmo recebe o Direct de verdade e chama aqui só pra decidir o texto da
// resposta (igual a SendPulse fazia) — o ShoppingHub nunca fala com a Meta nesse fluxo, quem manda
// a resposta de volta é o chatbot-direct, com o token dele.
//
// Diferença chave pro bridge da SendPulse: aqui o chamador já manda o `instagram_user_id` de
// verdade (o ID da conta do Instagram na Meta) — então a conta é resolvida direto por ele, sem
// precisar de um "shopping_slug" configurado à mão em lugar nenhum.
export async function POST(request: NextRequest) {
  const segredoRecebido = request.headers.get("x-bridge-secret");
  const segredoEsperado = process.env.CHATBOTDIRECT_BRIDGE_SECRET;

  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo) {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }

  const instagramUserId: string | undefined = corpo.instagram_user_id?.toString();
  const textoDaMensagem: string | undefined = corpo.texto?.toString().trim();
  const contatoId: string | undefined = corpo.contato_id?.toString();
  const username: string | null = corpo.username ? corpo.username.toString().toLowerCase() : null;
  const nomeDoCliente: string | null = corpo.nome ? corpo.nome.toString() : null;

  if (!instagramUserId || !textoDaMensagem || !contatoId) {
    return NextResponse.json(
      { erro: "Faltou instagram_user_id, texto ou contato_id no corpo da requisição." },
      { status: 400 }
    );
  }

  const admin = criarClienteAdmin();

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id, shopping_id")
    .eq("instagram_user_id", instagramUserId)
    .eq("active", true)
    .maybeSingle();

  if (!conta) {
    return NextResponse.json(
      { erro: `Nenhuma conta ativa do ShoppingHub pro instagram_user_id "${instagramUserId}".` },
      { status: 404 }
    );
  }

  const { data: shopping } = await admin
    .from("shoppinghub_shoppings")
    .select("nome, guardrails_texto")
    .eq("id", conta.shopping_id)
    .maybeSingle();

  if (!shopping) {
    return NextResponse.json({ erro: "Shopping dessa conta não encontrado." }, { status: 404 });
  }

  // Mesmo prefixo em toda mensagem vinda dessa ponte — evita colidir com o instagram_scoped_id
  // (IGSID) de verdade usado no fluxo direto via Meta, mas mantém tudo na MESMA tabela, então a
  // aba "Atendimentos" do painel mostra as conversas de todos os canais juntas, sem distinção.
  const idDoCliente = `chatbotdirect:${contatoId}`;

  // Ignora completamente mensagem de conta cadastrada como lojista autorizado — mesma regra do
  // fluxo direto (ver src/app/api/webhook/instagram/route.ts).
  if (username) {
    const { data: lojasDoShopping } = await admin
      .from("shoppinghub_lojas")
      .select("instagram_username, instagram_username_2")
      .eq("shopping_id", conta.shopping_id);

    const ehLojistaAutorizado = (lojasDoShopping ?? []).some(
      (l) =>
        l.instagram_username?.toLowerCase() === username ||
        l.instagram_username_2?.toLowerCase() === username
    );

    if (ehLojistaAutorizado) {
      console.log(`[ponte chatbot-direct] Mensagem de @${username} ignorada — é lojista autorizado.`);
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
    .select(CAMPOS_DA_LOJA_PARA_TRIAGEM)
    .eq("shopping_id", conta.shopping_id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (!lojas || lojas.length === 0) {
    return NextResponse.json({ erro: "Shopping sem lojas ativas." }, { status: 422 });
  }

  const lojaDecidida = await decidirLoja(lojas, historicoRecente, textoDaMensagem);

  const lojaEscolhida = lojaDecidida
    ? ((
        await admin.from("shoppinghub_lojas").select(CAMPOS_DA_LOJA).eq("id", lojaDecidida.id).maybeSingle()
      ).data as LojaComConhecimento | null)
    : null;

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
