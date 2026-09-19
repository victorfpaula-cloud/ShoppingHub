// Constantes e funções puras compartilhadas por menções de Story — mantidas SEM nenhuma
// dependência pesada (sharp, opentype.js, ffmpeg-static) de propósito. A Vercel empacota cada
// function/página separadamente, então um arquivo leve importado por uma rota que só precisa de
// um valor ou de uma conta de data (ex.: excluir uma menção, montar a URL pública de uma
// miniatura, contar quantas menções entraram hoje) evita carregar à toa o binário nativo do sharp
// no pacote dessa function — antes disso, essas rotas/páginas importavam esses valores direto de
// mencoes.ts, que puxa sharp mesmo sem usá-lo (achado ao investigar o consumo de "Functions
// storage" da Vercel em 19/09/2026).

// Bucket público do Supabase Storage onde ficam guardadas as mídias baixadas de menções de Story
// — precisa ser público porque a API de publicação de Stories da Meta exige uma `image_url`/
// `video_url` acessível publicamente (não aceita link autenticado nem upload direto de arquivo).
export const BUCKET_MENCOES = "shoppinghub-mencoes";

export function tipoDeMidiaPorContentType(contentType: string): "IMAGE" | "VIDEO" {
  return contentType.includes("video") ? "VIDEO" : "IMAGE";
}

/**
 * Meia-noite de "hoje" no horário de Brasília (UTC-3, sem horário de verão hoje em dia — fixo o
 * ano todo), devolvida como instante UTC. Usada pra resetar a contagem diária de menções de cada
 * loja: uma menção conta pro dia se `recebido_em >= inicioDoDiaBrasiliaISO()`.
 */
export function inicioDoDiaBrasiliaISO(agora: Date = new Date()): string {
  const OFFSET_BRASILIA_HORAS = 3;
  const agoraEmBrasilia = new Date(agora.getTime() - OFFSET_BRASILIA_HORAS * 60 * 60 * 1000);

  const meiaNoiteEmBrasilia = Date.UTC(
    agoraEmBrasilia.getUTCFullYear(),
    agoraEmBrasilia.getUTCMonth(),
    agoraEmBrasilia.getUTCDate(),
    0,
    0,
    0
  );

  return new Date(meiaNoiteEmBrasilia + OFFSET_BRASILIA_HORAS * 60 * 60 * 1000).toISOString();
}

// Fração da altura onde fica o CENTRO do selo queimado E da marcação nativa (user_tags, ver
// metaMessaging.ts) — os dois usam o MESMO valor de propósito, pra ficarem alinhados: o selo é só
// um desenho, não é clicável sozinho, então ele precisa marcar visualmente o lugar EXATO onde a
// marcação de verdade responde ao toque (senão vira um botão "mudo" que parece real, mas não é —
// visto na prática em 06/09/2026, quando os dois ficaram temporariamente em posições diferentes).
//
// Não pode ficar muito perto do rodapé (~0.92, testado em 04/09/2026): a barra de "responder" que
// o próprio Instagram desenha por cima da Story intercepta o toque nessa faixa inferior (~13% de
// baixo). 0.80 fica dentro da área segura (a Meta recomenda evitar os ~13% de cima e de baixo da
// tela pra qualquer elemento interativo) — o topo tem essa mesma faixa reservada pro cabeçalho da
// própria Story (foto de perfil, nome da conta, horário, menu, botão de fechar), então mover pra
// lá teria o mesmo problema, só que no sentido inverso.
//
// Mora aqui (não em creditoNaImagem.ts) só pra metaMessaging.ts poder usar o mesmo valor sem
// precisar importar sharp/opentype.js à toa — esse arquivo não processa nenhuma imagem de
// verdade, só manda a marcação (user_tags) pra Meta.
export const POSICAO_Y_TAG_NATIVA = 0.8;
