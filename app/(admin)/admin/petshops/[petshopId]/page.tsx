import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { createClient } from "@/lib/supabase/server";
import type { Petshop } from "@/types/database";
import { ConfiguracoesForm } from "@/app/(app)/configuracoes/ConfiguracoesForm";

// Pedido do Eduardo (31/ago): clicar num petshop na lista de /admin/petshops
// e ver — e, se precisar, alterar — as configurações que ELE MESMO configura
// (expediente, janela de mensagens, comissão, falta consome visita paga).
// Reaproveita literalmente o mesmo <ConfiguracoesForm/> que a equipe do
// petshop usa em app/(app)/configuracoes: são as mesmas colunas de
// `petshops`, e updatePetshopConfig() (app/(app)/configuracoes/actions.ts)
// já recebe o petshopId como parâmetro em vez de tirar da sessão — não
// precisou mudar UMA linha do formulário nem da action.
//
// Isso funciona sem service role e sem migration porque `petshops` já tem
// uma policy que libera SELECT/UPDATE de qualquer linha pra quem tem
// auth_admin_plataforma() (0002/0017) — o mesmo motivo por que
// atualizarTaxasPlataforma()/atualizarStatusPetshop() em ../actions.ts
// também usam o client comum. A equipe (usuarios_petshop) e o cadastro de
// funcionários NÃO têm esse bypass — por isso esta tela mostra só o que
// está em `petshops`, igual ao card da lista já mostra a equipe à parte.
export default async function AdminPetshopDetalhePage({
  params,
}: {
  params: { petshopId: string };
}) {
  const admin = await getAdminContext();
  if (!admin) {
    redirect("/login");
  }

  const supabase = createClient();
  const { data: petshop } = await supabase
    .from("petshops")
    .select("*")
    .eq("id", params.petshopId)
    .maybeSingle();

  if (!petshop) {
    notFound();
  }

  return (
    <div>
      <Link
        href="/admin/petshops"
        className="text-sm font-medium text-ink-500 hover:text-ink-700"
      >
        ← Petshops
      </Link>

      <h1 className="mt-2 font-display text-2xl text-ink-900">
        Configurações — {(petshop as Petshop).nome}
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        O que esse petshop configurou pra própria operação — expediente,
        janela de confirmação, comissão da equipe e a política de falta.
        Taxas da plataforma e status da conta continuam em{" "}
        <Link href="/admin/petshops" className="font-medium text-brand-700 hover:underline">
          Petshops
        </Link>
        .
      </p>

      <ConfiguracoesForm petshop={petshop as Petshop} ehAdminPlataforma />
    </div>
  );
}
