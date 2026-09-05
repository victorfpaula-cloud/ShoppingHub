import crypto from "node:crypto";
import { POSICAO_Y_CREDITO } from "./creditoNaImagem";

const GRAPH_API_VERSION = "v21.0";

/**
 * Confere a assinatura X-Hub-Signature-256 que a Meta manda em todo webhook, calculada em cima
 * do corpo BRUTO (raw) da requisição usando o App Secret como chave HMAC-SHA256. Isso garante
 * que a chamada realmente veio da Meta, e não de qualquer um que descubra a URL do webhook.
 * Comparação em tempo constante (timingSafeEqual) pra não vazar informação por tempo de resposta.
 */
export function assinaturaValida(corpoBruto: string, assinaturaRecebida: string | null): boolean {
  // Descoberto na prática (04/09/2026): esse App tem DOIS produtos de webhook coexistindo —
  // "Messenger" (assina com a chave secreta do App principal, Config. do app > Básico — mesma
  // usada no OAuth) e "Casos de uso > API do Instagram" (assina com a chave secreta do sub-app
  // "ShoppingHub-IG"). Sem saber qual produto vai efetivamente entregar cada evento em produção,
  // confere contra as duas chaves — basta uma bater.
  if (!assinaturaRecebida) {
    console.warn("assinaturaValida: requisição sem header x-hub-signature-256.");
    return false;
  }

  const secrets = [process.env.META_APP_SECRET, process.env.META_INSTAGRAM_APP_SECRET].filter(
    (s): s is string => Boolean(s)
  );

  if (secrets.length === 0) {
    console.warn("assinaturaValida: nenhum App Secret configurado.");
    return false;
  }

  const bufferRecebido = Buffer.from(assinaturaRecebida, "utf8");

  const valida = secrets.some((appSecret) => {
    const esperada =
      "sha256=" + crypto.createHmac("sha256", appSecret).update(corpoBruto, "utf8").digest("hex");
    const bufferEsperado = Buffer.from(esperada, "utf8");
    return (
      bufferEsperado.length === bufferRecebido.length &&
      crypto.timingSafeEqual(bufferEsperado, bufferRecebido)
    );
  });

  if (!valida) {
    console.warn("assinaturaValida: assinatura não bateu — requisição recusada.");
  }

  return valida;
}

/**
 * Envia uma mensagem de texto pro Direct de um cliente, usando o token de acesso da Página
 * conectada. O endpoint oficial é `/me/messages` (a Meta resolve pra Página certa a partir do
 * próprio token) — não `/{page-id}/messages`, confirmado na documentação da Instagram Messaging
 * API.
 */
export async function enviarMensagemDirect(
  tokenDaConta: string,
  igsidDoCliente: string,
  texto: string
): Promise<void> {
  const resposta = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(
      tokenDaConta
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: igsidDoCliente },
        message: { text: texto },
      }),
      cache: "no-store",
    }
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao enviar mensagem pro Direct (status ${resposta.status}): ${corpoErro}`
    );
  }
}

/**
 * Busca nome e @usuário do Instagram de quem mandou a mensagem — guardado junto com a mensagem
 * recebida (ver shoppinghub_mensagens) pra aparecer no relatório de atendimentos. Se a chamada
 * falhar por qualquer motivo, devolve nome genérico em vez de derrubar o processamento da
 * mensagem por causa disso.
 */
export async function buscarPerfilDoCliente(
  tokenDaConta: string,
  instagramScopedId: string
): Promise<{ nome: string; username: string | null }> {
  try {
    const resposta = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instagramScopedId}?fields=name,username&access_token=${encodeURIComponent(
        tokenDaConta
      )}`,
      { cache: "no-store" }
    );

    if (!resposta.ok) return { nome: "Cliente", username: null };

    const dados = await resposta.json();
    return {
      nome: typeof dados?.name === "string" && dados.name ? dados.name : "Cliente",
      username: typeof dados?.username === "string" ? dados.username : null,
    };
  } catch (erro) {
    console.error("Falha ao buscar perfil do cliente no Instagram:", erro);
    return { nome: "Cliente", username: null };
  }
}

