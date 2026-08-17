"use client";

import { botao } from "@/lib/ui/styles";
import { useEffect, useState, useTransition } from "react";
import type { CategoriaServico, Pet, PrecoServico, Servico } from "@/types/database";
import { FormField, inputClass } from "@/components/ui/FormField";
import { agendarEPagar, buscarHorariosDisponiveis, type HorarioDisponivel } from "./actions";

// "YYYY-MM-DD" de amanhã em diante — agendar pra hoje pelo portal fica de
// fora de propósito (o petshop precisa de aviso mínimo pra encaixar a
// visita; hoje já é tarde demais na prática pra maioria).
function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// Mesma fórmula de calcularComposicaoPreco em
// supabase/functions/processar-cobrancas/index.ts — decisão de 16/ago/2026
// (docs/fase6_pagamentos.md, seção 1c): o petshop recebe sempre o valor
// cheio do serviço; a receita da plataforma + a taxa do gateway (Pix=R$0)
// são somadas ao tutor, mostradas separadas aqui pra transparência. Duplicada
// de propósito (mesmo motivo de confirmar_agendamento_por_whatsapp na Fase
// 5): esta função roda no browser do tutor, a outra roda numa Edge Function
// Deno — não dá pra compartilhar módulo entre os dois runtimes sem um passo
// de build a mais, que não vale a pena pra uma conta desse tamanho.
function calcularComposicaoPreco(
  valorServico: number,
  percentualPlataforma: number,
  meio: "cartao" | "pix",
  taxaCartaoPercentual: number,
  taxaCartaoFixo: number
): { taxaPlataforma: number; taxaGateway: number; valorTotal: number } {
  const taxaPlataforma = arredondar(valorServico * percentualPlataforma);
  const base = valorServico + taxaPlataforma;

  if (meio === "pix") {
    return { taxaPlataforma, taxaGateway: 0, valorTotal: arredondar(base) };
  }

  const valorTotal = arredondar((base + taxaCartaoFixo) / (1 - taxaCartaoPercentual));
  const taxaGateway = arredondar(valorTotal - base);
  return { taxaPlataforma, taxaGateway, valorTotal };
}

