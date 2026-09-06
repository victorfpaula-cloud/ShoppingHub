import { criarClienteAdmin } from "@/lib/supabase/admin";
import { inicioDoDiaBrasiliaISO } from "@/lib/mencoes";
import { DiaDeMencoesAccordion } from "@/components/DiaDeMencoesAccordion";
import { BotaoEnviarRelatorioPorEmail } from "@/components/BotaoEnviarRelatorioPorEmail";

export const dynamic = "force-dynamic";

const DIAS_NO_DETALHAMENTO = 30;

function formatarDataLonga(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
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

const OPCOES_DE_PERIODO = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "15", rotulo: "15 dias" },
  { chave: "30", rotulo: "30 dias" },
] as const;
type ChaveDePeriodo = (typeof OPCOES_DE_PERIODO)[number]["chave"];

export default async function RelatoriosDeMencoesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { periodo?: string; email?: string };
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

  // ---- Resumo do período escolhido (cabeçalho com o total publicado, quantos lojistas tiveram
  // alguma menção nesse período, limite diário e erro, e quanto cada loja publicou) — "Hoje" é o
  // padrão (pedido em 06/09/2026), usando meia-noite de Brasília como corte, igual ao resto do
  // painel (ver inicioDoDiaBrasiliaISO em lib/mencoes.ts). ----
  const chavePeriodo: ChaveDePeriodo = OPCOES_DE_PERIODO.some((o) => o.chave === searchParams.periodo)
    ? (searchParams.periodo as ChaveDePeriodo)
    : "hoje";

  const limitePeriodo =
    chavePeriodo === "hoje"
      ? new Date(inicioDoDiaBrasiliaISO())
      : new Date(Date.now() - Number(chavePeriodo) * 24 * 60 * 60 * 1000);
  const mencoesDoPeriodo = mencoes.filter((m) => new Date(m.recebido_em) >= limitePeriodo);

  const publicadosNoPeriodo = mencoesDoPeriodo.filter((m) => m.status === "publicado").length;
  const limiteDiarioNoPeriodo = mencoesDoPeriodo.filter((m) => m.status === "descartado_limite").length;
  const errosNoPeriodo = mencoesDoPeriodo.filter((m) => m.status === "erro").length;

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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-tight">Relatórios de Menções</h1>
          <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
            Visão geral de todas as menções de Story recebidas e republicadas, por loja e por dia.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <BotaoEnviarRelatorioPorEmail shoppingId={params.id} />
          <div className="grid grid-cols-2 gap-2 sm:order-1 sm:flex">
            <a
              href={`/api/shoppings/${params.id}/relatorios/exportar?dias=15`}
              className="rounded-[9px] border border-white/14 px-3.5 py-2 text-center text-xs font-semibold text-neutral-200 hover:bg-white/5"
            >
              Exportar últimos 15 dias
            </a>
            <a
              href={`/api/shoppings/${params.id}/relatorios/exportar?dias=30`}
              className="rounded-[9px] border border-white/14 px-3.5 py-2 text-center text-xs font-semibold text-neutral-200 hover:bg-white/5"
            >
              Exportar últimos 30 dias
            </a>
          </div>
        </div>
      </div>

      {searchParams.email === "enviado" && (
        <div className="mt-4 rounded-xl border border-ok/25 bg-ok/10 px-4 py-2.5 text-sm text-ok">
          Relatórios enviados por e-mail com sucesso.
        </div>
      )}

      {searchParams.email === "erro" && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Não foi possível enviar o e-mail. Confira se a RESEND_API_KEY está configurada
          corretamente e veja os logs da Vercel pra mais detalhes.
        </div>
      )}

      {/* Resumo do período escolhido */}
      <div className="mt-7 rounded-2xl border border-white/8 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13.5px] font-bold text-neutral-200">Resumo do período</h3>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 p-1">
            {OPCOES_DE_PERIODO.map((opcao) => (
              <a
                key={opcao.chave}
                href={`?periodo=${opcao.chave}`}
                className={`rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                  chavePeriodo === opcao.chave
                    ? "bg-accent text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {opcao.rotulo}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/8 bg-ink-850 p-4">
            <p className="text-[11px] font-semibold text-neutral-400">Publicados no período</p>
            <p className="font-display mt-1.5 text-2xl font-bold text-ok">{publicadosNoPeriodo}</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-ink-850 p-4">
            <p className="text-[11px] font-semibold text-neutral-400">Lojistas acionados</p>
            <p className="font-display mt-1.5 text-2xl font-bold">{lojasAcionadasNoPeriodo}</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-ink-850 p-4">
            <p className="text-[11px] font-semibold text-neutral-400">Limite diário</p>
            <p className="font-display mt-1.5 text-2xl font-bold text-neutral-300">{limiteDiarioNoPeriodo}</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-ink-850 p-4">
            <p className="text-[11px] font-semibold text-neutral-400">Erro</p>
            <p className="font-display mt-1.5 text-2xl font-bold text-danger">{errosNoPeriodo}</p>
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
              Nenhuma Story publicada nesse período.
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
          Os relatórios completos (menções e atendimentos) chegam por e-mail a cada 30 dias — ou
          na hora, pelo botão "Enviar por e-mail" ali em cima.
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
    </div>
  );
}
