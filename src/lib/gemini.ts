// Chamada à API do Gemini (Google) pra gerar a resposta do atendimento virtual.
// O nome do modelo é configurável via variável de ambiente (GEMINI_MODEL) — se o nome padrão
// abaixo não existir mais na sua conta do Google AI Studio, dá pra trocar sem precisar mexer
// em código, só ajustando essa variável na Vercel.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

export async function gerarRespostaComGemini(
  promptDoSistema: string,
  mensagemDoCliente: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY não está definida nas variáveis de ambiente.");
    return null;
  }

  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: promptDoSistema }] },
        contents: [{ role: "user", parts: [{ text: mensagemDoCliente }] }],
      }),
      cache: "no-store",
    }
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => "");
    console.error(`Falha ao chamar o Gemini (status ${resposta.status}):`, corpoErro);
    return null;
  }

  const dados = await resposta.json();
  const texto = dados?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof texto === "string" ? texto.trim() : null;
}
