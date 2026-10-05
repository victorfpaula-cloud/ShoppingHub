import { FormularioDePublicacao } from "@/components/FormularioDePublicacao";
import { MAX_ITENS_CARROSSEL } from "@/lib/publicacoesConstantes";

export const dynamic = "force-dynamic";

export default function NovoFeedPage({ params }: { params: { id: string } }) {
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

      <FormularioDePublicacao shoppingId={params.id} tipo="feed" />
    </div>
  );
}
