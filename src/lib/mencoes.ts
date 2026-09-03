import type { SupabaseClient } from "@supabase/supabase-js";

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
