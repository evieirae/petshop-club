import { Logo } from "@/components/brand/Logo";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContatoAdicional, Pet, Porte, Tutor } from "@/types/database";
import { CadastroForm } from "./CadastroForm";

// Sem isso, o Next trata essa rota dinamica como estatica (nao chama
// cookies()/headers()) e cacheia o HTML da PRIMEIRA visita a cada
// [tutorId]/[lembreteId] para sempre (Full Route Cache) — inclusive numa
// Netlify function, que reusa o cache entre requests. Bug real encontrado
// em producao: tutor visitado uma vez sem pet cadastrado ficava preso na
// mensagem "nenhum pet encontrado" mesmo depois do pet ser criado, porque
// a pagina nunca mais rodava a query de novo. force-dynamic garante SSR
// (e consulta ao Supabase) a cada request.
export const dynamic = "force-dynamic";

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