/**
 * Baixa a mídia de uma menção de Story a partir do `payload.url` que a Meta manda no webhook —
 * esse link é temporário, então precisa ser baixado e guardado em algum storage nosso (Supabase
 * Storage) assim que o evento chega, antes que expire.
 */
export async function baixarMidiaDoStory(
  url: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const resposta = await fetch(url, { cache: "no-store" });
    if (!resposta.ok) return null;

    const contentType = resposta.headers.get("content-type") ?? "application/octet-stream";
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    return { bytes, contentType };
  } catch (erro) {
    console.error("Falha ao baixar mídia de menção de Story:", erro);
    return null;
  }
}

/**
 * Depois de criar o container de mídia, a Meta baixa a imagem/vídeo da nossa URL pública de forma
 * assíncrona — publicar antes disso terminar dá erro "Media ID is not available" (aconteceu na
 * prática em 04/09/2026). Fica checando o `status_code` do container até virar `FINISHED` (ou
 * `ERROR`) antes de seguir pra publicação, do jeito que a documentação da Content Publishing API
 * recomenda.
 */
async function aguardarContainerPronto(
  containerId: string,
  tokenDaConta: string,
  tipoDeMidia: "IMAGE" | "VIDEO"
): Promise<void> {
  // Vídeo demora bem mais que imagem pra Meta processar (transcodificação) — um orçamento curto
  // demais faz o container ainda estar em progresso quando desistimos, e a menção erra à toa
  // (aconteceu na prática em 05/09/2026, com várias menções de vídeo na fila). O cron que chama
  // isso publica várias menções na mesma execução (maxDuration de 60s no total) e já para de
  // pegar itens novos antes de chegar perto do limite (ver publicar-mencoes/route.ts), então dá
  // pra ser mais generoso aqui sem risco de estourar o tempo total da function.
  const TENTATIVAS_MAXIMAS = tipoDeMidia === "VIDEO" ? 20 : 6;
  const INTERVALO_MS = 2000;

  // Guarda a última resposta da Meta (bruta) pra logar em caso de erro/timeout — sem isso, um
  // container que nunca sai de "IN_PROGRESS" só dá uma mensagem genérica, sem pista nenhuma do
  // motivo real (formato/duração/tamanho do vídeo, por exemplo).
  let ultimaRespostaBruta = "(nenhuma resposta recebida)";

  for (let tentativa = 0; tentativa < TENTATIVAS_MAXIMAS; tentativa++) {
    const resposta = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(
        tokenDaConta
      )}`,
      { cache: "no-store" }
    );

    ultimaRespostaBruta = await resposta.text().catch(() => ultimaRespostaBruta);

    if (resposta.ok) {
      let dados: any = null;
      try {
        dados = JSON.parse(ultimaRespostaBruta);
      } catch {
        // segue com dados null — o texto bruto já fica registrado em ultimaRespostaBruta
      }
      const statusCode = dados?.status_code as string | undefined;

      if (statusCode === "FINISHED") return;

      if (statusCode === "ERROR") {
        throw new Error(
          `A Meta reportou erro ao processar a mídia da Story (container em ERROR): ${ultimaRespostaBruta}`
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, INTERVALO_MS));
  }

  throw new Error(
    `A mídia da Story não ficou pronta a tempo (container nunca chegou a FINISHED). Última resposta da Meta: ${ultimaRespostaBruta}`
  );
}

/**
 * Publica uma Story na conta do Instagram do shopping, em duas etapas conforme a documentação
 * oficial da Meta (Content Publishing API): cria um container de mídia com
 * `media_type=STORIES` + `image_url`/`video_url` (precisa ser uma URL pública, por isso a mídia
 * baixada do story_mention é reenviada primeiro pro Supabase Storage), depois publica o container
 * já criado. Devolve o ID do story publicado — é esse ID que mais tarde bate com
 * `reply_to.story.id` na hora de rotear a resposta do cliente pra loja certa.
 *
 * `usernameParaMarcar`, quando informado, usa o campo `user_tags` (suportado pra Stories de
 * imagem e vídeo desde 09/07/2025) pra criar uma marcação clicável de verdade da loja que gerou a
 * menção — {x, y} é só a posição da marcação na mídia (0.0–1.0, a partir do canto superior
 * esquerdo). Usa a MESMA posição vertical da faixa de crédito (`POSICAO_Y_CREDITO`, ver
 * creditoNaImagem.ts) — fora dessa faixa segura, perto do rodapé, a barra de "responder" que o
 * próprio Instagram desenha por cima da Story intercepta o toque e a figurinha não fica clicável
 * (confirmado em teste real em 04/09/2026).
 */
export async function publicarStoryNoInstagram(
  tokenDaConta: string,
  instagramUserId: string,
  urlPublicaDaMidia: string,
  tipoDeMidia: "IMAGE" | "VIDEO",
  usernameParaMarcar?: string | null
): Promise<string> {
  const camposDeMidia =
    tipoDeMidia === "VIDEO" ? { video_url: urlPublicaDaMidia } : { image_url: urlPublicaDaMidia };

  // `user_tags` precisa ser um array de verdade aqui, não uma string — o corpo inteiro da
  // requisição já passa por JSON.stringify mais abaixo. Encodar como string funciona só em POST
  // form-urlencoded (formato usado nos exemplos da documentação da Meta), não em JSON puro; um
  // teste real (04/09/2026) mostrou a Story publicando normal mas sem nenhuma marcação, porque a
  // Meta recebia um texto no lugar de uma lista e ignorava a marcação sem dar erro.
  const camposDeMarcacao = usernameParaMarcar
    ? { user_tags: [{ username: usernameParaMarcar, x: 0.5, y: POSICAO_Y_CREDITO }] }
    : {};

  // Log de diagnóstico (adicionado em 05/09/2026, depois de uma Story ir pro ar sem a marcação
  // sem nenhuma pista do motivo nos logs): mostra ANTES de mandar pra Meta se a gente sequer
  // tentou marcar alguém, e depois mostra a resposta bruta da criação do container — a Meta pode
  // aceitar a requisição (200 OK) e mesmo assim ignorar/descartar um user_tags inválido sem
  // sinalizar erro nenhum, então só dá pra saber comparando o que foi enviado com o que ela
  // devolveu.
  console.log(
    usernameParaMarcar
      ? `publicarStoryNoInstagram: tentando marcar @${usernameParaMarcar}`
      : "publicarStoryNoInstagram: sem username pra marcar (usernameParaMarcar vazio)"
  );

  const respostaContainer = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${instagramUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "STORIES",
        ...camposDeMidia,
        ...camposDeMarcacao,
        access_token: tokenDaConta,
      }),
      cache: "no-store",
    }
  );

  const corpoContainerBruto = await respostaContainer.text().catch(() => "");
  console.log(`publicarStoryNoInstagram: resposta da criação do container: ${corpoContainerBruto}`);

  if (!respostaContainer.ok) {
    throw new Error(
      `Falha ao criar container de Story (status ${respostaContainer.status}): ${corpoContainerBruto}`
    );
  }

  let dadosContainer: any = null;
  try {
    dadosContainer = JSON.parse(corpoContainerBruto);
  } catch {
    // segue com dadosContainer null — o texto bruto já ficou logado acima
  }
  const containerId = dadosContainer?.id as string | undefined;

  if (!containerId) {
    throw new Error("A Meta não devolveu um ID de container ao criar a Story.");
  }

  await aguardarContainerPronto(containerId, tokenDaConta, tipoDeMidia);

  const respostaPublicacao = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${instagramUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: tokenDaConta,
      }),
      cache: "no-store",
    }
  );

  if (!respostaPublicacao.ok) {
    const corpoErro = await respostaPublicacao.text().catch(() => "");
    throw new Error(
      `Falha ao publicar Story (status ${respostaPublicacao.status}): ${corpoErro}`
    );
  }

  const dadosPublicacao = await respostaPublicacao.json();
  const storyMediaId = dadosPublicacao?.id as string | undefined;

  if (!storyMediaId) {
    throw new Error("A Meta não devolveu um ID de mídia ao publicar a Story.");
  }

  return storyMediaId;
}
