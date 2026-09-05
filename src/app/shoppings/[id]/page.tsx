import { criarClienteAdmin } from "@/lib/supabase/admin";
import { inicioDoDiaBrasiliaISO } from "@/lib/mencoes";
import { iniciaisDoNome } from "@/lib/iniciais";
import { BotaoAtualizar } from "@/components/BotaoAtualizar";

export const dynamic = "force-dynamic";

// Cores de avatar por índice, só pra lojas ativas e não-fallback (dá uma variação visual bonita
// no grid) — loja inativa ou a "Geral" (fallback) sempre usa o avatar neutro, pra não competir com
// as lojas de verdade.
const CORES_AVATAR = [
  ["#8f82ff", "#6a5bde"],
  ["#5fd0c0", "#2f9a8d"],
  ["#ff9d7a", "#d9673f"],
  ["#7ea8ff", "#4a6fd6"],
  ["#f2a7c8", "#c2568f"],
  ["#a3e178", "#5a9c3f"],
] as const;

function CartaoDeEstatistica({
  rotulo,
  valor,
  icone,
  corIcone,
  corFundoIcone,
  corBarra,
  larguraPercentual,
}: {
  rotulo: string;
  valor: number;
  icone: React.ReactNode;
  corIcone: string;
  corFundoIcone: string;
  corBarra: string;
  larguraPercentual: number;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-white/8 bg-ink-900 p-5">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: corFundoIcone, color: corIcone }}
        >
          {icone}
        </div>
        <span className="text-xs font-semibold text-neutral-400">{rotulo}</span>
      </div>
      <div className="font-display mt-3.5 text-[32px] font-bold leading-none">{valor}</div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-850">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${larguraPercentual}%`, backgroundColor: corBarra }}
        />
      </div>
    </div>
  );
}

