import { criarClienteAdmin } from "@/lib/supabase/admin";
import { diasDeRetencaoDeMensagens } from "@/lib/retencao";

export const dynamic = "force-dynamic";

type MensagemDoAtendimento = {
  direcao: "recebida" | "enviada";
  texto: string;
  dataHora: string;
  lojaNome: string | null;
};

type Atendimento = {
  instagramScopedId: string;
  clienteNome: string;
  clienteUsername: string | null;
  totalMensagens: number;
  ultimaMensagemEm: string;
  mensagens: MensagemDoAtendimento[];
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

export default async function AtendimentosPage({ params }: { params: { id: string } }) {
  const admin = criarClienteAdmin();

  const { data: contas } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", params.id);

  const contaIds = (contas ?? []).map((c) => c.id);

  const { data: mensagens } =
    contaIds.length > 0
      ? await admin
          .from("shoppinghub_mensagens")
          .select("instagram_scoped_id, direcao, texto, loja_id, cliente_nome, cliente_username, created_at")
          .in("conta_id", contaIds)
          .order("created_at", { ascending: true })
          .limit(5000)
      : { data: [] as any[] };

  const lojaIds = Array.from(new Set((mensagens ?? []).map((m) => m.loja_id).filter(Boolean)));
  const { data: lojas } =
    lojaIds.length > 0
      ? await admin.from("shoppinghub_lojas").select("id, nome").in("id", lojaIds as string[])
      : { data: [] as { id: string; nome: string }[] };
  const nomePorLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]));

  const porCliente = new Map<string, Atendimento>();
  for (const m of mensagens ?? []) {
    const existente = porCliente.get(m.instagram_scoped_id);
    const mensagemFormatada: MensagemDoAtendimento = {
      direcao: m.direcao,
      texto: m.texto,
      dataHora: formatarDataHora(m.created_at),
      lojaNome: m.loja_id ? nomePorLoja.get(m.loja_id) ?? null : null,
    };

    if (!existente) {
      porCliente.set(m.instagram_scoped_id, {
        instagramScopedId: m.instagram_scoped_id,
        clienteNome: m.cliente_nome ?? "Cliente",
        clienteUsername: m.cliente_username,
        totalMensagens: 1,
        ultimaMensagemEm: m.created_at,
        mensagens: [mensagemFormatada],
      });
    } else {
      existente.totalMensagens += 1;
      existente.ultimaMensagemEm = m.created_at;
      existente.mensagens.push(mensagemFormatada);
      // Atualiza nome/@usuário com o dado mais recente (pode ter vindo em branco numa mensagem
      // antiga e preenchido depois, ou a pessoa ter trocado de @usuário).
      if (m.cliente_nome) existente.clienteNome = m.cliente_nome;
      if (m.cliente_username) existente.clienteUsername = m.cliente_username;
    }
  }

  const atendimentos = Array.from(porCliente.values()).sort(
    (a, b) => new Date(b.ultimaMensagemEm).getTime() - new Date(a.ultimaMensagemEm).getTime()
  );

  return (
    <div>
      <h1 className="font-display text-[22px] font-bold tracking-tight">Atendimentos</h1>
      <p className="mt-2 max-w-2xl text-[13px] text-neutral-400">
        Um card por cliente atendido pela IA — clica pra expandir e ver a conversa inteira. O
        histórico de mensagens fica guardado por {diasDeRetencaoDeMensagens()} dias e depois é
        apagado automaticamente.
      </p>

      <div className="mt-6 flex flex-col gap-2.5">
        {atendimentos.map((atendimento) => (
          <details
            key={atendimento.instagramScopedId}
            className="rounded-2xl border border-white/8 bg-ink-900"
          >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-neutral-100">
                  {atendimento.clienteNome}
                  {atendimento.clienteUsername && (
                    <span className="text-neutral-500"> @{atendimento.clienteUsername}</span>
                  )}
                </p>
                <p className="mt-0.5 text-[11.5px] text-neutral-500">
                  Último contato em {formatarDataHora(atendimento.ultimaMensagemEm)}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/8 px-2.5 py-1 text-[10.5px] font-semibold text-neutral-300">
                {atendimento.totalMensagens} mensagem{atendimento.totalMensagens === 1 ? "" : "ns"}
              </span>
            </summary>

            <ul className="divide-y divide-white/8 border-t border-white/8">
              {atendimento.mensagens.map((m, indice) => (
                <li key={indice} className="flex flex-col gap-0.5 px-4 py-2.5 text-xs">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span
                      className={
                        m.direcao === "recebida"
                          ? "font-semibold text-neutral-300"
                          : "font-semibold text-accent-strong"
                      }
                    >
                      {m.direcao === "recebida" ? "Cliente" : "Atendimento"}
                      {m.lojaNome && <span className="text-neutral-500"> · {m.lojaNome}</span>}
                    </span>
                    <span className="shrink-0 text-neutral-500">{m.dataHora}</span>
                  </div>
                  <p className="text-neutral-400">{m.texto}</p>
                </li>
              ))}
            </ul>
          </details>
        ))}

        {atendimentos.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-neutral-400">
            Nenhum atendimento registrado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
