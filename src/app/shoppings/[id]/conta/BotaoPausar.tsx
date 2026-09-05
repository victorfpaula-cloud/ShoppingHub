"use client";

// Botão de Pausar/Reativar da conta. Precisa ser um componente separado com "use client" porque a
// página que o usa é um componente de servidor (busca dado no banco antes de renderizar) e só
// componente de cliente pode ter onClick/confirm do navegador.
//
// A popup de confirmação (window.confirm) só aparece quando o clique é pra PAUSAR — reativar não
// tem risco de "deixar o cliente sem atendimento", então não precisa confirmar. Se o usuário
// cancelar a popup, o clique não confirma, então o preventDefault() impede o formulário de ser
// enviado — nenhuma requisição chega a sair.
export function BotaoPausar({ ativo }: { ativo: boolean }) {
  return (
    <button
      type="submit"
      onClick={(evento) => {
        if (ativo) {
          const confirmou = window.confirm(
            "Tem certeza que deseja pausar essa conta? O bot vai parar de responder no Direct até você reativar."
          );
          if (!confirmou) {
            evento.preventDefault();
          }
        }
      }}
      className="w-full rounded-[9px] border border-white/14 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5"
    >
      {ativo ? "Pausar" : "Reativar"}
    </button>
  );
}
