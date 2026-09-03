/** @type {import('next').NextConfig} */
const nextConfig = {
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
