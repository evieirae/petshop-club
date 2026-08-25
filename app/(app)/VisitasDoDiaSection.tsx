"use client";

// Quadro Kanban com as visitas de hoje — pedido de 18/ago/2026 pra Visão
// Geral (fileira horizontal única), reorganizado em colunas por estágio em
// 20/ago/2026. Cada status tem sua própria cor (migration 0014 +
// lib/design/tokens.ts, tom "progresso" — roxo), todo clique grava um
// evento com timestamp (tabela agendamento_status_eventos, gerada sozinha
// por trigger — nenhum código daqui escreve nela direto), e um botão
// pequeno de "desfazer" cobre clique errado.
//
// Fluxo: agendado/confirmado/reagendado -> presente -> pronto -> entregue.
// Reaproveita marcarPresente/marcarPronto/marcarEntregue/
// voltarStatusAgendamento de app/(app)/agenda/actions.ts — mesmas Server
// Actions que a Agenda usa, sem reimplementar a transição de status (mesmo
// princípio já seguido em todo o resto do projeto).
//
// De propósito SEM "Confirmar"/"Reagendar"/"Cancelar" aqui: essas ações
// continuam só na Agenda. A Visão Geral cobre o fluxo físico do dia (pet
// chega -> banho/tosa -> pronto -> entregue), que é o que importa numa tela
// de resumo; o resto é edição de verdade e pede o contexto completo da
// Agenda.
//
// COLUNAS (20/ago/2026): agrupa as visitas por estágio do fluxo em vez de
// uma fileira só — cada card continua com a cor do PRÓPRIO status
// (tomCores[TOM_STATUS[status]], já existia), não uma cor por coluna, então
// "Aguardando" ainda distingue visualmente agendado/confirmado/reagendado
// entre si. Quando o status muda, a Server Action revalida a página e o
// card recalcula sozinho pra qual coluna pertence — sem lógica de
// animação/drag, é só re-render.

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { cx, tomCores } from "@/lib/ui/styles";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  type AgendamentoResolvido,
  formatarHorario,
  LABEL_STATUS,
  podeVoltarNoQuadro,
  proximoStatusQuadro,
  racaDoPet,
  TOM_STATUS,
} from "@/lib/agenda/resolver";
import type { Agendamento, StatusAgendamento } from "@/types/database";
import {
  marcarEntregue,
  marcarPresente,
  marcarPronto,
  voltarStatusAgendamento,
  type ActionResult,
} from "./agenda/actions";

// Rótulo do próximo passo, em forma de ação ("toque pra..."). Separado de
// LABEL_STATUS (que é o rótulo do status em SI, ex. "Pronto p/ busca") —
// aqui é sempre um verbo curto, cabe melhor no card compacto.
const ROTULO_PROXIMO_PASSO: Record<"presente" | "pronto" | "entregue", string> = {
  presente: "Toque: marcar presente",
  pronto: "Toque: marcar pronto",
  entregue: "Toque: marcar entregue",
};

const ACAO_POR_PROXIMO_STATUS: Record<
  "presente" | "pronto" | "entregue",
  (id: string) => Promise<ActionResult>
> = {
  presente: marcarPresente,
  pronto: marcarPronto,
  entregue: marcarEntregue,
};

// Colunas do quadro. "Fora do fluxo" só aparece se tiver alguma visita
// faltou/cancelada hoje — não faz sentido poluir o quadro com uma coluna
// vazia todo dia sem falta nenhuma.
const COLUNAS: { chave: string; label: string; statuses: StatusAgendamento[]; opcional?: boolean }[] = [
  { chave: "aguardando", label: "Aguardando", statuses: ["agendado", "confirmado", "reagendado"] },
  { chave: "presente", label: "Presente", statuses: ["presente"] },
  { chave: "pronto", label: "Pronto p/ busca", statuses: ["pronto"] },
  { chave: "entregue", label: "Entregue", statuses: ["entregue"] },
  { chave: "fora", label: "Faltou / Cancelado", statuses: ["faltou", "cancelado"], opcional: true },
];

