import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_MENCOES } from "@/lib/mencoes";

export const dynamic = "force-dynamic";

const ROTULO_DO_STATUS: Record<string, { texto: string; classe: string }> = {
  pendente: { texto: "Pendente", classe: "border-yellow-900 bg-yellow-950 text-yellow-300" },
  publicado: { texto: "Publicado", classe: "border-green-900 bg-green-950 text-green-300" },
  descartado_limite: {
    texto: "Descartado (limite diário)",
    classe: "border-neutral-700 bg-neutral-900 text-neutral-400",
  },
  erro: { texto: "Erro", classe: "border-red-900 bg-red-950 text-red-400" },
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
          .select("id, loja_id, status, recebido_em, publicado_em, story_media_id, storage_path")
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
      <h2 className="text-lg font-semibold">Fila de menções de Stories</h2>
      <p className="mt-1 text-sm text-neutral-400">
        A publicação é automática pelo cron, duas vezes por dia — não tem botão de aprovar, só de
        excluir (caso precise tirar uma menção indevida ou um teste antes de ser publicado).
      </p>

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(ROTULO_DO_STATUS) as Array<keyof typeof ROTULO_DO_STATUS>).map((status) => (
          <div key={status} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
            <p className="text-xs text-neutral-400">{ROTULO_DO_STATUS[status].texto}</p>
            <p className="mt-1 text-xl font-semibold">{contagemPorStatus[status] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {(mencoes ?? []).map((mencao) => {
          const rotulo = ROTULO_DO_STATUS[mencao.status] ?? {
            texto: mencao.status,
            classe: "border-neutral-700 bg-neutral-900 text-neutral-400",
          };

          const urlDaMidia = mencao.storage_path
            ? admin.storage.from(BUCKET_MENCOES).getPublicUrl(mencao.storage_path).data.publicUrl
            : null;

          return (
            <div
              key={mencao.id}
              className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              {urlDaMidia && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urlDaMidia}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    {nomePorLoja.get(mencao.loja_id) ?? "Loja removida"}
                  </p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${rotulo.classe}`}>
                    {rotulo.texto}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Recebida em {formatarDataHora(mencao.recebido_em)}
                  {mencao.publicado_em && ` — publicada em ${formatarDataHora(mencao.publicado_em)}`}
                </p>
              </div>

              <form action={`/api/mencoes/${mencao.id}/excluir`} method="POST">
                <input type="hidden" name="shopping_id" value={params.id} />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:border-red-900 hover:bg-red-950/40 hover:text-red-400"
                >
                  Excluir
                </button>
              </form>
            </div>
          );
        })}

        {(mencoes ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-700 px-4 py-6 text-center text-sm text-neutral-400">
            Nenhuma menção de Story recebida ainda.
          </p>
        )}
      </div>
    </div>
  );
}
