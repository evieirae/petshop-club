"use client";

import { botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { useState, useTransition, type FormEvent } from "react";
import type { FuncaoFuncionario, Funcionario } from "@/types/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  alternarAtivoFuncionario,
  atualizarFuncionario,
  criarFuncionario,
  type FuncionarioInput,
} from "./actions";

// Funcionários (migration 0016, pedido do Eduardo em 20/ago/2026). Fica
// fora do <form> de configurações de propósito: são dois salvamentos
// independentes (o formulário grande salva colunas de `petshops`, cada
// funcionário salva a própria linha), e <form> aninhado não existe em HTML.
//
// Não é login. Quem acessa o sistema continua sendo usuarios_petshop — aqui
// é só "quem trabalha no petshop", pra aparecer como vendedor numa venda e
// como responsável por um banho/tosa.

const FUNCOES: { valor: FuncaoFuncionario; label: string }[] = [
  { valor: "tosador", label: "Tosador(a)" },
  { valor: "banhista", label: "Banhista" },
  { valor: "atendente", label: "Atendente" },
  { valor: "vendedor", label: "Vendedor(a)" },
  { valor: "veterinario", label: "Veterinário(a)" },
  { valor: "outro", label: "Outro" },
];

function labelFuncao(funcao: FuncaoFuncionario): string {
  return FUNCOES.find((f) => f.valor === funcao)?.label ?? funcao;
}

