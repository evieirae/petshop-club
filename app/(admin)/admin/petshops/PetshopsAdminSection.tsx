"use client";

import { botao } from "@/lib/ui/styles";
import { useState, useTransition, type FormEvent } from "react";
import type { Petshop } from "@/types/database";
import type { TomBadge } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { atualizarStatusPetshop, atualizarTaxasPlataforma } from "../actions";
import { NovoPetshopForm } from "../NovoPetshopForm";

// 0.03 (fracao, como fica em petshops.percentual_plataforma) <-> "3" (%, o
// que a pessoa realmente quer digitar) — mesma conversao usada em
// app/(app)/configuracoes/ConfiguracoesForm.tsx.
function paraPercentualExibido(fracao: number): string {
  return String(Math.round(fracao * 10000) / 100);
}

const STATUS_LABEL: Record<Petshop["status"], string> = {
  ativo: "Ativo",
  congelado: "Congelado",
  encerrado: "Encerrado",
};

const STATUS_TOM: Record<Petshop["status"], TomBadge> = {
  ativo: "sucesso",
  congelado: "atencao",
  encerrado: "erro",
};

export function PetshopsAdminSection({ petshops }: { petshops: Petshop[] }) {
  const [criandoPetshop, setCriandoPetshop] = useState(false);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          {petshops.length} petshop{petshops.length === 1 ? "" : "s"} cadastrado
          {petshops.length === 1 ? "" : "s"}.
        </p>
        <button
          type="button"
          onClick={() => setCriandoPetshop((v) => !v)}
          className={botao({ variante: criandoPetshop ? "neutra" : "cta" })}
        >
          {criandoPetshop ? "Cancelar" : "+ Novo petshop"}
        </button>
      </div>

      {criandoPetshop && (
        <div className="mt-4">
          <NovoPetshopForm onCancel={() => setCriandoPetshop(false)} />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {petshops.length === 0 && !criandoPetshop ? (
          <EmptyState
            titulo="Nenhum petshop cadastrado"
            descricao="Use “+ Novo petshop” acima, ou converta um lead em /admin/leads."
          />
        ) : (
          petshops.map((petshop) => <PetshopCard key={petshop.id} petshop={petshop} />)
        )}
      </div>
    </section>
  );
}

function PetshopCard({ petshop }: { petshop: Petshop }) {
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erroStatus, setErroStatus] = useState("");

  if (editando) {
    return (
      <PetshopTaxasEditForm petshop={petshop} onCancel={() => setEditando(false)} onSaved={() => setEditando(false)} />
    );
  }

  const isento =
    petshop.isento_fee_ate && new Date(petshop.isento_fee_ate) >= new Date(new Date().toDateString());

  function mudarStatus(novoStatus: Petshop["status"]) {
    setErroStatus("");
    startTransition(async () => {
      const resultado = await atualizarStatusPetshop(petshop.id, novoStatus);
      if (!resultado.ok) setErroStatus(resultado.erro);
    });
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink-900">{petshop.nome}</p>
            <Badge tom={STATUS_TOM[petshop.status]}>{STATUS_LABEL[petshop.status]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            R$ {petshop.fee_fixo_mensal.toFixed(2)}/mês ·{" "}
            {paraPercentualExibido(petshop.percentual_plataforma)}% por cobrança
            {petshop.isento_fee_ate && (
              <>
                {" "}
                ·{" "}
                <span className={isento ? "text-success-700" : undefined}>
                  isento até {petshop.isento_fee_ate}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className={botao({ variante: "neutra", tamanho: "sm" })}
          >
            Editar taxas
          </button>
          {petshop.status !== "ativo" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => mudarStatus("ativo")}
              className={botao({ variante: "neutra", tamanho: "sm" })}
            >
              Reativar
            </button>
          )}
          {petshop.status === "ativo" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => mudarStatus("congelado")}
              className={botao({ variante: "neutra", tamanho: "sm" })}
            >
              Congelar
            </button>
          )}
          {petshop.status !== "encerrado" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => mudarStatus("encerrado")}
              className={botao({ variante: "perigo", tamanho: "sm" })}
            >
              Encerrar
            </button>
          )}
        </div>
      </div>
      {erroStatus && (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {erroStatus}
        </p>
      )}
    </div>
  );
}

function PetshopTaxasEditForm({
  petshop,
  onCancel,
  onSaved,
}: {
  petshop: Petshop;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [feeFixo, setFeeFixo] = useState(String(petshop.fee_fixo_mensal));
  const [percentual, setPercentual] = useState(paraPercentualExibido(petshop.percentual_plataforma));
  const [isentoAte, setIsentoAte] = useState(petshop.isento_fee_ate ?? "");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    const fee = Number(feeFixo);
    const percentualNum = Number(percentual);

    if (Number.isNaN(fee) || fee < 0) {
      setErro("Fee fixo precisa ser um número maior ou igual a zero.");
      return;
    }
    if (Number.isNaN(percentualNum) || percentualNum < 0 || percentualNum > 100) {
      setErro("Percentual precisa ser um número entre 0 e 100.");
      return;
    }

    startTransition(async () => {
      const resultado = await atualizarTaxasPlataforma(petshop.id, {
        fee_fixo_mensal: fee,
        percentual_plataforma: percentualNum / 100,
        isento_fee_ate: isentoAte || null,
      });
      if (resultado.ok) {
        onSaved();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:grid-cols-3"
    >
      <p className="text-sm font-medium text-ink-900 sm:col-span-3">{petshop.nome}</p>

      <FormField label="Fee fixo mensal" htmlFor={`admin_fee_${petshop.id}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-500">R$</span>
          <input
            id={`admin_fee_${petshop.id}`}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className={inputClass}
            value={feeFixo}
            onChange={(e) => setFeeFixo(e.target.value)}
          />
        </div>
      </FormField>

      <FormField label="Percentual da plataforma" htmlFor={`admin_percentual_${petshop.id}`}>
        <div className="flex items-center gap-2">
          <input
            id={`admin_percentual_${petshop.id}`}
            type="number"
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            className={inputClass}
            value={percentual}
            onChange={(e) => setPercentual(e.target.value)}
          />
          <span className="text-sm text-ink-500">%</span>
        </div>
      </FormField>

      <FormField
        label="Isento até"
        htmlFor={`admin_isento_${petshop.id}`}
        hint="Período de piloto — deixe em branco fora dele."
      >
        <input
          id={`admin_isento_${petshop.id}`}
          type="date"
          className={inputClass}
          value={isentoAte}
          onChange={(e) => setIsentoAte(e.target.value)}
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className={botao()}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-ink-500 hover:text-ink-700">
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
