// Constantes e funções puras compartilhadas pelas publicações agendadas (Feed/Stories) — mesmo
// motivo do mencoesConstantes.ts: ficar sem dependência pesada, pra rotas/páginas leves (criar,
// listar, excluir um agendamento) não carregarem nada à toa no pacote da function.

// Bucket público — mesmo motivo do shoppinghub-mencoes: a Content Publishing API da Meta exige
// uma image_url/video_url acessível publicamente (não aceita link autenticado nem upload direto).
export const BUCKET_PUBLICACOES = "shoppinghub-publicacoes";

// Limite da própria Meta pra quantos itens cabem num carrossel de Feed.
export const MAX_ITENS_CARROSSEL = 10;

const OFFSET_BRASILIA_HORAS = 3;

/**
 * Converte uma data ("YYYY-MM-DD") e um horário ("HH:MM") escolhidos no painel — sempre no
 * horário de Brasília (UTC-3, sem horário de verão hoje em dia) — no instante UTC
 * correspondente, pra guardar em `proxima_publicacao_em`/`data_fim_instante`.
 */
export function dataHoraBrasiliaParaISO(data: string, horario: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [hora, minuto] = horario.split(":").map(Number);

  const instanteUTC = Date.UTC(ano, mes - 1, dia, hora + OFFSET_BRASILIA_HORAS, minuto, 0);

  return new Date(instanteUTC).toISOString();
}
