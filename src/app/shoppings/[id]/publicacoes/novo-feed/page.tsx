import { CampoDeTexto } from "@/components/CampoDeTexto";
import { MAX_ITENS_CARROSSEL } from "@/lib/publicacoesConstantes";

export const dynamic = "force-dynamic";

export default function NovoFeedPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  return (
    <div>
      <a
        href={`/shoppings/${params.id}/publicacoes`}
        className="text-sm text-neutral-400 hover:text-neutral-300"
      >
        &larr; Voltar pras publicações
      </a>

      <h1 className="font-display mt-4 text-[22px] font-bold tracking-tight">Novo post no Feed</h1>
      <p className="mt-2 max-w-xl text-[13px] text-neutral-400">
        Escolha um arquivo pra um post único, ou vários (até {MAX_ITENS_CARROSSEL}) pra publicar
        como carrossel. Publica uma única vez, na data e horário escolhidos.
      </p>

      {searchParams.erro && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {searchParams.erro}
        </div>
      )}

      <form
        action={`/api/shoppings/${params.id}/publicacoes`}
        method="POST"
        encType="multipart/form-data"
        className="mt-5 flex flex-col gap-4"
      >
        <input type="hidden" name="shopping_id" value={params.id} />
        <input type="hidden" name="tipo" value="feed" />

        <div className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-ink-900 p-5 sm:p-6">
          <CampoDeTexto
            label={`Arquivo(s) — imagem ou vídeo, até ${MAX_ITENS_CARROSSEL} pra carrossel`}
            type="file"
            name="arquivos"
            accept="image/*,video/*"
            multiple
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <CampoDeTexto label="Data" type="date" name="data_inicio" required />
            <CampoDeTexto label="Horário (Brasília)" type="time" name="horario" required />
          </div>
        </div>

        <button
          type="submit"
          className="self-start rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong"
        >
          Agendar publicação
        </button>
      </form>
    </div>
  );
}
