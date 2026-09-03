import { redirect } from "next/navigation";

// Ninguém fica na tela inicial — ela só existe pra mandar direto pra lista de shoppings. Na
// primeira vez que o site é aberto numa aba, quem aparece por cima é a tela de abertura com o
// logo (`src/app/layout.tsx`); nas trocas de página depois disso, só a barrinha fina de
// carregamento (`src/app/loading.tsx`).
export default function Home() {
  redirect("/shoppings");
}
