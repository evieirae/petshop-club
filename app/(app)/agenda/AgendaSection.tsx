"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import type {
  Agendamento,
  Assinatura,
  CategoriaServico,
  Pet,
  Plano,
  Servico,
  StatusAgendamento,
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
  cancelarAgendamento,
  confirmarAgendamento,
  criarAgendamentoAvulso,
  marcarEntregue,
  marcarFaltou,
  marcarPronto,
  reagendar,
  type ActionResult,
} from "./actions";

function horarioLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dataLocalDoISO(iso: string): string {
  return paraDataLocal(new Date(iso));
}

// Combina "YYYY-MM-DD" + "HH:MM" num Date pelos componentes locais — nunca
// concatenando string e passando pro construtor, que trata alguns formatos
// como UTC (mesma cautela documentada em app/(app)/tutores/actions.ts).
function combinarDataHorario(data: string, horario: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [hora, minuto] = horario.split(":").map(Number);
  return new Date(ano, mes - 1, dia, hora, minuto, 0, 0);
}

const TERMINAIS: StatusAgendamento[] = ["entregue", "faltou", "cancelado"];

const LABEL_STATUS: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  pronto: "Pronto p/ busca",
  entregue: "Entregue",
  faltou: "Faltou",
  reagendado: "Reagendado",
  cancelado: "Cancelado",
};

const ESTILO_STATUS: Record<StatusAgendamento, string> = {
  agendado: "bg-surface text-ink-700 border border-surface-border",
  confirmado: "bg-confirmado-bg text-confirmado",
  pronto: "bg-club-light text-club-dark",
  entregue: "bg-confirmado-bg text-confirmado",
  faltou: "bg-pendente-bg text-pendente",
  reagendado: "bg-club-light text-club-dark",
  cancelado: "bg-surface text-ink-500",
};

function StatusBadge({ status }: { status: StatusAgendamento }) {
  return (
    <span className={`rounded-stamp px-2 py-0.5 text-xs font-medium ${ESTILO_STATUS[status]}`}>
      {LABEL_STATUS[status]}
    </span>
  );
}

function nomeServico(servico: Servico | undefined, categorias: CategoriaServico[]) {
  if (!servico) return "Serviço removido";
  return (
    servico.nome_customizado?.trim() ||
    categorias.find((c) => c.id === servico.categoria_servico_id)?.nome ||
    "Serviço sem categoria"
  );
}

