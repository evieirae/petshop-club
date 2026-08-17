"use client";

import { alerta, botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { useState, useTransition, type FormEvent } from "react";
import type { CategoriaServico, Plano, PlanoPreco, PlanoServico, Porte, Servico } from "@/types/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  alternarAtivoPlano,
  atualizarPlano,
  criarPlano,
  salvarPlanoPrecos,
  salvarPlanoServicos,
} from "./actions";

function AtivoBadge({ ativo }: { ativo: boolean }) {
  // Inativo é neutro, não vermelho: desligar um serviço é uma escolha do
  // petshop, e o vermelho fica reservado pra coisa que deu errado de verdade.
  return <Badge tom={ativo ? "sucesso" : "neutro"}>{ativo ? "Ativo" : "Inativo"}</Badge>;
}

// Mesma regra de app/(app)/planos/ServicosSection.tsx (nomeExibicao): nome
// customizado se tiver, senão o nome da categoria (Banho, Tosa Higiênica…) —
// a maioria dos serviços não tem nome_customizado preenchido, então cair
// direto num "Serviço #id" (como era antes) deixava a lista de checkboxes
// ilegível.
function nomeServico(servico: Servico, categorias: CategoriaServico[]) {
  return (
    servico.nome_customizado?.trim() ||
    categorias.find((c) => c.id === servico.categoria_servico_id)?.nome ||
    "Serviço sem categoria"
  );
}

