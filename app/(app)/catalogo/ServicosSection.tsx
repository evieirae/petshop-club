"use client";

import { botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { useState, useTransition, type FormEvent } from "react";
import type { CategoriaServico, Porte, PrecoServico, Servico } from "@/types/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  alternarAtivoServico,
  atualizarServico,
  criarServico,
  salvarPrecosServico,
} from "./actions";

function nomeExibicao(servico: Servico, categoria?: CategoriaServico) {
  return servico.nome_customizado?.trim() || categoria?.nome || "Serviço sem categoria";
}

function AtivoBadge({ ativo }: { ativo: boolean }) {
  // Inativo é neutro, não vermelho: desligar um serviço é uma escolha do
  // petshop, e o vermelho fica reservado pra coisa que deu errado de verdade.
  return <Badge tom={ativo ? "sucesso" : "neutro"}>{ativo ? "Ativo" : "Inativo"}</Badge>;
}

export function ServicosSection({
  petshopId,
  portes,
  categorias,
  servicos,
  precos,
}: {
  petshopId: string;
  portes: Porte[];
  categorias: CategoriaServico[];
  servicos: Servico[];
  precos: PrecoServico[];
}) {
  const [criando, setCriando] = useState(false);
  // Filtros (pedido de 20/ago/2026) — client-side sobre o que já veio do
  // server, mesmo padrão usado em Tutores/Pets.
  const [categoriaFiltro, setCategoriaFiltro] = useState<number | "todas">("todas");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "ativos" | "inativos">("todos");

  const servicosFiltrados = servicos.filter((servico) => {
    if (categoriaFiltro !== "todas" && servico.categoria_servico_id !== categoriaFiltro) return false;
    if (statusFiltro === "ativos" && !servico.ativo) return false;
    if (statusFiltro === "inativos" && servico.ativo) return false;
    return true;
  });

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-ink-900">Serviços</h2>
          <p className="mt-1 text-sm text-ink-500">
            O cardápio deste petshop — cada serviço tem um preço avulso de
            referência por porte.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCriando((v) => !v)}
          className={botao({ variante: criando ? "neutra" : "cta" })}
        >
          {criando ? "Cancelar" : "+ Novo serviço"}
        </button>
      </div>

      {criando && (
        <div className="mt-4">
          <NovoServicoForm
            petshopId={petshopId}
            categorias={categorias}
            onDone={() => setCriando(false)}
          />
        </div>
      )}

      {servicos.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-card p-3">
          <div>
            <label htmlFor="servicos_filtro_categoria" className="mb-1 block text-xs font-medium text-ink-500">
              Categoria
            </label>
            <select
              id="servicos_filtro_categoria"
              className={inputClass}
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value === "todas" ? "todas" : Number(e.target.value))}
            >
              <option value="todas">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="servicos_filtro_status" className="mb-1 block text-xs font-medium text-ink-500">
              Status
            </label>
            <select
              id="servicos_filtro_status"
              className={inputClass}
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as "todos" | "ativos" | "inativos")}
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {servicos.length === 0 && !criando ? (
          <EmptyState
            titulo="Nenhum serviço cadastrado"
            descricao="Comece pelo básico: banho, tosa higiênica, tosa completa, hidratação. Os planos da seção abaixo só podem usar serviços já cadastrados aqui."
          />
        ) : servicosFiltrados.length === 0 ? (
          <EmptyState
            titulo="Nenhum serviço encontrado com esse filtro"
            descricao="Ajuste os filtros acima."
          />
        ) : (
          servicosFiltrados.map((servico) => (
            <ServicoCard
              key={servico.id}
              servico={servico}
              categorias={categorias}
              portes={portes}
              precos={precos.filter((p) => p.servico_id === servico.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function NovoServicoForm({
  petshopId,
  categorias,
  onDone,
}: {
  petshopId: string;
  categorias: CategoriaServico[];
  onDone: () => void;
}) {
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? 0);
  const [nomeCustomizado, setNomeCustomizado] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    startTransition(async () => {
      const resultado = await criarServico(petshopId, {
        categoria_servico_id: categoriaId,
        nome_customizado: nomeCustomizado.trim() || null,
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
      <FormField label="Categoria" htmlFor="nova_categoria">
        <select
          id="nova_categoria"
          className={inputClass}
          value={categoriaId}
          onChange={(e) => setCategoriaId(Number(e.target.value))}
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Nome customizado"
        htmlFor="novo_nome_customizado"
        hint="Opcional — deixe em branco pra usar só o nome da categoria."
      >
        <input
          id="novo_nome_customizado"
          className={inputClass}
          value={nomeCustomizado}
          onChange={(e) => setNomeCustomizado(e.target.value)}
          placeholder="ex.: Banho com escovação"
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className={botao()}
        >
          {pending ? "Adicionando…" : "Adicionar serviço"}
        </button>
        <p className="text-xs text-ink-500">
          Depois de criar, edite pra definir o preço por porte.
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

function ServicoCard({
  servico,
  categorias,
  portes,
  precos,
}: {
  servico: Servico;
  categorias: CategoriaServico[];
  portes: Porte[];
  precos: PrecoServico[];
}) {
  const [editando, setEditando] = useState(false);
  const categoria = categorias.find((c) => c.id === servico.categoria_servico_id);

  if (editando) {
    return (
      <ServicoEditForm
        servico={servico}
        categorias={categorias}
        portes={portes}
        precos={precos}
        onCancel={() => setEditando(false)}
        onSaved={() => setEditando(false)}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-card p-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink-900">{nomeExibicao(servico, categoria)}</p>
          <AtivoBadge ativo={servico.ativo} />
        </div>
        <p className="mt-0.5 text-xs text-ink-500">
          {categoria?.nome ?? "Sem categoria"} ·{" "}
          {portes.length === 0
            ? "sem preços cadastrados"
            : portes
                .map((p) => {
                  const preco = precos.find((pr) => pr.porte_id === p.id);
                  return `${p.nome} R$ ${preco ? preco.preco.toFixed(2) : "—"}`;
                })
                .join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <AtivoToggleButton
          ativo={servico.ativo}
          onToggle={(novoAtivo) => alternarAtivoServico(servico.id, novoAtivo)}
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

function ServicoEditForm({
  servico,
  categorias,
  portes,
  precos,
  onCancel,
  onSaved,
}: {
  servico: Servico;
  categorias: CategoriaServico[];
  portes: Porte[];
  precos: PrecoServico[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [categoriaId, setCategoriaId] = useState(servico.categoria_servico_id);
  const [nomeCustomizado, setNomeCustomizado] = useState(servico.nome_customizado ?? "");
  const [precosPorPorte, setPrecosPorPorte] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      portes.map((p) => [p.id, precos.find((pr) => pr.porte_id === p.id)?.preco.toString() ?? ""])
    )
  );
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    const precosParaSalvar = portes
      .filter((p) => precosPorPorte[p.id] !== "")
      .map((p) => ({ porte_id: p.id, preco: Number(precosPorPorte[p.id]) }));

    if (precosParaSalvar.some((p) => Number.isNaN(p.preco) || p.preco < 0)) {
      setErro("Os preços precisam ser números maiores ou iguais a zero.");
      return;
    }

    startTransition(async () => {
      const resultadoServico = await atualizarServico(servico.id, {
        categoria_servico_id: categoriaId,
        nome_customizado: nomeCustomizado.trim() || null,
      });
      if (!resultadoServico.ok) {
        setErro(resultadoServico.erro);
        return;
      }

      if (precosParaSalvar.length > 0) {
        const resultadoPrecos = await salvarPrecosServico(servico.id, precosParaSalvar);
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
      <FormField label="Categoria" htmlFor={`categoria_${servico.id}`}>
        <select
          id={`categoria_${servico.id}`}
          className={inputClass}
          value={categoriaId}
          onChange={(e) => setCategoriaId(Number(e.target.value))}
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Nome customizado"
        htmlFor={`nome_customizado_${servico.id}`}
        hint="Opcional — deixe em branco pra usar só o nome da categoria."
      >
        <input
          id={`nome_customizado_${servico.id}`}
          className={inputClass}
          value={nomeCustomizado}
          onChange={(e) => setNomeCustomizado(e.target.value)}
        />
      </FormField>

      <FormField label="Preço avulso por porte" htmlFor={`preco_${portes[0]?.id}_${servico.id}`} full>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {portes.map((porte) => (
            <div key={porte.id}>
              <label
                htmlFor={`preco_${porte.id}_${servico.id}`}
                className="mb-1 block text-xs text-ink-500"
              >
                {porte.nome}
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-ink-500">R$</span>
                <input
                  id={`preco_${porte.id}_${servico.id}`}
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
