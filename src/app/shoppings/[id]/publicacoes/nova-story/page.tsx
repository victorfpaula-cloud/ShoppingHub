import { FormularioDePublicacao } from "@/components/FormularioDePublicacao";

export const dynamic = "force-dynamic";

export default function NovaStoryPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <a
        href={`/shoppings/${params.id}/publicacoes`}
        className="text-sm text-neutral-400 hover:text-neutral-300"
      >
        &larr; Voltar pras publicações
      </a>

      <h1 className="font-display mt-4 text-[22px] font-bold tracking-tight">Nova Story</h1>
      <p className="mt-2 max-w-xl text-[13px] text-neutral-400">
        A mesma imagem ou vídeo é publicado automaticamente todo dia, no horário escolhido, do
        primeiro ao último dia do período — como um Story some em 24h, é assim que ele fica no ar o
        período inteiro.
      </p>

      <FormularioDePublicacao shoppingId={params.id} tipo="story" />
    </div>
  );
}
