import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BotaoPausar } from "./BotaoPausar";

export const dynamic = "force-dynamic";

const MENSAGENS_DE_ERRO: Record<string, string> = {
  parametros_faltando: "O Facebook não devolveu os dados esperados. Tenta conectar de novo.",
  state_invalido: "Essa tentativa de login expirou ou já foi usada. Tenta conectar de novo.",
  sem_paginas_com_instagram:
    "Nenhuma das suas Páginas do Facebook tem uma conta do Instagram profissional vinculada.",
  falha_na_conexao: "Deu um erro conectando com o Facebook. Tenta de novo em instantes.",
  escolha_invalida: "Não veio nenhuma conta selecionada.",
  conexao_expirada: "Essa conexão expirou. Começa de novo clicando em Conectar Instagram.",
  pagina_nao_encontrada: "Essa conta não estava mais na lista. Tenta conectar de novo.",
  falha_ao_salvar_conta: "Deu um erro salvando a conta. Tenta de novo em instantes.",
  falha_ao_pausar: "Deu um erro pausando/reativando a conta. Tenta de novo em instantes.",
  falha_ao_excluir: "Deu um erro desconectando a conta. Tenta de novo em instantes.",
};

export default async function ContaDoShoppingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; conectada?: string; aviso?: string; detalhe?: string; excluida?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: contas } = await admin
    .from("shoppinghub_contas")
    .select("id, page_name, instagram_username, active")
    .eq("shopping_id", params.id)
    .order("created_at", { ascending: true });

  const mensagemDeErro = searchParams.erro ? MENSAGENS_DE_ERRO[searchParams.erro] : null;
  const avisoFalhaWebhook = searchParams.aviso === "falha_ao_inscrever_webhook";

  return (
    <div>
      <h1 className="font-display text-[22px] font-bold tracking-tight">Conta do Instagram</h1>
      <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
        Conta conectada que recebe as menções de Story, republica-as e recebe/responde as
        mensagens do Direct desse shopping.
      </p>

      {searchParams.conectada && (
        <div className="mt-4 rounded-xl border border-ok/25 bg-ok/10 px-4 py-2.5 text-sm text-ok">
          Conta conectada com sucesso.
        </div>
      )}

      {searchParams.excluida && (
        <div className="mt-4 rounded-xl border border-ok/25 bg-ok/10 px-4 py-2.5 text-sm text-ok">
          Conta desconectada.
        </div>
      )}

      {mensagemDeErro && (
        <div className="mt-4 break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {mensagemDeErro}
        </div>
      )}

      {avisoFalhaWebhook && (
        <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          <p>
            A conta foi conectada, mas não conseguimos inscrever ela pra receber mensagens (o
            Facebook recusou o pedido). Tenta conectar essa mesma conta de novo em instantes.
          </p>
          {searchParams.detalhe && (
            <p className="mt-2 break-words rounded-md bg-warn/10 px-2 py-1 font-mono text-xs text-warn">
              Motivo do Facebook: {searchParams.detalhe}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(contas ?? []).map((conta) => (
          <div
            key={conta.id}
            className={`rounded-2xl border bg-ink-900 px-4 py-3.5 ${
              conta.active ? "border-white/12" : "border-danger/25"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[13.5px] font-bold">{conta.page_name}</p>
                <p className="text-xs text-neutral-500">@{conta.instagram_username}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  conta.active ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger"
                }`}
              >
                {conta.active ? "ATIVA" : "PAUSADA"}
              </span>
            </div>

            <div className="mt-3.5 flex gap-2">
              <form action={`/api/shoppings/${params.id}/conta/status`} method="POST" className="flex-1">
                <input type="hidden" name="conta_id" value={conta.id} />
                <input type="hidden" name="ativar" value={conta.active ? "0" : "1"} />
                <BotaoPausar ativo={conta.active} />
              </form>

              <form action={`/api/shoppings/${params.id}/conta/excluir`} method="POST">
                <input type="hidden" name="conta_id" value={conta.id} />
                <button
                  type="submit"
                  className="rounded-[9px] border border-white/12 bg-transparent px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                >
                  Desconectar
                </button>
              </form>
            </div>
          </div>
        ))}

        {(contas ?? []).length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
            Nenhuma conta conectada ainda.
          </p>
        )}

        <a
          href={`/api/auth/facebook/start?shopping_id=${params.id}`}
          className="flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-white/14 p-5 text-neutral-500 transition hover:border-white/25 hover:text-neutral-300"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink-900 text-neutral-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="text-[12.5px] font-bold">Conectar Instagram</span>
        </a>
      </div>
    </div>
  );
}
