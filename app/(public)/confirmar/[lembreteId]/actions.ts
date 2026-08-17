"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Rota publica, sem sessao — mesmo motivo de app/(public)/cadastro/[tutorId]/actions.ts:
// quem clica o link do WhatsApp nao tem login, entao a policy "isolamento_petshop"
// (baseada em auth_petshop_id()) nunca bate. Usa a service_role key.

export type ConfirmarResult = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não deu pra confirmar. Tenta de novo em alguns segundos.";

// Estados terminais/ja resolvidos do agendamento — confirmar nao faz
// sentido pra nenhum deles (a visita ja aconteceu, foi cancelada ou ja
// esta noutro estagio do fluxo).
const STATUS_CONFIRMAVEIS = ["agendado", "reagendado"];

export async function confirmarPresenca(lembreteId: string): Promise<ConfirmarResult> {
  const supabase = createAdminClient();

  const { data: lembrete, error: erroLembrete } = await supabase
    .from("lembretes")
    .select("id, agendamento_id, tipo, confirmado_em")
    .eq("id", lembreteId)
    .maybeSingle();

  if (erroLembrete || !lembrete || !lembrete.agendamento_id || lembrete.tipo !== "confirmacao_agendamento") {
    return { ok: false, erro: "Link inválido ou expirado." };
  }

  // Clique repetido no mesmo link — idempotente, nao e erro.
  if (lembrete.confirmado_em) {
    return { ok: true };
  }

  // O UPDATE em agendamentos dispara trg_pet_pronto_lembrete() sozinho, que
  // carimba confirmado_em — mesma logica ja usada quando a equipe clica
  // "Confirmar" na tela de Agenda (app/(app)/agenda/actions.ts), nada de
  // carimbo novo precisa ser escrito aqui.
  const { count } = await supabase
    .from("agendamentos")
    .update({ status: "confirmado" }, { count: "exact" })
    .eq("id", lembrete.agendamento_id)
    .in("status", STATUS_CONFIRMAVEIS);

  if (!count) {
    return {
      ok: false,
      erro: "Esse agendamento não está mais disponível pra confirmação — fale direto com o petshop.",
    };
  }

  const { error: erroUpdateLembrete } = await supabase
    .from("lembretes")
    .update({
      confirmado_em: new Date().toISOString(),
      resposta: "Confirmado pelo tutor via link do WhatsApp.",
    })
    .eq("id", lembreteId);

  if (erroUpdateLembrete) {
    console.error("Erro ao atualizar lembrete apos confirmacao:", erroUpdateLembrete);
    return { ok: false, erro: ERRO_GENERICO };
  }

  return { ok: true };
}
