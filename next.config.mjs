/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // O webpack do Next empacota o código do ffmpeg-static junto com a rota por padrão — isso
    // muda o __dirname que o pacote usa pra montar o caminho do próprio binário (passa a apontar
    // pra dentro de .next/server/chunks, onde o binário não existe, em vez de node_modules/
    // ffmpeg-static, onde ele realmente está). Marcando como "external" aqui, o Next deixa o
    // require("ffmpeg-static") intacto, resolvido de verdade em node_modules na hora que a
    // function roda — confirmado em produção em 05/09/2026 (erro "spawn .../chunks/ffmpeg ENOENT"
    // sem essa configuração).
    // O pdfkit tem exatamente o mesmo problema do ffmpeg-static: lê as métricas das fontes padrão
    // (Helvetica etc.) de arquivos .afm dentro do próprio pacote, usando um caminho montado a
    // partir do `__dirname` em tempo de execução — e o webpack do Next muda esse `__dirname` ao
    // empacotar o código junto com a rota (passa a apontar pra dentro de .next/server/chunks, onde
    // os .afm não existem). Confirmado em produção em 06/09/2026: erro "ENOENT .../chunks/data/
    // Helvetica.afm" ao gerar o PDF do relatório. Marcando como "external" aqui (igual já era feito
    // com o ffmpeg-static), o Next deixa o require("pdfkit") intacto, resolvido de verdade em
    // node_modules na hora que a function roda.
    serverComponentsExternalPackages: ["ffmpeg-static", "pdfkit"],
    // O rastreador de arquivos do Next não detecta sozinho o binário do ffmpeg-static (o caminho
    // dele é montado em tempo de execução a partir de um valor lido do package.json, não uma
    // string literal — o rastreamento estático não enxerga isso). Sem essa inclusão explícita, o
    // binário fica de fora do pacote da function na Vercel e o comprimirVideo() quebra em
    // produção. Só nas duas rotas que processam menção de Story recebida (onde o vídeo é
    // comprimido) — ver src/lib/comprimirVideo.ts.
    // Os .afm do pdfkit citados acima — mantido como reforço mesmo com o "external", nas duas
    // rotas que geram PDF de relatório (ver src/lib/pdfRelatorio.ts): o envio manual e o cron que
    // faz o ciclo automático de 30 dias.
    outputFileTracingIncludes: {
      "/api/webhook/instagram": ["./node_modules/ffmpeg-static/**"],
      "/api/bridge/sendpulse/webhook": ["./node_modules/ffmpeg-static/**"],
      "/api/manutencao/recomprimir-videos": ["./node_modules/ffmpeg-static/**"],
      "/api/shoppings/[id]/relatorios/enviar-email": ["./node_modules/pdfkit/js/data/**"],
      "/api/cron/publicar-mencoes": ["./node_modules/pdfkit/js/data/**"],
    },
  },
  async headers() {
    return [
      {
        // Todas as páginas do app (não os arquivos estáticos do _next nem os ícones, que já têm
        // cache seguro por serem versionados a cada deploy) — força o navegador, principalmente o
        // Safari no iPhone/iPad, a sempre buscar a versão mais nova em vez de reaproveitar uma
        // tela antiga guardada no cache.
        source: "/((?!_next/static|_next/image|icon.png|apple-icon.png).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
