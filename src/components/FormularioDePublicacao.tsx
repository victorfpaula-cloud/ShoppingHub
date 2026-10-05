"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { tipoDeMidiaPorContentType } from "@/lib/mencoesConstantes";
import { BUCKET_PUBLICACOES, MAX_ITENS_CARROSSEL } from "@/lib/publicacoesConstantes";
import { CampoDeTexto } from "./CampoDeTexto";

/**
 * Formulário de Nova Story / Novo post no Feed — sobe o(s) arquivo(s) DIRETO do navegador pro
 * Supabase Storage via URL assinada (ver api/.../publicacoes/url-de-upload), em vez de mandar o
 * arquivo pra nossa própria function. Existe por causa do limite de ~4,5MB de corpo de requisição
 * das Serverless Functions da Vercel — um vídeo de Story real passa disso fácil, e isso travava o
 * agendamento com um erro sem explicação nenhuma (achado em produção em 05/10/2026, na primeira
 * tentativa real de agendar um Story). Com o arquivo saindo direto pro Storage, só sobra uma
 * chamada pequena (JSON, sem arquivo) pra registrar a publicação de verdade.
 */
export function FormularioDePublicacao({
  shoppingId,
  tipo,
}: {
  shoppingId: string;
  tipo: "story" | "feed";
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const arquivos = dados.getAll("arquivos").filter((v): v is File => v instanceof File && v.size > 0);
    const horario = dados.get("horario")?.toString() ?? "";
    const dataInicio = dados.get("data_inicio")?.toString() ?? "";
    const dataFim = dados.get("data_fim")?.toString() || null;

    if (arquivos.length === 0) return setErro("Escolha pelo menos um arquivo.");
    if (tipo === "story" && arquivos.length > 1) return setErro("Story aceita só um arquivo por vez.");
    if (tipo === "feed" && arquivos.length > MAX_ITENS_CARROSSEL) {
      return setErro(`Carrossel aceita no máximo ${MAX_ITENS_CARROSSEL} arquivos.`);
    }
    if (!horario || !dataInicio) return setErro("Preencha a data e o horário.");
    if (tipo === "story" && !dataFim) return setErro("Preencha o último dia do período.");

    setEnviando(true);

    try {
      const tipos = arquivos.map((arquivo) => tipoDeMidiaPorContentType(arquivo.type || ""));

      const respostaUrls = await fetch(`/api/shoppings/${shoppingId}/publicacoes/url-de-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipos }),
      });
      const dadosUrls = await respostaUrls.json().catch(() => null);
      if (!respostaUrls.ok) throw new Error(dadosUrls?.erro ?? "Falha ao preparar o upload.");

      const supabase = criarClienteNavegador();
      const midias: { storage_path: string; tipo: "IMAGE" | "VIDEO" }[] = [];

      for (let i = 0; i < arquivos.length; i++) {
        const { storagePath, token, tipo: tipoDaMidia } = dadosUrls.uploads[i];
        const { error: erroDeUpload } = await supabase.storage
          .from(BUCKET_PUBLICACOES)
          .uploadToSignedUrl(storagePath, token, arquivos[i]);

        if (erroDeUpload) {
          throw new Error(`Falha subindo "${arquivos[i].name}". Tenta de novo.`);
        }

        midias.push({ storage_path: storagePath, tipo: tipoDaMidia });
      }

      const respostaCriar = await fetch(`/api/shoppings/${shoppingId}/publicacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, horario, data_inicio: dataInicio, data_fim: dataFim, midias }),
      });
      const dadosCriar = await respostaCriar.json().catch(() => null);
      if (!respostaCriar.ok) throw new Error(dadosCriar?.erro ?? "Falha ao agendar a publicação.");

      router.push(`/shoppings/${shoppingId}/publicacoes`);
      router.refresh();
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : "Erro inesperado. Tenta de novo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={aoEnviar} className="mt-5 flex flex-col gap-4">
      {erro && (
        <div className="break-words rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {erro}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-ink-900 p-5 sm:p-6">
        {tipo === "story" ? (
          <CampoDeTexto
            label="Arquivo (imagem ou vídeo)"
            type="file"
            name="arquivos"
            accept="image/*,video/*"
            required
          />
        ) : (
          <CampoDeTexto
            label={`Arquivo(s) — imagem ou vídeo, até ${MAX_ITENS_CARROSSEL} pra carrossel`}
            type="file"
            name="arquivos"
            accept="image/*,video/*"
            multiple
            required
          />
        )}

        {tipo === "story" ? (
          <div className="grid grid-cols-2 gap-4">
            <CampoDeTexto label="Primeiro dia" type="date" name="data_inicio" required />
            <CampoDeTexto label="Último dia" type="date" name="data_fim" required />
          </div>
        ) : (
          <CampoDeTexto label="Data" type="date" name="data_inicio" required />
        )}

        <CampoDeTexto label="Horário (Brasília)" type="time" name="horario" required />
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="self-start rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(124,110,242,0.55)] transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-80"
      >
        {enviando ? "Enviando…" : tipo === "story" ? "Agendar Story" : "Agendar publicação"}
      </button>
    </form>
  );
}
