import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function EditarLojaPage({
  params,
  searchParams,
}: {
  params: { id: string; lojaId: string };
  searchParams: { erro?: string; salvo?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: loja } = await admin
    .from("shoppinghub_lojas")
    .select(
      "id, nome, eh_geral, ativo, instagram_username, limite_diario_mencoes, endereco, telefone, email, horario_atendimento, responsavel, base_conhecimento_texto"
    )
    .eq("id", params.lojaId)
    .eq("shopping_id", params.id)
    .maybeSingle();

  if (!loja) {
    return (
      <div>
        <a href={`/shoppings/${params.id}`} className="text-sm text-neutral-400 hover:text-neutral-300">
          &larr; Voltar pras lojas
        </a>
        <p className="mt-4 text-sm text-neutral-400">Loja não encontrada.</p>
      </div>
    );
  }

  return (
    <div>
      <a href={`/shoppings/${params.id}`} className="text-sm text-neutral-400 hover:text-neutral-300">
        &larr; Voltar pras lojas
      </a>

      <div className="mt-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{loja.nome}</h2>
        {loja.eh_geral && (
          <span className="rounded-full border border-sky-900 bg-sky-950 px-2 py-0.5 text-[10px] font-medium text-sky-300">
            Fallback
          </span>
        )}
      </div>

      {searchParams.salvo && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950 px-4 py-2 text-sm text-green-300">
          Loja salva.
        </div>
      )}

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {searchParams.erro}
        </div>
      )}

      <form action={`/api/lojas/${loja.id}`} method="POST" className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="shopping_id" value={params.id} />

        <div>
          <label className="text-xs text-neutral-400">Nome da loja</label>
          <input
            type="text"
            name="nome"
            required
            defaultValue={loja.nome}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" name="ativo" value="1" defaultChecked={loja.ativo} />
          Loja ativa (aparece pra triagem escolher)
        </label>

        {!loja.eh_geral && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="text-sm font-semibold text-neutral-200">Marcação de Stories</h3>
            <p className="mt-1 text-xs text-neutral-500">
              @usuário autorizado a marcar o shopping nos Stories dele — só menções desse @usuário
              entram na fila de republicação. Deixe em branco pra não autorizar nenhum por
              enquanto.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-neutral-400">@usuário do Instagram</label>
                <input
                  type="text"
                  name="instagram_username"
                  placeholder="Ex: loja_exemplo"
                  defaultValue={loja.instagram_username ?? ""}
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400">Limite diário de menções</label>
                <input
                  type="number"
                  name="limite_diario_mencoes"
                  min={0}
                  defaultValue={loja.limite_diario_mencoes}
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h3 className="text-sm font-semibold text-neutral-200">Contato (opcional)</h3>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-400">Endereço</label>
              <input
                type="text"
                name="endereco"
                defaultValue={loja.endereco ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Telefone</label>
              <input
                type="text"
                name="telefone"
                defaultValue={loja.telefone ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">E-mail</label>
              <input
                type="email"
                name="email"
                defaultValue={loja.email ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Horário de atendimento</label>
              <input
                type="text"
                name="horario_atendimento"
                placeholder="Ex: seg a sáb, 10h às 22h"
                defaultValue={loja.horario_atendimento ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-neutral-400">Responsável</label>
              <input
                type="text"
                name="responsavel"
                defaultValue={loja.responsavel ?? ""}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-neutral-400">
            Base de conhecimento (texto que o Gemini usa pra responder sobre essa loja — ideal
            incluir uma lista de produtos e preços, já que pergunta de preço não perdoa informação
            desatualizada)
          </label>
          <textarea
            name="base_conhecimento_texto"
            rows={12}
            defaultValue={loja.base_conhecimento_texto}
            placeholder="Cola aqui tudo que essa loja precisa saber pra responder bem"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Upload de PDF/Word chega numa próxima etapa — por enquanto, é só colar o texto aqui.
          </p>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Salvar loja
        </button>
      </form>

      {!loja.eh_geral ? (
        <form
          action={`/api/lojas/${loja.id}/excluir`}
          method="POST"
          className="mt-6 border-t border-neutral-800 pt-4"
        >
          <input type="hidden" name="shopping_id" value={params.id} />
          <button
            type="submit"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:border-red-900 hover:bg-red-950/40 hover:text-red-400"
          >
            Excluir loja
          </button>
        </form>
      ) : (
        <p className="mt-6 border-t border-neutral-800 pt-4 text-xs text-neutral-500">
          Essa é a loja "Geral" (fallback) — não pode ser excluída. Dá pra desativar (mas não é
          recomendado, já que é o destino padrão de qualquer assunto que não bata com nenhuma
          outra loja).
        </p>
      )}
    </div>
  );
}
