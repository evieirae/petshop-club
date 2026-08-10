import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { ConfiguracoesForm } from "./ConfiguracoesForm";

export default async function ConfiguracoesPage() {
  const contexto = await getUsuarioContext();

  // O layout (app/(app)/layout.tsx) ja bloqueia os casos de "sem sessao" e
  // "sem petshop vinculado" antes de renderizar a pagina — isso aqui e so
  // uma garantia extra pro TypeScript, na pratica nao deveria disparar.
  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Configurações</h1>
      <p className="mt-1 text-sm text-ink-500">
        Tudo que varia de petshop pra petshop — ver docs/regras_padrao_petshop.md.
      </p>

      <ConfiguracoesForm petshop={contexto.petshop} />
    </div>
  );
}
