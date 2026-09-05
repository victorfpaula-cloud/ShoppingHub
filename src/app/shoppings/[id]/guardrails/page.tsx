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
      <h1 className="font-display text-[22px] font-bold tracking-tight">Guardrails</h1>
      <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
        Regras que valem pra TODAS as lojas desse shopping — o que o atendimento virtual nunca
        pode fazer ou falar, não importa o assunto da mensagem. Já vem com um texto padrão pronto;
        edite à vontade pra ajustar ao jeito do seu shopping.
      </p>

      {searchParams.salvo && (
        <div className="mt-4 rounded-xl border border-ok/25 bg-ok/10 px-4 py-2.5 text-sm text-ok">
          Guardrails salvos.
        </div>
      )}

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {searchParams.erro}
        </div>
      )}

      <form
        action={`/api/shoppings/${params.id}/guardrails`}
        method="POST"
        className="mt-5 flex flex-col gap-4"
      >
        <textarea
          name="guardrails_texto"
          rows={16}
          defaultValue={shopping?.guardrails_texto ?? ""}
          className="w-full rounded-2xl border border-white/8 bg-ink-900 px-4 py-3.5 text-[13.5px] leading-relaxed text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
        />

        <button
          type="submit"
          className="w-fit rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong"
        >
          Salvar guardrails
        </button>
      </form>
    </div>
  );
}
