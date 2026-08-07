import { EmptyState } from "@/components/ui/EmptyState";

export default function PlanosPage() {
  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">
        Planos & Serviços
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        Catálogo de serviços, combinações em planos e preço por porte.
      </p>

      <div className="mt-8">
        <EmptyState
          titulo="Ainda sem tela de planos"
          descricao="Vai gerenciar servicos, planos, plano_servicos e plano_precos — a base de tudo que a cobrança mensal usa."
          itens={[
            "Catálogo de serviços por categoria (banho, tosa higiênica, tosa completa, hidratação)",
            "Montagem de planos: quais serviços entram + intervalo_dias + ocorrencias_padrao_mes",
            "Preço da assinatura por porte (plano_precos), separado do preço avulso de referência",
          ]}
        />
      </div>
    </div>
  );
}
