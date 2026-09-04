export const metadata = {
  title: "Política de Privacidade — ShoppingHub",
};

export default function PoliticaDePrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-neutral-200">
      <h1 className="text-2xl font-semibold text-neutral-50">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-neutral-400">Última atualização: setembro de 2026.</p>

      <p className="mt-6 text-sm leading-relaxed text-neutral-300">
        O ShoppingHub é um sistema de atendimento automatizado via Instagram Direct, operado por{" "}
        <strong className="text-neutral-100">
          53.195.119 VICTOR FELIPPE DE PAULA (CNPJ 53.195.119/0001-23)
        </strong>
        , usado por administradoras de shopping centers para responder clientes automaticamente e
        republicar menções de Stories de lojistas parceiros. Esta política explica quais dados
        tratamos, para quê, e quais direitos você tem sobre eles, conforme a Lei Geral de Proteção
        de Dados (LGPD — Lei nº 13.709/2018).
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">1. Quem trata seus dados</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        Cada shopping que usa o ShoppingHub é responsável pelo atendimento da própria conta do
        Instagram. O ShoppingHub fornece a tecnologia (o software) que processa as mensagens em
        nome do shopping contratante.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">2. Quais dados coletamos</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-300">
        <li>
          <strong className="text-neutral-100">De clientes que mandam Direct:</strong> nome
          público, @usuário do Instagram, e o conteúdo das mensagens trocadas com a conta do
          shopping.
        </li>
        <li>
          <strong className="text-neutral-100">De lojistas que marcam o shopping em Stories:</strong>{" "}
          @usuário do Instagram e a mídia (foto ou vídeo) do Story marcado, temporariamente.
        </li>
        <li>
          <strong className="text-neutral-100">Do painel administrativo:</strong> e-mail de login
          dos administradores do shopping (autenticação via Supabase Auth).
        </li>
      </ul>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        Não coletamos dados de pagamento, localização precisa, nem categorias sensíveis de dados
        (saúde, origem racial, orientação sexual, etc.).
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">3. Para que usamos esses dados</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-300">
        <li>Identificar qual loja do shopping o cliente está procurando e gerar uma resposta automática relevante.</li>
        <li>Republicar, como Story oficial do shopping, a marcação de um lojista autorizado.</li>
        <li>Gerar relatórios internos de atendimento para o shopping contratante.</li>
        <li>Impedir abuso (ex: limite diário de menções por loja).</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">4. Com quem compartilhamos</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        Usamos a API oficial da Meta (Instagram/Facebook) para receber e enviar mensagens, o
        Google Gemini para interpretar o texto das mensagens e gerar as respostas, e a Supabase
        para armazenar os dados de forma segura. Não vendemos nem compartilhamos dados com
        anunciantes ou corretores de dados.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">5. Por quanto tempo guardamos</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        O histórico de mensagens é apagado automaticamente depois de 60 dias. A mídia de uma
        menção de Story é apagada assim que a Story é republicada com sucesso. Mais detalhes na{" "}
        <a href="/exclusao-de-dados" className="text-sky-400 underline">
          página de exclusão de dados
        </a>
        .
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">6. Seus direitos (LGPD)</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        Você pode pedir a confirmação, o acesso, a correção ou a exclusão antecipada dos seus
        dados a qualquer momento, entrando em contato pelo e-mail abaixo. Atendemos o pedido em
        até 15 dias úteis.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">7. Segurança</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        Os dados ficam em um banco de dados com controle de acesso restrito, acessível só pelos
        sistemas internos do ShoppingHub — nenhuma tabela é exposta publicamente.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">8. Crianças e adolescentes</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        O ShoppingHub não é direcionado a menores de 13 anos e não coleta dados intencionalmente
        de crianças.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">9. Mudanças nesta política</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        Podemos atualizar esta política de tempos em tempos. A data no topo da página sempre
        mostra a versão mais recente.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-50">10. Contato</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        Dúvidas sobre privacidade ou pedidos relacionados aos seus dados:{" "}
        <a href="mailto:victorfpaula@gmail.com" className="text-sky-400 underline">
          victorfpaula@gmail.com
        </a>
        .
      </p>
    </main>
  );
}
