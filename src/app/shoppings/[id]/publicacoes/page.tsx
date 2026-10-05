import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_PUBLICACOES } from "@/lib/publicacoesConstantes";
import { BotaoAtualizar } from "@/components/BotaoAtualizar";

export const dynamic = "force-dynamic";

type Publicacao = {
  id: string;
  tipo: "story" | "feed";
  midias: { storage_path: string; tipo: "IMAGE" | "VIDEO" }[];
  horario: string;
  data_inicio: string;
  data_fim: string | null;
  status: "agendado" | "publicando" | "publicado" | "concluido" | "erro" | "cancelado";
  ultima_publicacao_em: string | null;
  erro_detalhe: string | null;
};

const ROTULO_DO_STATUS: Record<string, { texto: string; pill: string }> = {
  agendado: { texto: "Agendado", pill: "bg-accent/15 text-accent-strong" },
  publicando: { texto: "Publicando", pill: "bg-accent/15 text-accent-strong" },
  publicado: { texto: "Publicado", pill: "bg-ok/15 text-ok" },
  concluido: { texto: "Concluído", pill: "bg-ok/15 text-ok" },
  erro: { texto: "Erro", pill: "bg-danger/15 text-danger" },
  cancelado: { texto: "Cancelado", pill: "bg-white/8 text-neutral-400" },
};

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarHorario(horario: string): string {
  return horario.slice(0, 5);
}

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function PublicacoesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", params.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: publicacoes } = conta
    ? await admin
        .from("shoppinghub_publicacoes")
        .select(
          "id, tipo, midias, horario, data_inicio, data_fim, status, ultima_publicacao_em, erro_detalhe"
        )
        .eq("conta_id", conta.id)
        .neq("status", "cancelado")
        .order("criado_em", { ascending: false })
        .limit(100)
    : { data: [] as Publicacao[] };

  const stories = (publicacoes ?? []).filter((p) => p.tipo === "story");
  const feed = (publicacoes ?? []).filter((p) => p.tipo === "feed");

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold tracking-tight">Publicações</h1>
        <BotaoAtualizar />
      </div>
      <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
        Agende artes e vídeos próprios do shopping pra publicar automaticamente no Instagram —
        Stories (com período, republicado todo dia no horário escolhido) ou Feed (data única,
        imagem/vídeo único ou carrossel).
      </p>

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {searchParams.erro}
        </div>
      )}

      {!conta && (
        <div className="mt-5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          Conecte uma conta do Instagram antes de agendar uma publicação — veja a aba{" "}
          <a href={`/shoppings/${params.id}/conta`} className="font-semibold underline">
            Conta do Instagram
          </a>
          .
        </div>
      )}

      <SecaoDePublicacoes
        titulo="Stories"
        descricao="Imagem ou vídeo único, republicado automaticamente todo dia no horário escolhido, até o fim do período."
        hrefNovo={`/shoppings/${params.id}/publicacoes/nova-story`}
        rotuloNovo="+ Nova Story"
        itens={stories}
        shoppingId={params.id}
        admin={admin}
      />

      <SecaoDePublicacoes
        titulo="Feed"
        descricao="Imagem, vídeo ou carrossel (até 10 itens), publicado uma vez na data e horário escolhidos."
        hrefNovo={`/shoppings/${params.id}/publicacoes/novo-feed`}
        rotuloNovo="+ Novo post no Feed"
        itens={feed}
        shoppingId={params.id}
        admin={admin}
      />
    </div>
  );
}

function SecaoDePublicacoes({
  titulo,
  descricao,
  hrefNovo,
  rotuloNovo,
  itens,
  shoppingId,
  admin,
}: {
  titulo: string;
  descricao: string;
  hrefNovo: string;
  rotuloNovo: string;
  itens: Publicacao[];
  shoppingId: string;
  admin: ReturnType<typeof criarClienteAdmin>;
}) {
  return (
    <div className="mt-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-neutral-200">{titulo}</h3>
          <p className="mt-0.5 max-w-xl text-[12px] text-neutral-500">{descricao}</p>
        </div>
        <a
          href={hrefNovo}
          className="shrink-0 rounded-[10px] bg-accent px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong"
        >
          {rotuloNovo}
        </a>
      </div>

      {itens.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-white/12 px-4 py-5 text-center text-sm text-neutral-400">
          Nenhuma publicação agendada ainda.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {itens.map((publicacao) => {
            const primeiraMidia = publicacao.midias[0];
            const urlDaMidia = primeiraMidia
              ? admin.storage.from(BUCKET_PUBLICACOES).getPublicUrl(primeiraMidia.storage_path).data.publicUrl
              : null;
            const ehVideo = primeiraMidia?.tipo === "VIDEO";
            const rotulo = ROTULO_DO_STATUS[publicacao.status];
            const podeExcluir = publicacao.status !== "publicado" && publicacao.status !== "concluido";

            return (
              <div
                key={publicacao.id}
                className={`flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 ${
                  publicacao.status === "erro" ? "border-danger/25 bg-danger/[0.04]" : "border-white/8 bg-ink-850"
                }`}
              >
                {ehVideo ? (
                  <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-ink-950 text-neutral-500">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                      <path d="M4 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4Zm11.5 2.5 3-1.75a.75.75 0 0 1 1.13.65v8.2a.75.75 0 0 1-1.13.65l-3-1.75v-6Z" />
                    </svg>
                  </div>
                ) : urlDaMidia ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urlDaMidia}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-[52px] w-[52px] shrink-0 rounded-xl object-cover"
                  />
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-bold">
                      {publicacao.tipo === "story"
                        ? "Story"
                        : publicacao.midias.length > 1
                          ? `Carrossel (${publicacao.midias.length} itens)`
                          : "Feed"}
                    </p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${rotulo.pill}`}>
                      {rotulo.texto.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-neutral-500">
                    {publicacao.tipo === "story" && publicacao.data_fim
                      ? `${formatarData(publicacao.data_inicio)} a ${formatarData(publicacao.data_fim)}, ${formatarHorario(publicacao.horario)}`
                      : `${formatarData(publicacao.data_inicio)}, ${formatarHorario(publicacao.horario)}`}
                    {publicacao.ultima_publicacao_em &&
                      ` — última publicação em ${formatarDataHora(publicacao.ultima_publicacao_em)}`}
                  </p>
                  {publicacao.status === "erro" && publicacao.erro_detalhe && (
                    <p className="mt-0.5 break-words text-[11.5px] text-danger">{publicacao.erro_detalhe}</p>
                  )}
                </div>

                {podeExcluir && (
                  <form action={`/api/publicacoes/${publicacao.id}/excluir`} method="POST" className="shrink-0">
                    <input type="hidden" name="shopping_id" value={shoppingId} />
                    <button
                      type="submit"
                      className="rounded-[9px] border border-white/12 bg-transparent px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                    >
                      Cancelar
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