function formatarHorario(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ----------------------------------------------------------------------------

type ContextoNomes = {
  tutores: Tutor[];
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
  planos: Plano[];
  assinaturas: Assinatura[];
};

type AgendamentoResolvido = {
  agendamento: Agendamento;
  tutor: Tutor | undefined;
  pet: Pet | undefined;
  rotulo: string;
  origem: "assinatura" | "avulsa";
};

function resolverAgendamento(agendamento: Agendamento, ctx: ContextoNomes): AgendamentoResolvido {
  if (agendamento.assinatura_id) {
    const assinatura = ctx.assinaturas.find((a) => a.id === agendamento.assinatura_id);
    const tutor = ctx.tutores.find((t) => t.id === assinatura?.tutor_id);
    const pet = ctx.pets.find((p) => p.id === assinatura?.pet_id);
    const plano = ctx.planos.find((p) => p.id === assinatura?.plano_id);
    return { agendamento, tutor, pet, rotulo: plano?.nome ?? "Assinatura", origem: "assinatura" };
  }

  const tutor = ctx.tutores.find((t) => t.id === agendamento.tutor_id);
  const pet = ctx.pets.find((p) => p.id === agendamento.pet_id);
  const servico = ctx.servicos.find((s) => s.id === agendamento.servico_id);
  return {
    agendamento,
    tutor,
    pet,
    rotulo: `${nomeServico(servico, ctx.categorias)} (avulso)`,
    origem: "avulsa",
  };
}

// O que abre o formulário de visita avulsa: de onde veio o clique (botão
// geral, célula vazia do quadro, ou tutor sem agendamento) decide quais
// campos já chegam preenchidos.
type FormularioAvulsaInfo = { data: string; horario?: string; tutorId?: string };

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

  return (
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
              className="rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-ink-700 transition hover:border-club hover:text-club-dark"
            >
              ‹ Semana anterior
            </Link>
            <Link
              href="/agenda"
              className="rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-ink-700 transition hover:border-club hover:text-club-dark"
            >
              Hoje
            </Link>
            <Link
              href={`/agenda?data=${adicionarDias(inicioSemana, 7)}`}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-ink-700 transition hover:border-club hover:text-club-dark"
            >
              Semana seguinte ›
            </Link>
            <button
              type="button"
              onClick={() =>
                setFormularioAvulsa((atual) => (atual ? null : { data: diaSelecionado }))
              }
              className="rounded-lg border border-club px-4 py-2 text-sm font-medium text-club-dark transition hover:bg-club-light"
            >
              {formularioAvulsa ? "Cancelar" : "+ Agendar visita avulsa"}
            </button>
          </div>
        </div>

        {formularioAvulsa && (
          <div className="mt-4">
            <AvulsaForm
              petshopId={petshopId}
              expediente={expediente}
              tutores={tutores}
              pets={pets}
              servicos={servicos}
              categorias={categorias}
              info={formularioAvulsa}
              onDone={() => setFormularioAvulsa(null)}
            />
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border bg-surface-card">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-16 border-b border-r border-surface-border bg-surface p-2" />
                {dias.map((dia) => (
                  <th
                    key={dia}
                    className={`border-b border-surface-border p-2 text-center font-medium ${
                      dia === hoje ? "bg-club-light/40" : "bg-surface"
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
                            dia === hoje ? "bg-club-light/10" : ""
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
                                  ESTILO_STATUS[r.agendamento.status]
                                } ${
                                  selecionadoId === r.agendamento.id
                                    ? "ring-2 ring-club ring-offset-1"
                                    : ""
                                }`}
                                title={`${r.pet?.nome ?? "Pet removido"} · ${r.tutor?.nome ?? "Tutor removido"}`}
                              >
                                {r.pet?.nome ?? "Pet removido"}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setFormularioAvulsa({ data: dia, horario })}
                              className="text-left text-[11px] text-ink-500 hover:text-club-dark"
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

        <div className="mt-4">
          {selecionado ? (
            <AgendamentoCard
              resolvido={selecionado}
              expediente={expediente}
              onFechar={() => setSelecionadoId(null)}
            />
          ) : (
            <p className="text-sm text-ink-500">
              Clique numa visita no quadro acima pra ver os detalhes e as ações
              (confirmar, marcar pronto, entregue…).
            </p>
          )}
        </div>
      </section>

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
                  className="text-xs font-medium text-club-dark hover:underline"
                >
                  Agendar visita avulsa
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
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

  function executar(acao: (id: string) => Promise<ActionResult>) {
    setErro("");
    startTransition(async () => {
      const resultado = await acao(agendamento.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  const terminal = TERMINAIS.includes(agendamento.status);

  return (
    <div className="rounded-xl border border-club bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-ink-900">
              {formatarHorario(agendamento.data_hora)}
            </span>
            <StatusBadge status={agendamento.status} />
            {origem === "avulsa" && (
              <span className="rounded-stamp border border-dashed border-club px-2 py-0.5 text-xs text-club-dark">
                avulso
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-ink-900">
            {pet?.nome ?? "Pet removido"} · {tutor?.nome ?? "Tutor removido"}
          </p>
          <p className="text-xs text-ink-500">{rotulo}</p>
          {tutor?.telefone && <p className="text-xs text-ink-500">{tutor.telefone}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!terminal && (
            <>
              {(agendamento.status === "agendado" || agendamento.status === "reagendado") && (
                <AcaoBotao onClick={() => executar(confirmarAgendamento)} pending={pending}>
                  Confirmar
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
            </>
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

      {erro && <p className="mt-2 text-xs text-pendente">{erro}</p>}

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
    ? "bg-club text-white hover:bg-club-dark"
    : atencao
      ? "border border-surface-border text-pendente hover:border-pendente"
      : "border border-surface-border text-ink-700 hover:border-club hover:text-club-dark";

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
        className="rounded-lg bg-club px-3 py-1.5 text-sm font-medium text-white transition hover:bg-club-dark disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Confirmar novo horário"}
      </button>
      {erro && <p className="text-sm text-pendente">{erro}</p>}
    </form>
  );
}

function AvulsaForm({
  petshopId,
  expediente,
  tutores,
  pets,
  servicos,
  categorias,
  info,
  onDone,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  tutores: Tutor[];
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
  info: FormularioAvulsaInfo;
  onDone: () => void;
}) {
  const horarios = gerarHorariosDisponiveis(expediente);
  const [tutorId, setTutorId] = useState(info.tutorId ?? tutores[0]?.id ?? "");
  const petsDoTutor = pets.filter((p) => p.tutor_id === tutorId);
  const [petId, setPetId] = useState(petsDoTutor[0]?.id ?? "");
  const [servicoId, setServicoId] = useState(servicos[0]?.id ?? "");
  const [data, setData] = useState(info.data);
  const [horario, setHorario] = useState(
    info.horario && horarios.includes(info.horario) ? info.horario : horarios[0] ?? ""
  );
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleTutorChange(novoTutorId: string) {
    setTutorId(novoTutorId);
    const primeiroPet = pets.find((p) => p.tutor_id === novoTutorId);
    setPetId(primeiroPet?.id ?? "");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!tutorId || !petId || !servicoId) {
      setErro("Escolha tutor, pet e serviço.");
      return;
    }
    if (!horario) {
      setErro("Nenhum horário disponível — confira o expediente em Configurações.");
      return;
    }

    startTransition(async () => {
      const resultado = await criarAgendamentoAvulso(petshopId, {
        tutor_id: tutorId,
        pet_id: petId,
        servico_id: servicoId,
        data_hora: combinarDataHorario(data, horario).toISOString(),
      });
      if (resultado.ok) {
        onDone();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  if (tutores.length === 0) {
    return (
      <p className="text-sm text-pendente">
        Cadastre um tutor em Tutores &amp; Pets antes de agendar uma visita avulsa.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-dashed border-club bg-club-light/30 p-5 sm:grid-cols-2"
    >
      <FormField label="Tutor" htmlFor="avulsa_tutor">
        <select
          id="avulsa_tutor"
          className={inputClass}
          value={tutorId}
          onChange={(e) => handleTutorChange(e.target.value)}
        >
          {tutores.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Pet"
        htmlFor="avulsa_pet"
        hint={petsDoTutor.length === 0 ? "Esse tutor ainda não tem pet cadastrado." : undefined}
      >
        <select
          id="avulsa_pet"
          className={inputClass}
          value={petId}
          onChange={(e) => setPetId(e.target.value)}
          disabled={petsDoTutor.length === 0}
        >
          {petsDoTutor.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Serviço" htmlFor="avulsa_servico">
        <select
          id="avulsa_servico"
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
      <FormField label="Data" htmlFor="avulsa_data">
        <input
          id="avulsa_data"
          type="date"
          className={inputClass}
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </FormField>
      <FormField
        label="Horário"
        htmlFor="avulsa_horario"
        hint={horarios.length === 0 ? "Confira o expediente em Configurações." : undefined}
      >
        <select
          id="avulsa_horario"
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

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending || petsDoTutor.length === 0 || horarios.length === 0}
          className="rounded-lg bg-club px-4 py-2 text-sm font-medium text-white transition hover:bg-club-dark disabled:opacity-60"
        >
          {pending ? "Agendando…" : "Agendar visita avulsa"}
        </button>
        <p className="text-xs text-ink-500">
          O preço é puxado de Planos &amp; Serviços pelo porte do pet.
        </p>
        {erro && (
          <p role="alert" className="text-sm text-pendente">
            {erro}
          </p>
        )}
      </div>
    </form>
  );
}
