import { gerarRespostaComGemini } from "./gemini";

export type LojaParaTriagem = {
  id: string;
  nome: string;
  eh_geral: boolean;
};

export type LojaComConhecimento = LojaParaTriagem & {
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  horario_atendimento: string | null;
  responsavel: string | null;
  base_conhecimento_texto: string;
};

/**
 * Chamada 1 (roteador): decide qual loja do shopping deve responder a mensagem do cliente,
 * mostrando pro Gemini só os nomes das lojas (nunca a base de conhecimento de nenhuma delas) —
 * pede de volta só o número da loja escolhida, pra não depender de bater string com o nome exato.
 * Se a chamada ao Gemini falhar ou vier algo que não dá pra interpretar, cai na loja "Geral".
 *
 * Só é usada quando a mensagem NÃO é resposta a um story reposted — nesse caso o roteamento já é
 * determinístico via `shoppinghub_mencoes.story_media_id`, sem precisar de IA pra decidir (ver
 * src/app/api/webhook/instagram/route.ts).
 */
export async function decidirLoja<T extends LojaParaTriagem>(
  lojas: T[],
  historicoRecente: string,
  mensagemDoCliente: string
): Promise<T | null> {
  if (lojas.length === 0) return null;

  const lojaGeral = lojas.find((l) => l.eh_geral) ?? lojas[0];

  const listaNumerada = lojas.map((loja, indice) => `${indice + 1}. ${loja.nome}`).join("\n");

  const promptDoSistema = `Você é a triagem do atendimento virtual de um shopping center. Sua única tarefa é ler a mensagem de um cliente (levando em conta o histórico recente da conversa, se houver) e decidir qual loja abaixo deve responder. Responda SOMENTE com o número da loja escolhida, sem nenhum texto além disso.

Lojas disponíveis:
${listaNumerada}

Se a mensagem não bater claramente com nenhuma loja específica (ex: pergunta sobre horário de funcionamento do shopping, estacionamento, localização geral), escolha a loja "Geral".
${historicoRecente.trim() ? `\nHistórico recente dessa conversa (mais antiga primeiro):\n${historicoRecente}\n` : ""}`;

  const resposta = await gerarRespostaComGemini(promptDoSistema, mensagemDoCliente);
  if (!resposta) return lojaGeral;

  const numeroEncontrado = resposta.match(/\d+/)?.[0];
  const indice = numeroEncontrado ? parseInt(numeroEncontrado, 10) - 1 : -1;

  return lojas[indice] ?? lojaGeral;
}

/**
 * Chamada 2 (especialista): gera a resposta de verdade, usando só a base de conhecimento e os
 * dados de contato da loja já escolhida (pela triagem, ou de forma determinística via reply a um
 * story) — nunca vê informação de outra loja.
 */
export async function responderComoLoja(
  loja: LojaComConhecimento,
  nomeDoShopping: string,
  guardrailsDoShopping: string,
  historicoRecente: string,
  mensagemDoCliente: string
): Promise<string | null> {
  const contato = [
    loja.endereco ? `Endereço: ${loja.endereco}` : null,
    loja.telefone ? `Telefone: ${loja.telefone}` : null,
    loja.email ? `E-mail: ${loja.email}` : null,
    loja.horario_atendimento ? `Horário de atendimento: ${loja.horario_atendimento}` : null,
    loja.responsavel ? `Responsável: ${loja.responsavel}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const promptDoSistema = `Você é o atendimento virtual da loja "${loja.nome}" do ${nomeDoShopping}, respondendo clientes pelo Instagram Direct. Responda de forma direta, cordial e objetiva, usando só as informações abaixo. Se a pergunta não puder ser respondida com elas, diga isso com honestidade e, se houver contato da loja, indique pra pessoa procurar a loja diretamente. Se houver histórico recente da conversa, use ele pra entender o contexto (ex: uma pergunta de seguimento tipo "tem no tamanho M?"), mas responda só a mensagem mais recente do cliente.
${guardrailsDoShopping.trim() ? `\nRegras que você DEVE seguir sempre, sem exceção:\n${guardrailsDoShopping}\n` : ""}
Base de conhecimento da loja:
${loja.base_conhecimento_texto || "(nenhuma informação cadastrada ainda)"}
${contato ? `\nContato da loja:\n${contato}` : ""}
${historicoRecente.trim() ? `\nHistórico recente dessa conversa (mais antiga primeiro):\n${historicoRecente}\n` : ""}`;

  return gerarRespostaComGemini(promptDoSistema, mensagemDoCliente);
}
