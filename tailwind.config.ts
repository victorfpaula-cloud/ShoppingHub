import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Sem isso, "/8", "/12" e "/14" (usados o app inteiro pra bordas e fundos bem sutis, tipo
      // border-white/8) não geravam NENHUM CSS — o Tailwind só aceita opacidade "/N" se N estiver
      // nessa escala (por padrão só tem 0,5,10,15,20,25,30,40,50,60,70,75,80,90,95,100). Sem a cor
      // aplicada, a borda caía no padrão do navegador (branco, puxando a cor do texto) — foi o que
      // deixou tudo com contorno branco duro e sem nenhum preenchimento (relatado em 06/09/2026).
      opacity: {
        8: "0.08",
        12: "0.12",
        14: "0.14",
      },
      colors: {
        // Paleta do redesign (aprovada em 05/09/2026) — ink substitui os tons neutral-9xx usados
        // antes, accent substitui indigo/sky como cor de marca. Usar com opacidade via "/" do
        // Tailwind (ex: bg-accent/10, border-white/8) em vez de criar uma variante "-soft" pra
        // cada cor.
        ink: {
          950: "#07080a",
          900: "#111318",
          850: "#15171d",
          800: "#0a0b0f",
        },
        accent: {
          DEFAULT: "#7c6ef2",
          strong: "#9c90ff",
        },
        warn: "#fbbf24",
        danger: "#f87171",
        ok: "#34d399",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"],
      },
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.85)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "sh-barra": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.45s ease-out",
        "sh-barra": "sh-barra 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
