import type { SupabaseClient } from "@supabase/supabase-js";
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

// Horários de publicação automática (cron, ver vercel.json): meio-dia e 18h, horário de Brasília.
const HORAS_DE_PUBLICACAO_BRASILIA = [12, 18];

/**
 * Todos os horários de publicação (meio-dia e 18h) de ontem, hoje e amanhã, como instantes UTC —
 * base pra achar "o último que já passou" (início do ciclo atual) ou "o próximo" (usada pelas duas
 * funções abaixo).
 */
function horariosDePublicacaoBrasilia(agora: Date): number[] {
  const OFFSET_BRASILIA_HORAS = 3;
  const agoraEmBrasilia = new Date(agora.getTime() - OFFSET_BRASILIA_HORAS * 60 * 60 * 1000);

  const candidatos: number[] = [];
  for (const diasDeOffset of [-1, 0, 1]) {
    for (const hora of HORAS_DE_PUBLICACAO_BRASILIA) {
      const instanteEmBrasilia = Date.UTC(
        agoraEmBrasilia.getUTCFullYear(),
        agoraEmBrasilia.getUTCMonth(),
        agoraEmBrasilia.getUTCDate() + diasDeOffset,
        hora,
        0,
        0
      );
      candidatos.push(instanteEmBrasilia + OFFSET_BRASILIA_HORAS * 60 * 60 * 1000);
    }
  }

  return candidatos.sort((a, b) => a - b);
}

/**
 * Início do CICLO DE PUBLICAÇÃO atual (o último horário de cron que já passou) — usado em vez de
 * "meia-noite" pra contar menções "aguardando publicar". Diferença importante: uma menção recebida
 * às 22h30 (depois do cron das 18h) continua contando a noite inteira, até publicar de verdade no
 * cron do meio-dia seguinte — com meia-noite como corte, ela "sumia" da contagem ao virar o dia,
 * mesmo sem ter sido publicada ainda (bug relatado em 05/09/2026).
 */
export function inicioDoCicloDePublicacaoISO(agora: Date = new Date()): string {
  const horarios = horariosDePublicacaoBrasilia(agora);
  const jaPassaram = horarios.filter((h) => h <= agora.getTime());
  return new Date(jaPassaram[jaPassaram.length - 1]).toISOString();
}

/**
 * Próximo horário de publicação (o próximo cron que ainda vai rodar) — usado só pra deixar a
 * interface clara ("próxima publicação às HH:mm"), sem nenhum efeito na contagem em si.
 */
export function proximaPublicacaoISO(agora: Date = new Date()): string {
  const horarios = horariosDePublicacaoBrasilia(agora);
  const aindaVaoRodar = horarios.filter((h) => h > agora.getTime());
  return new Date(aindaVaoRodar[0]).toISOString();
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
    // Imagem: dá crédito à loja sobrepondo uma faixa com o @usuário dela no rodapé, antes de
    // guardar. Vídeo: corta pros primeiros 10s (se precisar), recomprime num formato
    // garantidamente compatível e queima a MESMA faixa de crédito — evita vídeos longos/grandes
    // travando pra sempre no processamento da Meta e garante que a loja apareça marcada, já que o
    // `user_tags` da API de Stories não desenha nenhuma marcação visível sozinho (ver
    // comprimirVideo.ts).
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
