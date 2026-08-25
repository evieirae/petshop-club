"use client";

import { useState, useTransition, type FormEvent } from "react";
import { botao, superficie } from "@/lib/ui/styles";
import { FormField, inputClass } from "@/components/ui/FormField";
import { criarLead } from "./actions";

export function LeadForm() {
  const [nomePetshop, setNomePetshop] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!email.trim()) {
      setErro("Informe um e-mail pra receber a cotação.");
      return;
    }

    startTransition(async () => {
      const resultado = await criarLead({ nomePetshop, nomeResponsavel, email, telefone, mensagem });
      if (resultado.ok) {
        setEnviado(true);
      } else {
        setErro(resultado.erro);
      }
    });
  }

  if (enviado) {
    return (
      <div id="cotacao" className={`${superficie.cardPadded} text-center`}>
        <h2 className="font-display text-xl text-ink-900">Recebemos seu pedido</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
          Alguém do nosso time entra em contato com a cotação. Nenhum petshop
          foi criado ainda — isso só acontece depois da gente conversar com
          você.
        </p>
      </div>
    );
  }

  return (
    <form
      id="cotacao"
      onSubmit={handleSubmit}
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${superficie.cardPadded}`}
    >
      <div className="sm:col-span-2">
        <h2 className="font-display text-xl text-ink-900">Quero uma cotação</h2>
        <p className="mt-1 text-sm text-ink-500">
          Conta um pouco sobre o seu petshop — a gente entra em contato com
          os próximos passos. Isso não cria conta nem cobra nada
          automaticamente.
        </p>
      </div>

      <FormField label="Nome do petshop" htmlFor="lead_nome_petshop" hint="Opcional.">
        <input
          id="lead_nome_petshop"
          className={inputClass}
          value={nomePetshop}
          onChange={(e) => setNomePetshop(e.target.value)}
          placeholder="ex.: Petshop Amigo Fiel"
        />
      </FormField>
      <FormField label="Seu nome" htmlFor="lead_nome_responsavel" hint="Opcional.">
        <input
          id="lead_nome_responsavel"
          className={inputClass}
          value={nomeResponsavel}
          onChange={(e) => setNomeResponsavel(e.target.value)}
          placeholder="ex.: Maria Silva"
        />
      </FormField>
      <FormField label="E-mail" htmlFor="lead_email" hint="Obrigatório — é como vamos te responder.">
        <input
          id="lead_email"
          type="email"
          required
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@petshop.com.br"
        />
      </FormField>
      <FormField label="Telefone" htmlFor="lead_telefone" hint="Opcional.">
        <input
          id="lead_telefone"
          className={inputClass}
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(48) 99999-0000"
        />
      </FormField>
      <FormField label="Mensagem" htmlFor="lead_mensagem" hint="Opcional — conte um pouco mais, se quiser." full>
        <textarea
          id="lead_mensagem"
          rows={3}
          className={inputClass}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={botao({ tamanho: "lg" })}>
          {pending ? "Enviando…" : "Quero uma cotação"}
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
