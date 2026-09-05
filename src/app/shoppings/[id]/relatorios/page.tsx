import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_RELATORIOS } from "@/lib/relatorios";
import { DiaDeMencoesAccordion } from "@/components/DiaDeMencoesAccordion";

export const dynamic = "force-dynamic";

const DIAS_NO_DETALHAMENTO = 30;

const ROTULO_DO_STATUS: Record<string, { texto: string; classe: string }> = {
  pendente: { texto: "Pendente", classe: "bg-warn/15 text-warn" },
  publicado: { texto: "Publicado", classe: "bg-ok/15 text-ok" },
  descartado_limite: {
    texto: "Limite diário",
    classe: "bg-white/8 text-neutral-400",
  },
  erro: { texto: "Erro", classe: "bg-danger/15 text-danger" },
};

function formatarDataLonga(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(iso));
}

function formatarDataCurta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function chaveDoDia(iso: string): string {
  // Chave estável (ano-mês-dia em Brasília) pra agrupar por dia sem depender de fuso do servidor.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

// Colunas mínimas pro resumo geral, ranking e agrupamento por dia — o detalhamento linha a linha
// de cada dia (usuário, horários, status individual) só é buscado sob demanda quando o dropdown
// daquele dia é aberto (ver DiaDeMencoesAccordion + api/shoppings/[id]/relatorios/dia), em vez de
// vir tudo de uma vez nessa carga inicial da página.
type MencaoResumida = {
  id: string;
  loja_id: string;
  status: string;
  recebido_em: string;
};

const PERIODOS_VALIDOS = [15, 30] as const;

export default async function RelatoriosDeMencoesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { periodo?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select("id, nome")
    .eq("shopping_id", params.id)
    .order("ordem", { ascending: true });

  const idsDasLojas = (lojas ?? []).map((l) => l.id);
  const nomePorLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]));

  const { data: todasAsMencoes } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("id, loja_id, status, recebido_em")
          .in("loja_id", idsDasLojas)
      : { data: [] as MencaoResumida[] };

  const mencoes = (todasAsMencoes ?? []) as MencaoResumida[];

  // ---- Resumo geral (todo o histórico) ----
  const totalPorStatus = { pendente: 0, publicado: 0, descartado_limite: 0, erro: 0 } as Record<
    string,
    number
  >;
  for (const m of mencoes) {
    totalPorStatus[m.status] = (totalPorStatus[m.status] ?? 0) + 1;
  }

  // ---- Ranking por loja (publicações confirmadas, todo o histórico) ----
  const publicadosPorLoja = new Map<string, number>();
  for (const m of mencoes) {
    if (m.status === "publicado") {
      publicadosPorLoja.set(m.loja_id, (publicadosPorLoja.get(m.loja_id) ?? 0) + 1);
    }
  }
  const ranking = Array.from(publicadosPorLoja.entries())
    .map(([lojaId, total]) => ({ lojaId, nome: nomePorLoja.get(lojaId) ?? "Loja removida", total }))
    .sort((a, b) => b.total - a.total);
  const maiorTotalDoRanking = ranking[0]?.total ?? 1;

  // ---- Resumo do período escolhido (pedido em 06/09/2026: um cabeçalho com o total publicado,
  // quantos lojistas tiveram alguma menção nesse período, e quanto cada um teve) ----
  const periodoPedido = Number(searchParams.periodo);
  const diasDoPeriodo = (PERIODOS_VALIDOS as readonly number[]).includes(periodoPedido)
    ? periodoPedido
    : 30;
  const limitePeriodo = new Date(Date.now() - diasDoPeriodo * 24 * 60 * 60 * 1000);
  const mencoesDoPeriodo = mencoes.filter((m) => new Date(m.recebido_em) >= limitePeriodo);

  const publicadosNoPeriodo = mencoesDoPeriodo.filter((m) => m.status === "publicado").length;

  const publicadosPorLojaNoPeriodo = new Map<string, number>();
  for (const m of mencoesDoPeriodo) {
    if (m.status !== "publicado") continue;
    publicadosPorLojaNoPeriodo.set(m.loja_id, (publicadosPorLojaNoPeriodo.get(m.loja_id) ?? 0) + 1);
  }
  // "Acionado" conta qualquer menção recebida no período (não só as publicadas) — mostra o
  // lojista que usou a marcação, mesmo que a publicação tenha caído em erro ou limite diário.
  const lojasAcionadasNoPeriodo = new Set(mencoesDoPeriodo.map((m) => m.loja_id)).size;

  const rankingDoPeriodo = Array.from(publicadosPorLojaNoPeriodo.entries())
    .map(([lojaId, total]) => ({ lojaId, nome: nomePorLoja.get(lojaId) ?? "Loja removida", total }))
    .sort((a, b) => b.total - a.total);
  const maiorTotalDoPeriodo = rankingDoPeriodo[0]?.total ?? 1;

  // ---- Detalhamento diário (últimos 30 dias) ----
  const limiteDetalhamento = new Date(Date.now() - DIAS_NO_DETALHAMENTO * 24 * 60 * 60 * 1000);
  const mencoesRecentes = mencoes
    .filter((m) => new Date(m.recebido_em) >= limiteDetalhamento)
    .sort((a, b) => new Date(a.recebido_em).getTime() - new Date(b.recebido_em).getTime());

  const porDia = new Map<string, { contagem: number; primeiroRecebidoEm: string }>();
  for (const m of mencoesRecentes) {
    const chave = chaveDoDia(m.recebido_em);
    const existente = porDia.get(chave);
    if (existente) {
      existente.contagem += 1;
    } else {
      porDia.set(chave, { contagem: 1, primeiroRecebidoEm: m.recebido_em });
    }
  }
  const diasOrdenados = Array.from(porDia.keys()).sort((a, b) => (a < b ? 1 : -1));

  // ---- Exportações automáticas (a cada 30 dias) ----
  const { data: exportacoes } = await admin
    .from("shoppinghub_exportacoes_mencoes")
    .select("id, periodo_inicio, periodo_fim, storage_path, total_mencoes, created_at")
    .eq("shopping_id", params.id)
    .order("periodo_fim", { ascending: false });

  const caminhos = (exportacoes ?? []).map((e) => e.storage_path);
  const { data: urlsAssinadas } =
    caminhos.length > 0
      ? await admin.storage.from(BUCKET_RELATORIOS).createSignedUrls(caminhos, 60 * 60)
      : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlPorCaminho = new Map(
    (urlsAssinadas ?? []).filter((u) => u.path).map((u) => [u.path as string, u.signedUrl])
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-tight">Relatórios de Menções</h1>
          <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
            Visão geral de todas as menções de Story recebidas e republicadas, por loja e por dia.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`/api/shoppings/${params.id}/relatorios/exportar?dias=15`}
            className="rounded-[9px] border border-white/14 px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/5"
          >
            Exportar últimos 15 dias
          </a>
          <a
            href={`/api/shoppings/${params.id}/relatorios/exportar?dias=30`}
            className="rounded-[9px] border border-white/14 px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/5"
          >
            Exportar últimos 30 dias
          </a>
        </div>
      </div>

      {/* Resumo do período escolhido */}
      <div className="mt-7 rounded-2xl border border-white/8 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13.5px] font-bold text-neutral-200">Resumo do período</h3>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 p-1">
            {PERIODOS_VALIDOS.map((dias) => (
              <a
                key={dias}
                href={`?periodo=${dias}`}
                className={`rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                  diasDoPeriodo === dias
                    ? "bg-accent text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {dias} dias
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/8 bg-ink-850 p-4">
            <p className="text-[11px] font-semibold text-neutral-400">Publicados no período</p>
            <p className="font-display mt-1.5 text-2xl font-bold text-ok">{publicadosNoPeriodo}</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-ink-850 p-4">
            <p className="text-[11px] font-semibold text-neutral-400">Lojistas acionados</p>
            <p className="font-display mt-1.5 text-2xl font-bold">{lojasAcionadasNoPeriodo}</p>
          </div>
        </div>

        <h4 className="mt-5 text-[12px] font-bold text-neutral-400">Publicações por loja no período</h4>
        <div className="mt-3 flex flex-col gap-2.5">
          {rankingDoPeriodo.map((linha) => (
            <div key={linha.lojaId} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-[13px] font-medium text-neutral-300">{linha.nome}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-850">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(4, (linha.total / maiorTotalDoPeriodo) * 100)}%` }}
                />
              </div>
              <span className="w-36 shrink-0 whitespace-nowrap text-right text-[12px] font-semibold text-neutral-400">
                {linha.total} stor{linha.total === 1 ? "y" : "ies"} no período
              </span>
            </div>
          ))}

          {rankingDoPeriodo.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/12 px-4 py-5 text-center text-sm text-neutral-400">
              Nenhuma Story publicada nos últimos {diasDoPeriodo} dias.
            </p>
          )}
        </div>
      </div>

      {/* Resumo geral */}
      <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(ROTULO_DO_STATUS) as Array<keyof typeof ROTULO_DO_STATUS>).map((status) => (
          <div key={status} className="rounded-2xl border border-white/8 bg-ink-900 p-4">
            <p className="text-[11px] font-semibold text-neutral-400">{ROTULO_DO_STATUS[status].texto}</p>
            <p className="font-display mt-2 text-2xl font-bold">{totalPorStatus[status] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Ranking por loja */}
      <div className="mt-9">
        <h3 className="text-[13.5px] font-bold text-neutral-200">Publicações por loja (histórico completo)</h3>
        <div className="mt-3.5 flex flex-col gap-2.5">
          {ranking.map((linha) => (
            <div key={linha.lojaId} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-[13px] font-medium text-neutral-300">{linha.nome}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-850">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(4, (linha.total / maiorTotalDoRanking) * 100)}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-[13px] font-bold text-neutral-200">
                {linha.total}
              </span>
            </div>
          ))}

          {ranking.length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
              Nenhuma Story publicada ainda.
            </p>
          )}
        </div>
      </div>

      {/* Detalhamento diário */}
      <div className="mt-9">
        <h3 className="text-[13.5px] font-bold text-neutral-200">
          Detalhamento diário (últimos {DIAS_NO_DETALHAMENTO} dias)
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Histórico mais antigo continua disponível nos arquivos exportados, logo abaixo.
        </p>

        <div className="mt-3.5 flex flex-col gap-2.5">
          {diasOrdenados.map((chave) => {
            const resumoDoDia = porDia.get(chave)!;
            return (
              <DiaDeMencoesAccordion
                key={chave}
                shoppingId={params.id}
                chaveDoDia={chave}
                tituloFormatado={formatarDataLonga(resumoDoDia.primeiroRecebidoEm)}
                totalDeMencoes={resumoDoDia.contagem}
              />
            );
          })}

          {diasOrdenados.length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
              Nenhuma menção nos últimos {DIAS_NO_DETALHAMENTO} dias.
            </p>
          )}
        </div>
      </div>

      {/* Exportações automáticas */}
      <div className="mt-9">
        <h3 className="text-[13.5px] font-bold text-neutral-200">Exportações automáticas</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Um arquivo CSV é gerado sozinho a cada 30 dias com o histórico completo do período — dá
          pra abrir no Excel/Google Sheets. Os links de download valem por 1 hora depois de abrir
          essa página.
        </p>

        <div className="mt-3.5 flex flex-col gap-2.5">
          {(exportacoes ?? []).map((exp) => (
            <div
              key={exp.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/8 bg-ink-900 px-4 py-3.5"
            >
              <div>
                <p className="text-[13px] font-semibold text-neutral-200">
                  {formatarDataCurta(exp.periodo_inicio)} – {formatarDataCurta(exp.periodo_fim)}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {exp.total_mencoes} menç{exp.total_mencoes === 1 ? "ão" : "ões"} nesse período
                </p>
              </div>
              {urlPorCaminho.get(exp.storage_path) ? (
                <a
                  href={urlPorCaminho.get(exp.storage_path) ?? undefined}
                  className="shrink-0 rounded-[9px] border border-white/14 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-white/5"
                >
                  Baixar CSV
                </a>
              ) : (
                <span className="shrink-0 text-xs text-neutral-500">Link indisponível</span>
              )}
            </div>
          ))}

          {(exportacoes ?? []).length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
              Ainda não passou o primeiro ciclo de 30 dias — a primeira exportação aparece aqui
              automaticamente.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
