"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro("E-mail ou senha incorretos.");
      setEnviando(false);
      return;
    }

    router.push("/shoppings");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">ShoppingHub</h1>
      <p className="mt-1 text-sm text-neutral-400">Painel administrativo — acesso restrito.</p>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {erro}
        </div>
      )}

      <form onSubmit={entrar} className="mt-6 flex flex-col gap-4">
        <div>
          <label className="text-xs text-neutral-400">E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-400">Senha</label>
          <input
            type="password"
            required
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-xl bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-950 disabled:opacity-60"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
