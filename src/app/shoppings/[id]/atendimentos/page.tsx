import { criarClienteAdmin } from "@/lib/supabase/admin";
import { diasDeRetencaoDeMensagens } from "@/lib/retencao";
import { BotaoEnviarRelatorioPorEmail } from "@/components/BotaoEnviarRelatorioPorEmail";
import { AtendimentoAccordion } from "@/components/AtendimentoAccordion";

export const dynamic = "force-dynamic";

type Atendimento = {
  instagramScopedId: string;
  clienteNome: string;
  clienteUsername: string | null;
  totalMensagens: number;
  ultimaMensagemEm: string;
  pausado: boolean;
};

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatarDataLonga(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(iso));
}

function chaveDoDia(iso: string): string {
  // Chave estável (ano-mês-dia em Brasília) pra agrupar por dia sem depender de fuso do servidor.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export default async function AtendimentosPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { email?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: contas } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", params.id);

  const contaIds = (contas ?? []).map((c) => c.id);

  // As duas buscas abaixo só dependem de contaIds, nenhuma da outra — rodam em paralelo.
  const [{ data: mensagens }, { data: pausadas }] =
    contaIds.length > 0
      ? await Promise.all([
          // Só o necessário pra montar a LISTA (nome, @usuário, quantas mensagens, último
          // contato) — o texto de cada mensagem (potencialmente milhares de linhas com conteúdo
          // longo) só é buscado sob demanda quando alguém abre a conversa de um cliente
          // específico (ver AtendimentoAccordion + api/shoppings/[id]/atendimentos/conversa).
          admin
            .from("shoppinghub_mensagens")
            .select("instagram_scoped_id, cliente_nome, cliente_username, created_at")
            .in("conta_id", contaIds)
            .order("created_at", { ascending: true })
            .limit(5000),
          // Conversas em que um humano respondeu manualmente pelo Instagram — o bot fica pausado
          // nelas até alguém clicar em "Retomar bot" (ver AtendimentoAccordion).
          admin.from("shoppinghub_conversas_pausadas").select("instagram_scoped_id").in("conta_id", contaIds),
        ])
      : [{ data: [] as any[] }, { data: [] as { instagram_scoped_id: string }[] }];

  const scopedIdsPausados = new Set((pausadas ?? []).map((p) => p.instagram_scoped_id));

  const porCliente = new Map<string, Atendimento>();
  for (const m of mensagens ?? []) {
    const existente = porCliente.get(m.instagram_scoped_id);

    if (!existente) {
      porCliente.set(m.instagram_scoped_id, {
        instagramScopedId: m.instagram_scoped_id,
        clienteNome: m.cliente_nome ?? "Cliente",
        clienteUsername: m.cliente_username,
        totalMensagens: 1,
        ultimaMensagemEm: m.created_at,
        pausado: scopedIdsPausados.has(m.instagram_scoped_id),
      });
    } else {
      existente.totalMensagens += 1;
      existente.ultimaMensagemEm = m.created_at;
      // Atualiza nome/@usuário com o dado mais recente (pode ter vindo em branco numa mensagem
      // antiga e preenchido depois, ou a pessoa ter trocado de @usuário).
      if (m.cliente_nome) existente.clienteNome = m.cliente_nome;
      if (m.cliente_username) existente.clienteUsername = m.cliente_username;
    }
  }

  const atendimentos = Array.from(porCliente.values()).sort(
    (a, b) => new Date(b.ultimaMensagemEm).getTime() - new Date(a.ultimaMensagemEm).getTime()
  );

  // Agrupado por dia do ÚLTIMO contato (pedido em 06/09/2026) — cada dia é um dropdown, e dentro
  // dele cada atendimento continua sendo o próprio dropdown que já existia.
  const porDia = new Map<string, Atendimento[]>();
  for (const atendimento of atendimentos) {
    const chave = chaveDoDia(atendimento.ultimaMensagemEm);
    if (!porDia.has(chave)) porDia.set(chave, []);
    porDia.get(chave)!.push(atendimento);
  }
  const diasOrdenados = Array.from(porDia.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-tight">Atendimentos</h1>
          <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
            Um card por cliente atendido pela IA — clica pra expandir e ver a conversa inteira. O
            histórico de mensagens fica guardado por {diasDeRetencaoDeMensagens()} dias e depois é
            apagado automaticamente.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <BotaoEnviarRelatorioPorEmail
            actionUrl={`/api/shoppings/${params.id}/atendimentos/enviar-email`}
          />
          <div className="grid grid-cols-2 gap-2 sm:order-1 sm:flex">
            <a
              href={`/api/shoppings/${params.id}/atendimentos/exportar?dias=15`}
              className="rounded-[9px] border border-white/14 px-3.5 py-2 text-center text-xs font-semibold text-neutral-200 hover:bg-white/5"
            >
              Exportar últimos 15 dias
            </a>
            <a
              href={`/api/shoppings/${params.id}/atendimentos/exportar?dias=30`}
              className="rounded-[9px] border border-white/14 px-3.5 py-2 text-center text-xs font-semibold text-neutral-200 hover:bg-white/5"
            >
              Exportar últimos 30 dias
            </a>
          </div>
        </div>
      </div>

      {searchParams.email === "enviado" && (
        <div className="mt-4 rounded-xl border border-ok/25 bg-ok/10 px-4 py-2.5 text-sm text-ok">
          Relatório enviado por e-mail com sucesso.
        </div>
      )}

      {searchParams.email === "erro" && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Não foi possível enviar o e-mail. Confira se a RESEND_API_KEY está configurada
          corretamente e veja os logs da Vercel pra mais detalhes.
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        {diasOrdenados.map((chave) => {
          const atendimentosDoDia = porDia.get(chave)!;
          return (
            <details key={chave} className="rounded-2xl border border-white/8 bg-ink-900">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                <p className="text-[13px] font-bold capitalize text-neutral-200">
                  {formatarDataLonga(atendimentosDoDia[0].ultimaMensagemEm)}
                </p>
                <span className="shrink-0 rounded-full bg-white/8 px-2.5 py-1 text-[10.5px] font-semibold text-neutral-300">
                  {atendimentosDoDia.length} atendimento{atendimentosDoDia.length === 1 ? "" : "s"}
                </span>
              </summary>

              <div className="flex flex-col gap-2.5 border-t border-white/8 p-2.5">
                {atendimentosDoDia.map((atendimento) => (
                  <AtendimentoAccordion
                    key={atendimento.instagramScopedId}
                    shoppingId={params.id}
                    instagramScopedId={atendimento.instagramScopedId}
                    clienteNome={atendimento.clienteNome}
                    clienteUsername={atendimento.clienteUsername}
                    totalMensagens={atendimento.totalMensagens}
                    ultimaMensagemEmFormatada={formatarDataHora(atendimento.ultimaMensagemEm)}
                    pausado={atendimento.pausado}
                  />
                ))}
              </div>
            </details>
          );
        })}

        {atendimentos.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
            Nenhum atendimento registrado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
