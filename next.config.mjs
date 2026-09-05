/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // O rastreador de arquivos do Next não detecta sozinho o binário do ffmpeg-static (o caminho
    // dele é montado em tempo de execução a partir de um valor lido do package.json, não uma
    // string literal — o rastreamento estático não enxerga isso). Sem essa inclusão explícita, o
    // binário fica de fora do pacote da function na Vercel e o comprimirVideo() quebra em
    // produção. Só nas duas rotas que processam menção de Story recebida (onde o vídeo é
    // comprimido) — ver src/lib/comprimirVideo.ts.
    outputFileTracingIncludes: {
      "/api/webhook/instagram": ["./node_modules/ffmpeg-static/**"],
      "/api/bridge/sendpulse/webhook": ["./node_modules/ffmpeg-static/**"],
      "/api/manutencao/recomprimir-videos": ["./node_modules/ffmpeg-static/**"],
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
