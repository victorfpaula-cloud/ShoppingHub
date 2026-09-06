import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { baixarMidiaDoStory } from "./metaMessaging";
import { adicionarFaixaDeCredito, ehImagem } from "./creditoNaImagem";
import { comprimirVideo } from "./comprimirVideo";

// Bucket público do Supabase Storage onde ficam guardadas as mídias baixadas de menções de Story
// — precisa ser público porque a API de publicação de Stories da Meta exige uma `image_url`/
// `video_url` acessível publicamente (não aceita link autenticado nem upload direto de arquivo).
export const BUCKET_MENCOES = "shoppinghub-mencoes";

/**
 * Meia-noite de "hoje" no horário de Brasília (UTC-3, sem horário de verão hoje em dia — fixo o
 * ano todo), devolvida como instante UTC. Usada pra resetar a contagem diária de menções de cada
 * loja: uma menção conta pro dia se `recebido_em >= inicioDoDiaBrasilia()`.
 */
export function inicioDoDiaBrasiliaISO(agora: Date = new Date()): string {
  const OFFSET_BRASILIA_HORAS = 3;
  const agoraEmBrasilia = new Date(agora.getTime() - OFFSET_BRASILIA_HORAS * 60 * 60 * 1000);

  const meiaNoiteEmBrasilia = Date.UTC(
    agoraEmBrasilia.getUTCFullYear(),
    agoraEmBrasilia.getUTCMonth(),
    agoraEmBrasilia.getUTCDate(),
    0,
    0,
    0
  );

  return new Date(meiaNoiteEmBrasilia + OFFSET_BRASILIA_HORAS * 60 * 60 * 1000).toISOString();
}

function extensaoPorContentType(contentType: string): string {
  if (contentType.includes("video")) return "mp4";
  if (contentType.includes("png")) return "png";
  return "jpg";
}

export function tipoDeMidiaPorContentType(contentType: string): "IMAGE" | "VIDEO" {
  return contentType.includes("video") ? "VIDEO" : "IMAGE";
}

/**
 * Sobe a mídia baixada de uma menção de Story pro bucket público, e devolve o caminho salvo (pra
 * guardar em `shoppinghub_mencoes.storage_path`) junto com a URL pública (pra publicar a Story
 * depois, no cron).
 */
