import { EmptyState } from "@/components/ui/EmptyState";

export default function TutoresPage() {
  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Tutores & Pets</h1>
      <p className="mt-1 text-sm text-ink-500">
        Cadastro, contatos por papel e histórico de assinaturas.
      </p>

      <div className="mt-8">
        <EmptyState
          titulo="Ainda sem tela de tutores"
          descricao="Vai puxar tutores + pets, com o link de autopreenchimento (seção 6 das regras) como forma padrão de cadastro."
          itens={[
            "Lista de tutores com indicador de cadastro_completo",
            "Botão pra (re)enviar o link de autopreenchimento por WhatsApp (lembretes tipo='cadastro')",
            "Contato adicional por papel — ex.: quem busca o pet, se for diferente de quem agenda",
            "Pets vinculados a cada tutor, com porte, raça e observações",
          ]}
        />
      </div>
    </div>
  );
}
