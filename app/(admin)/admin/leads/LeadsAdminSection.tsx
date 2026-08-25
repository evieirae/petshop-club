"use client";

import { useState, useTransition } from "react";
import { botao } from "@/lib/ui/styles";
import type { TomBadge } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LeadSaas } from "@/types/database";
import { atualizarStatusLead } from "../actions";
import { NovoPetshopForm } from "../NovoPetshopForm";

const STATUS_LABEL: Record<LeadSaas["status"], string> = {
  novo: "Novo",
  contatado: "Contatado",
  convertido: "Convertido",
  descartado: "Descartado",
};

const STATUS_TOM: Record<LeadSaas["status"], TomBadge> = {
  novo: "info",
  contatado: "atencao",
  convertido: "sucesso",
  descartado: "neutro",
};

export function LeadsAdminSection({ leads }: { leads: LeadSaas[] }) {
  if (leads.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum lead ainda"
        descricao="Pedidos de cotação feitos na Home aparecem aqui — nunca criam petshop sozinhos."
      />
    );
  }

  return (
    <div className="space-y-3">
      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} />
      ))}
    </div>
  );
}

function LeadCard({ lead }: { lead: LeadSaas }) {
  const [convertendo, setConvertendo] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  if (convertendo) {
    return (
      <NovoPetshopForm
        leadId={lead.id}
        nomePetshopInicial={lead.nome_petshop ?? ""}
        nomeDonoInicial={lead.nome_responsavel ?? ""}
        emailDonoInicial={lead.email}
        onCancel={() => setConvertendo(false)}
      />
    );
  }

  function mudarStatus(status: LeadSaas["status"]) {
    setErro("");
    startTransition(async () => {
      const resultado = await atualizarStatusLead(lead.id, status);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  const podeAgir = lead.status === "novo" || lead.status === "contatado";

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink-900">
              {lead.nome_petshop || lead.nome_responsavel || lead.email}
            </p>
            <Badge tom={STATUS_TOM[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            {lead.email}
            {lead.telefone ? ` · ${lead.telefone}` : ""}
            {lead.nome_responsavel ? ` · ${lead.nome_responsavel}` : ""}
          </p>
          {lead.mensagem && <p className="mt-1 text-xs text-ink-500">&quot;{lead.mensagem}&quot;</p>}
        </div>
        {podeAgir && (
          <div className="flex flex-wrap items-center gap-2">
            {lead.status === "novo" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => mudarStatus("contatado")}
                className={botao({ variante: "neutra", tamanho: "sm" })}
              >
                Marcar contatado
              </button>
            )}
            <button
              type="button"
              onClick={() => setConvertendo(true)}
              className={botao({ variante: "cta", tamanho: "sm" })}
            >
              Converter em petshop
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => mudarStatus("descartado")}
              className={botao({ variante: "textoPerigo", tamanho: "sm" })}
            >
              Descartar
            </button>
          </div>
        )}
      </div>
      {erro && (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {erro}
        </p>
      )}
    </div>
  );
}
