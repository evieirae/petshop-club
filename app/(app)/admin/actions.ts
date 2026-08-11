"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Petshop } from "@/types/database";

export type ActionResult = { ok: true } | { ok: false; erro: string };

// Únicas colunas que essa tela mexe — exatamente as protegidas pelo trigger
// trg_petshops_protege_taxas (supabase/migrations/0002_admin_plataforma.sql).
export type TaxasPlataformaInput = Pick<
  Petshop,
  "fee_fixo_mensal" | "percentual_plataforma" | "isento_fee_ate"
>;

// Não precisa checar "quem está chamando isso é admin?" aqui na mão — a RLS
// (auth_admin_plataforma() na policy de `petshops`) e o trigger
// trg_petshops_protege_taxas já rejeitam no banco qualquer tentativa de
// quem não tem a flag, com count=0 linhas afetadas ou erro do trigger. Por
// isso o count é checado abaixo, igual ao resto das actions do projeto.
export async function atualizarTaxasPlataforma(
  petshopId: string,
  dados: TaxasPlataformaInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("petshops")
    .update(dados, { count: "exact" })
    .eq("id", petshopId);

  if (error) {
    console.error("Erro ao atualizar taxas do petshop:", error);
    // O trigger de protecao levanta uma excecao de banco quando quem chama
    // nao e admin — cai aqui, nao no "count === 0" abaixo.
    return {
      ok: false,
      erro: error.message.includes("Somente a administração")
        ? error.message
        : "Não deu pra salvar. Tenta de novo em alguns segundos.",
    };
  }
  if (!count) {
    return {
      ok: false,
      erro: "Nenhuma linha foi alterada — confirme se o petshop ainda existe.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/configuracoes");
  return { ok: true };
}
