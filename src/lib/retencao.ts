import type { SupabaseClient } from "@supabase/supabase-js";

const RETENCAO_PADRAO_DIAS = 60;

/**
 * Quantos dias o histórico de mensagens (shoppinghub_mensagens) fica guardado antes de ser
 * apagado automaticamente — configurável via variável de ambiente pra ajustar sem precisar mexer
 * em código. Sem a variável, usa 60 dias por padrão.
 */
export function diasDeRetencaoDeMensagens(): number {
  const valor = process.env.RETENCAO_MENSAGENS_DIAS;
  const numero = valor ? parseInt(valor, 10) : NaN;
  return Number.isFinite(numero) && numero > 0 ? numero : RETENCAO_PADRAO_DIAS;
}

/**
 * Apaga mensagens mais antigas que o prazo de retenção — chamado a partir do cron que já roda
 * duas vezes por dia (não criamos um cron novo só pra isso). Devolve quantas linhas apagou, só
 * pra aparecer no log/retorno do endpoint.
 */
export async function limparMensagensAntigas(admin: SupabaseClient): Promise<number> {
  const dias = diasDeRetencaoDeMensagens();
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("shoppinghub_mensagens")
    .delete()
    .lt("created_at", limite)
    .select("id");

  if (error) {
    console.error("Falha ao limpar mensagens antigas:", error);
    return 0;
  }

  return data?.length ?? 0;
}
