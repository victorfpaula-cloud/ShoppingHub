import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_MENCOES, inicioDoDiaBrasiliaISO } from "@/lib/mencoes";
import { BotaoAtualizar } from "@/components/BotaoAtualizar";

export const dynamic = "force-dynamic";

const ROTULO_DO_STATUS: Record<string, { texto: string; pill: string }> = {
  pendente: { texto: "Pendente", pill: "bg-warn/15 text-warn" },
  erro: { texto: "Erro", pill: "bg-danger/15 text-danger" },
};

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function FilaDeMencoesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select("id, nome")
    .eq("shopping_id", params.id);

  const idsDasLojas = (lojas ?? []).map((l) => l.id);
  const nomePorLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]));

  // ---- "Precisa de atenção": só pendente/erro, sem limite de data — é a razão da página existir
  // (tudo o que já foi publicado é histórico, e histórico já é o trabalho da página de Relatórios).
  // Mais antiga primeiro, pra quem está esperando há mais tempo aparecer no topo. ----
  const { data: itensDeAtencao } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("id, loja_id, status, recebido_em, storage_path, tentativas")
          .in("loja_id", idsDasLojas)
          .in("status", ["pendente", "erro"])
          .order("recebido_em", { ascending: true })
          .limit(200)
      : { data: [] as any[] };

  // ---- "Hoje": só um resumo rápido do dia (publicadas + quantas caíram no limite diário), sem
  // virar uma segunda página de histórico — quem quiser navegar dia a dia vai em Relatórios. ----
  const inicioDeHoje = inicioDoDiaBrasiliaISO();
  const { data: mencoesDeHoje } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("id, loja_id, status, publicado_em, thumbnail_path")
          .in("loja_id", idsDasLojas)
          .in("status", ["publicado", "descartado_limite"])
          .gte("recebido_em", inicioDeHoje)
      : { data: [] as any[] };

  const publicadasHoje = (mencoesDeHoje ?? [])
    .filter((m) => m.status === "publicado")
    .sort((a, b) => new Date(b.publicado_em).getTime() - new Date(a.publicado_em).getTime());
  const descartadasHoje = (mencoesDeHoje ?? []).filter((m) => m.status === "descartado_limite").length;

  const pendentesCount = (itensDeAtencao ?? []).filter((m) => m.status === "pendente").length;
  const errosCount = (itensDeAtencao ?? []).filter((m) => m.status === "erro").length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold tracking-tight">Fila de menções de Stories</h1>
        <BotaoAtualizar />
      </div>
      <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
        Aqui fica só o que precisa da sua atenção agora (pendente ou com erro) e um resumo rápido do
        que já foi publicado hoje. Pra ver o histórico completo, dia a dia e por loja, veja os{" "}
        <a href={`/shoppings/${params.id}/relatorios`} className="font-semibold text-accent-strong hover:underline">
          Relatórios
        </a>
        .
      </p>

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {searchParams.erro}
        </div>
      )}

      {/* Precisa de atenção */}
      <div className="mt-7 rounded-2xl border border-white/8 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13.5px] font-bold text-neutral-200">Precisa de atenção</h3>
          {(itensDeAtencao ?? []).length > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              {pendentesCount > 0 && (
                <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-bold text-warn">
                  {pendentesCount} pendente{pendentesCount === 1 ? "" : "s"}
                </span>
              )}
              {errosCount > 0 && (
                <span className="rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-bold text-danger">
                  {errosCount} com erro
                </span>
              )}
            </div>
          )}
        </div>

        {(itensDeAtencao ?? []).length === 0 ? (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-ok/20 bg-ok/[0.06] px-4 py-3 text-sm font-medium text-ok">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
            Tudo certo por aqui — nenhuma menção pendente ou com erro agora.
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {(itensDeAtencao ?? []).map((mencao) => {
              const rotulo = ROTULO_DO_STATUS[mencao.status];
              const ehVideo = mencao.storage_path?.endsWith(".mp4") ?? false;
              const urlDaMidia =
                mencao.storage_path && !ehVideo
                  ? admin.storage.from(BUCKET_MENCOES).getPublicUrl(mencao.storage_path).data.publicUrl
                  : null;
              const emErro = mencao.status === "erro";

              return (
                <div
                  key={mencao.id}
                  className={`flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 ${
                    emErro ? "border-danger/25 bg-danger/[0.04]" : "border-white/8 bg-ink-850"
                  }`}
                >
                  {urlDaMidia && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urlDaMidia}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-[52px] w-[52px] shrink-0 rounded-xl object-cover"
                    />
                  )}

                  {ehVideo && (
                    // Nunca aponta pro arquivo de vídeo direto aqui — alguns navegadores (Safari no
                    // iPhone/iPad, principalmente) tocam o vídeo como se fosse um GIF animado dentro
                    // da miniatura. Com várias menções de vídeo na fila ao mesmo tempo, isso trava a
                    // página (relatado em 05/09/2026). Só um ícone fixo, sem baixar o vídeo.
                    <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-ink-950 text-neutral-500">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                        <path d="M4 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4Zm11.5 2.5 3-1.75a.75.75 0 0 1 1.13.65v8.2a.75.75 0 0 1-1.13.65l-3-1.75v-6Z" />
                      </svg>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-bold">
                        {nomePorLoja.get(mencao.loja_id) ?? "Loja removida"}
                      </p>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${rotulo.pill}`}>
                        {rotulo.texto.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-neutral-500">
                      Recebida em {formatarDataHora(mencao.recebido_em)}
                      {emErro &&
                        mencao.tentativas > 0 &&
                        ` — ${mencao.tentativas} tentativa${mencao.tentativas > 1 ? "s" : ""} sozinha${
                          mencao.tentativas > 1 ? "s" : ""
                        }`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {emErro && (
                      <form action={`/api/mencoes/${mencao.id}/tentar-novamente`} method="POST">
                        <input type="hidden" name="shopping_id" value={params.id} />
                        <button
                          type="submit"
                          className="rounded-[9px] border border-accent/40 bg-transparent px-3 py-1.5 text-xs font-semibold text-accent-strong hover:bg-accent/10"
                        >
                          Tentar novamente
                        </button>
                      </form>
                    )}

                    <form action={`/api/mencoes/${mencao.id}/excluir`} method="POST">
                      <input type="hidden" name="shopping_id" value={params.id} />
                      <button
                        type="submit"
                        className="rounded-[9px] border border-white/12 bg-transparent px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                      >
                        Excluir
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hoje — resumo rápido, sem virar uma segunda página de histórico */}
      <div className="mt-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13.5px] font-bold text-neutral-200">Hoje</h3>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-ok/15 px-2.5 py-1 text-[11px] font-bold text-ok">
              {publicadasHoje.length} publicada{publicadasHoje.length === 1 ? "" : "s"}
            </span>
            {descartadasHoje > 0 && (
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-bold text-neutral-400">
                {descartadasHoje} descartada{descartadasHoje === 1 ? "" : "s"} (limite diário)
              </span>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Histórico completo, dia a dia, fica nos Relatórios.
        </p>

        <div className="mt-3.5 flex flex-col gap-2">
          {publicadasHoje.map((mencao) => {
            const urlDaThumbnail = mencao.thumbnail_path
              ? admin.storage.from(BUCKET_MENCOES).getPublicUrl(mencao.thumbnail_path).data.publicUrl
              : null;

            return (
              <div
                key={mencao.id}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-ink-850 px-3 py-2"
              >
                {urlDaThumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urlDaThumbnail}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-9 w-9 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  // Vídeo (sem miniatura, ver gerarThumbnailDeMencao) ou menção antiga, de antes
                  // dessa miniatura existir — ícone genérico no lugar, sem quebrar o layout.
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-950 text-neutral-600">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path
                        fillRule="evenodd"
                        d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0l-2.97 2.97ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-200">
                  {nomePorLoja.get(mencao.loja_id) ?? "Loja removida"}
                </span>
                <span className="shrink-0 text-[11.5px] text-neutral-500">
                  {formatarDataHora(mencao.publicado_em)}
                </span>
              </div>
            );
          })}

          {publicadasHoje.length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/12 px-4 py-5 text-center text-sm text-neutral-400">
              Nenhuma publicação hoje ainda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
