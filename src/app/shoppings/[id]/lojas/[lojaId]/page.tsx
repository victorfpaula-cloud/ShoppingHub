import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CampoDeTexto } from "@/components/CampoDeTexto";

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
      "id, nome, eh_geral, ativo, instagram_username, instagram_username_2, limite_diario_mencoes, endereco, telefone, email, horario_atendimento, responsavel, base_conhecimento_texto"
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display flex min-w-0 items-center gap-2.5 text-[22px] font-bold tracking-tight">
          <span className="truncate">{loja.nome}</span>
          {loja.eh_geral && (
            <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[10px] font-bold text-accent-strong">
              FALLBACK
            </span>
          )}
        </h1>
        <button
          type="submit"
          form="form-editar-loja"
          className="shrink-0 rounded-[10px] bg-accent px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong"
        >
          Salvar loja
        </button>
      </div>

      {searchParams.salvo && (
        <div className="mt-4 rounded-xl border border-ok/25 bg-ok/10 px-4 py-2.5 text-sm text-ok">
          Loja salva.
        </div>
      )}

      {searchParams.erro && (
        <div className="mt-4 break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {searchParams.erro}
        </div>
      )}

      <form
        id="form-editar-loja"
        action={`/api/lojas/${loja.id}`}
        method="POST"
        className="mt-6 flex flex-col gap-4"
      >
        <input type="hidden" name="shopping_id" value={params.id} />

        <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 sm:p-6">
          <h3 className="text-[14.5px] font-bold">Dados básicos</h3>
          <div className="mt-4 grid grid-cols-1 items-end gap-4 sm:grid-cols-[2fr_1fr]">
            <CampoDeTexto label="Nome da loja" type="text" name="nome" required defaultValue={loja.nome} />
            <label className="flex h-[42px] cursor-pointer items-center justify-between rounded-[10px] border border-white/14 bg-ink-850 px-3.5">
              <span className="text-[13px] font-semibold text-neutral-300">Loja ativa</span>
              <span className="relative inline-flex items-center">
                <input
                  type="checkbox"
                  name="ativo"
                  value="1"
                  defaultChecked={loja.ativo}
                  className="peer sr-only"
                />
                <span className="block h-[23px] w-10 rounded-full bg-white/15 transition-colors peer-checked:bg-accent" />
                <span className="absolute left-[3px] h-[17px] w-[17px] rounded-full bg-white transition-transform peer-checked:translate-x-[17px]" />
              </span>
            </label>
          </div>
          <p className="mt-3 text-[11.5px] text-neutral-500">Loja ativa aparece pra triagem escolher.</p>
        </div>

        {!loja.eh_geral && (
          <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 sm:p-6">
            <h3 className="text-[14.5px] font-bold">Marcação de Stories</h3>
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
              @usuário autorizado a marcar o shopping nos Stories dele — só menções desses
              @usuários entram na fila de republicação. Dá pra cadastrar até dois; deixe o segundo
              em branco pra não autorizar mais ninguém além do primeiro.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CampoDeTexto
                label="@usuário do Instagram"
                type="text"
                name="instagram_username"
                placeholder="Ex: loja_exemplo"
                defaultValue={loja.instagram_username ?? ""}
              />
              <CampoDeTexto
                label="2º @usuário (opcional)"
                type="text"
                name="instagram_username_2"
                placeholder="Ex: outra_conta"
                defaultValue={loja.instagram_username_2 ?? ""}
              />
              <CampoDeTexto
                label="Limite diário de menções"
                type="number"
                name="limite_diario_mencoes"
                min={0}
                defaultValue={loja.limite_diario_mencoes}
              />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 sm:p-6">
          <h3 className="text-[14.5px] font-bold">Contato (opcional)</h3>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoDeTexto label="Endereço" type="text" name="endereco" defaultValue={loja.endereco ?? ""} />
            <CampoDeTexto label="Telefone" type="text" name="telefone" defaultValue={loja.telefone ?? ""} />
            <CampoDeTexto label="E-mail" type="email" name="email" defaultValue={loja.email ?? ""} />
            <CampoDeTexto
              label="Horário de atendimento"
              type="text"
              name="horario_atendimento"
              placeholder="Ex: seg a sáb, 10h às 22h"
              defaultValue={loja.horario_atendimento ?? ""}
            />
            <div className="sm:col-span-2">
              <CampoDeTexto
                label="Responsável"
                type="text"
                name="responsavel"
                defaultValue={loja.responsavel ?? ""}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 sm:p-6">
          <h3 className="text-[14.5px] font-bold">Base de conhecimento</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
            Texto que o Gemini usa pra responder sobre essa loja — ideal incluir uma lista de
            produtos e preços, já que pergunta de preço não perdoa informação desatualizada.
          </p>
          <textarea
            name="base_conhecimento_texto"
            rows={12}
            defaultValue={loja.base_conhecimento_texto}
            placeholder="Cola aqui tudo que essa loja precisa saber pra responder bem"
            className="mt-3 w-full rounded-[10px] border border-white/14 bg-ink-850 px-3.5 py-3 text-[13.5px] leading-relaxed text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
          />
          <p className="mt-2 text-[11.5px] text-neutral-500">
            Upload de PDF/Word chega numa próxima etapa — por enquanto, é só colar o texto aqui.
          </p>
        </div>
      </form>

      <div className="mt-6 border-t border-white/8 pt-5">
        {!loja.eh_geral ? (
          <form action={`/api/lojas/${loja.id}/excluir`} method="POST">
            <input type="hidden" name="shopping_id" value={params.id} />
            <button
              type="submit"
              className="rounded-[9px] border border-white/12 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-neutral-400 hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
            >
              Excluir loja
            </button>
          </form>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500">
            Essa é a loja &quot;Geral&quot; (fallback) — não pode ser excluída. Dá pra desativar (mas não é
            recomendado, já que é o destino padrão de qualquer assunto que não bata com nenhuma
            outra loja).
          </p>
        )}
      </div>
    </div>
  );
}
