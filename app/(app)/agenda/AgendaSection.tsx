"use client";

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
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
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

export function AgendaSection({
  petshopId,
  agendamentosHoje,
  tutores,
  pets,
  servicos,
  categorias,
  planos,
  assinaturas,
  tutoresSemAgendamento,
}: {
  petshopId: string;
  agendamentosHoje: Agendamento[];
  tutores: Tutor[];
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
  planos: Plano[];
  assinaturas: Assinatura[];
  tutoresSemAgendamento: Tutor[];
}) {
  const [agendando, setAgendando] = useState(false);
  const [tutorPreSelecionado, setTutorPreSelecionado] = useState<string | undefined>();
  const ctx: ContextoNomes = { tutores, pets, servicos, categorias, planos, assinaturas };

  const itens = [...agendamentosHoje].sort((a, b) => a.data_hora.localeCompare(b.data_hora));

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-ink-900">Hoje</h2>
            <p className="mt-1 text-sm text-ink-500">
              {itens.length === 0
                ? "Nenhuma visita hoje."
                : `${itens.length} visita${itens.length > 1 ? "s" : ""} hoje.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTutorPreSelecionado(undefined);
              setAgendando((v) => !v);
            }}
            className="rounded-lg border border-club px-4 py-2 text-sm font-medium text-club-dark transition hover:bg-club-light"
          >
            {agendando ? "Cancelar" : "+ Agendar visita avulsa"}
          </button>
        </div>

        {agendando && (
          <div className="mt-4">
            <AvulsaForm
              petshopId={petshopId}
              tutores={tutores}
              pets={pets}
              servicos={servicos}
              categorias={categorias}
              tutorInicial={tutorPreSelecionado}
              onDone={() => setAgendando(false)}
            />
          </div>
        )}

        <div className="mt-4 space-y-3">
          {itens.length === 0 && !agendando ? (
            <EmptyState
              titulo="Nada agendado pra hoje"
              descricao="Visitas de assinatura aparecem aqui sozinhas (geradas pelo ciclo automático) — ou agende uma visita avulsa acima."
            />
          ) : (
            itens.map((agendamento) => (
              <AgendamentoCard
                key={agendamento.id}
                resolvido={resolverAgendamento(agendamento, ctx)}
              />
            ))
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
                  onClick={() => {
                    setTutorPreSelecionado(tutor.id);
                    setAgendando(true);
                  }}
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

function AgendamentoCard({ resolvido }: { resolvido: AgendamentoResolvido }) {
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
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
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

        {!terminal && (
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        )}
      </div>

      {erro && <p className="mt-2 text-xs text-pendente">{erro}</p>}

      {reagendando && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <ReagendarForm
            agendamentoId={agendamento.id}
            dataHoraAtual={agendamento.data_hora}
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

function paraInputDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ReagendarForm({
  agendamentoId,
  dataHoraAtual,
  onDone,
}: {
  agendamentoId: string;
  dataHoraAtual: string;
  onDone: () => void;
}) {
  const [novaDataHora, setNovaDataHora] = useState(paraInputDatetimeLocal(dataHoraAtual));
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    startTransition(async () => {
      const resultado = await reagendar(agendamentoId, new Date(novaDataHora).toISOString());
      if (resultado.ok) {
        onDone();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <FormField label="Nova data e horário" htmlFor={`reagendar_${agendamentoId}`}>
        <input
          id={`reagendar_${agendamentoId}`}
          type="datetime-local"
          className={inputClass}
          value={novaDataHora}
          onChange={(e) => setNovaDataHora(e.target.value)}
        />
      </FormField>
      <button
        type="submit"
        disabled={pending}
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
  tutores,
  pets,
  servicos,
  categorias,
  tutorInicial,
  onDone,
}: {
  petshopId: string;
  tutores: Tutor[];
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
  tutorInicial?: string;
  onDone: () => void;
}) {
  const [tutorId, setTutorId] = useState(tutorInicial ?? tutores[0]?.id ?? "");
  const petsDoTutor = pets.filter((p) => p.tutor_id === tutorId);
  const [petId, setPetId] = useState(petsDoTutor[0]?.id ?? "");
  const [servicoId, setServicoId] = useState(servicos[0]?.id ?? "");
  const [dataHora, setDataHora] = useState(() => paraInputDatetimeLocal(new Date().toISOString()));
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

    startTransition(async () => {
      const resultado = await criarAgendamentoAvulso(petshopId, {
        tutor_id: tutorId,
        pet_id: petId,
        servico_id: servicoId,
        data_hora: new Date(dataHora).toISOString(),
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
      <FormField label="Data e horário" htmlFor="avulsa_data_hora">
        <input
          id="avulsa_data_hora"
          type="datetime-local"
          className={inputClass}
          value={dataHora}
          onChange={(e) => setDataHora(e.target.value)}
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending || petsDoTutor.length === 0}
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
