import { criarClienteAdmin } from "@/lib/supabase/admin";
import { inicioDoDiaBrasiliaISO } from "@/lib/mencoes";
import { iniciaisDoNome } from "@/lib/iniciais";
import { BotaoAtualizar } from "@/components/BotaoAtualizar";

export const dynamic = "force-dynamic";

// Avatar de loja sempre no mesmo tom de roxo (pedido em 06/09/2026 — o grid com várias cores por
// índice ficava poluído visualmente); só a "Geral" (fallback) ou loja inativa usa o tom neutro, pra
// não competir com as lojas de verdade.
const COR_AVATAR: readonly [string, string] = ["#8f82ff", "#6a5bde"];

function formatarHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function CartaoDePublicacoes({
  valor,
  totalErros,
  ultimaPublicacao,
}: {
  valor: number;
  totalErros: number;
  ultimaPublicacao: string | null;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-ok/30 bg-ink-900 p-5 shadow-[0_0_0_1px_rgba(52,211,153,0.1),0_0_36px_-10px_rgba(52,211,153,0.55)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
            style={{ backgroundColor: "rgba(52,211,153,0.13)", color: "#34d399" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-neutral-400">Publicados hoje</span>
        </div>
        {totalErros > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-bold text-danger">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M12 8v5M12 16.5h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            {totalErros} com erro
          </span>
        )}
      </div>
      <div className="font-display mt-3.5 text-[32px] font-bold leading-none">{valor}</div>
      <p className="mt-2.5 text-[11px] font-semibold text-neutral-500">
        {ultimaPublicacao
          ? `Última publicação às ${formatarHora(ultimaPublicacao)}`
          : "Nenhuma publicação ainda"}
      </p>
    </div>
  );
}

export default async function LojasDoShoppingPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = criarClienteAdmin();

  const { data: lojasEncontradas } = await admin
    .from("shoppinghub_lojas")
    .select(
      "id, nome, eh_geral, ativo, instagram_username, instagram_username_2, base_conhecimento_texto"
    )
    .eq("shopping_id", params.id);

  // Ordem alfabética pelo nome (pedido em 06/09/2026) — comparação com `localeCompare` em vez de
  // deixar o Postgres ordenar, pra tratar acentos (ex.: "Óticas") do jeito esperado em pt-BR.
  const lojas = [...(lojasEncontradas ?? [])].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
  );

  const idsDasLojas = lojas.map((l) => l.id);

  // Publicação roda a cada poucos minutos, continuamente (ver
  // .github/workflows/publicar-mencoes.yml) — o painel não precisa mais mostrar "aguardando
  // publicar" (não ajudava, já que o item some da fila em minutos); o que importa pra loja e pro
  // shopping é o resultado do dia. "Publicados hoje" usa a meia-noite de Brasília como corte,
  // igual ao limite diário de menções por loja.
  const inicioDoDia = inicioDoDiaBrasiliaISO();

  const { data: mencoesPublicadasHoje } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("loja_id")
          .in("loja_id", idsDasLojas)
          .eq("status", "publicado")
          .gte("publicado_em", inicioDoDia)
      : { data: [] as { loja_id: string }[] };

  // Badge por loja mostra quantas publicações saíram HOJE e, se tiver alguma com erro, avisa isso
  // também — os dois contadores por loja vêm dessas duas buscas.
  const { data: mencoesComErro } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("loja_id")
          .in("loja_id", idsDasLojas)
          .eq("status", "erro")
      : { data: [] as { loja_id: string }[] };

  // Última publicação de qualquer loja do shopping, pra mostrar o horário junto do card de
  // "Publicados hoje" (pedido em 06/09/2026) — pode ser de antes de hoje se nada saiu ainda hoje.
  const { data: ultimaPublicacaoLinha } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("publicado_em")
          .in("loja_id", idsDasLojas)
          .eq("status", "publicado")
          .order("publicado_em", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  function contarPorLoja(linhas: { loja_id: string }[]): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const linha of linhas) {
      mapa.set(linha.loja_id, (mapa.get(linha.loja_id) ?? 0) + 1);
    }
    return mapa;
  }

  const publicadosHojePorLoja = contarPorLoja(mencoesPublicadasHoje ?? []);
  const errosPorLoja = contarPorLoja(mencoesComErro ?? []);

  const totalPublicadosHoje = (mencoesPublicadasHoje ?? []).length;
  const totalErros = (mencoesComErro ?? []).length;

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

      <div className="mt-6">
        <CartaoDePublicacoes
          valor={totalPublicadosHoje}
          totalErros={totalErros}
          ultimaPublicacao={ultimaPublicacaoLinha?.publicado_em ?? null}
        />
      </div>
      <p className="mt-3 text-[11px] text-neutral-500">
        Publicação automática contínua — a menção sai poucos minutos depois de o lojista marcar.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {lojas.map((loja) => {
          const publicadosHojeDaLoja = publicadosHojePorLoja.get(loja.id) ?? 0;
          const errosDaLoja = errosPorLoja.get(loja.id) ?? 0;

          const usaAvatarNeutro = !loja.ativo || loja.eh_geral;
          const [corInicio, corFim] = usaAvatarNeutro ? ["#2a2c33", "#2a2c33"] : COR_AVATAR;

          return (
            <a
              key={loja.id}
              href={`/shoppings/${params.id}/lojas/${loja.id}`}
              className={`relative flex h-[132px] flex-col rounded-2xl border bg-ink-900 px-5 py-[18px] transition hover:-translate-y-0.5 ${
                loja.eh_geral
                  ? "border-sky-400/35 shadow-[0_0_0_1px_rgba(56,165,255,0.1),0_0_32px_-10px_rgba(56,165,255,0.6)]"
                  : loja.ativo
                  ? "border-white/12 shadow-[0_16px_36px_-22px_rgba(0,0,0,0.7)]"
                  : "border-danger/25 opacity-70 shadow-[0_16px_36px_-22px_rgba(0,0,0,0.7)]"
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

              <div className="mt-3.5 flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-neutral-400">
                  {loja.instagram_username
                    ? [loja.instagram_username, loja.instagram_username_2]
                        .filter(Boolean)
                        .map((u) => `@${u}`)
                        .join(" / ")
                    : "Sem @usuário autorizado"}
                </span>
                <span className="shrink-0 rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-neutral-400">
                  {loja.base_conhecimento_texto?.trim() ? "Com base" : "Sem base"}
                </span>
              </div>
            </a>
          );
        })}
      </div>

      {lojas.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
          Nenhuma loja cadastrada ainda.
        </p>
      )}
    </div>
  );
}
