# ShoppingHub

Atendimento virtual de shopping centers via Instagram Direct — o cliente manda mensagem, uma
camada de IA identifica qual loja é responsável e responde usando só a base de conhecimento
daquela loja. Projeto irmão do [DirectGov](https://github.com/victorfpaula-cloud/Directgov) (a
mesma ideia aplicada a prefeituras) e do Chatbot Direct, totalmente separado (código, deploy, App
da Meta), mas reaproveitando o **mesmo projeto Supabase** (tabelas com prefixo `shoppinghub_`, sem
tocar nas tabelas dos outros produtos que já rodam nele).

Stack: Next.js 14 (App Router, TypeScript) + Tailwind + Supabase (Postgres) + Meta Graph API
(Instagram messaging) + Gemini (atendimento por IA).

## O diferencial: identificar a loja pela menção em Story

Lojistas marcam (@mencionam) a conta do shopping nos Stories deles várias vezes ao dia. O shopping
reposta essas marcações no story oficial dele, e quando um cliente responde perguntando "quanto
custa isso?", o sistema precisa saber **de qual loja** veio aquele story pra responder com a base
de conhecimento certa — sem isso, é impossível saber pra qual loja rotear a pergunta.

Fluxo:

1. Lojista marca o shopping no story dele → chega webhook `story_mention` (o mesmo
   `entry.messaging` do Direct, com `message.attachments[].type === "story_mention"`).
2. Resolve o `sender.id` pro @usuário do Instagram e bate contra a lista de lojas cadastradas
   (@usuário autorizado por loja). Não bateu → descarta.
3. Bateu → confere o limite diário de menções da loja (reset à meia-noite, horário de Brasília).
   Estourou → descarta. Dentro do limite → baixa o arquivo do story e entra na fila (`pendente`).
4. Duas vezes por dia (cron da Vercel, 12h e 18h em Brasília), um endpoint publica cada menção
   pendente como Story do shopping (Content Publishing API) e grava o `story_media_id` retornado.
5. Cliente responde aquele story reposted → o webhook recebe `message.reply_to.story.id`, bate
   contra `story_media_id` da fila e acha a loja **com certeza, sem IA adivinhando nada**.
6. Só então entra o Gemini: responde a pergunta do cliente usando a base de conhecimento daquela
   loja específica.

Sem botão de aprovação manual — uma vez que a marcação passa pelo filtro de @usuário autorizado +
limite diário, ela publica sozinha no cron.

> ⚠️ O formato do evento `story_mention` foi confirmado via documentação de produto de terceiros
> (ManyChat/SendPulse), não lendo a documentação primária da Meta linha a linha. Vale validar
> contra uma conta de teste real antes de confiar 100% no formato em produção.

## Como funciona (visão geral)

- Cada **shopping** é um ambiente isolado, com sua própria conta do Instagram conectada e suas
  próprias lojas — nada cruza entre shoppings diferentes.
- Todo shopping nasce com uma loja **"Geral"** (fallback, trigger no banco — ver
  `supabase/schema.sql`) pra pergunta genérica do shopping (horário, estacionamento etc.).
  Diferente do DirectGov, não existe lista fechada de categorias: cada shopping cadastra as
  próprias lojas do zero, com @usuário autorizado do Instagram e limite diário de menções.
- Mensagem de texto normal (não vinda de reply a story) passa por uma triagem por IA que decide
  qual loja deve responder; mensagem em resposta a um story reposted é roteada de forma
  determinística (passo 5 acima).

## Banco de dados

O schema está em `supabase/schema.sql` — roda no SQL Editor do mesmo projeto Supabase que já
hospeda o DirectGov, o agendador-stories e o Chatbot Direct. Todas as tabelas usam o prefixo
`shoppinghub_` e RLS ativado sem policies públicas (leitura/escrita só via rotas server-side com a
chave de service role).

## Como rodar (visão geral, não precisa fazer isso localmente)

1. `npm install`
2. Copiar `.env.example` para `.env.local` e preencher com os valores reais (Supabase, Meta,
   Gemini, `CRON_SECRET`) — nunca commitar o `.env.local`.
3. `npm run dev`

Na Vercel, as mesmas variáveis de ambiente vão em Project Settings → Environment Variables. O
cron (`vercel.json`) roda automaticamente às 15h e 21h UTC (12h e 18h em Brasília).
