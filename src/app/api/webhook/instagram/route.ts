import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  assinaturaValida,
  baixarMidiaDoStory,
  buscarPerfilDoCliente,
  enviarMensagemDirect,
} from "@/lib/metaMessaging";
import { decidirLoja, responderComoLoja, type LojaComConhecimento } from "@/lib/triagem";
import { inicioDoDiaBrasiliaISO, subirMidiaDeMencao } from "@/lib/mencoes";

const CAMPOS_DA_LOJA =
  "id, nome, eh_geral, endereco, telefone, email, horario_atendimento, responsavel, base_conhecimento_texto";

export async function GET(request: NextRequest) {
  const modo = request.nextUrl.searchParams.get("hub.mode");
  const tokenRecebido = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const tokenEsperado = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (modo === "subscribe" && tokenEsperado && tokenRecebido === tokenEsperado && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Verificação falhou.", { status: 403 });
}

export async function POST(request: NextRequest) {
  const corpoBruto = await request.text();
  const assinatura = request.headers.get("x-hub-signature-256");

  if (!assinaturaValida(corpoBruto, assinatura)) {
    return new NextResponse("Assinatura inválida.", { status: 403 });
  }

  let payload: any;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const admin = criarClienteAdmin();

  const entradas: any[] = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entrada of entradas) {
    const eventosDeMensagem: any[] = Array.isArray(entrada?.messaging) ? entrada.messaging : [];

    for (const evento of eventosDeMensagem) {
      try {
        await processarEventoDeMensagem(admin, evento);
      } catch (erro) {
        console.error("Erro processando evento de mensagem do Direct:", erro);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function processarEventoDeMensagem(admin: ReturnType<typeof criarClienteAdmin>, evento: any) {
  const mensagem = evento?.message;

  if (mensagem?.is_echo) {
    return;
  }

  if (!mensagem) {
    return;
  }

  const idDaMensagem: string | undefined = mensagem?.mid;
  const idDoCliente: string | undefined = evento?.sender?.id;
  const idDaContaRecebendo: string | undefined = evento?.recipient?.id;

  if (!idDaMensagem || !idDoCliente || !idDaContaRecebendo) {
    return;
  }

  const { error: erroAoRegistrar } = await admin
    .from("shoppinghub_processed_messages")
    .insert({ message_id: idDaMensagem });

  if (erroAoRegistrar) {
    if ((erroAoRegistrar as any).code === "23505") return;
    throw erroAoRegistrar;
  }

  const { data: conta, error: erroAoBuscarConta } = await admin
    .from("shoppinghub_contas")
    .select("id, shopping_id, access_token")
    .eq("instagram_user_id", idDaContaRecebendo)
    .eq("active", true)
    .maybeSingle();

  if (erroAoBuscarConta) throw erroAoBuscarConta;

  if (!conta) {
    console.warn(
      `Mensagem recebida pra uma conta ainda não conectada no sistema (instagram_user_id=${idDaContaRecebendo}).`
    );
    return;
  }

  // Caso (b): marcação do shopping num Story de um lojista — entra na fila de publicação, não
  // gera resposta nenhuma pro cliente (quem marcou é o lojista, não um cliente perguntando algo).
  const anexos: any[] = Array.isArray(mensagem.attachments) ? mensagem.attachments : [];
  const mencaoDeStory = anexos.find((anexo) => anexo?.type === "story_mention");

  if (mencaoDeStory) {
    await processarMencaoDeStory(admin, conta, idDoCliente, mencaoDeStory);
    return;
  }

  // Caso (c): resposta a um Story que o próprio shopping repostou — o ID do story bate direto com
  // shoppinghub_mencoes.story_media_id, então dá pra saber a loja com certeza, sem IA adivinhando.
  const idDoStoryRespondido: string | undefined = mensagem?.reply_to?.story?.id;
  const textoDaMensagem: string | undefined = mensagem.text;

  // Últimas mensagens dessa conversa (mesma conta + mesmo cliente), dentro de uma janela curta —
  // dá continuidade a perguntas de seguimento ("tem no tamanho M?") sem arrastar assunto de uma
  // conversa antiga e já esquecida que aconteceu dias atrás.
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

  const perfilDoCliente = await buscarPerfilDoCliente(conta.access_token, idDoCliente);

  const { data: mensagemRecebida } = await admin
    .from("shoppinghub_mensagens")
    .insert({
      conta_id: conta.id,
      instagram_scoped_id: idDoCliente,
      direcao: "recebida",
      texto: textoDaMensagem ?? "[mensagem sem texto — áudio, imagem, story etc.]",
      cliente_nome: perfilDoCliente.nome,
      cliente_username: perfilDoCliente.username,
    })
    .select("id")
    .single();

  if (!textoDaMensagem) {
    return;
  }

  const { data: shopping } = await admin
    .from("shoppinghub_shoppings")
    .select("nome, guardrails_texto")
    .eq("id", conta.shopping_id)
    .maybeSingle();

  if (!shopping) {
    console.warn(`Shopping ${conta.shopping_id} não encontrado — mensagem sem resposta.`);
    return;
  }

  let lojaEscolhida: LojaComConhecimento | null = null;

  // Roteamento determinístico: se a mensagem é resposta a um story que o shopping publicou (a
  // partir de uma menção da fila), a loja já é conhecida com certeza.
  if (idDoStoryRespondido) {
    const { data: mencao } = await admin
      .from("shoppinghub_mencoes")
      .select("loja_id")
      .eq("story_media_id", idDoStoryRespondido)
      .maybeSingle();

    if (mencao?.loja_id) {
      const { data: loja } = await admin
        .from("shoppinghub_lojas")
        .select(CAMPOS_DA_LOJA)
        .eq("id", mencao.loja_id)
        .eq("ativo", true)
        .maybeSingle();

      lojaEscolhida = (loja as LojaComConhecimento | null) ?? null;
    }
  }

  // Sem roteamento determinístico (mensagem normal, ou story sem mapeamento encontrado) — a
  // triagem por IA decide qual loja é responsável, vendo só os nomes das lojas.
  if (!lojaEscolhida) {
    const { data: lojas } = await admin
      .from("shoppinghub_lojas")
      .select(CAMPOS_DA_LOJA)
      .eq("shopping_id", conta.shopping_id)
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (!lojas || lojas.length === 0) {
      console.warn(`Shopping ${conta.shopping_id} sem lojas ativas — mensagem sem resposta.`);
      return;
    }

    lojaEscolhida = await decidirLoja(lojas as LojaComConhecimento[], historicoRecente, textoDaMensagem);
  }

  // Atualiza a mensagem recebida com a loja decidida — assim o relatório de atendimentos
  // consegue mostrar quem procurou cada loja, sem precisar cruzar com a mensagem de resposta.
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

  await enviarMensagemDirect(conta.access_token, idDoCliente, respostaFinal);

  await admin.from("shoppinghub_mensagens").insert({
    conta_id: conta.id,
    instagram_scoped_id: idDoCliente,
    direcao: "enviada",
    texto: respostaFinal,
    loja_id: lojaEscolhida?.id ?? null,
  });
}

/**
 * Caso (b) do webhook — ver comentário acima de onde essa função é chamada. Segue os passos 2-5
 * do fluxo descrito no README: resolve o @usuário de quem marcou, bate contra uma loja cadastrada
 * nesse shopping, confere o limite diário, baixa a mídia do story e entra na fila.
 */
async function processarMencaoDeStory(
  admin: ReturnType<typeof criarClienteAdmin>,
  conta: { id: string; shopping_id: string; access_token: string },
  idDoCliente: string,
  anexo: any
) {
  const urlDoStory: string | undefined = anexo?.payload?.url;
  if (!urlDoStory) {
    return;
  }

  const perfil = await buscarPerfilDoCliente(conta.access_token, idDoCliente);
  const username = perfil.username?.toLowerCase();

  if (!username) {
    console.warn(
      `Menção de Story recebida sem @usuário resolvido (IGSID=${idDoCliente}) — descartada.`
    );
    return;
  }

  const { data: loja } = await admin
    .from("shoppinghub_lojas")
    .select("id, limite_diario_mencoes, ativo")
    .eq("shopping_id", conta.shopping_id)
    .ilike("instagram_username", username)
    .maybeSingle();

  if (!loja || !loja.ativo) {
    console.warn(
      `Menção de Story de @${username} não bate com nenhuma loja autorizada nesse shopping — descartada.`
    );
    return;
  }

  const inicioDoDia = inicioDoDiaBrasiliaISO();
  const { count: mencoesHoje } = await admin
    .from("shoppinghub_mencoes")
    .select("id", { count: "exact", head: true })
    .eq("loja_id", loja.id)
    .neq("status", "descartado_limite")
    .gte("recebido_em", inicioDoDia);

  if ((mencoesHoje ?? 0) >= loja.limite_diario_mencoes) {
    // Registrado (não só ignorado) pra dar visibilidade na fila de menções — ver
    // src/app/shoppings/[id]/mencoes/page.tsx.
    await admin.from("shoppinghub_mencoes").insert({
      conta_id: conta.id,
      loja_id: loja.id,
      instagram_scoped_id: idDoCliente,
      status: "descartado_limite",
    });
    return;
  }

  const { data: mencaoCriada, error: erroAoCriarMencao } = await admin
    .from("shoppinghub_mencoes")
    .insert({
      conta_id: conta.id,
      loja_id: loja.id,
      instagram_scoped_id: idDoCliente,
      status: "pendente",
    })
    .select("id")
    .single();

  if (erroAoCriarMencao || !mencaoCriada) {
    console.error("Falha ao registrar menção de Story na fila:", erroAoCriarMencao);
    return;
  }

  const midia = await baixarMidiaDoStory(urlDoStory);

  if (!midia) {
    await admin.from("shoppinghub_mencoes").update({ status: "erro" }).eq("id", mencaoCriada.id);
    return;
  }

  try {
    const { storagePath } = await subirMidiaDeMencao(
      admin,
      mencaoCriada.id,
      midia.bytes,
      midia.contentType
    );
    await admin
      .from("shoppinghub_mencoes")
      .update({ storage_path: storagePath })
      .eq("id", mencaoCriada.id);
  } catch (erro) {
    console.error("Falha ao subir mídia de menção de Story pro Storage:", erro);
    await admin.from("shoppinghub_mencoes").update({ status: "erro" }).eq("id", mencaoCriada.id);
  }
}
