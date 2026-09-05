import { criarClienteAdmin } from "@/lib/supabase/admin";
import { inicioDoDiaBrasiliaISO } from "@/lib/mencoes";

export const dynamic = "force-dynamic";

function BarraDeProgressoDoDia({
  rotulo,
  valor,
  corBarra,
  larguraPercentual,
}: {
  rotulo: string;
  valor: number;
  corBarra: string;
  larguraPercentual: number;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-neutral-400">{rotulo}</p>
        <p className="text-lg font-semibold text-neutral-100">{valor}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ${corBarra}`}
          style={{ width: `${larguraPercentual}%` }}
        />
      </div>
    </div>
  );
}

export default async function LojasDoShoppingPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = criarClienteAdmin();

  const { data: lojas } = await admin
    .from("shoppinghub_lojas")
    .select(
      "id, nome, eh_geral, ativo, instagram_username, instagram_username_2, base_conhecimento_texto"
    )
    .eq("shopping_id", params.id)
    .order("ordem", { ascending: true });

  const idsDasLojas = (lojas ?? []).map((l) => l.id);
  const inicioHoje = inicioDoDiaBrasiliaISO();

  // "Hoje" reseta sozinho à meia-noite (horário de Brasília) — não precisa de nenhuma rotina de
  // limpeza, é só filtrar pela data em cada consulta.
  const { data: mencoesMarcadasHoje } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("loja_id")
          .in("loja_id", idsDasLojas)
          .gte("recebido_em", inicioHoje)
      : { data: [] as { loja_id: string }[] };

  const { count: publicadosHoje } =
    idsDasLojas.length > 0
      ? await admin
          .from("shoppinghub_mencoes")
          .select("id", { count: "exact", head: true })
          .in("loja_id", idsDasLojas)
          .eq("status", "publicado")
          .gte("publicado_em", inicioHoje)
      : { count: 0 };

  const marcadosHojePorLoja = new Map<string, number>();
  for (const m of mencoesMarcadasHoje ?? []) {
    marcadosHojePorLoja.set(m.loja_id, (marcadosHojePorLoja.get(m.loja_id) ?? 0) + 1);
  }

  const totalMarcadosHoje = (mencoesMarcadasHoje ?? []).length;
  const totalPublicadosHoje = publicadosHoje ?? 0;
  const maiorValorDoDia = Math.max(totalMarcadosHoje, totalPublicadosHoje, 1);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Lojas</h2>
        <a
          href={`/shoppings/${params.id}/lojas/novo`}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-950"
        >
          + Nova loja
        </a>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:flex-row sm:gap-6">
        <BarraDeProgressoDoDia
          rotulo="Stories marcados hoje"
          valor={totalMarcadosHoje}
          corBarra="bg-sky-500"
          larguraPercentual={Math.max(4, (totalMarcadosHoje / maiorValorDoDia) * 100)}
        />
        <BarraDeProgressoDoDia
          rotulo="Stories publicados hoje"
          valor={totalPublicadosHoje}
          corBarra="bg-green-500"
          larguraPercentual={Math.max(4, (totalPublicadosHoje / maiorValorDoDia) * 100)}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(lojas ?? []).map((loja) => {
          const marcadosHoje = marcadosHojePorLoja.get(loja.id) ?? 0;

          return (
            <a
              key={loja.id}
              href={`/shoppings/${params.id}/lojas/${loja.id}`}
              className={`flex flex-col rounded-xl border bg-neutral-800 px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-lg ${
                loja.ativo ? "border-neutral-700" : "border-red-950/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="truncate">{loja.nome}</span>
                  {loja.eh_geral && (
                    <span className="shrink-0 rounded-full border border-sky-900 bg-sky-950 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                      Fallback
                    </span>
                  )}
                </span>

                {marcadosHoje > 0 && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-sky-600 to-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm shadow-sky-950">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                      <path d="M10 2a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H3a1 1 0 1 1 0-2h6V3a1 1 0 0 1 1-1Z" />
                    </svg>
                    {marcadosHoje} hoje
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    loja.ativo
                      ? "border-green-900 bg-green-950 text-green-300"
                      : "border-red-900 bg-red-950 text-red-400"
                  }`}
                >
                  {loja.ativo ? "Ativa" : "Inativa"}
                </span>
                <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-400">
                  {loja.instagram_username
                    ? [loja.instagram_username, loja.instagram_username_2]
                        .filter(Boolean)
                        .map((u) => `@${u}`)
                        .join(" / ")
                    : "Sem @usuário autorizado"}
                </span>
                <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-400">
                  {loja.base_conhecimento_texto?.trim()
                    ? "Com base de conhecimento"
                    : "Sem base de conhecimento ainda"}
                </span>
              </div>
            </a>
          );
        })}
      </div>

      {(lojas ?? []).length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-700 px-4 py-6 text-center text-sm text-neutral-400">
          Nenhuma loja cadastrada ainda.
        </p>
      )}
    </div>
  );
}
