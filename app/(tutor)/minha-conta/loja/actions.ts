"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTutorContext } from "@/lib/auth/getTutorContext";

const ERRO_GENERICO = "Não deu pra reservar agora. Tenta de novo em alguns segundos.";

export type ItemCarrinho = { produtoId: string; quantidade: number };

export type ReservaResult =
  | { ok: true; vendaId: string; reservadoAte: string }
  | { ok: false; erro: string };

/**
 * Reserva os itens do carrinho.
 *
 * Toda a lógica de verdade mora em `criar_reserva_tutor()` (migration 0026),
 * não aqui — e isso é deliberado: a checagem de disponível e o incremento de
 * `estoque_reservado` precisam acontecer na MESMA transação, com `for update`
 * na linha do produto. Fazer isso em TypeScript (ler estoque, decidir,
 * escrever) abriria exatamente a corrida que a reserva existe pra evitar:
 * dois tutores pegando a última unidade.
 *
 * Service role pelo mesmo motivo do agendamento (0025): a 0024 não deu policy
 * de INSERT pro tutor de propósito, então existe UM caminho validado em vez
 * de um insert livre que a tela poderia mentir.
 */
export async function reservarProdutos(itens: ItemCarrinho[]): Promise<ReservaResult> {
  const contexto = await getTutorContext();

  if (!contexto) {
    return { ok: false, erro: "Sua sessão expirou. Entre de novo pra continuar." };
  }
  if (contexto.precisaTrocarSenha) {
    return { ok: false, erro: "Crie sua senha antes de reservar." };
  }

  const limpos = itens.filter((i) => i.produtoId && i.quantidade > 0);
  if (limpos.length === 0) {
    return { ok: false, erro: "Seu carrinho está vazio." };
  }

  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin.rpc("criar_reserva_tutor", {
    p_tutor_id: contexto.tutor.id,
    p_itens: limpos.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })),
  });

  if (error) {
    // As mensagens de estoque da função são escritas pra serem lidas por
    // gente ("Só restam 1 unidade(s) de Ração X") — repassa em vez de
    // esconder atrás do erro genérico.
    const paraOUsuario =
      error.message.includes("restam") ||
      error.message.includes("indisponivel") ||
      error.message.includes("Carrinho");
    if (paraOUsuario) return { ok: false, erro: error.message };

    console.error("Erro ao criar reserva do tutor:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  const vendaId = data as unknown as string;

  const { data: venda } = await supabaseAdmin
    .from("vendas")
    .select("reservado_ate")
    .eq("id", vendaId)
    .maybeSingle();

  revalidatePath("/minha-conta");
  revalidatePath("/minha-conta/loja");
  revalidatePath("/vendas");

  return {
    ok: true,
    vendaId,
    reservadoAte: (venda?.reservado_ate as string) ?? "",
  };
}

export type CancelarResult = { ok: true } | { ok: false; erro: string };

/** O tutor desistiu. Devolve o estoque na hora, sem esperar o prazo vencer. */
export async function cancelarMinhaReserva(vendaId: string): Promise<CancelarResult> {
  const contexto = await getTutorContext();
  if (!contexto) {
    return { ok: false, erro: "Sua sessão expirou. Entre de novo pra continuar." };
  }

  const supabaseAdmin = createAdminClient();

  // A reserva é MESMO deste tutor e ainda está de pé? Sem esta checagem o id
  // de outra pessoa colado na chamada cancelaria a reserva dela.
  const { data: venda } = await supabaseAdmin
    .from("vendas")
    .select("id")
    .eq("id", vendaId)
    .eq("tutor_id", contexto.tutor.id)
    .eq("status", "reservada")
    .maybeSingle();

  if (!venda) {
    return { ok: false, erro: "Reserva não encontrada." };
  }

  const { error } = await supabaseAdmin.rpc("cancelar_reserva", { p_venda_id: vendaId });

  if (error) {
    console.error("Erro ao cancelar reserva do tutor:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/minha-conta");
  revalidatePath("/minha-conta/loja");
  revalidatePath("/vendas");
  return { ok: true };
}
