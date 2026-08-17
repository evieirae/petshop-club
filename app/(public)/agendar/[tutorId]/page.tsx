import { Logo } from "@/components/brand/Logo";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Pet, Servico, PrecoServico, CategoriaServico } from "@/types/database";
import { AgendarForm } from "./AgendarForm";

// Rota pública (Fase 6 — docs/fase6_pagamentos.md, seção 7): mesmo padrão
// de app/(public)/cadastro/[tutorId] — sem sessão, service_role key via
// lib/supabase/admin.ts, id da URL é o próprio tutores.id.
//
// Só entra aqui quem já tem cadastro_completo (o link é enviado pro tutor
// depois que ele já tem pelo menos 1 pet cadastrado — sem pet não tem o
// que agendar). Tutor sem pet cai no 404 igual a tutor inexistente, com
// mensagem própria.
export default async function AgendarPage({
  params,
}: {
  params: { tutorId: string };
}) {
  const supabase = createAdminClient();

  const [{ data: tutor, error: erroTutor }, { data: pets }] = await Promise.all([
    supabase
      .from("tutores")
      .select("id, nome, petshop_id, forma_pagamento_preferida")
      .eq("id", params.tutorId)
      .maybeSingle(),
    supabase.from("pets").select("*").eq("tutor_id", params.tutorId).order("criado_em"),
  ]);

  if (erroTutor || !tutor) {
    notFound();
  }

  const { data: petshop } = await supabase
    .from("petshops")
    .select("percentual_plataforma")
    .eq("id", tutor.petshop_id)
    .maybeSingle();

  if (!pets || pets.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-ink-500">
          Ainda não encontramos nenhum pet no seu cadastro — peça pro
          petshop confirmar seus dados antes de agendar por aqui.
        </p>
      </main>
    );
  }

  const { data: servicos } = await supabase
    .from("servicos")
    .select("*")
    .eq("petshop_id", tutor.petshop_id)
    .eq("ativo", true);

  const servicoIds = (servicos ?? []).map((s) => s.id);
  const [{ data: precos }, { data: categorias }] = await Promise.all([
    servicoIds.length
      ? supabase.from("precos_servico").select("*").in("servico_id", servicoIds)
      : Promise.resolve({ data: [] as PrecoServico[] }),
    supabase.from("categorias_servico").select("*"),
  ]);

  return (
    <main className="flex min-h-screen justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <Logo tamanho="lg" />
        </div>

        <h1 className="text-center font-display text-2xl text-ink-900">
          Agendar uma visita
        </h1>
        <p className="mt-1 text-center text-sm text-ink-500">
          Escolha o pet, o serviço e o horário — a cobrança sai na hora,
          sem precisar ligar pro petshop.
        </p>

        <div className="mt-8">
          {/*
            Taxa do cartão vem de env var, não hardcoded (mesma decisão de
            processar-cobrancas/index.ts) — mas ATENÇÃO: Edge Functions
            (Deno, `supabase secrets set`) e este app Next.js (`.env.local`
            / env vars do Vercel) são dois lugares DIFERENTES de config.
            ASAAS_TAXA_CARTAO_PERCENTUAL/_FIXO precisa estar cadastrado nos
            dois quando a Asaas mudar a taxa (16/nov/2026), senão o valor
            mostrado aqui diverge do valor cobrado de verdade pelo cron.
          */}
          <AgendarForm
            tutorId={params.tutorId}
            petshopId={tutor.petshop_id}
            pets={(pets as Pet[]) ?? []}
            servicos={(servicos as Servico[]) ?? []}
            precos={(precos as PrecoServico[]) ?? []}
            categorias={(categorias as CategoriaServico[]) ?? []}
            percentualPlataforma={petshop?.percentual_plataforma ?? 0.03}
            formaPagamentoPreferida={tutor.forma_pagamento_preferida ?? "cartao"}
            taxaCartaoPercentual={Number(process.env.ASAAS_TAXA_CARTAO_PERCENTUAL ?? "0.0199")}
            taxaCartaoFixo={Number(process.env.ASAAS_TAXA_CARTAO_FIXO ?? "0.49")}
          />
        </div>
      </div>
    </main>
  );
}
