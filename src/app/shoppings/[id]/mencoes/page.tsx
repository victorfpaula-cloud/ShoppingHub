import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_MENCOES } from "@/lib/mencoes";

export const dynamic = "force-dynamic";

const ROTULO_DO_STATUS: Record<string, { texto: string; ponto: string; pill: string }> = {
  pendente: { texto: "Pendente", ponto: "bg-warn", pill: "bg-warn/15 text-warn" },
  publicado: { texto: "Publicado", ponto: "bg-ok", pill: "bg-ok/15 text-ok" },
  descartado_limite: {
    texto: "Descartado (limite diário)",
    ponto: "bg-neutral-500",
    pill: "bg-white/8 text-neutral-400",
  },
  erro: { texto: "Erro", ponto: "bg-danger", pill: "bg-danger/15 text-danger" },
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

  const { data: mencoes } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select(
            "id, loja_id, status, recebido_em, publicado_em, story_media_id, storage_path, tentativas"
          )
          .in("loja_id", idsDasLojas)
          .order("recebido_em", { ascending: false })
          .limit(100)
      : { data: [] as any[] };

  const contagemPorStatus = { pendente: 0, publicado: 0, descartado_limite: 0, erro: 0 } as Record<
    string,
    number
  >;
  for (const m of mencoes ?? []) {
    contagemPorStatus[m.status] = (contagemPorStatus[m.status] ?? 0) + 1;
  }

  return (
    <div>
      <h1 className="font-display text-[26px] font-bold tracking-tight">Fila de menções de Stories</h1>
      <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
        A publicação é automática, a cada poucos minutos — não tem botão de aprovar. Uma menção com
        erro tenta de novo sozinha algumas vezes antes de precisar de ação manual (tentar de novo ou
        excluir).
      </p>

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {searchParams.erro}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(ROTULO_DO_STATUS) as Array<keyof typeof ROTULO_DO_STATUS>).map((status) => (
          <div key={status} className="rounded-2xl border border-white/8 bg-ink-900 p-4">
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ROTULO_DO_STATUS[status].ponto}`} />
              <p className="text-[11px] font-semibold text-neutral-400">{ROTULO_DO_STATUS[status].texto}</p>
            </div>
            <p className="font-display mt-2 text-2xl font-bold">{contagemPorStatus[status] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {(mencoes ?? []).map((mencao) => {
          const rotulo = ROTULO_DO_STATUS[mencao.status] ?? {
            texto: mencao.status,
            ponto: "bg-neutral-500",
            pill: "bg-white/8 text-neutral-400",
          };

          const ehVideo = mencao.storage_path?.endsWith(".mp4") ?? false;

          const urlDaMidia = mencao.storage_path && !ehVideo
            ? admin.storage.from(BUCKET_MENCOES).getPublicUrl(mencao.storage_path).data.publicUrl
            : null;

          const emErro = mencao.status === "erro";

          return (
            <div
              key={mencao.id}
              className={`flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 ${
                emErro ? "border-danger/25 bg-danger/[0.04]" : "border-white/8 bg-ink-900"
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
                <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-ink-850 text-neutral-500">
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
                  {mencao.publicado_em && ` — publicada em ${formatarDataHora(mencao.publicado_em)}`}
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

        {(mencoes ?? []).length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
            Nenhuma menção de Story recebida ainda.
          </p>
        )}
      </div>
    </div>
  );
}
