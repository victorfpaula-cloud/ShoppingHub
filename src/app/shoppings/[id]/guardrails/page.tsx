import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function GuardrailsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; salvo?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: shopping } = await admin
    .from("shoppinghub_shoppings")
    .select("guardrails_texto")
    .eq("id", params.id)
    .maybeSingle();

  return (
    <div>
      <h2 className="text-lg font-semibold">Guardrails</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Regras que valem pra TODAS as lojas desse shopping — o que o atendimento virtual nunca
        pode fazer ou falar, não importa o assunto da mensagem. Já vem com um texto padrão pronto;
        edite à vontade pra ajustar ao jeito do seu shopping.
      </p>

      {searchParams.salvo && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Guardrails salvos.
        </div>
      )}

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <form
        action={`/api/shoppings/${params.id}/guardrails`}
        method="POST"
        className="mt-4 flex flex-col gap-4"
      >
        <textarea
          name="guardrails_texto"
          rows={16}
          defaultValue={shopping?.guardrails_texto ?? ""}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="mt-2 w-fit rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Salvar guardrails
        </button>
      </form>
    </div>
  );
}
