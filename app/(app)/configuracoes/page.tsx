import { EmptyState } from "@/components/ui/EmptyState";

export default function ConfiguracoesPage() {
  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Configurações</h1>
      <p className="mt-1 text-sm text-ink-500">
        Tudo que varia de petshop pra petshop — ver docs/regras_padrao_petshop.md.
      </p>

      <div className="mt-8">
        <EmptyState
          titulo="Ainda sem tela de configurações"
          descricao="Formulário editando direto as colunas parametrizáveis de petshops, agrupadas como no documento de regras."
          itens={[
            "Expediente e intervalo (hora_abertura, hora_fechamento, pausa pro almoço)",
            "Janela de mensagens D-1 (horário do lembrete e os cortes de confirmação manhã/tarde)",
            "Cobrança e repasse (fee_fixo_mensal, percentual_plataforma, isento_fee_ate)",
            "Política de falta (falta_consome_visita_paga) — hoje só 'true' está implementado de ponta a ponta",
          ]}
        />
      </div>
    </div>
  );
}