function primeiroNome(nome: string | undefined): string {
  const primeiro = nome?.trim().split(" ")[0];
  return primeiro && primeiro.length > 0 ? primeiro : "tutor não identificado";
}

export function VisitasDoDiaSection({ visitas }: { visitas: AgendamentoResolvido[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [, startTransition] = useTransition();

  if (visitas.length === 0) {
    return (
      <EmptyState
        titulo="Nenhuma visita hoje"
        descricao="Quando tiver visitas marcadas pra hoje, elas aparecem aqui em colunas por estágio — um toque avança presente → pronto → entregue e já manda o aviso pro tutor no WhatsApp em pronto/entregue. Agende a primeira na Agenda."
      />
    );
  }

  function avancar(agendamento: Agendamento) {
    const proximo = proximoStatusQuadro(agendamento.status);
    if (!proximo || pendingId) return;

    setErro("");
    setPendingId(agendamento.id);
    startTransition(async () => {
      const resultado = await ACAO_POR_PROXIMO_STATUS[proximo](agendamento.id);
      setPendingId(null);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  function voltar(agendamento: Agendamento) {
    if (pendingId) return;
    setErro("");
    setPendingId(agendamento.id);
    startTransition(async () => {
      const resultado = await voltarStatusAgendamento(agendamento.id);
      setPendingId(null);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  const colunas = COLUNAS.map((coluna) => ({
    ...coluna,
    visitas: visitas.filter((v) => coluna.statuses.includes(v.agendamento.status)),
  })).filter((coluna) => !coluna.opcional || coluna.visitas.length > 0);

  return (
    <div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {colunas.map((coluna) => (
          <div key={coluna.chave} className="w-56 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{coluna.label}</p>
              <span className="font-mono text-xs text-ink-500">{coluna.visitas.length}</span>
            </div>

            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-0.5">
              {coluna.visitas.length === 0 ? (
                <p className="rounded-xl border border-dashed border-surface-strong px-3 py-4 text-center text-xs text-ink-500">
                  Nenhuma
                </p>
              ) : (
                coluna.visitas.map(({ agendamento, pet, tutor }) => {
                  const status: StatusAgendamento = agendamento.status;
                  const proximo = proximoStatusQuadro(status);
                  const podeVoltar = podeVoltarNoQuadro(status);
                  const pending = pendingId === agendamento.id;
                  const semNadaParaFazer = !proximo && !podeVoltar; // faltou/cancelado — fora do fluxo, só a Agenda edita

                  return (
                    <div
                      key={agendamento.id}
                      className={cx(
                        "relative rounded-xl",
                        tomCores[TOM_STATUS[status]],
                        (semNadaParaFazer || pending) && "opacity-70"
                      )}
                    >
                      <button
                        type="button"
                        disabled={!proximo || pending}
                        onClick={() => avancar(agendamento)}
                        title={`${tutor?.nome ?? "Tutor removido"} · ${racaDoPet(pet)}${
                          tutor?.telefone ? ` · ${tutor.telefone}` : ""
                        }`}
                        className={cx(
                          "flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed",
                          proximo && !pending && "cursor-pointer hover:brightness-95"
                        )}
                      >
                        <span className="font-mono text-xs opacity-80">
                          {formatarHorario(agendamento.data_hora)}
                        </span>
                        <span className="truncate text-sm font-semibold">{pet?.nome ?? "Pet removido"}</span>
                        <span className="truncate text-xs opacity-80">{primeiroNome(tutor?.nome)}</span>
                        <span className="mt-1 text-[11px] font-medium">
                          {pending
                            ? "Enviando…"
                            : proximo
                              ? ROTULO_PROXIMO_PASSO[proximo]
                              : LABEL_STATUS[status]}
                        </span>
                      </button>

                      {podeVoltar && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={(evento) => {
                            evento.stopPropagation();
                            voltar(agendamento);
                          }}
                          title="Desfazer — voltar pro status anterior"
                          aria-label="Desfazer, voltar pro status anterior"
                          className="absolute right-1 top-1 rounded-full p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Undo2 size={12} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
      {erro && (
        <p role="alert" className="mt-2 text-xs text-danger-600">
          {erro}
        </p>
      )}
    </div>
  );
}
