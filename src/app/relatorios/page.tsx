import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BotaoImprimir } from "./BotaoImprimir";

export const dynamic = "force-dynamic";

type MensagemDaLoja = {
  clienteNome: string;
  clienteUsername: string | null;
  dataHora: string;
  texto: string;
};

type LojaDoRelatorio = {
  nome: string;
  quantidade: number;
  mensagens: MensagemDaLoja[];
};

type DadosDoRelatorio = {
  totalRecebidas: number;
  totalRespondidas: number;
  clientesUnicos: number;
  porLoja: LojaDoRelatorio[];
};

function mesAtualISO(): string {
  const agora = new Date();
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
}

function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, mesNumero] = mes.split("-").map((v) => parseInt(v, 10));
  const inicio = new Date(Date.UTC(ano, mesNumero - 1, 1));
  const fim = new Date(Date.UTC(ano, mesNumero, 1));
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

function nomeDoMes(mes: string): string {
  const [ano, mesNumero] = mes.split("-").map((v) => parseInt(v, 10));
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, mesNumero - 1, 1))
  );
}

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Resumo do assunto: em vez de gastar mais uma chamada de IA só pra gerar uma palavra-chave, usa
// um recorte do começo da própria mensagem — dá uma ideia do assunto sem custo nem espera extra.
function resumirAssunto(texto: string): string {
  const limite = 60;
  return texto.length > limite ? `${texto.slice(0, limite).trim()}…` : texto;
}

