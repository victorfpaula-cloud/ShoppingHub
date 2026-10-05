import { NextRequest, NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_PUBLICACOES } from "@/lib/publicacoesConstantes";

// Gera uma URL assinada de upload por arquivo — o navegador sobe o arquivo DIRETO pro Supabase
// Storage com ela, sem passar pela nossa function. Existe só por causa do limite de tamanho de
// corpo de requisição das Serverless Functions da Vercel (~4,5MB): um vídeo de Story real passa
// disso fácil, e cair nesse limite derrubava o agendamento com um erro genérico, sem explicação
// nenhuma pro usuário (achado em produção em 05/10/2026, tentando agendar o primeiro Story).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const corpo = await request.json().catch(() => null);
  const tipos: ("IMAGE" | "VIDEO")[] = Array.isArray(corpo?.tipos) ? corpo.tipos : [];

  if (tipos.length === 0) {
    return NextResponse.json({ erro: "Nenhum arquivo informado." }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { data: conta } = await admin
    .from("shoppinghub_contas")
    .select("id")
    .eq("shopping_id", params.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conta) {
    return NextResponse.json(
      { erro: "Conecte uma conta do Instagram antes de agendar uma publicação." },
      { status: 400 }
    );
  }

  const uploads: { storagePath: string; token: string; tipo: "IMAGE" | "VIDEO" }[] = [];

  for (const tipo of tipos) {
    const extensao = tipo === "VIDEO" ? "mp4" : "jpg";
    const storagePath = `${conta.id}/${crypto.randomUUID()}.${extensao}`;

    const { data, error } = await admin.storage.from(BUCKET_PUBLICACOES).createSignedUploadUrl(storagePath);

    if (error || !data) {
      console.error("Falha ao gerar URL assinada de upload de publicação agendada:", error);
      return NextResponse.json({ erro: "Deu um erro preparando o upload. Tenta de novo." }, { status: 500 });
    }

    uploads.push({ storagePath, token: data.token, tipo });
  }

  return NextResponse.json({ uploads });
}