export async function subirMidiaDeMencao(
  admin: SupabaseClient,
  mencaoId: string,
  bytes: Uint8Array,
  contentType: string
): Promise<{ storagePath: string; urlPublica: string }> {
  const storagePath = `${mencaoId}.${extensaoPorContentType(contentType)}`;

  const { error } = await admin.storage.from(BUCKET_MENCOES).upload(storagePath, bytes, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Falha ao subir mídia da menção pro Storage: ${error.message}`);
  }

  const { data } = admin.storage.from(BUCKET_MENCOES).getPublicUrl(storagePath);

  return { storagePath, urlPublica: data.publicUrl };
}

// ~3x o tamanho exibido na Fila de Menções (ver FilaDeMencoesPage), pra ficar nítido em telas
// retina sem pesar — qualidade 60 numa imagem 160x160 fica na casa de poucos KB.
const LARGURA_THUMBNAIL = 160;
const QUALIDADE_THUMBNAIL = 60;

/**
 * Gera uma miniatura pequena e comprimida a partir da mídia recém-publicada, ANTES dela ser
 * apagada do Storage (ver cron de publicação) — sem isso, a Fila de Menções não teria nenhuma
 * imagem pra mostrar no resumo de "hoje", já que o arquivo original não fica guardado (pedido em
 * 05/09/2026, pra não acumular espaço no Storage). Só faz sentido pra imagem: vídeo já é mostrado
 * com um ícone fixo em vez de miniatura (mesma lógica de não baixar/tocar vídeo na Fila), então
 * nem tenta gerar. Nunca lança erro — se falhar, a menção fica sem miniatura (mostra o ícone
 * genérico), mas a publicação em si (que já aconteceu de verdade no Instagram) não é afetada.
 */
export async function gerarThumbnailDeMencao(
  admin: SupabaseClient,
  mencaoId: string,
  storagePath: string
): Promise<string | null> {
  if (storagePath.endsWith(".mp4")) return null;

  try {
    const { data: original, error: erroAoBaixar } = await admin.storage
      .from(BUCKET_MENCOES)
      .download(storagePath);

    if (erroAoBaixar || !original) {
      throw erroAoBaixar ?? new Error("Download da mídia original veio vazio.");
    }

    const bytesOriginais = Buffer.from(await original.arrayBuffer());
    const bytesDaThumbnail = await sharp(bytesOriginais)
      .resize(LARGURA_THUMBNAIL, LARGURA_THUMBNAIL, { fit: "cover" })
      .jpeg({ quality: QUALIDADE_THUMBNAIL })
      .toBuffer();

    const thumbnailPath = `${mencaoId}-thumb.jpg`;
    const { error: erroAoSubir } = await admin.storage
      .from(BUCKET_MENCOES)
      .upload(thumbnailPath, bytesDaThumbnail, { contentType: "image/jpeg", upsert: true });

    if (erroAoSubir) throw erroAoSubir;

    return thumbnailPath;
  } catch (erro) {
    console.error(`Falha ao gerar thumbnail da menção ${mencaoId}:`, erro);
    return null;
  }
}

/**
 * Núcleo do processamento de uma menção de Story — loja autorizada, limite diário, download da
 * mídia, faixa de crédito e upload pro Storage — compartilhado pelos DOIS jeitos de uma menção
 * chegar até a gente:
 *  1. Direto pelo webhook da Meta (`src/app/api/webhook/instagram/route.ts`), quando o remetente
 *     tem algum papel no App (admin/dev/tester) — hoje só a conta pessoal do dono.
 *  2. Pela ponte com o SendPulse (`src/app/api/bridge/sendpulse/mencao/route.ts`), que já tem
 *     acesso aprovado pela Meta e recebe a menção de QUALQUER lojista — usada enquanto o App
 *     Review do ShoppingHub não sai.
 *
 * Em ambos os casos a PUBLICAÇÃO em si (feita depois, pelo cron) usa sempre o token de acesso
 * próprio do ShoppingHub — isso nunca foi bloqueado pelo Standard Access da Meta, só o RECEBIMENTO
 * da menção de contas sem papel no App é que era o problema.
 */
export async function processarMencaoRecebida(
  admin: SupabaseClient,
  conta: { id: string; shopping_id: string },
  instagramScopedId: string,
  usernameRecebido: string,
  urlDaMidia: string
): Promise<void> {
  const username = usernameRecebido.toLowerCase();

  const { data: lojasDoShopping } = await admin
    .from("shoppinghub_lojas")
    .select("id, limite_diario_mencoes, ativo, instagram_username, instagram_username_2")
    .eq("shopping_id", conta.shopping_id);

  const loja = (lojasDoShopping ?? []).find(
    (l) =>
      l.instagram_username?.toLowerCase() === username ||
      l.instagram_username_2?.toLowerCase() === username
  );

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
      instagram_scoped_id: instagramScopedId,
      status: "descartado_limite",
    });
    return;
  }

  const { data: mencaoCriada, error: erroAoCriarMencao } = await admin
    .from("shoppinghub_mencoes")
    .insert({
      conta_id: conta.id,
      loja_id: loja.id,
      instagram_scoped_id: instagramScopedId,
      instagram_username: username,
      status: "pendente",
    })
    .select("id")
    .single();

  if (erroAoCriarMencao || !mencaoCriada) {
    console.error("Falha ao registrar menção de Story na fila:", erroAoCriarMencao);
    return;
  }

  const midia = await baixarMidiaDoStory(urlDaMidia);

  if (!midia) {
    await admin.from("shoppinghub_mencoes").update({ status: "erro" }).eq("id", mencaoCriada.id);
    return;
  }

  try {
    // Imagem: dá crédito à loja sobrepondo um selo com o @usuário dela, antes de guardar. Vídeo:
    // corta pros primeiros 10s, recomprime num formato garantidamente compatível — evita vídeos
    // longos/grandes travando pra sempre no processamento da Meta — e queima o mesmo selo (a
    // marcação nativa da Meta em vídeo fica invisível até tocar na tela, ver comprimirVideo.ts).
    const midiaFinal = ehImagem(midia.contentType)
      ? await adicionarFaixaDeCredito(midia.bytes, username)
      : await comprimirVideo(midia.bytes, username);

    const { storagePath } = await subirMidiaDeMencao(
      admin,
      mencaoCriada.id,
      midiaFinal.bytes,
      midiaFinal.contentType
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
