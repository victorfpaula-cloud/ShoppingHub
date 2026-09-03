"use client";

// Exportar em PDF aqui é só usar a função de impressão do próprio navegador (Salvar como PDF) —
// sem precisar de nenhuma biblioteca ou serviço extra pra gerar o arquivo. O CSS de impressão
// (classes `print:hidden` nesta página) já esconde os filtros e esse botão na hora de imprimir,
// deixando só o relatório em si.
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:bg-neutral-950"
    >
      Imprimir / Exportar PDF
    </button>
  );
}