export function AgendarForm({
  tutorId,
  petshopId,
  pets,
  servicos,
  precos,
  categorias,
  percentualPlataforma,
  formaPagamentoPreferida,
  taxaCartaoPercentual,
  taxaCartaoFixo,
}: {
  tutorId: string;
  petshopId: string;
  pets: Pet[];
  servicos: Servico[];
  precos: PrecoServico[];
  categorias: CategoriaServico[];
  percentualPlataforma: number;
  formaPagamentoPreferida: "cartao" | "pix";
  taxaCartaoPercentual: number;
  taxaCartaoFixo: number;
}) {
  const [petId, setPetId] = useState(pets[0]?.id ?? "");
  const [servicoId, setServicoId] = useState("");
  const [data, setData] = useState(amanha());
  const [horario, setHorario] = useState("");
  const [horarios, setHorarios] = useState<HorarioDisponivel[]>([]);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);

  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<{ valorTotal: number } | null>(null);

  const petAtual = pets.find((p) => p.id === petId);
  const servicosDisponiveis = servicos.filter((s) =>
    petAtual ? precos.some((p) => p.servico_id === s.id && p.porte_id === petAtual.porte_id) : false
  );
  const precoSelecionado = precos.find(
    (p) => p.servico_id === servicoId && p.porte_id === petAtual?.porte_id
  );

  // Composição do preço (seção 1c do plano) — mesmo cálculo que
  // processar-cobrancas vai usar de fato na hora de cobrar. Meio de
  // pagamento aqui é o já cadastrado do tutor (forma_pagamento_preferida)
  // — o portal ainda não deixa escolher cartão x Pix na hora do
  // agendamento (fica pra uma próxima iteração).
  const composicao = precoSelecionado
    ? calcularComposicaoPreco(
        precoSelecionado.preco,
        percentualPlataforma,
        formaPagamentoPreferida,
        taxaCartaoPercentual,
        taxaCartaoFixo
      )
    : null;

  function nomeServico(servico: Servico): string {
    if (servico.nome_customizado) return servico.nome_customizado;
    return categorias.find((c) => c.id === servico.categoria_servico_id)?.nome ?? "Serviço";
  }

  useEffect(() => {
    if (!servicosDisponiveis.some((s) => s.id === servicoId)) {
      setServicoId(servicosDisponiveis[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  useEffect(() => {
    let cancelado = false;
    setCarregandoHorarios(true);
    setHorario("");

    buscarHorariosDisponiveis(petshopId, data).then((lista) => {
      if (!cancelado) {
        setHorarios(lista);
        setCarregandoHorarios(false);
      }
    });

    return () => {
      cancelado = true;
    };
  }, [petshopId, data]);

  function handleConfirmar() {
    setErro("");

    if (!petId || !servicoId || !horario) {
      setErro("Escolha o pet, o serviço e o horário.");
      return;
    }

    startTransition(async () => {
      const resposta = await agendarEPagar(tutorId, { pet_id: petId, servico_id: servicoId, data, horario });
      if (resposta.ok) {
        // O servidor confirma o valor do SERVIÇO (preço travado na hora do
        // agendamento); o total com taxa é o mesmo `composicao` já
        // mostrado antes de confirmar — mesma fórmula dos dois lados.
        setResultado({ valorTotal: composicao?.valorTotal ?? resposta.valor });
      } else {
        setErro(resposta.erro);
      }
    });
  }

  if (resultado) {
    return (
      <div className="rounded-xl border border-success-100 bg-success-50 px-6 py-8 text-center">
        <p className="font-display text-lg text-ink-900">Visita agendada!</p>
        <p className="mt-2 text-sm text-ink-700">
          Total cobrado: <span className="font-mono">{formatarPreco(resultado.valorTotal)}</span>.
          A cobrança já foi gerada e está sendo processada — você recebe a
          confirmação de pagamento por WhatsApp em instantes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Pet" htmlFor="agendar_pet">
            <select
              id="agendar_pet"
              className={inputClass}
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
            >
              {pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Serviço" htmlFor="agendar_servico">
            <select
              id="agendar_servico"
              className={inputClass}
              value={servicoId}
              onChange={(e) => setServicoId(e.target.value)}
              disabled={servicosDisponiveis.length === 0}
            >
              {servicosDisponiveis.length === 0 && <option value="">Nenhum serviço disponível</option>}
              {servicosDisponiveis.map((s) => (
                <option key={s.id} value={s.id}>
                  {nomeServico(s)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Data" htmlFor="agendar_data">
            <input
              id="agendar_data"
              type="date"
              className={inputClass}
              value={data}
              min={amanha()}
              onChange={(e) => setData(e.target.value)}
            />
          </FormField>

          <FormField label="Horário" htmlFor="agendar_horario">
            <select
              id="agendar_horario"
              className={inputClass}
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              disabled={carregandoHorarios}
            >
              <option value="">
                {carregandoHorarios ? "Carregando…" : "Escolha um horário"}
              </option>
              {horarios
                .filter((h) => h.livre)
                .map((h) => (
                  <option key={h.horario} value={h.horario}>
                    {h.horario}
                  </option>
                ))}
            </select>
          </FormField>
        </div>

        {precoSelecionado && composicao && (
          <div className="mt-4 space-y-1 border-t border-surface-border pt-4 text-sm">
            <div className="flex justify-between text-ink-700">
              <span>Serviço</span>
              <span className="font-mono">{formatarPreco(precoSelecionado.preco)}</span>
            </div>
            <div className="flex justify-between text-ink-500">
              <span>
                Taxa de serviço{" "}
                {formaPagamentoPreferida === "pix" ? "(Pix)" : "(cartão)"}
              </span>
              <span className="font-mono">
                {formatarPreco(composicao.taxaPlataforma + composicao.taxaGateway)}
              </span>
            </div>
            <div className="flex justify-between border-t border-surface-border pt-1 font-medium text-ink-900">
              <span>Total</span>
              <span className="font-mono">{formatarPreco(composicao.valorTotal)}</span>
            </div>
            {formaPagamentoPreferida === "cartao" && (
              <p className="pt-1 text-xs text-ink-500">
                Pagando via Pix a taxa de serviço fica menor — atualize sua
                preferência de pagamento com o petshop.
              </p>
            )}
          </div>
        )}
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={handleConfirmar}
        disabled={pending || !horario}
        className={botao({ tamanho: "lg", largura: "cheia" })}
      >
        {pending ? "Agendando…" : "Confirmar e gerar cobrança"}
      </button>
    </div>
  );
}
