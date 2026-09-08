import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirTutor } from "@/lib/auth/exigirTutor";
import { botao, texto } from "@/lib/ui/styles";
import type {
  Assinatura,
  CategoriaServico,
  Pet,
  PrecoServico,
  Servico,
} from "@/types/database";
import { AgendarTutorForm } from "./AgendarTutorForm";

// Marcar visita pelo portal (migration 0025).
//
// Tudo aqui vem pelas policies da 0024 — pets do próprio tutor, catálogo do
// petshop dele. A grade de horários NÃO é carregada aqui: ela depende do dia
// escolhido e vem por Server Action, que é onde mora o cuidado de devolver
// só "livre / ocupado" (ver actions.ts).
export default async function AgendarPage() {
  const { petshop } = await exigirTutor();
  const supabase = createClient();

  const [
    { data: petsData },
    { data: servicosData },
    { data: categoriasData },
    { data: assinaturasData },
  ] = await Promise.all([
    supabase.from("pets").select("*").eq("ativo", true).order("nome"),
    supabase.from("servicos").select("*").eq("ativo", true).order("criado_em"),
    supabase.from("categorias_servico").select("*").order("id"),
    supabase.from("assinaturas").select("id, status").eq("status", "ativa"),
  ]);

  const pets = (petsData ?? []) as Pet[];
  const servicos = (servicosData ?? []) as Servico[];
  const servicoIds = servicos.map((s) => s.id);

  const { data: precosData } = servicoIds.length
    ? await supabase.from("precos_servico").select("*").in("servico_id", servicoIds)
    : { data: [] as PrecoServico[] };

  const temAssinaturaAtiva = ((assinaturasData ?? []) as Assinatura[]).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/minha-conta" className={botao({ variante: "texto" })}>
          ← Voltar
        </Link>
        <h1 className={`mt-2 ${texto.tituloPagina}`}>Marcar uma visita</h1>
        <p className={texto.subtitulo}>
          Escolha o pet, o serviço e um horário livre no {petshop.nome}.
        </p>
      </div>

      <AgendarTutorForm
        pets={pets}
        servicos={servicos}
        categorias={(categoriasData ?? []) as CategoriaServico[]}
        precos={(precosData ?? []) as PrecoServico[]}
        temAssinaturaAtiva={temAssinaturaAtiva}
        nomePetshop={petshop.nome}
      />
    </div>
  );
}
