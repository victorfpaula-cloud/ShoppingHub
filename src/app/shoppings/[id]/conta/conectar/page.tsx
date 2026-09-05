import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { PaginaComInstagram } from "@/lib/facebookOAuth";
import ConectarForm from "./ConectarForm";

export const dynamic = "force-dynamic";

export default async function ConectarContaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { pendente?: string };
}) {
  const idPendente = searchParams.pendente;

  if (!idPendente) {
    return (
      <div>
        <p className="text-sm text-neutral-400">
          Nenhuma conexão em andamento.{" "}
          <a href={`/shoppings/${params.id}/conta`} className="text-accent-strong underline">
            Voltar
          </a>
        </p>
      </div>
    );
  }

  const admin = criarClienteAdmin();
  const { data: pendente } = await admin
    .from("shoppinghub_pending_connections")
    .select("pages")
    .eq("id", idPendente)
    .maybeSingle();

  if (!pendente) {
    return (
      <div>
        <p className="text-sm text-neutral-400">
          Essa conexão expirou.{" "}
          <a href={`/shoppings/${params.id}/conta`} className="text-accent-strong underline">
            Voltar e tentar de novo
          </a>
        </p>
      </div>
    );
  }

  const paginas = pendente.pages as PaginaComInstagram[];

  return (
    <div>
      <h1 className="font-display text-[22px] font-bold tracking-tight">Qual conta você quer conectar?</h1>
      <p className="mt-2 text-[13px] text-neutral-400">
        Encontramos {paginas.length} Página(s) do Facebook com Instagram vinculado.
      </p>

      <ConectarForm shoppingId={params.id} idPendente={idPendente} paginas={paginas} />

      <a
        href={`/shoppings/${params.id}/conta`}
        className="mt-6 inline-block text-sm text-neutral-500 hover:underline"
      >
        Cancelar e voltar
      </a>
    </div>
  );
}
