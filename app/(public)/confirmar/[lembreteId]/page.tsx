import { Logo } from "@/components/brand/Logo";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConfirmarClient } from "./ConfirmarClient";

// Rota publica (fora do grupo (app), sem o guard de sessao de
// app/(app)/layout.tsx) — e o link mandado no lembrete tipo=
// 'confirmacao_agendamento' (ver supabase/functions/enviar-lembretes). O id
// na URL e o proprio lembretes.id, nao o agendamento — assim cada envio tem
// seu link proprio e a resposta fica registrada na linha certa.
export default async function ConfirmarPage({
  params,
}: {
  params: { lembreteId: string };
}) {
  const supabase = createAdminClient();

  const { data: lembrete } = await supabase
    .from("lembretes")
    .select("*")
    .eq("id", params.lembreteId)
    .maybeSingle();

  if (!lembrete || lembrete.tipo !== "confirmacao_agendamento" || !lembrete.agendamento_id) {
    notFound();
  }

  const { data: agendamento } = await supabase
    .from("agendamentos")
    .select("*")
    .eq("id", lembrete.agendamento_id)
    .maybeSingle();

  if (!agendamento) {
    notFound();
  }

  // Mesma ramificacao assinatura x avulsa documentada em
  // 0003_fase4_assinaturas_agenda.sql pra achar o pet certo.
  let petId: string | null = agendamento.pet_id;
  if (!petId && agendamento.assinatura_id) {
    const { data: assinatura } = await supabase
      .from("assinaturas")
      .select("pet_id")
      .eq("id", agendamento.assinatura_id)
      .maybeSingle();
    petId = assinatura?.pet_id ?? null;
  }

  const [{ data: pet }, { data: petshop }] = await Promise.all([
    petId
      ? supabase.from("pets").select("nome").eq("id", petId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("petshops").select("nome").eq("id", agendamento.petshop_id).maybeSingle(),
  ]);

  const dataHora = new Date(agendamento.data_hora);
  const dataFormatada = dataHora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const horaFormatada = dataHora.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="flex min-h-screen justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo tamanho="lg" />
        </div>

        <h1 className="text-center font-display text-2xl text-ink-900">
          Confirmar presença
        </h1>
        <p className="mt-1 text-center text-sm text-ink-500">
          {pet?.nome ?? "Seu pet"} · {dataFormatada} às {horaFormatada} · {petshop?.nome ?? "o petshop"}
        </p>

        <div className="mt-8">
          <ConfirmarClient lembreteId={lembrete.id} jaConfirmado={!!lembrete.confirmado_em} />
        </div>
      </div>
    </main>
  );
}
