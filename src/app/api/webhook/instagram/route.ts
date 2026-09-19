import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { assinaturaValida, enviarMensagemDirect } from "@/lib/metaMessaging";
import { decidirLoja, responderComoLoja, type LojaComConhecimento } from "@/lib/triagem";
import { processarMencaoRecebida, buscarPerfilDoClienteComCache } from "@/lib/mencoes";

// Sem isso, a Vercel usa o padrão de 10s — insuficiente pra baixar+comprimir um vídeo de menção
// (ver comprimirVideo.ts, chamado dentro de processarMencaoRecebida), o que podia estourar
// silenciosamente e cair como "erro" na fila sem nenhuma pista do motivo real.
export const maxDuration = 60;

const CAMPOS_DA_LOJA =
  "id, nome, eh_geral, endereco, telefone, email, horario_atendimento, responsavel, base_conhecimento_texto";

// Campos leves usados só pra decidirLoja (ver triagem.ts) escolher qual loja deve responder — a
// base de conhecimento e os dados de contato de cada loja (potencialmente extensos) só interessam
// depois de já saber QUAL loja venceu, não pra decidir entre elas (achado ao revisar egress do
// Supabase em 19/09/2026: antes disso, toda mensagem recebida trazia a base de conhecimento de
// TODAS as lojas ativas do shopping, mesmo a IA de triagem só olhando o nome de cada uma).
const CAMPOS_DA_LOJA_PARA_TRIAGEM = "id, nome, eh_geral";

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
    // Log temporário de diagnóstico (08/09/2026, ver processarEventoDeMensagem) — se um payload de
    // eco (is_echo) estiver sendo rejeitado bem aqui, o problema é a assinatura vir de um produto/
    // segredo diferente dos dois já conferidos em assinaturaValida, não a lógica da pausa em si.
    console.warn(
      `Assinatura inválida rejeitou um payload${
        corpoBruto.includes('"is_echo"') ? " que PARECE ser um eco (contém is_echo)" : ""
      }.`
    );
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

  // Log temporário de diagnóstico (08/09/2026) — a pausa automática por intervenção manual não
  // disparou em produção depois de implementada. Antes de mexer mais no código, precisamos
  // confirmar o que a Meta está de fato mandando: se esse evento nem aparece no log, a Meta não
  // está entregando eco nenhum pra mensagem mandada manualmente pelo app (aí o problema é de
  // permissão/plataforma, não do nosso código); se aparece só com is_echo ausente ou com
  // sender/recipient diferentes do esperado, é a nossa leitura do payload que está errada. Tirar
  // esse log assim que a causa for confirmada.
  if (mensagem?.is_echo) {
    console.log("Evento de eco recebido (bruto):", JSON.stringify(evento));
    await tratarEcoDeMensagemEnviada(admin, evento, mensagem);
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

  const perfilDoCliente = await buscarPerfilDoClienteComCache(admin, conta.access_token, idDoCliente);

  // Ignora completamente qualquer mensagem de uma conta cadastrada como @usuário autorizado de
  // alguma loja desse shopping — essas contas são lojistas, cadastradas só pra poder marcar o
  // shopping nos Stories deles (repostagem automática, caso b acima). Não é cliente perguntando
  // nada, então não salva, não aciona a IA, não responde nada — sem isso o Gemini ficava tentando
  // puxar conversa com o lojista toda vez que ele mandava um Direct qualquer.
  const usernameDoRemetente = perfilDoCliente.username?.toLowerCase();
  if (usernameDoRemetente) {
    const { data: lojasDoShopping } = await admin
      .from("shoppinghub_lojas")
      .select("instagram_username, instagram_username_2")
      .eq("shopping_id", conta.shopping_id);

    const ehLojistaAutorizado = (lojasDoShopping ?? []).some(
      (l) =>
        l.instagram_username?.toLowerCase() === usernameDoRemetente ||
        l.instagram_username_2?.toLowerCase() === usernameDoRemetente
    );

    if (ehLojistaAutorizado) {
      console.log(
        `Mensagem de @${usernameDoRemetente} ignorada — é lojista autorizado desse shopping, não cliente.`
      );
      return;
    }
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

  // Um humano já respondeu essa conversa direto pelo Instagram (fora do bot) — ver
  // tratarEcoDeMensagemEnviada abaixo. A mensagem do cliente já ficou registrada (linha acima),
  // só não gera nem manda resposta automática, pra não entrar no meio de um atendimento manual.
  const { data: conversaPausada } = await admin
    .from("shoppinghub_conversas_pausadas")
    .select("conta_id")
    .eq("conta_id", conta.id)
    .eq("instagram_scoped_id", idDoCliente)
    .maybeSingle();

  if (conversaPausada) {
    console.log(`Conversa com ${idDoCliente} está pausada (atendimento manual) — bot não responde.`);
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
      .select(CAMPOS_DA_LOJA_PARA_TRIAGEM)
      .eq("shopping_id", conta.shopping_id)
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (!lojas || lojas.length === 0) {
      console.warn(`Shopping ${conta.shopping_id} sem lojas ativas — mensagem sem resposta.`);
      return;
    }

    const lojaDecidida = await decidirLoja(lojas, historicoRecente, textoDaMensagem);

    if (lojaDecidida) {
      const { data: lojaCompleta } = await admin
        .from("shoppinghub_lojas")
        .select(CAMPOS_DA_LOJA)
        .eq("id", lojaDecidida.id)
        .maybeSingle();

      lojaEscolhida = (lojaCompleta as LojaComConhecimento | null) ?? null;
    }
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

  const { messageId } = await enviarMensagemDirect(conta.access_token, idDoCliente, respostaFinal);

  await admin.from("shoppinghub_mensagens").insert({
    conta_id: conta.id,
    instagram_scoped_id: idDoCliente,
    direcao: "enviada",
    texto: respostaFinal,
    loja_id: lojaEscolhida?.id ?? null,
    message_id: messageId,
  });
}

/**
 * Eco de uma mensagem "enviada" pela conta do shopping — chega tanto quando é o PRÓPRIO bot (a
 * Meta ecoa de volta a mensagem que `enviarMensagemDirect` acabou de mandar) quanto quando é um
 * HUMANO respondendo direto pelo app do Instagram, por fora do bot. Só dá pra diferenciar pelo
 * `mid`: se bate com um que a gente mesma registrou ao mandar, é o bot (só confirmação, nada a
 * fazer); se não bate com nenhum, foi um humano — registra a mensagem (pra aparecer na aba
 * Atendimentos) e PAUSA o bot nessa conversa específica, pra ele não entrar no meio de um
 * atendimento que já está sendo feito na mão (pedido em 08/09/2026).
 *
 * Nos campos do evento, um eco vem com sender/recipient invertidos em relação a uma mensagem
 * normal: quem "manda" é a própria conta do shopping, e quem recebe é o cliente.
 */
async function tratarEcoDeMensagemEnviada(
  admin: ReturnType<typeof criarClienteAdmin>,
  evento: any,
  mensagem: any
) {
  const idDaMensagem: string | undefined = mensagem?.mid;
  const idDoCliente: string | undefined = evento?.recipient?.id;
  const idDaContaQueEnviou: string | undefined = evento?.sender?.id;
  const textoDaMensagem: string | undefined = mensagem?.text;

  if (!idDaMensagem || !idDoCliente || !idDaContaQueEnviou) {
    console.warn(
      `Eco descartado por falta de campo (mid=${idDaMensagem}, recipient=${idDoCliente}, sender=${idDaContaQueEnviou}) — ver payload bruto logado acima.`
    );
    return;
  }

  const { error: erroAoRegistrar } = await admin
    .from("shoppinghub_processed_messages")
    .insert({ message_id: idDaMensagem });

  if (erroAoRegistrar) {
    if ((erroAoRegistrar as any).code === "23505") return; // eco já processado antes
    throw erroAoRegistrar;
  }

  // Risco residual aceito: se o eco chegar rápido demais, ainda ANTES da nossa própria gravação
  // da mensagem "enviada" (linha logo depois de enviarMensagemDirect) terminar, esse SELECT não
  // encontra nada e a conversa é pausada por engano, achando que foi um humano. Não tem perda de
  // dado nem resposta errada — só teria que clicar em "Retomar bot" uma vez. Não vale complicar o
  // código com retry/lock pra uma corrida rara com recuperação de um clique.
  const { data: jaEnviadaPeloBot } = await admin
    .from("shoppinghub_mensagens")
    .select("id")
    .eq("message_id", idDaMensagem)
    .maybeSingle();

  if (jaEnviadaPeloBot) {
    console.log(`Eco de mensagem já enviada pelo próprio bot (mid=${idDaMensagem}) — ignorado.`);
    return;
  }

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("instagram_user_id", idDaContaQueEnviou)
    .eq("active", true)
    .maybeSingle();

  if (!conta) {
    console.warn(
      `Eco de conta não encontrada/inativa (instagram_user_id=${idDaContaQueEnviou}) — verifique se sender/recipient não estão invertidos nesse payload.`
    );
    return;
  }

  console.log(
    `Mensagem enviada manualmente pelo Instagram (fora do bot) pra ${idDoCliente} — pausando o bot nessa conversa.`
  );

  await admin.from("shoppinghub_mensagens").insert({
    conta_id: conta.id,
    instagram_scoped_id: idDoCliente,
    direcao: "enviada",
    texto: textoDaMensagem ?? "[mensagem sem texto — áudio, imagem etc.]",
    message_id: idDaMensagem,
  });

  await admin
    .from("shoppinghub_conversas_pausadas")
    .upsert(
      { conta_id: conta.id, instagram_scoped_id: idDoCliente },
      { onConflict: "conta_id,instagram_scoped_id" }
    );
}

/**
 * Caso (b) do webhook — ver comentário acima de onde essa função é chamada. Resolve o @usuário de
 * quem marcou (só a Meta manda o IGSID no webhook direto, por isso o `buscarPerfilDoCliente` fica
 * aqui e não em `processarMencaoRecebida`) e delega o resto do fluxo (loja autorizada, limite
 * diário, download da mídia, faixa de crédito) pra função compartilhada com a ponte do SendPulse —
 * ver `src/lib/mencoes.ts`.
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

  const perfil = await buscarPerfilDoClienteComCache(admin, conta.access_token, idDoCliente);
  const username = perfil.username?.toLowerCase();

  if (!username) {
    console.warn(
      `Menção de Story recebida sem @usuário resolvido (IGSID=${idDoCliente}) — descartada.`
    );
    return;
  }

  await processarMencaoRecebida(admin, conta, idDoCliente, username, urlDoStory);
}
