"use client";

import { useState, useTransition, type FormEvent } from "react";
import { botao, superficie } from "@/lib/ui/styles";
import { FormField, inputClass } from "@/components/ui/FormField";
import { criarPetshopComDono } from "./actions";

// A senha temporária aparece na tela UMA vez pro admin copiar, mesmo sem
// RESEND_API_KEY configurada (ver .env.example) — é o fallback de sempre.
// Com o Resend configurado, o mesmo e-mail com a senha já sai
// automaticamente pro dono (lib/email/, criarPetshopComDono em ./actions.ts);
// resposta.emailEnviado diz se esse envio funcionou.
export function NovoPetshopForm({
  leadId,
  nomePetshopInicial = "",
  nomeDonoInicial = "",
  emailDonoInicial = "",
  onCriado,
  onCancel,
}: {
  leadId?: string;
  nomePetshopInicial?: string;
  nomeDonoInicial?: string;
  emailDonoInicial?: string;
  onCriado?: () => void;
  onCancel: () => void;
}) {
  const [nomePetshop, setNomePetshop] = useState(nomePetshopInicial);
  const [nomeDono, setNomeDono] = useState(nomeDonoInicial);
  const [emailDono, setEmailDono] = useState(emailDonoInicial);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<{ senha: string; emailEnviado: boolean } | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!nomePetshop.trim() || !nomeDono.trim() || !emailDono.trim()) {
      setErro("Preencha nome do petshop, nome e e-mail do dono.");
      return;
    }

    startTransition(async () => {
      const resposta = await criarPetshopComDono({
        nomePetshop,
        nomeDono,
        emailDono,
        leadId,
      });
      if (resposta.ok) {
        setResultado({ senha: resposta.senhaTemporaria, emailEnviado: resposta.emailEnviado });
        onCriado?.();
      } else {
        setErro(resposta.erro);
      }
    });
  }

  if (resultado) {
    return (
      <div className={superficie.blocoEdicao}>
        <p className="text-sm font-medium text-ink-900">
          Petshop &quot;{nomePetshop}&quot; criado — anote a senha temporária
          de {nomeDono} agora, ela só aparece uma vez:
        </p>
        <p className="mt-3 select-all rounded-lg border border-brand-200 bg-surface-card px-4 py-3 text-center font-mono text-lg tracking-wide text-ink-900">
          {resultado.senha}
        </p>
        <p className="mt-2 text-xs text-ink-500">
          {resultado.emailEnviado ? (
            <>Também mandamos um e-mail pra {emailDono} com essa senha e o link de login.</>
          ) : (
            <>
              Não deu pra mandar e-mail automático — mande essa senha e o
              login ({emailDono}) pro dono manualmente. Ele consegue trocar a
              senha depois de entrar.
            </>
          )}
        </p>
        <div className="mt-4">
          <button type="button" onClick={onCancel} className={botao({ tamanho: "sm" })}>
            Concluir
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${superficie.blocoEdicao}`}>
      <FormField label="Nome do petshop" htmlFor="novo_petshop_nome" full>
        <input
          id="novo_petshop_nome"
          className={inputClass}
          value={nomePetshop}
          onChange={(e) => setNomePetshop(e.target.value)}
          placeholder="ex.: Petshop Amigo Fiel"
        />
      </FormField>
      <FormField label="Nome do dono" htmlFor="novo_petshop_nome_dono">
        <input
          id="novo_petshop_nome_dono"
          className={inputClass}
          value={nomeDono}
          onChange={(e) => setNomeDono(e.target.value)}
          placeholder="ex.: Maria Silva"
        />
      </FormField>
      <FormField label="E-mail do dono" htmlFor="novo_petshop_email_dono" hint="Vira o login dele no PetClub.">
        <input
          id="novo_petshop_email_dono"
          type="email"
          className={inputClass}
          value={emailDono}
          onChange={(e) => setEmailDono(e.target.value)}
          placeholder="dono@petshop.com.br"
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={botao({ tamanho: "sm" })}>
          {pending ? "Criando…" : "Criar petshop e dono"}
        </button>
        <button type="button" onClick={onCancel} className={botao({ variante: "neutra", tamanho: "sm" })}>
          Cancelar
        </button>
        {erro && (
          <p role="alert" className="text-sm text-danger-600">
            {erro}
          </p>
        )}
      </div>
    </form>
  );
}