async function buscarDadosDoRelatorio(
  admin: ReturnType<typeof criarClienteAdmin>,
  shoppingId: string,
  mes: string
): Promise<DadosDoRelatorio> {
  const { inicio, fim } = limitesDoMes(mes);

  const { data: contas } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", shoppingId);

  const contaIds = (contas ?? []).map((c) => c.id);

  if (contaIds.length === 0) {
    return { totalRecebidas: 0, totalRespondidas: 0, clientesUnicos: 0, porLoja: [] };
  }

  const { data: mensagens } = await admin
    .from("shoppinghub_mensagens")
    .select("direcao, instagram_scoped_id, loja_id, cliente_nome, cliente_username, texto, created_at")
    .in("conta_id", contaIds)
    .gte("created_at", inicio)
    .lt("created_at", fim)
    .order("created_at", { ascending: true });

  const recebidas = (mensagens ?? []).filter((m) => m.direcao === "recebida");
  const respondidas = (mensagens ?? []).filter((m) => m.direcao === "enviada");
  const clientesUnicos = new Set(recebidas.map((m) => m.instagram_scoped_id)).size;

  // Agrupa as mensagens RECEBIDAS (já com a loja que o roteamento decidiu pra cada uma) — é isso
  // que mostra quem procurou cada loja, e quando.
  const mensagensPorLoja = new Map<string, MensagemDaLoja[]>();
  for (const m of recebidas) {
    if (!m.loja_id) continue;
    const lista = mensagensPorLoja.get(m.loja_id) ?? [];
    lista.push({
      clienteNome: m.cliente_nome ?? "Cliente",
      clienteUsername: m.cliente_username,
      dataHora: formatarDataHora(m.created_at),
      texto: resumirAssunto(m.texto),
    });
    mensagensPorLoja.set(m.loja_id, lista);
  }

  const lojaIds = Array.from(mensagensPorLoja.keys());
  const { data: lojas } =
    lojaIds.length > 0
      ? await admin.from("shoppinghub_lojas").select("id, nome").in("id", lojaIds)
      : { data: [] as { id: string; nome: string }[] };

  const porLoja = (lojas ?? [])
    .map((l) => {
      const mensagensDaLoja = mensagensPorLoja.get(l.id) ?? [];
      return { nome: l.nome, quantidade: mensagensDaLoja.length, mensagens: mensagensDaLoja };
    })
    .sort((a, b) => b.quantidade - a.quantidade);

  return {
    totalRecebidas: recebidas.length,
    totalRespondidas: respondidas.length,
    clientesUnicos,
    porLoja,
  };
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { shopping_id?: string; mes?: string };
}) {
  const admin = criarClienteAdmin();

  const { data: shoppings } = await admin
    .from("shoppinghub_shoppings")
    .select("id, nome")
    .order("nome", { ascending: true });

  const shoppingId = searchParams.shopping_id;
  const mes = searchParams.mes ?? mesAtualISO();

  const shoppingEscolhido = (shoppings ?? []).find((s) => s.id === shoppingId) ?? null;

  const dados = shoppingEscolhido
    ? await buscarDadosDoRelatorio(admin, shoppingEscolhido.id, mes)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 print:text-black">
      <a
        href="/shoppings"
        className="text-sm text-neutral-400 hover:text-neutral-300 print:hidden"
      >
        &larr; Voltar pros shoppings
      </a>

      <h1 className="mt-4 text-2xl font-semibold print:text-black">Relatório de atendimentos</h1>
      <p className="mt-1 text-sm text-neutral-400 print:hidden">
        Uso interno — escolhe o shopping e o mês, e exporta em PDF pra enviar mensalmente.
      </p>

      <form method="GET" className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="text-xs text-neutral-400">Shopping</label>
          <select
            name="shopping_id"
            defaultValue={shoppingId ?? ""}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          >
            <option value="">Escolha um shopping</option>
            {(shoppings ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-neutral-400">Mês</label>
          <input
            type="month"
            name="mes"
            defaultValue={mes}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Filtrar
        </button>

        {dados && <BotaoImprimir />}
      </form>

      {!shoppingEscolhido && (
        <p className="mt-8 text-sm text-neutral-500 print:hidden">
          Escolhe um shopping acima pra ver o relatório.
        </p>
      )}

      {shoppingEscolhido && dados && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold capitalize print:text-black">
            {shoppingEscolhido.nome} — {nomeDoMes(mes)}
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 print:border-neutral-300 print:bg-white">
              <p className="text-xs text-neutral-400 print:text-neutral-600">Mensagens recebidas</p>
              <p className="mt-1 text-2xl font-semibold print:text-black">{dados.totalRecebidas}</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 print:border-neutral-300 print:bg-white">
              <p className="text-xs text-neutral-400 print:text-neutral-600">Mensagens respondidas</p>
              <p className="mt-1 text-2xl font-semibold print:text-black">{dados.totalRespondidas}</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 print:border-neutral-300 print:bg-white">
              <p className="text-xs text-neutral-400 print:text-neutral-600">Clientes únicos atendidos</p>
              <p className="mt-1 text-2xl font-semibold print:text-black">{dados.clientesUnicos}</p>
            </div>
          </div>

          <h3 className="mt-8 text-sm font-semibold text-neutral-300 print:text-black">
            Atendimentos por loja
          </h3>

          {dados.porLoja.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 print:text-neutral-600">
              Nenhuma mensagem respondida nesse mês.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {dados.porLoja.map((loja) => (
                <div
                  key={loja.nome}
                  className="rounded-xl border border-neutral-800 print:border-neutral-300"
                >
                  <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2 print:border-neutral-300 print:bg-neutral-100">
                    <p className="font-semibold text-neutral-100 print:text-black">{loja.nome}</p>
                    <p className="text-xs text-neutral-400 print:text-neutral-600">
                      {loja.quantidade} mensagem{loja.quantidade === 1 ? "" : "ns"}
                    </p>
                  </div>

                  <ul className="divide-y divide-neutral-800 print:divide-neutral-200">
                    {loja.mensagens.map((m, indice) => (
                      <li
                        key={indice}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2 text-xs"
                      >
                        <span className="text-neutral-300 print:text-black">
                          {m.clienteNome}
                          {m.clienteUsername && (
                            <span className="text-neutral-500 print:text-neutral-600">
                              {" "}
                              @{m.clienteUsername}
                            </span>
                          )}
                          <span className="text-neutral-500 print:text-neutral-600"> — {m.texto}</span>
                        </span>
                        <span className="shrink-0 text-neutral-500 print:text-neutral-600">
                          {m.dataHora}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
