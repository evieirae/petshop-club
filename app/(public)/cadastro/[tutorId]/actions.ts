"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Rota publica, sem sessao — ver lib/supabase/admin.ts pra entender por que
// isso usa a service_role key em vez do cliente normal (RLS exige
// auth_petshop_id(), que so existe pra equipe logada).

export type CadastroPetInput = {
  id?: string; // presente = editando pet ja existente; ausente = pet novo
  nome: string;
  porte_id: number;
  raca: string | null;
  observacoes: string | null;
};

export type CadastroInput = {
  nome: string;
  telefone: string;
  endereco: string | null;
  pets: CadastroPetInput[];
  // Contato de quem busca/entrega o pet, quando diferente do proprio tutor
  // (o exemplo motivador da seção 5 de docs/regras_padrao_petshop.md).
  contatoBuscaEntrega: { nome: string; telefone: string } | null;
};

export type EnviarCadastroResult = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não deu pra salvar. Tenta de novo em alguns segundos.";

export async function enviarCadastro(
  tutorId: string,
  dados: CadastroInput
): Promise<EnviarCadastroResult> {
  if (!dados.nome.trim() || !dados.telefone.trim()) {
    return { ok: false, erro: "Preencha nome e telefone." };
  }
  if (dados.pets.some((p) => !p.nome.trim())) {
    return { ok: false, erro: "Todo pet precisa de um nome." };
  }
  if (
    dados.contatoBuscaEntrega &&
    (!dados.contatoBuscaEntrega.nome.trim() || !dados.contatoBuscaEntrega.telefone.trim())
  ) {
    return { ok: false, erro: "Preencha nome e telefone de quem busca/entrega o pet." };
  }

  const supabase = createAdminClient();

  // Confirma que o id da URL corresponde a um tutor de verdade ANTES de
  // gravar qualquer coisa — sem isso, um id invalido criaria pets/contatos
  // orfaos. Tambem precisamos do petshop_id aqui: pets e contatos_adicionais
  // exigem a coluna, e o formulario publico nao tem contexto de petshop
  // nenhum alem do que vem junto do tutor.
  const { data: tutorExistente, error: erroBusca } = await supabase
    .from("tutores")
    .select("id, petshop_id")
    .eq("id", tutorId)
    .maybeSingle();

  if (erroBusca || !tutorExistente) {
    return { ok: false, erro: "Link inválido — peça um novo link ao petshop." };
  }

  const petshopId = tutorExistente.petshop_id as string;

  const { error: erroTutor } = await supabase
    .from("tutores")
    .update({
      nome: dados.nome.trim(),
      telefone: dados.telefone.trim(),
      endereco: dados.endereco?.trim() || null,
      cadastro_completo: true,
    })
    .eq("id", tutorId);

  if (erroTutor) {
    console.error("Erro ao salvar tutor (form publico de cadastro):", erroTutor);
    return { ok: false, erro: ERRO_GENERICO };
  }

  for (const pet of dados.pets) {
    if (pet.id) {
      // .eq("tutor_id", tutorId) e uma trava extra: mesmo com a service role
      // (sem RLS), isso impede que um id de pet de OUTRO tutor colado aqui
      // por engano mexa em dado que nao e desse cadastro.
      const { error } = await supabase
        .from("pets")
        .update({
          nome: pet.nome.trim(),
          porte_id: pet.porte_id,
          raca: pet.raca?.trim() || null,
          observacoes: pet.observacoes?.trim() || null,
        })
        .eq("id", pet.id)
        .eq("tutor_id", tutorId);

      if (error) {
        console.error("Erro ao atualizar pet (form publico de cadastro):", error);
        return { ok: false, erro: ERRO_GENERICO };
      }
    } else {
      const { error } = await supabase.from("pets").insert({
        petshop_id: petshopId,
        tutor_id: tutorId,
        nome: pet.nome.trim(),
        porte_id: pet.porte_id,
        raca: pet.raca?.trim() || null,
        observacoes: pet.observacoes?.trim() || null,
      });

      if (error) {
        console.error("Erro ao criar pet (form publico de cadastro):", error);
        return { ok: false, erro: ERRO_GENERICO };
      }
    }
  }

  if (dados.contatoBuscaEntrega) {
    const { error } = await supabase.from("contatos_adicionais").upsert(
      {
        petshop_id: petshopId,
        tutor_id: tutorId,
        papel: "busca_entrega",
        nome: dados.contatoBuscaEntrega.nome.trim(),
        telefone: dados.contatoBuscaEntrega.telefone.trim(),
      },
      { onConflict: "tutor_id,papel" }
    );

    if (error) {
      console.error("Erro ao salvar contato adicional (form publico de cadastro):", error);
      return { ok: false, erro: ERRO_GENERICO };
    }
  }

  // Fecha o(s) lembrete(s) tipo='cadastro' pendentes desse tutor — mesma
  // logica descrita na secao 8 do schema (a resposta do tutor volta por
  // rota publica, nao por webhook, e grava confirmado_em/resposta aqui).
  const { error: erroLembrete } = await supabase
    .from("lembretes")
    .update({
      confirmado_em: new Date().toISOString(),
      resposta: "Cadastro preenchido pelo tutor via formulário público.",
    })
    .eq("tutor_id", tutorId)
    .eq("tipo", "cadastro")
    .is("confirmado_em", null);

  if (erroLembrete) {
    // Nao bloqueia o cadastro por causa disso — o dado principal (tutor +
    // pets + contato) ja foi salvo com sucesso.
    console.error("Erro ao atualizar lembrete de cadastro:", erroLembrete);
  }

  return { ok: true };
}
