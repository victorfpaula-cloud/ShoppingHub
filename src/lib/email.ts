// Sem SDK — só a REST API do Resend via fetch, pra não adicionar mais uma dependência só pra
// mandar um e-mail com anexos de vez em quando.
const RESEND_API_URL = "https://api.resend.com/emails";

// "onboarding@resend.dev" é o remetente de teste que o Resend libera pra QUALQUER conta, sem
// precisar verificar domínio — mas só entrega pro e-mail da própria conta cadastrada no Resend. Se
// um domínio verificado for configurado no Resend depois, é só preencher RESEND_FROM_EMAIL no .env.
const REMETENTE_PADRAO = "ShoppingHub <onboarding@resend.dev>";

export type AnexoDeEmail = {
  nomeArquivo: string;
  conteudo: string | Buffer;
};

/**
 * Manda um e-mail com anexos (PDF, CSV etc.) via Resend. Nunca lança erro — só registra no log e
 * devolve `false` — porque o ciclo automático (ver exportarRelatoriosDevidos em relatorios.ts) roda
 * dentro do cron de publicar-mencoes: uma falha de e-mail não pode derrubar a publicação de
 * Stories. O retorno booleano existe pra quem PRECISA saber se deu certo (o envio manual, que
 * mostra um aviso de sucesso/erro pro usuário).
 */
export async function enviarEmailComAnexos({
  destinatario,
  assunto,
  corpoHtml,
  anexos,
}: {
  destinatario: string;
  assunto: string;
  corpoHtml: string;
  anexos: AnexoDeEmail[];
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY não configurada — e-mail de relatório não enviado.");
    return false;
  }

  try {
    const resposta = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || REMETENTE_PADRAO,
        to: [destinatario],
        subject: assunto,
        html: corpoHtml,
        attachments: anexos.map((a) => ({
          filename: a.nomeArquivo,
          // Resend espera o conteúdo do anexo em base64, seja ele texto (CSV) ou binário (PDF).
          content: Buffer.isBuffer(a.conteudo)
            ? a.conteudo.toString("base64")
            : Buffer.from(a.conteudo, "utf-8").toString("base64"),
        })),
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      console.error(`Falha ao enviar e-mail via Resend (HTTP ${resposta.status}):`, corpo);
      return false;
    }

    return true;
  } catch (erro) {
    console.error("Falha ao chamar a API do Resend:", erro);
    return false;
  }
}
