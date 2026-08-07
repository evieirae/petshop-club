import { EmptyState } from "@/components/ui/EmptyState";

export default function AgendaPage() {
  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Agenda</h1>
      <p className="mt-1 text-sm text-ink-500">
        Visitas do dia, confirmações e o fluxo até a entrega do pet.
      </p>

      <div className="mt-8">
        <EmptyState
          titulo="Ainda sem tela de agenda"
          descricao="Vai puxar a tabela agendamentos, filtrada pelo dia, com os status confirmado / pronto / entregue."
          itens={[
            "Lista do dia com status de confirmação de cada visita (agendamentos.confirmado_em)",
            "Ação de marcar 'pronto' — dispara lembrete automático pro tutor (trg_agendamentos_pet_pronto)",
            "Ação de marcar 'entregue' — fecha o ciclo e gera o próximo agendamento",
            "Aviso visual pra quem passou do horário de corte de confirmação (seção 2 de regras_padrao_petshop.md)",
          ]}
        />
      </div>
    </div>
  );
}
