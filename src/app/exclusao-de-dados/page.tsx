export const metadata = {
  title: "Exclusão de dados — ShoppingHub",
};

export default function ExclusaoDeDadosPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-neutral-200">
      <h1 className="text-2xl font-semibold text-neutral-50">Instruções para exclusão de dados</h1>
      <p className="mt-2 text-sm text-neutral-400">Última atualização: setembro de 2026.</p>

      <p className="mt-6 text-sm leading-relaxed text-neutral-300">
        O ShoppingHub é um sistema de atendimento automatizado via Instagram Direct usado por
        shoppings para responder clientes e republicar menções de Stories de lojistas parceiros.
        Esta página explica quais dados guardamos e como pedir a exclusão deles.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">Quais dados guardamos</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-300">
        <li>
          Mensagens trocadas por Direct entre um cliente e a conta do Instagram de um shopping
          parceiro (texto, nome e @usuário público do cliente), usadas só para gerar a resposta
          automática e para relatório de atendimento.
        </li>
        <li>
          Menções de Stories feitas por lojistas autorizados (a mídia da Story, temporariamente,
          até ser republicada — depois é apagada automaticamente).
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">Exclusão automática</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        O histórico de mensagens é apagado automaticamente depois de 60 dias — não fica guardado
        indefinidamente. A mídia de uma menção de Story é apagada assim que a Story é republicada
        com sucesso.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">Pedir exclusão antes do prazo</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        Se você trocou mensagens com um shopping parceiro pelo Instagram e quer que os dados sejam
        apagados antes do prazo automático de 60 dias, mande um e-mail para{" "}
        <a href="mailto:victorfpaula@gmail.com" className="text-sky-400 underline">
          victorfpaula@gmail.com
        </a>{" "}
        informando o @usuário do Instagram usado na conversa e o nome do shopping. Atendemos o
        pedido em até 15 dias úteis e confirmamos por e-mail quando a exclusão for concluída.
      </p>
    </main>
  );
}