export default async function LojasDoShoppingPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = criarClienteAdmin();

  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select(
      "id, nome, eh_geral, ativo, instagram_username, instagram_username_2, base_conhecimento_texto"
    )
    .eq("shopping_id", params.id)
    .order("ordem", { ascending: true });

  const idsDasLojas = (lojas ?? []).map((l) => l.id);

  // Publicação hoje roda a cada poucos minutos (ver .github/workflows/publicar-mencoes.yml), não
  // mais em dois horários fixos — não faz mais sentido contar por "ciclo entre crons". "Aguardando
  // publicar" agora é simplesmente quem ainda está com status pendente; "Publicados hoje" usa a
  // meia-noite de Brasília como corte, igual ao limite diário de menções por loja.
  const inicioDoDia = inicioDoDiaBrasiliaISO();

  const { data: mencoesPendentes } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("loja_id")
          .in("loja_id", idsDasLojas)
          .eq("status", "pendente")
      : { data: [] as { loja_id: string }[] };

  const { data: mencoesPublicadasHoje } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("loja_id")
          .in("loja_id", idsDasLojas)
          .eq("status", "publicado")
          .gte("publicado_em", inicioDoDia)
      : { data: [] as { loja_id: string }[] };

  // Badge por loja mostra quantas publicações saíram HOJE (e não mais "N aguardando", que não
  // ajudava a loja a ver o próprio resultado do dia) e, se tiver alguma com erro, avisa isso
  // também — os dois contadores por loja vêm dessas duas buscas.
  const { data: mencoesComErro } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("loja_id")
          .in("loja_id", idsDasLojas)
          .eq("status", "erro")
      : { data: [] as { loja_id: string }[] };

  function contarPorLoja(linhas: { loja_id: string }[]): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const linha of linhas) {
      mapa.set(linha.loja_id, (mapa.get(linha.loja_id) ?? 0) + 1);
    }
    return mapa;
  }

  const pendentesPorLoja = contarPorLoja(mencoesPendentes ?? []);
  const publicadosHojePorLoja = contarPorLoja(mencoesPublicadasHoje ?? []);
  const errosPorLoja = contarPorLoja(mencoesComErro ?? []);

  const totalPendentes = (mencoesPendentes ?? []).length;
  const totalPublicadosHoje = (mencoesPublicadasHoje ?? []).length;
  const maiorValor = Math.max(totalPendentes, totalPublicadosHoje, 1);

  let indiceDeCor = 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold tracking-tight">Lojas</h1>
        <div className="flex shrink-0 items-center gap-2">
          <BotaoAtualizar />
          <a
            href={`/shoppings/${params.id}/lojas/novo`}
            className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-accent px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nova loja
          </a>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3.5 sm:flex-row">
        <CartaoDeEstatistica
          rotulo="Aguardando publicar"
          valor={totalPendentes}
          icone={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
          corIcone="#fbbf24"
          corFundoIcone="rgba(251,191,36,0.14)"
          corBarra="#fbbf24"
          larguraPercentual={Math.max(4, (totalPendentes / maiorValor) * 100)}
        />
        <CartaoDeEstatistica
          rotulo="Publicados hoje"
          valor={totalPublicadosHoje}
          icone={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          }
          corIcone="#34d399"
          corFundoIcone="rgba(52,211,153,0.13)"
          corBarra="#34d399"
          larguraPercentual={Math.max(4, (totalPublicadosHoje / maiorValor) * 100)}
        />
      </div>
      <p className="mt-3 text-[11px] text-neutral-500">
        Publicação automática contínua — a menção sai poucos minutos depois de o lojista marcar.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {(lojas ?? []).map((loja) => {
          const publicadosHojeDaLoja = publicadosHojePorLoja.get(loja.id) ?? 0;
          const errosDaLoja = errosPorLoja.get(loja.id) ?? 0;

          const usaAvatarNeutro = !loja.ativo || loja.eh_geral;
          const [corInicio, corFim] = usaAvatarNeutro
            ? ["#2a2c33", "#2a2c33"]
            : CORES_AVATAR[indiceDeCor++ % CORES_AVATAR.length];

          return (
            <a
              key={loja.id}
              href={`/shoppings/${params.id}/lojas/${loja.id}`}
              className={`relative flex flex-col rounded-2xl border bg-ink-900 px-5 py-[18px] shadow-[0_16px_36px_-22px_rgba(0,0,0,0.7)] transition hover:-translate-y-0.5 ${
                loja.ativo ? "border-white/12" : "border-danger/25 opacity-70"
              }`}
            >
              {(publicadosHojeDaLoja > 0 || errosDaLoja > 0) && (
                <div className="absolute -top-2.5 right-4 flex items-center gap-1.5">
                  {publicadosHojeDaLoja > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(124,110,242,0.5)]">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5">
                        <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                      </svg>
                      {publicadosHojeDaLoja} hoje
                    </span>
                  )}
                  {errosDaLoja > 0 && (
                    <span className="rounded-full bg-danger px-2.5 py-1 text-[10.5px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(248,113,113,0.5)]">
                      {errosDaLoja} com erro
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className="font-display flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold text-white"
                    style={{ background: `linear-gradient(155deg, ${corInicio}, ${corFim})` }}
                  >
                    {iniciaisDoNome(loja.nome)}
                  </div>
                  <span className="truncate text-[13.5px] font-bold">{loja.nome}</span>
                  {loja.eh_geral && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-strong">
                      FALLBACK
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    loja.ativo ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger"
                  }`}
                >
                  {loja.ativo ? "ATIVA" : "INATIVA"}
                </span>
              </div>

              <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-neutral-400">
                  {loja.instagram_username
                    ? [loja.instagram_username, loja.instagram_username_2]
                        .filter(Boolean)
                        .map((u) => `@${u}`)
                        .join(" / ")
                    : "Sem @usuário autorizado"}
                </span>
                <span className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-neutral-400">
                  {loja.base_conhecimento_texto?.trim()
                    ? "Com base de conhecimento"
                    : "Sem base de conhecimento ainda"}
                </span>
              </div>
            </a>
          );
        })}
      </div>

      {(lojas ?? []).length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
          Nenhuma loja cadastrada ainda.
        </p>
      )}
    </div>
  );
}
