import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { publicarStoryNoInstagram } from "@/lib/metaMessaging";
import { BUCKET_MENCOES, tipoDeMidiaPorContentType } from "@/lib/mencoes";
import { limparMensagensAntigas } from "@/lib/retencao";
import { exportarRelatoriosDevidos } from "@/lib/relatorios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chamado pela Vercel duas vezes por dia (ver vercel.json — 15h e 21h UTC = 12h e 18h em
// Brasília). Publica cada menção de Story pendente como Story da conta do shopping e grava o ID
// retornado, que depois serve pra rotear a resposta do cliente pra loja certa
// (src/app/api/webhook/instagram/route.ts, caso "reply_to.story.id").
//
// Protegido por CRON_SECRET — a Vercel manda esse valor automaticamente no header
// "Authorization: Bearer" das chamadas de cron; sem o valor certo, ninguém mais consegue disparar
// a publicação manualmente batendo na URL.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!cronSecret || autorizacao !== `Bearer ${cronSecret}`) {
    return new NextResponse("Não autorizado.", { status: 401 });
  }

  const admin = criarClienteAdmin();

  const { data: mencoesPendentes, error } = await admin
    .from("shoppinghub_mencoes")
    .select("id, conta_id, loja_id, storage_path, instagram_username")
    .eq("status", "pendente")
    .not("storage_path", "is", null)
    .order("recebido_em", { ascending: true });

  if (error) {
    console.error("Falha ao buscar menções pendentes:", error);
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  const resultado = { publicadas: 0, falhas: 0, total: mencoesPendentes?.length ?? 0 };

  for (const mencao of mencoesPendentes ?? []) {
    try {
      await publicarMencao(admin, mencao);
      resultado.publicadas += 1;
    } catch (erro) {
      console.error(`Falha ao publicar menção ${mencao.id}:`, erro);
      await admin.from("shoppinghub_mencoes").update({ status: "erro" }).eq("id", mencao.id);
      resultado.falhas += 1;
    }
  }

  // Aproveita esse mesmo cron (já roda duas vezes por dia) pra também limpar mensagens antigas do
  // histórico de atendimento e gerar a exportação mensal de relatórios — evita criar mais crons só
  // pra isso (o plano Hobby da Vercel só permite 2).
  const mensagensApagadas = await limparMensagensAntigas(admin);
  const exportacoesGeradas = await exportarRelatoriosDevidos(admin);

  return NextResponse.json({ ok: true, ...resultado, mensagensApagadas, exportacoesGeradas });
}

async function publicarMencao(
  admin: ReturnType<typeof criarClienteAdmin>,
  mencao: {
    id: string;
    conta_id: string;
    loja_id: string;
    storage_path: string | null;
    instagram_username: string | null;
  }
) {
  if (!mencao.storage_path) {
    throw new Error("Menção sem storage_path.");
  }

  const { data: conta, error: erroAoBuscarConta } = await admin
    .from("shoppinghub_contas")
    .select("instagram_user_id, access_token, active")
    .eq("id", mencao.conta_id)
    .maybeSingle();

  if (erroAoBuscarConta || !conta || !conta.active) {
    throw new Error("Conta do Instagram não encontrada ou pausada.");
  }

  const { data: urlPublica } = admin.storage.from(BUCKET_MENCOES).getPublicUrl(mencao.storage_path);

  const contentType = mencao.storage_path.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
  const tipoDeMidia = tipoDeMidiaPorContentType(contentType);

  const storyMediaId = await publicarStoryNoInstagram(
    conta.access_token,
    conta.instagram_user_id,
    urlPublica.publicUrl,
    tipoDeMidia,
    mencao.instagram_username
  );

  await admin
    .from("shoppinghub_mencoes")
    .update({
      status: "publicado",
      publicado_em: new Date().toISOString(),
      story_media_id: storyMediaId,
      storage_path: null,
    })
    .eq("id", mencao.id);

  // Já publicou de verdade (storyMediaId confirma que a Meta recebeu a mídia) — não tem motivo
  // pra continuar guardando o arquivo aqui. O registro em shoppinghub_mencoes (loja, horário,
  // status) já serve de log/auditoria sem precisar acumular mídia no Storage.
  const { error: erroAoApagar } = await admin.storage
    .from(BUCKET_MENCOES)
    .remove([mencao.storage_path]);

  if (erroAoApagar) {
    console.error(`Falha ao apagar mídia publicada (menção ${mencao.id}):`, erroAoApagar);
  }
}