export function PlanosSection({
  petshopId,
  portes,
  categorias,
  servicos,
  planos,
  planoServicos,
  planoPrecos,
}: {
  petshopId: string;
  portes: Porte[];
  categorias: CategoriaServico[];
  servicos: Servico[];
  planos: Plano[];
  planoServicos: PlanoServico[];
  planoPrecos: PlanoPreco[];
}) {
  const [criando, setCriando] = useState(false);
  const semServicos = servicos.length === 0;

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-ink-900">Planos</h2>
          <p className="mt-1 text-sm text-ink-500">
            Combinações de serviços + cadência, com preço de assinatura fixo
            por porte.
          </p>
        </div>
        <button
          type="button"
          disabled={semServicos}
          onClick={() => setCriando((v) => !v)}
          title={semServicos ? "Cadastre pelo menos um serviço antes de criar um plano." : undefined}
          className={botao({ variante: criando ? "neutra" : "cta" })}
        >
          {criando ? "Cancelar" : "+ Novo plano"}
        </button>
      </div>

      {semServicos && (
        <p className={alerta("atencao", "mt-3 text-xs")}>
          Cadastre pelo menos um serviço na seção acima antes de montar um
          plano — todo plano é uma combinação de serviços já existentes.
        </p>
      )}

      {criando && (
        <div className="mt-4">
          <NovoPlanoForm petshopId={petshopId} onDone={() => setCriando(false)} />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {planos.length === 0 && !criando ? (
          <EmptyState
            titulo="Nenhum plano cadastrado"
            descricao="Cada plano combina serviços (banho, tosa) com um intervalo de dias e um preço fixo de assinatura por porte."
          />
        ) : (
          planos.map((plano) => (
            <PlanoCard
              key={plano.id}
              plano={plano}
              portes={portes}
              categorias={categorias}
              servicos={servicos}
              servicosSelecionados={planoServicos
                .filter((ps) => ps.plano_id === plano.id)
                .map((ps) => ps.servico_id)}
              precos={planoPrecos.filter((pp) => pp.plano_id === plano.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function NovoPlanoForm({ petshopId, onDone }: { petshopId: string; onDone: () => void }) {
  const [nome, setNome] = useState("");
  const [intervaloDias, setIntervaloDias] = useState("7");
  const [ocorrencias, setOcorrencias] = useState("4");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    const intervalo = Number(intervaloDias);
    const ocorrenciasNum = Number(ocorrencias);
    if (!nome.trim()) {
      setErro("Dê um nome pro plano.");
      return;
    }
    if (!Number.isInteger(intervalo) || intervalo <= 0) {
      setErro("Intervalo precisa ser um número de dias maior que zero.");
      return;
    }
    if (!Number.isInteger(ocorrenciasNum) || ocorrenciasNum <= 0) {
      setErro("Ocorrências por mês precisa ser um número maior que zero.");
      return;
    }

    startTransition(async () => {
      const resultado = await criarPlano(petshopId, {
        nome: nome.trim(),
        intervalo_dias: intervalo,
        ocorrencias_padrao_mes: ocorrenciasNum,
      });
      if (resultado.ok) {
        onDone();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:grid-cols-2"
    >
      <FormField label="Nome do plano" htmlFor="novo_plano_nome" full>
        <input
          id="novo_plano_nome"
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex.: Quinzenal Banho + Tosa Higiênica"
        />
      </FormField>
      <FormField
        label="Intervalo (dias)"
        htmlFor="novo_plano_intervalo"
        hint="7 = semanal, 14 = quinzenal, 30 = mensal…"
      >
        <input
          id="novo_plano_intervalo"
          type="number"
          min="1"
          step="1"
          className={inputClass}
          value={intervaloDias}
          onChange={(e) => setIntervaloDias(e.target.value)}
        />
      </FormField>
      <FormField
        label="Ocorrências padrão/mês"
        htmlFor="novo_plano_ocorrencias"
        hint="Base pro cálculo de cobrança proporcional."
      >
        <input
          id="novo_plano_ocorrencias"
          type="number"
          min="1"
          step="1"
          className={inputClass}
          value={ocorrencias}
          onChange={(e) => setOcorrencias(e.target.value)}
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className={botao()}
        >
          {pending ? "Adicionando…" : "Adicionar plano"}
        </button>
        <p className="text-xs text-ink-500">
          Depois de criar, edite pra escolher os serviços e o preço por porte.
        </p>
        {erro && (
          <p role="alert" className="text-sm text-danger-600">
            {erro}
          </p>
        )}
      </div>
    </form>
  );
}

function PlanoCard({
  plano,
  portes,
  categorias,
  servicos,
  servicosSelecionados,
  precos,
}: {
  plano: Plano;
  portes: Porte[];
  categorias: CategoriaServico[];
  servicos: Servico[];
  servicosSelecionados: string[];
  precos: PlanoPreco[];
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <PlanoEditForm
        plano={plano}
        portes={portes}
        categorias={categorias}
        servicos={servicos}
        servicosSelecionados={servicosSelecionados}
        precos={precos}
        onCancel={() => setEditando(false)}
        onSaved={() => setEditando(false)}
      />
    );
  }

  const nomesServicos = servicos
    .filter((s) => servicosSelecionados.includes(s.id))
    .map((s) => nomeServico(s, categorias));

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink-900">{plano.nome}</p>
            <AtivoBadge ativo={plano.ativo} />
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            A cada {plano.intervalo_dias} dias · {plano.ocorrencias_padrao_mes}{" "}
            ocorrências/mês ·{" "}
            {nomesServicos.length > 0 ? nomesServicos.join(", ") : "sem serviços escolhidos"}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {portes.length === 0
              ? "sem preços cadastrados"
              : portes
                  .map((p) => {
                    const preco = precos.find((pr) => pr.porte_id === p.id);
                    return `${p.nome} R$ ${preco ? preco.preco_assinatura.toFixed(2) : "—"}`;
                  })
                  .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AtivoToggleButton
            ativo={plano.ativo}
            onToggle={(novoAtivo) => alternarAtivoPlano(plano.id, novoAtivo)}
          />
          <button
            type="button"
            onClick={() => setEditando(true)}
            className={botao({ variante: "neutra", tamanho: "sm" })}
          >
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}

function AtivoToggleButton({
  ativo,
  onToggle,
}: {
  ativo: boolean;
  onToggle: (novoAtivo: boolean) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => { await onToggle(!ativo); })}
      className={botao({ variante: "neutra", tamanho: "sm" })}
    >
      {ativo ? "Desativar" : "Ativar"}
    </button>
  );
}

function PlanoEditForm({
  plano,
  portes,
  categorias,
  servicos,
  servicosSelecionados,
  precos,
  onCancel,
  onSaved,
}: {
  plano: Plano;
  portes: Porte[];
  categorias: CategoriaServico[];
  servicos: Servico[];
  servicosSelecionados: string[];
  precos: PlanoPreco[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(plano.nome);
  const [intervaloDias, setIntervaloDias] = useState(String(plano.intervalo_dias));
  const [ocorrencias, setOcorrencias] = useState(String(plano.ocorrencias_padrao_mes));
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(servicosSelecionados)
  );
  const [precosPorPorte, setPrecosPorPorte] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      portes.map((p) => [
        p.id,
        precos.find((pr) => pr.porte_id === p.id)?.preco_assinatura.toString() ?? "",
      ])
    )
  );
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function alternarServico(servicoId: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(servicoId)) novo.delete(servicoId);
      else novo.add(servicoId);
      return novo;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    const intervalo = Number(intervaloDias);
    const ocorrenciasNum = Number(ocorrencias);
    if (!nome.trim()) {
      setErro("Dê um nome pro plano.");
      return;
    }
    if (!Number.isInteger(intervalo) || intervalo <= 0) {
      setErro("Intervalo precisa ser um número de dias maior que zero.");
      return;
    }
    if (!Number.isInteger(ocorrenciasNum) || ocorrenciasNum <= 0) {
      setErro("Ocorrências por mês precisa ser um número maior que zero.");
      return;
    }

    const precosParaSalvar = portes
      .filter((p) => precosPorPorte[p.id] !== "")
      .map((p) => ({ porte_id: p.id, preco_assinatura: Number(precosPorPorte[p.id]) }));

    if (precosParaSalvar.some((p) => Number.isNaN(p.preco_assinatura) || p.preco_assinatura < 0)) {
      setErro("Os preços precisam ser números maiores ou iguais a zero.");
      return;
    }

    startTransition(async () => {
      const resultadoPlano = await atualizarPlano(plano.id, {
        nome: nome.trim(),
        intervalo_dias: intervalo,
        ocorrencias_padrao_mes: ocorrenciasNum,
      });
      if (!resultadoPlano.ok) {
        setErro(resultadoPlano.erro);
        return;
      }

      const resultadoServicos = await salvarPlanoServicos(plano.id, Array.from(selecionados));
      if (!resultadoServicos.ok) {
        setErro(resultadoServicos.erro);
        return;
      }

      if (precosParaSalvar.length > 0) {
        const resultadoPrecos = await salvarPlanoPrecos(plano.id, precosParaSalvar);
        if (!resultadoPrecos.ok) {
          setErro(resultadoPrecos.erro);
          return;
        }
      }

      onSaved();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:grid-cols-2"
    >
      <FormField label="Nome do plano" htmlFor={`plano_nome_${plano.id}`} full>
        <input
          id={`plano_nome_${plano.id}`}
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </FormField>
      <FormField label="Intervalo (dias)" htmlFor={`plano_intervalo_${plano.id}`}>
        <input
          id={`plano_intervalo_${plano.id}`}
          type="number"
          min="1"
          step="1"
          className={inputClass}
          value={intervaloDias}
          onChange={(e) => setIntervaloDias(e.target.value)}
        />
      </FormField>
      <FormField label="Ocorrências padrão/mês" htmlFor={`plano_ocorrencias_${plano.id}`}>
        <input
          id={`plano_ocorrencias_${plano.id}`}
          type="number"
          min="1"
          step="1"
          className={inputClass}
          value={ocorrencias}
          onChange={(e) => setOcorrencias(e.target.value)}
        />
      </FormField>

      <FormField label="Serviços incluídos" htmlFor={`plano_servicos_${plano.id}`} full>
        {servicos.length === 0 ? (
          <p className="text-sm text-ink-500">Nenhum serviço cadastrado ainda.</p>
        ) : (
          <div id={`plano_servicos_${plano.id}`} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {servicos.map((servico) => (
              <label
                key={servico.id}
                className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-ink-700"
              >
                <input
                  type="checkbox"
                  checked={selecionados.has(servico.id)}
                  onChange={() => alternarServico(servico.id)}
                  className="h-4 w-4 rounded border-surface-border text-brand-500 focus:ring-brand-500"
                />
                {nomeServico(servico, categorias)}
                {!servico.ativo && (
                  <span className="text-xs text-danger-600">(inativo)</span>
                )}
              </label>
            ))}
          </div>
        )}
      </FormField>

      <FormField
        label="Preço da assinatura por porte"
        htmlFor={`plano_preco_${portes[0]?.id}_${plano.id}`}
        full
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {portes.map((porte) => (
            <div key={porte.id}>
              <label
                htmlFor={`plano_preco_${porte.id}_${plano.id}`}
                className="mb-1 block text-xs text-ink-500"
              >
                {porte.nome}
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-ink-500">R$</span>
                <input
                  id={`plano_preco_${porte.id}_${plano.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className={inputClass}
                  value={precosPorPorte[porte.id] ?? ""}
                  onChange={(e) =>
                    setPrecosPorPorte((atual) => ({ ...atual, [porte.id]: e.target.value }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className={botao()}
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-ink-500 hover:text-ink-700"
        >
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
