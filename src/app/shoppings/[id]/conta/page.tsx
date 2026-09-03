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
      <h2 className="text-lg font-semibold">Conta do Instagram</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Conta conectada que recebe as menções de Story, republica-as e recebe/responde as
        mensagens do Direct desse shopping.
      </p>

      {searchParams.conectada && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Conta conectada com sucesso.
        </div>
      )}

      {searchParams.excluida && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Conta desconectada.
        </div>
      )}

      {mensagemDeErro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {mensagemDeErro}
        </div>
      )}

      {avisoFalhaWebhook && (
        <div className="mt-4 rounded-lg border border-yellow-900 bg-yellow-950 px-4 py-2 text-sm text-yellow-300">
          <p>
            A conta foi conectada, mas não conseguimos inscrever ela pra receber mensagens (o
            Facebook recusou o pedido). Tenta conectar essa mesma conta de novo em instantes.
          </p>
          {searchParams.detalhe && (
            <p className="mt-2 break-words rounded-md bg-yellow-900/40 px-2 py-1 font-mono text-xs text-yellow-200">
              Motivo do Facebook: {searchParams.detalhe}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(contas ?? []).map((conta) => (
          <div
            key={conta.id}
            className={`rounded-xl border bg-neutral-800 px-4 py-3 ${
              conta.active ? "border-neutral-700" : "border-red-950/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{conta.page_name}</p>
                <p className="text-xs text-neutral-500">@{conta.instagram_username}</p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  conta.active
                    ? "border-green-900 bg-green-950 text-green-300"
                    : "border-red-900 bg-red-950 text-red-400"
                }`}
              >
                {conta.active ? "Ativa" : "Pausada"}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              <form action={`/api/shoppings/${params.id}/conta/status`} method="POST" className="flex-1">
                <input type="hidden" name="conta_id" value={conta.id} />
                <input type="hidden" name="ativar" value={conta.active ? "0" : "1"} />
                <BotaoPausar ativo={conta.active} />
              </form>

              <form action={`/api/shoppings/${params.id}/conta/excluir`} method="POST">
                <input type="hidden" name="conta_id" value={conta.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:border-red-900 hover:bg-red-950/40 hover:text-red-400"
                >
                  Desconectar
                </button>
              </form>
            </div>
          </div>
        ))}

        {(contas ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-700 px-4 py-6 text-center text-sm text-neutral-400">
            Nenhuma conta conectada ainda.
          </p>
        )}

        <a
          href={`/api/auth/facebook/start?shopping_id=${params.id}`}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-700 p-5 text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-300"
        >
          <span className="mb-1 text-2xl leading-none">+</span>
          <span className="text-sm font-medium">Conectar Instagram</span>
        </a>
      </div>
    </div>
  );
}
