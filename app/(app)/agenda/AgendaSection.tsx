"use client";

import { alerta, botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/agenda/StatusBadge";
import { tomCores } from "@/lib/ui/styles";
import Link from "next/link";
import { createContext, useContext, useState, useTransition, type FormEvent } from "react";
import type {
  Agendamento,
  Assinatura,
  CategoriaServico,
  Funcionario,
  Pet,
  Plano,
  Servico,
  Tutor,
} from "@/types/database";
import { FormField, inputClass } from "@/components/ui/FormField";
import { gerarHorariosDisponiveis, type ExpedientePetshop } from "@/lib/horarios";
import {
  adicionarDias,
  diasDaSemana,
  formatarDataCurta,
  nomeDiaSemana,
  paraDataLocal,
} from "@/lib/semana";
import {
  type AgendamentoResolvido,
  dataLocalDoISO,
  formatarHorario,
  horarioLocal,
  nomeServico,
  podeVoltarNoQuadro,
  racaDoPet,
  resolverAgendamento,
  TERMINAIS,
  TOM_STATUS,
  type ContextoNomes,
} from "@/lib/agenda/resolver";
import {
  cancelarAgendamento,
  confirmarAgendamento,
  criarAgendamentoAvulso,
  criarAssinaturaPelaAgenda,
  definirFuncionarioAgendamento,
  encerrarSerie,
  marcarEntregue,
  marcarFaltou,
  marcarPresente,
  marcarPronto,
  reagendar,
  voltarStatusAgendamento,
  type ActionResult,
} from "./actions";

// horarioLocal, dataLocalDoISO, racaDoPet, formatarHorario, TERMINAIS,
// TOM_STATUS, ContextoNomes, AgendamentoResolvido e resolverAgendamento
// viviam todos aqui — viraram lib/agenda/resolver.ts quando a Visão Geral
// (app/(app)/VisaoGeralSection.tsx) passou a precisar da mesma leitura pro
// quadro de visitas do dia. StatusBadge teve o mesmo destino, em
// components/agenda/StatusBadge.tsx.

// Combina "YYYY-MM-DD" + "HH:MM" num Date pelos componentes locais — nunca
// concatenando string e passando pro construtor, que trata alguns formatos
// como UTC (mesma cautela documentada em app/(app)/tutores/actions.ts). Só
// a Agenda constrói datas novas a partir de formulário — fica local aqui.
function combinarDataHorario(data: string, horario: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [hora, minuto] = horario.split(":").map(Number);
  return new Date(ano, mes - 1, dia, hora, minuto, 0, 0);
}

// O que abre o formulário de visita avulsa: de onde veio o clique (botão
// geral, célula vazia do quadro, ou tutor sem agendamento) decide quais
// campos já chegam preenchidos.
type FormularioAvulsaInfo = { data: string; horario?: string; tutorId?: string };

// Lista de funcionários ativos, disponível pra qualquer card da agenda sem
// precisar passar prop por SemanaQuadro > célula > card > pendência. É uma
// lista curta, lida (nunca escrita) por quem consome — o caso clássico de
// contexto em vez de prop drilling.
const FuncionariosContext = createContext<Funcionario[]>([]);

export function AgendaSection({
  petshopId,
  expediente,
  diaSelecionado,
  inicioSemana,
  agendamentosSemana,
  tutores,
  pets,
  servicos,
  categorias,
  planos,
  assinaturas,
  tutoresSemAgendamento,
  pendenciasConfirmacao,
  funcionarios,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  diaSelecionado: string;
  inicioSemana: string;
  agendamentosSemana: Agendamento[];
  tutores: Tutor[];
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
  planos: Plano[];
  assinaturas: Assinatura[];
  tutoresSemAgendamento: Tutor[];
  pendenciasConfirmacao: Agendamento[];
  funcionarios: Funcionario[];
}) {
  const [formularioAvulsa, setFormularioAvulsa] = useState<FormularioAvulsaInfo | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const ctx: ContextoNomes = { tutores, pets, servicos, categorias, planos, assinaturas };
  const resolvidos = agendamentosSemana.map((a) => resolverAgendamento(a, ctx));

  const dias = diasDaSemana(inicioSemana);
  const hoje = paraDataLocal(new Date());

  // Linhas do quadro: a grade fixa do expediente + qualquer horário "fora
  // da grade" que já exista em dados reais (ex.: visita antiga de antes do
  // intervalo_agendamento_minutos existir) — nada some do quadro por causa
  // de uma mudança de configuração depois.
  const horariosGrade = gerarHorariosDisponiveis(expediente);
  const horariosExtras = resolvidos
    .map((r) => horarioLocal(r.agendamento.data_hora))
    .filter((h) => !horariosGrade.includes(h));
  const horarios = Array.from(new Set([...horariosGrade, ...horariosExtras])).sort();

  // dia -> horario -> visitas naquela célula.
  const grade = new Map<string, Map<string, AgendamentoResolvido[]>>();
  for (const r of resolvidos) {
    const dia = dataLocalDoISO(r.agendamento.data_hora);
    const horario = horarioLocal(r.agendamento.data_hora);
    if (!grade.has(dia)) grade.set(dia, new Map());
    const porHorario = grade.get(dia)!;
    if (!porHorario.has(horario)) porHorario.set(horario, []);
    porHorario.get(horario)!.push(r);
  }

  const selecionado = selecionadoId
    ? resolvidos.find((r) => r.agendamento.id === selecionadoId)
    : undefined;

  const visitasDoDia = resolvidos
    .filter((r) => dataLocalDoISO(r.agendamento.data_hora) === diaSelecionado)
    .sort((a, b) => a.agendamento.data_hora.localeCompare(b.agendamento.data_hora));

  return (
    <FuncionariosContext.Provider value={funcionarios}>
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ink-900">Semana</h2>
            <p className="mt-1 text-sm text-ink-500">
              {formatarDataCurta(inicioSemana)} a {formatarDataCurta(adicionarDias(inicioSemana, 6))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/agenda?data=${adicionarDias(inicioSemana, -7)}`}
              className={botao({ variante: "neutra", tamanho: "sm" })}
            >
              ‹ Semana anterior
            </Link>
            <Link
              href="/agenda"
              className={botao({ variante: "neutra", tamanho: "sm" })}
            >
              Hoje
            </Link>
            <Link
              href={`/agenda?data=${adicionarDias(inicioSemana, 7)}`}
              className={botao({ variante: "neutra", tamanho: "sm" })}
            >
              Semana seguinte ›
            </Link>
            <button
              type="button"
              onClick={() =>
                setFormularioAvulsa((atual) => (atual ? null : { data: diaSelecionado }))
              }
              // Amarelo Ocre: a ação principal da tela. Vira "neutra" quando o
              // formulário está aberto, porque aí o botão só cancela.
              className={botao({ variante: formularioAvulsa ? "neutra" : "cta" })}
            >
              {formularioAvulsa ? "Cancelar" : "+ Agendar visita"}
            </button>
          </div>
        </div>

        {formularioAvulsa && (
          <div className="mt-4">
            <NovaVisitaForm
              petshopId={petshopId}
              expediente={expediente}
              // Migration 0019 (soft-delete) — só pet/tutor ativo entra no
              // picker de visita NOVA. `tutores`/`pets` sem filtro continuam
              // servindo pro `ctx` acima, que resolve nomes de visitas já
              // existentes (inclusive de pet/tutor hoje desativado).
              tutores={tutores.filter((t) => t.ativo)}
              pets={pets.filter((p) => p.ativo)}
              servicos={servicos}
              categorias={categorias}
              planos={planos}
              info={formularioAvulsa}
              onDone={() => setFormularioAvulsa(null)}
            />
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border bg-surface-card">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-16 border-b border-r border-surface-border bg-surface-muted p-2" />
                {dias.map((dia) => (
                  <th
                    key={dia}
                    className={`border-b border-surface-border p-2 text-center font-medium ${
                      dia === hoje ? "bg-brand-50/60" : "bg-surface-card"
                    }`}
                  >
                    <div className="text-xs font-normal text-ink-500">{nomeDiaSemana(dia)}</div>
                    <div className="text-ink-900">{formatarDataCurta(dia)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horarios.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-sm text-ink-500">
                    Nenhum horário no expediente configurado — confira Configurações.
                  </td>
                </tr>
              ) : (
                horarios.map((horario) => (
                  <tr key={horario}>
                    <td className="border-b border-r border-surface-border p-2 align-top font-mono text-xs text-ink-500">
                      {horario}
                    </td>
                    {dias.map((dia) => {
                      const itens = grade.get(dia)?.get(horario) ?? [];
                      return (
                        <td
                          key={dia}
                          className={`border-b border-surface-border p-1 align-top ${
                            dia === hoje ? "bg-brand-50/40" : ""
                          }`}
                        >
                          <div className="flex flex-col gap-1">
                            {itens.map((r) => (
                              <button
                                key={r.agendamento.id}
                                type="button"
                                onClick={() =>
                                  setSelecionadoId((atual) =>
                                    atual === r.agendamento.id ? null : r.agendamento.id
                                  )
                                }
                                className={`truncate rounded px-1.5 py-1 text-left text-xs transition ${
                                  tomCores[TOM_STATUS[r.agendamento.status]]
                                } ${
                                  selecionadoId === r.agendamento.id
                                    ? "ring-2 ring-brand-500 ring-offset-1"
                                    : ""
                                }`}
                                title={`${r.pet?.nome ?? "Pet removido"} (${racaDoPet(r.pet)}) · ${r.tutor?.nome ?? "Tutor removido"}`}
                              >
                                {r.pet?.nome ?? "Pet removido"}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setFormularioAvulsa({ data: dia, horario })}
                              className="text-left text-[11px] text-ink-500 hover:text-brand-700"
                            >
                              + novo
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/*
          Lista do dia — o quadro da semana é bom pra enxergar ocupação, mas
          ruim pra receber o animal no balcão: a célula é estreita e só cabe
          o nome. Aqui cada visita do dia aparece por extenso, com a raça, que
          é o que identifica o pet pra quem nunca o viu.
        */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-ink-900">
            Visitas de {nomeDiaSemana(diaSelecionado)}, {formatarDataCurta(diaSelecionado)}
          </h3>
          {visitasDoDia.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">
              Nenhuma visita nesse dia. Use “+ Agendar visita” pra marcar a primeira.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-surface-card">
              {visitasDoDia.map((r) => (
                <li key={r.agendamento.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelecionadoId((atual) =>
                        atual === r.agendamento.id ? null : r.agendamento.id
                      )
                    }
                    aria-current={selecionadoId === r.agendamento.id ? "true" : undefined}
                    className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors ${
                      selecionadoId === r.agendamento.id
                        ? "bg-brand-50"
                        : "hover:bg-surface-muted"
                    }`}
                  >
                    <span className="w-12 shrink-0 font-mono text-sm text-ink-900">
                      {horarioLocal(r.agendamento.data_hora)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {r.pet?.nome ?? "Pet removido"}
                        <span className="font-normal text-ink-500"> · {racaDoPet(r.pet)}</span>
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {r.tutor?.nome ?? "Tutor removido"} · {r.rotulo}
                      </span>
                    </span>
                    {r.agendamento.serie_id && (
                      <Badge tom="info">repete</Badge>
                    )}
                    <StatusBadge status={r.agendamento.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4">
          {selecionado ? (
            <AgendamentoCard
              resolvido={selecionado}
              expediente={expediente}
              onFechar={() => setSelecionadoId(null)}
            />
          ) : (
            <p className="text-sm text-ink-500">
              Clique numa visita pra ver os detalhes e as ações (confirmar,
              marcar pronto, entregue…).
            </p>
          )}
        </div>
      </section>

      {pendenciasConfirmacao.length > 0 && (
        <section>
          <h2 className="font-display text-lg text-ink-900">Confirmações pendentes</h2>
          <p className="mt-1 text-sm text-ink-500">
            Visitas de amanhã que passaram do prazo de confirmação do tutor
            (Fase 5 — lembrete de escalonamento já foi mandado por WhatsApp
            pro petshop também) — vale confirmar direto com o cliente.
          </p>
          <div className="mt-3 space-y-2">
            {pendenciasConfirmacao.map((agendamento) => {
              const resolvido = resolverAgendamento(agendamento, ctx);
              return (
                <Link
                  key={agendamento.id}
                  href={`/agenda?data=${dataLocalDoISO(agendamento.data_hora)}`}
                  className="flex items-center justify-between rounded-lg border border-danger-100 bg-danger-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {resolvido.pet?.nome ?? "Pet"} · {resolvido.tutor?.nome ?? "Tutor"}
                    </p>
                    <p className="text-xs text-ink-500">
                      {dataLocalDoISO(agendamento.data_hora)} às {horarioLocal(agendamento.data_hora)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-danger-600">Ver na agenda</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {tutoresSemAgendamento.length > 0 && (
        <section>
          <h2 className="font-display text-lg text-ink-900">Sem agendamento ainda</h2>
          <p className="mt-1 text-sm text-ink-500">
            Tutores cadastrados que nunca tiveram assinatura nem visita avulsa —
            candidatos a um contato pra fechar a primeira visita.
          </p>
          <div className="mt-3 space-y-2">
            {tutoresSemAgendamento.map((tutor) => (
              <div
                key={tutor.id}
                className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{tutor.nome}</p>
                  <p className="text-xs text-ink-500">{tutor.telefone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormularioAvulsa({ data: diaSelecionado, tutorId: tutor.id })}
                  className={botao({ variante: "texto", tamanho: "sm" })}
                >
                  Agendar visita
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
    </FuncionariosContext.Provider>
  );
}

function AgendamentoCard({
  resolvido,
  expediente,
  onFechar,
}: {
  resolvido: AgendamentoResolvido;
  expediente: ExpedientePetshop;
  onFechar?: () => void;
}) {
  const { agendamento, tutor, pet, rotulo, origem } = resolvido;
  const [reagendando, setReagendando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const funcionarios = useContext(FuncionariosContext);

  function executar(acao: (id: string) => Promise<ActionResult>) {
    setErro("");
    startTransition(async () => {
      const resultado = await acao(agendamento.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  const terminal = TERMINAIS.includes(agendamento.status);

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-ink-900">
              {formatarHorario(agendamento.data_hora)}
            </span>
            <StatusBadge status={agendamento.status} />
            {origem === "avulsa" && !agendamento.serie_id && (
              <span className="rounded-pill border border-brand-200 px-2 py-0.5 text-xs text-brand-700">
                única
              </span>
            )}
            {agendamento.serie_id && agendamento.serie_intervalo_dias && (
              <Badge tom="info">
                repete {descreverIntervalo(agendamento.serie_intervalo_dias)}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-ink-900">
            {pet?.nome ?? "Pet removido"} · {tutor?.nome ?? "Tutor removido"}
          </p>
          <p className="text-xs text-ink-500">{racaDoPet(pet)}</p>
          <p className="text-xs text-ink-500">{rotulo}</p>
          {tutor?.telefone && <p className="text-xs text-ink-500">{tutor.telefone}</p>}

          {/*
            Quem atendeu (migration 0016) — só aparece se o petshop cadastrou
            alguém em Configurações › Funcionários. Salva sozinho no onChange,
            sem botão: é um campo só, e obrigar "editar > salvar" pra trocar
            um nome seria atrito à toa no meio do dia.
          */}
          {funcionarios.length > 0 && (
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-500">
              Quem atendeu:
              <select
                className="rounded-lg border border-surface-border bg-surface-card px-2 py-1 text-xs text-ink-900"
                value={agendamento.funcionario_id ?? ""}
                disabled={pending}
                onChange={(e) => {
                  const valor = e.target.value || null;
                  setErro("");
                  startTransition(async () => {
                    const resultado = await definirFuncionarioAgendamento(agendamento.id, valor);
                    if (!resultado.ok) setErro(resultado.erro);
                  });
                }}
              >
                <option value="">— ninguém —</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!terminal && (
            <>
              {(agendamento.status === "agendado" || agendamento.status === "reagendado") && (
                <AcaoBotao onClick={() => executar(confirmarAgendamento)} pending={pending}>
                  Confirmar
                </AcaoBotao>
              )}
              {/*
                "Presente" (migration 0014) — pet chegou, está no banho/tosa
                agora. Fica disponível a partir de qualquer status que ainda
                não chegou lá; diferente do quadro da Visão Geral, a Agenda
                continua permitindo pular direto pra "Pronto" se preferir —
                aqui é a tela de controle total, não o fluxo guiado do balcão.
              */}
              {agendamento.status !== "presente" &&
                agendamento.status !== "pronto" && (
                  <AcaoBotao onClick={() => executar(marcarPresente)} pending={pending}>
                    Presente
                  </AcaoBotao>
                )}
              {agendamento.status !== "pronto" && (
                <AcaoBotao onClick={() => executar(marcarPronto)} pending={pending}>
                  Pronto
                </AcaoBotao>
              )}
              {agendamento.status === "pronto" && (
                <AcaoBotao onClick={() => executar(marcarEntregue)} pending={pending} destaque>
                  Entregue
                </AcaoBotao>
              )}
              <AcaoBotao onClick={() => setReagendando((v) => !v)} pending={pending}>
                Reagendar
              </AcaoBotao>
              <AcaoBotao onClick={() => executar(marcarFaltou)} pending={pending} atencao>
                Faltou
              </AcaoBotao>
              <AcaoBotao onClick={() => executar(cancelarAgendamento)} pending={pending} atencao>
                Cancelar
              </AcaoBotao>
              {/*
                "Cancelar" apaga só ESTA ocorrência — a próxima da série
                continua nascendo, igual a cancelar uma visita de assinatura
                sem cancelar a assinatura. Quem quer parar a repetição inteira
                precisa desta ação separada (ver encerrarSerie em actions.ts).
              */}
              {agendamento.serie_id && (
                <AcaoBotao
                  onClick={() => {
                    const serieId = agendamento.serie_id;
                    if (!serieId) return;
                    setErro("");
                    startTransition(async () => {
                      const resultado = await encerrarSerie(serieId);
                      if (!resultado.ok) setErro(resultado.erro);
                    });
                  }}
                  pending={pending}
                  atencao
                >
                  Encerrar repetição
                </AcaoBotao>
              )}
            </>
          )}
          {/*
            Fora do `{!terminal && ...}` de propósito: "entregue" É terminal
            (não avança mais), mas ainda pode desfazer um clique errado —
            diferente de faltou/cancelado, que não têm volta por este botão
            (podeVoltarNoQuadro só é true pra presente/pronto/entregue).
          */}
          {podeVoltarNoQuadro(agendamento.status) && (
            <AcaoBotao onClick={() => executar(voltarStatusAgendamento)} pending={pending}>
              Desfazer
            </AcaoBotao>
          )}
          {onFechar && (
            <button
              type="button"
              onClick={onFechar}
              className="text-xs font-medium text-ink-500 hover:text-ink-700"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {erro && <p className="mt-2 text-xs text-danger-600">{erro}</p>}

      {reagendando && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <ReagendarForm
            agendamentoId={agendamento.id}
            dataHoraAtual={agendamento.data_hora}
            expediente={expediente}
            onDone={() => setReagendando(false)}
          />
        </div>
      )}
    </div>
  );
}

function AcaoBotao({
  onClick,
  pending,
  destaque,
  atencao,
  children,
}: {
  onClick: () => void;
  pending: boolean;
  destaque?: boolean;
  atencao?: boolean;
  children: React.ReactNode;
}) {
  const estilo = destaque
    ? "bg-brand-500 text-white hover:bg-brand-700"
    : atencao
      ? "border border-surface-border text-danger-600 hover:border-danger-100"
      : "border border-surface-border text-ink-700 hover:border-brand-500 hover:text-brand-700";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${estilo}`}
    >
      {children}
    </button>
  );
}

function ReagendarForm({
  agendamentoId,
  dataHoraAtual,
  expediente,
  onDone,
}: {
  agendamentoId: string;
  dataHoraAtual: string;
  expediente: ExpedientePetshop;
  onDone: () => void;
}) {
  const horarios = gerarHorariosDisponiveis(expediente);
  const horarioAtual = horarioLocal(dataHoraAtual);

  const [novaData, setNovaData] = useState(() => dataLocalDoISO(dataHoraAtual));
  const [novoHorario, setNovoHorario] = useState(() =>
    horarios.includes(horarioAtual) ? horarioAtual : horarios[0] ?? ""
  );
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!novoHorario) {
      setErro("Nenhum horário disponível — confira o expediente em Configurações.");
      return;
    }

    startTransition(async () => {
      const resultado = await reagendar(
        agendamentoId,
        combinarDataHorario(novaData, novoHorario).toISOString()
      );
      if (resultado.ok) {
        onDone();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <FormField label="Nova data" htmlFor={`reagendar_data_${agendamentoId}`}>
        <input
          id={`reagendar_data_${agendamentoId}`}
          type="date"
          className={inputClass}
          value={novaData}
          onChange={(e) => setNovaData(e.target.value)}
        />
      </FormField>
      <FormField label="Novo horário" htmlFor={`reagendar_horario_${agendamentoId}`}>
        <select
          id={`reagendar_horario_${agendamentoId}`}
          className={inputClass}
          value={novoHorario}
          onChange={(e) => setNovoHorario(e.target.value)}
          disabled={horarios.length === 0}
        >
          {horarios.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </FormField>
      <button
        type="submit"
        disabled={pending || horarios.length === 0}
        className={botao({ tamanho: "sm" })}
      >
        {pending ? "Salvando…" : "Confirmar novo horário"}
      </button>
      {erro && <p className="text-sm text-danger-600">{erro}</p>}
    </form>
  );
}

// ----------------------------------------------------------------------------
// Formulário de nova visita.
//
// Um formulário só, com um seletor no topo — igual ao Google Meet, onde
// "não se repete / repete" é uma escolha DENTRO do evento, não dois botões
// diferentes na tela. Quem agenda não precisa saber o que é "avulso" antes
// de começar: escolhe pet, serviço e horário, e decide a repetição no fim.
//
// Recorrente tem dois caminhos, porque o produto tem dois tipos de
// recorrência de verdade:
//
//   POR PLANO      → cria uma assinatura. O plano carrega a frequência, os
//                    serviços e o preço mensal por porte. É o produto
//                    "clube": cobrança mensal proporcional, contador de
//                    banhos, pausar/retomar.
//   REPETIR LIVRE  → cria uma série de visitas avulsas (migration 0009).
//                    Cada visita é cobrada sozinha, pelo preço do serviço.
//                    Serve pro cliente que quer "de 15 em 15 dias" sem
//                    entrar no clube.
//
// Detalhe de UX que vale explicar pro operador (e está no resumo do
// formulário): nos dois casos só a PRÓXIMA visita aparece na agenda. A
// seguinte nasce quando a atual é resolvida — senão o trigger de cobrança,
// que é AFTER INSERT, cobraria todas as ocorrências de uma vez.
// ----------------------------------------------------------------------------

type TipoVisita = "unica" | "recorrente";
type TipoRecorrencia = "plano" | "livre";

/** Frequências da repetição livre. Múltiplos de 7 pra cair sempre no mesmo dia da semana. */
const FREQUENCIAS = [
  { dias: 7, label: "Toda semana" },
  { dias: 14, label: "A cada 15 dias" },
  { dias: 21, label: "A cada 3 semanas" },
  { dias: 28, label: "Uma vez por mês" },
] as const;

function descreverIntervalo(dias: number): string {
  const conhecida = FREQUENCIAS.find((f) => f.dias === dias);
  if (conhecida) return conhecida.label.toLowerCase();
  return `a cada ${dias} dias`;
}

function NovaVisitaForm({
  petshopId,
  expediente,
  tutores,
  pets,
  servicos,
  categorias,
  planos,
  info,
  onDone,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  tutores: Tutor[];
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
  planos: Plano[];
  info: FormularioAvulsaInfo;
  onDone: () => void;
}) {
  const horarios = gerarHorariosDisponiveis(expediente);
  const planosAtivos = planos.filter((p) => p.ativo);

  // Busca por pet primeiro (não por tutor) — se dois pets tiverem o mesmo
  // nome, o nome do tutor entra só como desambiguador na label da opção.
  // Ver pedido original: agendar pelo pet, tutor vem junto automaticamente.
  const petsOrdenados = [...pets].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const contagemNomes = new Map<string, number>();
  for (const p of pets) {
    const chave = p.nome.trim().toLowerCase();
    contagemNomes.set(chave, (contagemNomes.get(chave) ?? 0) + 1);
  }
  function nomeTutor(tutorId: string): string {
    return tutores.find((t) => t.id === tutorId)?.nome ?? "tutor não identificado";
  }
  function labelPet(p: Pet): string {
    // A raça entra na própria opção do select: é o que separa "Thor
    // poodle" de "Thor rottweiler" na hora de escolher, sem precisar abrir
    // o cadastro do pet.
    const base = p.raca?.trim() ? `${p.nome} — ${p.raca.trim()}` : p.nome;
    const duplicado = (contagemNomes.get(p.nome.trim().toLowerCase()) ?? 0) > 1;
    return duplicado ? `${base} (${nomeTutor(p.tutor_id)})` : base;
  }

  // Se veio um tutorId pré-selecionado (ex.: atalho "Sem agendamento
  // ainda"), abre já no primeiro pet desse tutor; senão, primeiro pet da
  // lista ordenada.
  const petInicial = info.tutorId
    ? pets.find((p) => p.tutor_id === info.tutorId)?.id
    : undefined;
  const [petId, setPetId] = useState(petInicial ?? petsOrdenados[0]?.id ?? "");
  const petSelecionado = pets.find((p) => p.id === petId);
  const tutorId = petSelecionado?.tutor_id ?? "";

  const [tipo, setTipo] = useState<TipoVisita>("unica");
  const [tipoRecorrencia, setTipoRecorrencia] = useState<TipoRecorrencia>(
    planosAtivos.length > 0 ? "plano" : "livre"
  );
  const [planoId, setPlanoId] = useState(planosAtivos[0]?.id ?? "");
  const [intervaloDias, setIntervaloDias] = useState<number>(14);
  const [ocorrencias, setOcorrencias] = useState<number>(4);

  const [servicoId, setServicoId] = useState(servicos[0]?.id ?? "");
  const [data, setData] = useState(info.data);
  const [horario, setHorario] = useState(
    info.horario && horarios.includes(info.horario) ? info.horario : horarios[0] ?? ""
  );
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  const planoSelecionado = planosAtivos.find((p) => p.id === planoId);
  // Por plano, a assinatura é quem manda no serviço e no preço — o campo de
  // serviço avulso não se aplica.
  const usaServicoAvulso = tipo === "unica" || tipoRecorrencia === "livre";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!petId || !tutorId) {
      setErro("Escolha o pet.");
      return;
    }
    if (!horario) {
      setErro("Nenhum horário disponível — confira o expediente em Configurações.");
      return;
    }
    if (usaServicoAvulso && !servicoId) {
      setErro("Escolha o serviço.");
      return;
    }
    if (tipo === "recorrente" && tipoRecorrencia === "plano" && !planoId) {
      setErro("Escolha o plano.");
      return;
    }

    startTransition(async () => {
      let resultado: ActionResult;

      if (tipo === "recorrente" && tipoRecorrencia === "plano") {
        // O dia da semana da assinatura sai da data escolhida — quem marca
        // "quinta às 10h" está dizendo que o pet vem toda quinta às 10h.
        resultado = await criarAssinaturaPelaAgenda(petshopId, {
          tutor_id: tutorId,
          pet_id: petId,
          plano_id: planoId,
          dia_semana_preferencial: combinarDataHorario(data, horario).getDay(),
          horario_preferencial: horario,
          data_inicio: data,
        });
      } else {
        resultado = await criarAgendamentoAvulso(petshopId, {
          tutor_id: tutorId,
          pet_id: petId,
          servico_id: servicoId,
          data_hora: combinarDataHorario(data, horario).toISOString(),
          repeticao:
            tipo === "recorrente"
              ? { intervalo_dias: intervaloDias, ocorrencias }
              : undefined,
        });
      }

      if (resultado.ok) {
        onDone();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  if (pets.length === 0) {
    return (
      <p className={alerta("erro")}>
        Cadastre um tutor e um pet em Tutores &amp; Pets antes de agendar uma visita.
      </p>
    );
  }

  const opcaoTipo = (valor: TipoVisita, rotulo: string, descricao: string) => (
    <button
      key={valor}
      type="button"
      role="radio"
      aria-checked={tipo === valor}
      onClick={() => setTipo(valor)}
      className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
        tipo === valor
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-surface-border bg-surface-card text-ink-700 hover:bg-surface-muted"
      }`}
    >
      <span className="block text-sm font-medium">{rotulo}</span>
      <span className="block text-xs text-ink-500">{descricao}</span>
    </button>
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:grid-cols-2"
    >
      {/* Escolha do tipo, antes de tudo — é ela que muda o resto do form. */}
      <div className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-ink-700">Esta visita</span>
        <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Tipo de visita">
          {opcaoTipo("unica", "Não se repete", "Uma visita só, nesta data.")}
          {opcaoTipo("recorrente", "Se repete", "O pet volta de tempos em tempos.")}
        </div>
      </div>

      <FormField label="Pet" htmlFor="visita_pet">
        <select
          id="visita_pet"
          className={inputClass}
          value={petId}
          onChange={(e) => setPetId(e.target.value)}
        >
          {petsOrdenados.map((p) => (
            <option key={p.id} value={p.id}>
              {labelPet(p)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Tutor e raça"
        htmlFor="visita_tutor_nome"
        hint="Preenchido automaticamente pelo pet escolhido."
      >
        <input
          id="visita_tutor_nome"
          className={inputClass}
          value={
            tutorId ? `${nomeTutor(tutorId)} · ${racaDoPet(petSelecionado)}` : ""
          }
          disabled
        />
      </FormField>

      {usaServicoAvulso ? (
        <FormField label="Serviço" htmlFor="visita_servico">
          <select
            id="visita_servico"
            className={inputClass}
            value={servicoId}
            onChange={(e) => setServicoId(e.target.value)}
          >
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {nomeServico(s, categorias)}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <FormField
          label="Plano"
          htmlFor="visita_plano"
          hint={
            planoSelecionado
              ? `Repete ${descreverIntervalo(planoSelecionado.intervalo_dias)} · ${planoSelecionado.ocorrencias_padrao_mes}x por mês.`
              : "Nenhum plano ativo — cadastre um em Planos & Serviços."
          }
        >
          <select
            id="visita_plano"
            className={inputClass}
            value={planoId}
            onChange={(e) => setPlanoId(e.target.value)}
            disabled={planosAtivos.length === 0}
          >
            {planosAtivos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField label="Data" htmlFor="visita_data">
        <input
          id="visita_data"
          type="date"
          className={inputClass}
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </FormField>
      <FormField
        label="Horário"
        htmlFor="visita_horario"
        hint={horarios.length === 0 ? "Confira o expediente em Configurações." : undefined}
      >
        <select
          id="visita_horario"
          className={inputClass}
          value={horario}
          onChange={(e) => setHorario(e.target.value)}
          disabled={horarios.length === 0}
        >
          {horarios.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </FormField>

      {/* Segundo nível: só aparece depois que "Se repete" foi escolhido. */}
      {tipo === "recorrente" && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-brand-200 bg-surface-card p-4 sm:col-span-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-ink-700">Como repete</span>
            <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Tipo de recorrência">
              <button
                type="button"
                role="radio"
                aria-checked={tipoRecorrencia === "plano"}
                disabled={planosAtivos.length === 0}
                onClick={() => setTipoRecorrencia("plano")}
                className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  tipoRecorrencia === "plano"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-surface-border bg-surface-card text-ink-700 hover:bg-surface-muted"
                }`}
              >
                <span className="block text-sm font-medium">Por plano</span>
                <span className="block text-xs text-ink-500">
                  {planosAtivos.length === 0
                    ? "Nenhum plano ativo cadastrado."
                    : "Vira assinatura: mensalidade e contador de banhos."}
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={tipoRecorrencia === "livre"}
                onClick={() => setTipoRecorrencia("livre")}
                className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                  tipoRecorrencia === "livre"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-surface-border bg-surface-card text-ink-700 hover:bg-surface-muted"
                }`}
              >
                <span className="block text-sm font-medium">Só repetir</span>
                <span className="block text-xs text-ink-500">
                  Sem plano: cada visita é cobrada sozinha.
                </span>
              </button>
            </div>
          </div>

          {tipoRecorrencia === "livre" && (
            <>
              <FormField label="Frequência" htmlFor="visita_frequencia">
                <select
                  id="visita_frequencia"
                  className={inputClass}
                  value={intervaloDias}
                  onChange={(e) => setIntervaloDias(Number(e.target.value))}
                >
                  {FREQUENCIAS.map((f) => (
                    <option key={f.dias} value={f.dias}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Quantas visitas"
                htmlFor="visita_ocorrencias"
                hint="Contando esta. A série se encerra sozinha ao chegar na última."
              >
                <select
                  id="visita_ocorrencias"
                  className={inputClass}
                  value={ocorrencias}
                  onChange={(e) => setOcorrencias(Number(e.target.value))}
                >
                  {[2, 3, 4, 6, 8, 12, 24].map((n) => (
                    <option key={n} value={n}>
                      {n} visitas
                    </option>
                  ))}
                </select>
              </FormField>
            </>
          )}

          {/* Resumo em português do que o botão vai criar. */}
          <p className={`sm:col-span-2 ${alerta("info", "text-xs")}`}>
            {tipoRecorrencia === "plano"
              ? planoSelecionado
                ? `${petSelecionado?.nome ?? "O pet"} entra no plano “${planoSelecionado.nome}”, ${descreverIntervalo(planoSelecionado.intervalo_dias)}, sempre ${nomeDiaSemana(data).toLowerCase()} às ${horario}. A agenda mostra uma visita por vez — a próxima é criada quando esta for entregue.`
                : "Escolha um plano pra ver o resumo."
              : `${ocorrencias} visitas ${descreverIntervalo(intervaloDias)}, sempre ${nomeDiaSemana(data).toLowerCase()} às ${horario}. A agenda mostra uma por vez — a próxima nasce quando esta for entregue, e cada uma é cobrada na sua data.`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={
            pending ||
            !petId ||
            horarios.length === 0 ||
            (tipo === "recorrente" && tipoRecorrencia === "plano" && !planoId)
          }
          className={botao()}
        >
          {pending
            ? "Agendando…"
            : tipo === "unica"
              ? "Agendar visita"
              : "Agendar e repetir"}
        </button>
        {usaServicoAvulso && (
          <p className="text-xs text-ink-500">
            O preço é puxado de Planos &amp; Serviços pelo porte do pet.
          </p>
        )}
        {erro && (
          <p role="alert" className="text-sm text-danger-600">
            {erro}
          </p>
        )}
      </div>
    </form>
  );
}
