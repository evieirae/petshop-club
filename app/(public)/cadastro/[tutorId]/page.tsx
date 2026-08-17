import { Logo } from "@/components/brand/Logo";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContatoAdicional, Pet, Porte, Tutor } from "@/types/database";
import { CadastroForm } from "./CadastroForm";

// Rota publica (fora do grupo (app), sem o guard de sessao de
// app/(app)/layout.tsx) — e o link de autopreenchimento descrito em
// docs/regras_padrao_petshop.md, seção 6. O id na URL é o próprio
// tutores.id; ver lib/supabase/admin.ts pro porquê disso usar a service
// role key em vez do cliente normal.
export default async function CadastroTutorPage({
  params,
}: {
  params: { tutorId: string };
}) {
  const supabase = createAdminClient();

  const [{ data: tutor, error: erroTutor }, { data: portes }, { data: pets }, { data: contatos }] =
    await Promise.all([
      supabase.from("tutores").select("*").eq("id", params.tutorId).maybeSingle(),
      supabase.from("portes").select("*").order("ordem"),
      supabase.from("pets").select("*").eq("tutor_id", params.tutorId).order("criado_em"),
      supabase
        .from("contatos_adicionais")
        .select("*")
        .eq("tutor_id", params.tutorId)
        .eq("papel", "busca_entrega")
        .maybeSingle(),
    ]);

  if (erroTutor || !tutor) {
    notFound();
  }

  return (
    <main className="flex min-h-screen justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <Logo tamanho="lg" />
        </div>

        <h1 className="text-center font-display text-2xl text-ink-900">
          Complete seu cadastro
        </h1>
        <p className="mt-1 text-center text-sm text-ink-500">
          Confirme seus dados e os do(s) seu(s) pet(s) — leva menos de um
          minuto.
        </p>

        <div className="mt-8">
          <CadastroForm
            tutorId={params.tutorId}
            tutor={tutor as Tutor}
            portes={(portes as Porte[]) ?? []}
            petsIniciais={(pets as Pet[]) ?? []}
            contatoBuscaEntrega={(contatos as ContatoAdicional | null) ?? null}
          />
        </div>
      </div>
    </main>
  );
}
