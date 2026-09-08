"use client";

import Link from "next/link";
import { botao, superficie } from "@/lib/ui/styles";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import type { Petshop, UsuarioPetshop } from "@/types/database";
import type { TomBadge } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  atualizarStatusPetshop,
  atualizarTaxasPlataforma,
  resetarSenhaUsuarioPetshop,
} from "../actions";
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

export function PetshopsAdminSection({
  petshops,
  usuarios,
}: {
  petshops: Petshop[];
  usuarios: UsuarioPetshop[];
}) {
  const [criandoPetshop, setCriandoPetshop] = useState(false);

  // Equipe agrupada por petshop, dono sempre antes de atendente — é quem a
  // administração mais provavelmente vai precisar resetar primeiro.
  const usuariosPorPetshop = useMemo(() => {
    const mapa = new Map<string, UsuarioPetshop[]>();
    usuarios.forEach((usuario) => {
      const lista = mapa.get(usuario.petshop_id) ?? [];
      lista.push(usuario);
      mapa.set(usuario.petshop_id, lista);
    });
    mapa.forEach((lista) =>
      lista.sort((a, b) => (a.papel === b.papel ? 0 : a.papel === "dono" ? -1 : 1))
    );
    return mapa;
  }, [usuarios]);

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
          petshops.map((petshop) => (
            <PetshopCard
              key={petshop.id}
              petshop={petshop}
              usuarios={usuariosPorPetshop.get(petshop.id) ?? []}
            />
          ))
        )}
      </div>
    </section>
  );
}

type SenhaRevelada = { nome: string; email: string; senha: string; emailEnviado: boolean };

function PetshopCard({ petshop, usuarios }: { petshop: Petshop; usuarios: UsuarioPetshop[] }) {
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erroStatus, setErroStatus] = useState("");

  const [pendingSenha, startTransitionSenha] = useTransition();
  const [erroSenha, setErroSenha] = useState("");
  const [revelada, setRevelada] = useState<SenhaRevelada | null>(null);

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

  function resetarSenha(usuarioId: string) {
    setErroSenha("");
    startTransitionSenha(async () => {
      const resposta = await resetarSenhaUsuarioPetshop(usuarioId);
      if (resposta.ok) {
        setRevelada({
          nome: resposta.nome,
          email: resposta.email,
          senha: resposta.senha,
          emailEnviado: resposta.emailEnviado,
        });
      } else {
        setErroSenha(resposta.erro);
      }
    });
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/petshops/${petshop.id}`}
              className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
            >
              {petshop.nome}
            </Link>
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
          <Link
            href={`/admin/petshops/${petshop.id}`}
            className={botao({ variante: "neutra", tamanho: "sm" })}
          >
            Configurações
          </Link>
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

      {usuarios.length > 0 && (
        <div className="mt-4 border-t border-surface-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Equipe com acesso
          </p>
          <div className="mt-2 space-y-2">
            {usuarios.map((usuario) => (
              <div key={usuario.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-900">
                  {usuario.nome}{" "}
                  <span className="text-xs text-ink-500">
                    ({usuario.papel === "dono" ? "dono" : "atendente"})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => resetarSenha(usuario.id)}
                  disabled={pendingSenha}
                  className={botao({ variante: "texto", tamanho: "sm" })}
                >
                  Nova senha
                </button>
              </div>
            ))}
          </div>

          {erroSenha && (
            <p role="alert" className="mt-2 text-sm text-danger-600">
              {erroSenha}
            </p>
          )}

          {revelada && (
            <div className={`mt-3 ${superficie.blocoEdicao}`}>
              <p className="text-sm font-medium text-ink-900">
                Senha de {revelada.nome} redefinida. Anote agora — ela só aparece uma vez:
              </p>
              <p className="mt-3 select-all rounded-lg border border-brand-200 bg-surface-card px-4 py-3 text-center font-mono text-lg tracking-wide text-ink-900">
                {revelada.senha}
              </p>
              <p className="mt-2 text-xs text-ink-500">
                Login: <span className="font-mono">{revelada.email}</span>
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {revelada.emailEnviado
                  ? "Também mandamos um e-mail com essa senha pra essa conta."
                  : "Não deu pra mandar e-mail automático — avise a pessoa manualmente."}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setRevelada(null)}
                  className={botao({ tamanho: "sm" })}
                >
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>
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
