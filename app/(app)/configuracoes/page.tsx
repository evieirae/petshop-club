import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { createClient } from "@/lib/supabase/server";
import type { Funcionario } from "@/types/database";
import { ConfiguracoesForm } from "./ConfiguracoesForm";
import { FuncionariosSection } from "./FuncionariosSection";

export default async function ConfiguracoesPage() {
  const contexto = await getUsuarioContext();

  // O layout (app/(app)/layout.tsx) ja bloqueia os casos de "sem sessao" e
  // "sem petshop vinculado" antes de renderizar a pagina — isso aqui e so
  // uma garantia extra pro TypeScript, na pratica nao deveria disparar.
  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  // Migration 0017 — vem de admins_plataforma, não mais de uma coluna em
  // usuarios_petshop (ver lib/auth/getAdminContext.ts).
  const admin = await getAdminContext();

  // Migration 0016 — funcionários (cadastro sem login). Inativos vêm junto:
  // a tela lista quem saiu numa seção separada, porque desativar é o
  // caminho de "não trabalha mais aqui" (não existe exclusão, pra não
  // quebrar o histórico de vendas e visitas).
  const { data: funcionarios } = await supabase
    .from("funcionarios")
    .select("*")
    .eq("petshop_id", contexto.petshop.id)
    .order("ativo", { ascending: false })
    .order("nome");

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Configurações</h1>
      <p className="mt-1 text-sm text-ink-500">
        Tudo que varia de petshop pra petshop — ver docs/regras_padrao_petshop.md.
      </p>

      <ConfiguracoesForm
        petshop={contexto.petshop}
        ehAdminPlataforma={admin !== null}
      />

      {/* Fora do <form> acima de propósito: cada funcionário salva sozinho,
          e <form> dentro de <form> não é HTML válido. */}
      <div className="mt-6 pb-24">
        <FuncionariosSection
          petshopId={contexto.petshop.id}
          funcionarios={(funcionarios as Funcionario[]) ?? []}
          comissaoAtiva={contexto.petshop.comissao_ativa}
          percentualPadraoVenda={contexto.petshop.comissao_percentual_venda}
          percentualPadraoServico={contexto.petshop.comissao_percentual_servico}
        />
      </div>
    </div>
  );
}