export function FuncionariosSection({
  petshopId,
  funcionarios,
  comissaoAtiva,
  percentualPadraoVenda,
  percentualPadraoServico,
}: {
  petshopId: string;
  funcionarios: Funcionario[];
  comissaoAtiva: boolean;
  percentualPadraoVenda: number;
  percentualPadraoServico: number;
}) {
  const [criando, setCriando] = useState(false);

  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);

  return (
    <section className="rounded-xl border border-surface-border bg-surface-card p-6 shadow-card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-brand-50 font-mono text-xs font-medium text-brand-700">
            6
          </span>
          <div>
            <h2 className="font-display text-lg text-ink-900">Funcionários</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              Quem trabalha no petshop, pra aparecer como vendedor numa venda e
              como responsável por um banho ou tosa. Isso não cria login — é só
              cadastro.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCriando((v) => !v)}
          className={botao({ variante: criando ? "neutra" : "cta", tamanho: "sm" })}
        >
          {criando ? "Cancelar" : "+ Novo funcionário"}
        </button>
      </div>

      {criando && (
        <div className="mb-4">
          <FuncionarioForm
            petshopId={petshopId}
            comissaoAtiva={comissaoAtiva}
            percentualPadraoVenda={percentualPadraoVenda}
            percentualPadraoServico={percentualPadraoServico}
            onDone={() => setCriando(false)}
          />
        </div>
      )}

      {funcionarios.length === 0 && !criando ? (
        <EmptyState
          titulo="Nenhum funcionário cadastrado"
          descricao="Cadastre a equipe pra poder marcar quem vendeu cada produto e quem atendeu cada pet — e, se quiser, calcular comissão em cima disso."
        />
      ) : (
        <div className="space-y-3">
          {ativos.map((funcionario) => (
            <FuncionarioCard
              key={funcionario.id}
              funcionario={funcionario}
              comissaoAtiva={comissaoAtiva}
              percentualPadraoVenda={percentualPadraoVenda}
              percentualPadraoServico={percentualPadraoServico}
            />
          ))}

          {inativos.length > 0 && (
            <>
              <p className="pt-3 text-xs font-medium uppercase tracking-wide text-ink-500">
                Não trabalham mais aqui
              </p>
              {inativos.map((funcionario) => (
                <FuncionarioCard
                  key={funcionario.id}
                  funcionario={funcionario}
                  comissaoAtiva={comissaoAtiva}
                  percentualPadraoVenda={percentualPadraoVenda}
                  percentualPadraoServico={percentualPadraoServico}
                />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function FuncionarioCard({
  funcionario,
  comissaoAtiva,
  percentualPadraoVenda,
  percentualPadraoServico,
}: {
  funcionario: Funcionario;
  comissaoAtiva: boolean;
  percentualPadraoVenda: number;
  percentualPadraoServico: number;
}) {
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editando) {
    return (
      <FuncionarioForm
        petshopId={funcionario.petshop_id}
        funcionario={funcionario}
        comissaoAtiva={comissaoAtiva}
        percentualPadraoVenda={percentualPadraoVenda}
        percentualPadraoServico={percentualPadraoServico}
        onDone={() => setEditando(false)}
      />
    );
  }

  const pctVenda = funcionario.comissao_percentual_venda ?? percentualPadraoVenda;
  const pctServico = funcionario.comissao_percentual_servico ?? percentualPadraoServico;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-card p-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink-900">{funcionario.nome}</p>
          <Badge tom={funcionario.ativo ? "sucesso" : "neutro"}>
            {funcionario.ativo ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-ink-500">
          {labelFuncao(funcionario.funcao)}
          {funcionario.telefone ? ` · ${funcionario.telefone}` : ""}
          {comissaoAtiva && ` · comissão ${pctVenda}% em venda, ${pctServico}% em serviço`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await alternarAtivoFuncionario(funcionario.id, !funcionario.ativo);
            })
          }
          className={botao({ variante: "neutra", tamanho: "sm" })}
        >
          {funcionario.ativo ? "Desativar" : "Reativar"}
        </button>
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

function FuncionarioForm({
  petshopId,
  funcionario,
  comissaoAtiva,
  percentualPadraoVenda,
  percentualPadraoServico,
  onDone,
}: {
  petshopId: string;
  funcionario?: Funcionario;
  comissaoAtiva: boolean;
  percentualPadraoVenda: number;
  percentualPadraoServico: number;
  onDone: () => void;
}) {
  const [nome, setNome] = useState(funcionario?.nome ?? "");
  const [funcao, setFuncao] = useState<FuncaoFuncionario>(funcionario?.funcao ?? "atendente");
  const [telefone, setTelefone] = useState(funcionario?.telefone ?? "");
  // Campo vazio = herda o padrão do petshop. Digitar 0 é diferente: significa
  // "essa pessoa não ganha comissão nisso" (por isso null vs 0 no banco).
  const [pctVenda, setPctVenda] = useState(
    funcionario?.comissao_percentual_venda != null
      ? String(funcionario.comissao_percentual_venda)
      : ""
  );
  const [pctServico, setPctServico] = useState(
    funcionario?.comissao_percentual_servico != null
      ? String(funcionario.comissao_percentual_servico)
      : ""
  );
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function validarPercentual(valor: string): number | null | "invalido" {
    if (valor.trim() === "") return null;
    const numero = Number(valor);
    if (Number.isNaN(numero) || numero < 0 || numero > 100) return "invalido";
    return numero;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!nome.trim()) {
      setErro("Informe o nome do funcionário.");
      return;
    }

    const venda = validarPercentual(pctVenda);
    const servico = validarPercentual(pctServico);
    if (venda === "invalido" || servico === "invalido") {
      setErro("Os percentuais precisam ficar entre 0 e 100 — ou em branco pra usar o padrão.");
      return;
    }

    const dados: FuncionarioInput = {
      nome: nome.trim(),
      funcao,
      telefone: telefone.trim() || null,
      comissao_percentual_venda: venda,
      comissao_percentual_servico: servico,
    };

    startTransition(async () => {
      const resultado = funcionario
        ? await atualizarFuncionario(funcionario.id, dados)
        : await criarFuncionario(petshopId, dados);
      if (resultado.ok) {
        onDone();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  const prefixo = funcionario ? `funcionario_${funcionario.id}` : "novo_funcionario";

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:grid-cols-2"
    >
      <FormField label="Nome" htmlFor={`${prefixo}_nome`}>
        <input
          id={`${prefixo}_nome`}
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex.: Ana Paula"
        />
      </FormField>
      <FormField label="Função" htmlFor={`${prefixo}_funcao`}>
        <select
          id={`${prefixo}_funcao`}
          className={inputClass}
          value={funcao}
          onChange={(e) => setFuncao(e.target.value as FuncaoFuncionario)}
        >
          {FUNCOES.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Telefone" htmlFor={`${prefixo}_telefone`} hint="Opcional — só pra contato interno.">
        <input
          id={`${prefixo}_telefone`}
          className={inputClass}
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(48) 99999-0000"
        />
      </FormField>

      {comissaoAtiva && (
        <>
          <FormField
            label="Comissão em venda (%)"
            htmlFor={`${prefixo}_pct_venda`}
            hint={`Em branco = usa o padrão (${percentualPadraoVenda}%). Zero = essa pessoa não ganha comissão em venda.`}
          >
            <input
              id={`${prefixo}_pct_venda`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              inputMode="decimal"
              className={inputClass}
              value={pctVenda}
              onChange={(e) => setPctVenda(e.target.value)}
              placeholder={String(percentualPadraoVenda)}
            />
          </FormField>
          <FormField
            label="Comissão em serviço (%)"
            htmlFor={`${prefixo}_pct_servico`}
            hint={`Em branco = usa o padrão (${percentualPadraoServico}%).`}
          >
            <input
              id={`${prefixo}_pct_servico`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              inputMode="decimal"
              className={inputClass}
              value={pctServico}
              onChange={(e) => setPctServico(e.target.value)}
              placeholder={String(percentualPadraoServico)}
            />
          </FormField>
        </>
      )}

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={botao({ tamanho: "sm" })}>
          {pending ? "Salvando…" : funcionario ? "Salvar" : "Adicionar funcionário"}
        </button>
        <button type="button" onClick={onDone} className={botao({ variante: "neutra", tamanho: "sm" })}>
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
