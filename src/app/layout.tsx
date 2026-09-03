import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShoppingHub",
  description: "Atendimento virtual de shopping centers via Instagram Direct",
};

// Cor de fundo repetida como estilo INLINE (não só como classe do Tailwind) tanto no <html>
// quanto no <body> — inline aplica na hora, antes até da folha de estilo terminar de carregar.
// Sem isso, sobrava um instante de tela branca entre abrir o app e a splash aparecer, porque o
// navegador pinta a página em branco por padrão até o CSS externo chegar.
const CorDeFundo = "#171717"; // mesmo tom do bg-neutral-900 do Tailwind

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" style={{ backgroundColor: CorDeFundo }}>
      <head>
        <meta name="theme-color" content={CorDeFundo} />
        {/*
          Sem isso, quando o app é adicionado à tela inicial do iPhone ("web app"), o iOS mostra
          uma tela de abertura EM BRANCO por padrão, antes mesmo da nossa página começar a
          carregar — é uma etapa própria do sistema, diferente da splash que a gente desenha (essa
          aqui embaixo, com a logo girando). O manifesto avisa o iOS pra usar essa mesma cor de
          fundo escura nessa tela nativa, em vez de branco.
        */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ShoppingHub" />
      </head>
      <body
        className="bg-neutral-900 text-neutral-100 antialiased"
        style={{ backgroundColor: CorDeFundo }}
      >
        {/*
          Tela de abertura com o logo — aparece SÓ na primeira vez que o site é aberto numa aba
          (guardado em sessionStorage, então some sozinha e não volta a aparecer enquanto você
          navega entre as páginas na mesma aba). Nas trocas de página depois disso, quem aparece é
          só a barrinha fina de carregamento (`src/app/loading.tsx`), bem mais discreta.
        */}
        <div
          id="sh-splash"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950 opacity-100 transition-opacity duration-500"
        >
          <div className="relative flex h-32 w-32 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-neutral-800 border-t-neutral-300" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-shoppinghub.png"
              alt="ShoppingHub"
              className="h-24 w-24 animate-pop-in object-contain"
            />
          </div>
        </div>
        <script
          // Roda assim que o navegador lê essa tag, antes do resto da página aparecer. Se já
          // existe a marca de "já abriu" nessa aba (sessionStorage — dura enquanto a aba estiver
          // aberta, some se fechar e abrir de novo), esconde a tela de abertura na hora. Se não
          // existe ainda, deixa aparecer por um instante e depois esconde sozinha com uma
          // transição suave.
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var el = document.getElementById("sh-splash");
                  if (!el) return;
                  var jaAbriu = sessionStorage.getItem("sh_ja_abriu");
                  if (jaAbriu) {
                    el.style.display = "none";
                    return;
                  }
                  sessionStorage.setItem("sh_ja_abriu", "1");
                  setTimeout(function () {
                    el.style.opacity = "0";
                    el.style.pointerEvents = "none";
                    setTimeout(function () {
                      el.style.display = "none";
                    }, 500);
                  }, 700);
                } catch (e) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
