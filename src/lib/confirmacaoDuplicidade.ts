function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Página de confirmação simples pra avisar de uma possível loja duplicada (mesmo nome ou mesmo
 * @usuário já cadastrado nesse shopping) antes de criar/salvar de verdade. Não passa pelo layout
 * React do painel (é devolvida direto pela rota da API), então vem com seu próprio HTML e CSS
 * mínimo — reenvia o formulário ORIGINAL inteiro (todos os campos, como campos ocultos) de volta
 * pro mesmo endpoint, com `confirmar=1` a mais, caso o usuário confirme que quer mesmo assim.
 */
export function paginaDeConfirmacaoDuplicidade(
  formData: FormData,
  actionUrl: string,
  avisos: string[],
  linkVoltar: string,
  textoBotaoConfirmar: string
): string {
  const camposOcultos = Array.from(formData.entries())
    .filter(([chave]) => chave !== "confirmar")
    .map(
      ([chave, valor]) =>
        `<input type="hidden" name="${escapeHtml(chave)}" value="${escapeHtml(String(valor))}">`
    )
    .join("\n      ");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Confirmar cadastro</title>
<style>
  body { background:#0a0a0a; color:#e5e5e5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; }
  .caixa { max-width: 440px; width:100%; background:#171717; border:1px solid #404040; border-radius:16px; padding:24px; }
  h1 { font-size:15px; margin:0 0 14px 0; color:#fbbf24; }
  p { font-size:13.5px; line-height:1.55; color:#d4d4d4; margin: 0 0 8px 0; }
  .botoes { display:flex; gap:10px; margin-top:20px; }
  button, a.cancelar { flex:1; padding:10px; border-radius:10px; font-size:13px; text-align:center; }
  button { border:1px solid #f59e0b; background:#262626; color:#fbbf24; cursor:pointer; }
  a.cancelar { border:1px solid #525252; background:#171717; color:#a3a3a3; text-decoration:none; }
</style>
</head>
<body>
  <div class="caixa">
    <h1>Possível duplicidade</h1>
    ${avisos.map((aviso) => `<p>${escapeHtml(aviso)}</p>`).join("\n    ")}
    <form method="POST" action="${escapeHtml(actionUrl)}">
      ${camposOcultos}
      <input type="hidden" name="confirmar" value="1">
      <div class="botoes">
        <a class="cancelar" href="${escapeHtml(linkVoltar)}">Cancelar</a>
        <button type="submit">${escapeHtml(textoBotaoConfirmar)}</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}
