"use client";

import { botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import type { TomBadge } from "@/lib/ui/styles";
import { useState, useTransition, type FormEvent } from "react";
import type { Assinatura, EspeciePet, Pet, Plano, Porte, StatusAssinatura } from "@/types/database";
import { FormField, inputClass } from "@/components/ui/FormField";
import { CampoRaca } from "@/components/pets/CampoRaca";
import { gerarHorariosDisponiveis, type ExpedientePetshop } from "@/lib/horarios";
import {
  alternarAtivoPet,
  atualizarPet,
  cancelarAssinatura,
  criarAssinatura,
  criarPet,
  pausarAssinatura,
  retomarAssinatura,
  type ActionResult,
  type PetInput,
} from "./actions";

// Fase F1 do roadmap de identidade visual (10/set/2026) — TutoresSection.tsx
// tinha 1.400 linhas (o maior arquivo de tela do projeto, já registrado como
// dívida em plano-refatoracoes-cadastro-estoque-pagamento-agenda.md desde
// agosto e nunca decomposto). Este arquivo concentra o bloco "pets +
// assinatura" de dentro do card do tutor: PetsSubsection, PetForm (que a
// tela /pets também reusa pro fluxo "+ Novo Pet" — ver
// app/(app)/pets/PetsSection.tsx), PetRow e o gerenciamento de assinatura
// (pausar/retomar/cancelar/criar). TutorCard.tsx cobre identidade do tutor +
// contatos adicionais; TutoresSection.tsx virou só a casca de lista/busca.
// Nenhuma linha de lógica mudou — só o arquivo em que ela mora.

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// "YYYY-MM-DD" -> "DD/MM/AAAA", sem passar por Date (evita fuso horário
// deslocando o dia em 1 pra trás/frente).
function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Componentes LOCAIS do Date, nunca .toISOString().slice(0,10) (usa UTC —
// à noite no fuso do Brasil já vira o dia seguinte em UTC).
function dataLocalHoje(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function PetsSubsection({
  petshopId,
  expediente,
  tutorId,
  portes,
  pets,
  planos,
  assinaturas,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  tutorId: string;
  portes: Porte[];
  pets: Pet[];
  planos: Plano[];
  assinaturas: Assinatura[];
}) {
  const [adicionando, setAdicionando] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink-900">Pets</h3>
        <button
          type="button"
          onClick={() => setAdicionando((v) => !v)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {adicionando ? "Cancelar" : "+ Adicionar pet"}
        </button>
      </div>

      {adicionando && (
        <div className="mt-3">
          <PetForm
            petshopId={petshopId}
            tutorId={tutorId}
            portes={portes}
            onDone={() => setAdicionando(false)}
          />
        </div>
      )}

      <div className="mt-3 space-y-2">
        {pets.length === 0 && !adicionando ? (
          <p className="text-sm text-ink-500">Nenhum pet cadastrado ainda.</p>
        ) : (
          pets.map((pet) => (
            <PetRow
              key={pet.id}
              petshopId={petshopId}
              expediente={expediente}
              tutorId={tutorId}
              pet={pet}
              portes={portes}
              planos={planos}
              assinaturas={assinaturas.filter((a) => a.pet_id === pet.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Exportado — a tela /pets (Fase 4, cadastro pelo Pet) reusa este mesmo
// formulário pro passo final do fluxo "+ Novo Pet" (depois de escolher ou
// criar o tutor), em vez de duplicar os campos nome/porte/espécie/raça/sexo.
export function PetForm({
  petshopId,
  tutorId,
  portes,
  pet,
  onDone,
  onCancel,
  onCollect,
  labelSubmit,
}: {
  petshopId?: string;
  tutorId?: string;
  portes: Porte[];
  pet?: Pet;
  // Opcional desde 20/ago/2026: no modo onCollect (abaixo) o formulário não
  // salva nada, então quem fecha o fluxo é o chamador — a tela /pets usa
  // esse modo e não passava onDone, o que era um erro de tipo silencioso
  // (`tsc --noEmit` acusava, mas o dev server não).
  onDone?: () => void;
  onCancel?: () => void;
  // Fase 4 (ajuste 18/ago/2026 — bug reportado: a tela /pets prometia
  // "cadastro começa pelo pet" mas o primeiro formulário que a pessoa via
  // era o do tutor). Quando presente, o form NÃO salva nada sozinho — só
  // valida e devolve os dados coletados pro chamador. Usado pelo fluxo
  // "+ Novo Pet" de PetsSection.tsx, que agora coleta os dados do pet
  // ANTES de perguntar o tutor, e só grava os dois juntos depois de
  // identificar o tutor (passo 2).
  onCollect?: (dados: PetInput) => void;
  labelSubmit?: string;
}) {
  const [nome, setNome] = useState(pet?.nome ?? "");
  const [porteId, setPorteId] = useState(pet?.porte_id ?? portes[0]?.id ?? 0);
  const [especie, setEspecie] = useState<EspeciePet | "">(pet?.especie ?? "");
  const [raca, setRaca] = useState<string | null>(pet?.raca ?? null);
  const [observacoes, setObservacoes] = useState(pet?.observacoes ?? "");
  const [sexo, setSexo] = useState<"macho" | "femea" | "">(pet?.sexo ?? "");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!nome.trim()) {
      setErro("Dê um nome pro pet.");
      return;
    }

    const dados: PetInput = {
      nome: nome.trim(),
      porte_id: porteId,
      raca: raca?.trim() || null,
      observacoes: observacoes.trim() || null,
      sexo: sexo || null,
      especie: especie || null,
    };

    if (onCollect) {
      onCollect(dados);
      return;
    }

    startTransition(async () => {
      const resultado = pet
        ? await atualizarPet(pet.id, dados)
        : await criarPet(petshopId!, tutorId!, dados);

      if (resultado.ok) {
        onDone?.();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-lg border border-brand-200 bg-brand-50/60 p-4 sm:grid-cols-2"
    >
      <FormField label="Nome do pet" htmlFor={`pet_nome_${pet?.id ?? "novo"}_${tutorId}`}>
        <input
          id={`pet_nome_${pet?.id ?? "novo"}_${tutorId}`}
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex.: Thor"
        />
      </FormField>
      <FormField label="Porte" htmlFor={`pet_porte_${pet?.id ?? "novo"}_${tutorId}`}>
        <select
          id={`pet_porte_${pet?.id ?? "novo"}_${tutorId}`}
          className={inputClass}
          value={porteId}
          onChange={(e) => setPorteId(Number(e.target.value))}
        >
          {portes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Tipo de pet"
        htmlFor={`pet_especie_${pet?.id ?? "novo"}_${tutorId}`}
        hint="Ajuda a sugerir as raças mais comuns."
      >
        <select
          id={`pet_especie_${pet?.id ?? "novo"}_${tutorId}`}
          className={inputClass}
          value={especie}
          onChange={(e) => {
            // Trocar de espécie invalida a raça escolhida antes — uma raça
            // de cachorro não faz sentido depois de mudar pra gato.
            setEspecie(e.target.value as EspeciePet | "");
            setRaca(null);
          }}
        >
          <option value="">Não informado</option>
          <option value="cachorro">Cachorro</option>
          <option value="gato">Gato</option>
          <option value="outro">Outro</option>
        </select>
      </FormField>
      <FormField label="Raça" htmlFor={`pet_raca_${pet?.id ?? "novo"}_${tutorId}`} hint="Opcional.">
        <CampoRaca
          id={`pet_raca_${pet?.id ?? "novo"}_${tutorId}`}
          especie={especie || null}
          raca={raca}
          onChange={setRaca}
        />
      </FormField>
      <FormField
        label="Sexo"
        htmlFor={`pet_sexo_${pet?.id ?? "novo"}_${tutorId}`}
        hint="Opcional — usado pra deixar as mensagens automáticas certas (ex.: 'pronto'/'pronta')."
      >
        <select
          id={`pet_sexo_${pet?.id ?? "novo"}_${tutorId}`}
          className={inputClass}
          value={sexo}
          onChange={(e) => setSexo(e.target.value as "macho" | "femea" | "")}
        >
          <option value="">Não informado</option>
          <option value="macho">Macho</option>
          <option value="femea">Fêmea</option>
        </select>
      </FormField>
      <FormField
        label="Observações"
        htmlFor={`pet_obs_${pet?.id ?? "novo"}_${tutorId}`}
        hint="Temperamento, alergias, restrições…"
      >
        <input
          id={`pet_obs_${pet?.id ?? "novo"}_${tutorId}`}
          className={inputClass}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className={botao({ tamanho: "sm" })}
        >
          {pending ? "Salvando…" : labelSubmit ?? (pet ? "Salvar" : "Adicionar pet")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-ink-500 hover:text-ink-700"
          >
            Cancelar
          </button>
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

function PetRow({
  petshopId,
  expediente,
  tutorId,
  pet,
  portes,
  planos,
  assinaturas,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  tutorId: string;
  pet: Pet;
  portes: Porte[];
  planos: Plano[];
  assinaturas: Assinatura[];
}) {
  const [editando, setEditando] = useState(false);
  const [mostrarAssinatura, setMostrarAssinatura] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const porte = portes.find((p) => p.id === pet.porte_id);

  // Mais recente primeiro — se a última for 'cancelada', o bloco de
  // assinatura mostra o histórico e oferece "+ Nova assinatura" em cima dela.
  const assinatura = [...assinaturas].sort((a, b) =>
    b.criado_em.localeCompare(a.criado_em)
  )[0] as Assinatura | undefined;

  if (editando) {
    return (
      <PetForm
        pet={pet}
        portes={portes}
        onDone={() => setEditando(false)}
        onCancel={() => setEditando(false)}
      />
    );
  }

  return (
    <div className="rounded-lg border border-surface-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-ink-900">{pet.nome}</p>
            {!pet.ativo && <Badge tom="neutro">Inativo</Badge>}
          </div>
          <p className="text-xs text-ink-500">
            {porte?.nome ?? "porte não definido"}
            {pet.raca ? ` · ${pet.raca}` : ""}
            {pet.observacoes ? ` · ${pet.observacoes}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarAssinatura((v) => !v)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {mostrarAssinatura
              ? "Fechar assinatura"
              : assinatura && assinatura.status !== "cancelada"
                ? `Assinatura: ${LABEL_STATUS_ASSINATURA[assinatura.status]}`
                : "+ Assinatura"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setErro("");
                const resultado = await alternarAtivoPet(pet.id, !pet.ativo);
                if (!resultado.ok) setErro(resultado.erro);
              })
            }
            className={botao({ variante: pet.ativo ? "textoPerigo" : "texto", tamanho: "sm" })}
          >
            {pet.ativo ? "Desativar" : "Reativar"}
          </button>
        </div>
      </div>
      {erro && <p className="mt-1 text-xs text-danger-600">{erro}</p>}

      {mostrarAssinatura && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <AssinaturaBlock
            petshopId={petshopId}
            expediente={expediente}
            tutorId={tutorId}
            petId={pet.id}
            planos={planos}
            assinatura={assinatura}
          />
        </div>
      )}
    </div>
  );
}

const LABEL_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  ativa: "ativa",
  pausada: "pausada",
  cancelada: "cancelada",
};

function AssinaturaStatusBadge({ status }: { status: StatusAssinatura }) {
  const tons: Record<StatusAssinatura, TomBadge> = {
    ativa: "sucesso",
    // Pausada não é falha — é uma decisão do tutor que pode ser revertida.
    pausada: "atencao",
    cancelada: "neutro",
  };
  return <Badge tom={tons[status]}>{LABEL_STATUS_ASSINATURA[status]}</Badge>;
}

function AssinaturaBlock({
  petshopId,
  expediente,
  tutorId,
  petId,
  planos,
  assinatura,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  tutorId: string;
  petId: string;
  planos: Plano[];
  assinatura: Assinatura | undefined;
}) {
  const [criando, setCriando] = useState(false);

  const semAssinaturaAtiva = !assinatura || assinatura.status === "cancelada";

  return (
    <div className="space-y-3">
      {assinatura && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <AssinaturaStatusBadge status={assinatura.status} />
            <span className="text-sm text-ink-900">
              {planos.find((p) => p.id === assinatura.plano_id)?.nome ?? "Plano removido"}
            </span>
            <span className="text-xs text-ink-500">
              {DIAS_SEMANA[assinatura.dia_semana_preferencial]} às{" "}
              {assinatura.horario_preferencial.slice(0, 5)}
            </span>
          </div>
          <p className="text-xs text-ink-500">
            {assinatura.status === "ativa" && assinatura.proxima_data_agendamento
              ? `Próxima visita: ${formatarData(assinatura.proxima_data_agendamento)}`
              : assinatura.status === "pausada"
                ? "Pausada — sem próxima visita agendada até retomar."
                : "Assinatura cancelada."}
          </p>
          <AssinaturaAcoes assinatura={assinatura} />
        </div>
      )}

      {semAssinaturaAtiva &&
        (criando ? (
          <AssinaturaForm
            petshopId={petshopId}
            expediente={expediente}
            tutorId={tutorId}
            petId={petId}
            planos={planos}
            onDone={() => setCriando(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {assinatura ? "+ Nova assinatura" : "+ Criar assinatura"}
          </button>
        ))}
    </div>
  );
}

function AssinaturaAcoes({ assinatura }: { assinatura: Assinatura }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function executar(acao: (id: string) => Promise<ActionResult>) {
    setErro("");
    startTransition(async () => {
      const resultado = await acao(assinatura.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  if (assinatura.status === "cancelada") return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {assinatura.status === "ativa" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => executar(pausarAssinatura)}
          className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-60"
        >
          Pausar
        </button>
      )}
      {assinatura.status === "pausada" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => executar(retomarAssinatura)}
          className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-60"
        >
          Retomar
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => executar(cancelarAssinatura)}
        className={botao({ variante: "textoPerigo", tamanho: "sm" })}
      >
        Cancelar assinatura
      </button>
      {erro && <p className="text-xs text-danger-600">{erro}</p>}
    </div>
  );
}

function AssinaturaForm({
  petshopId,
  expediente,
  tutorId,
  petId,
  planos,
  onDone,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  tutorId: string;
  petId: string;
  planos: Plano[];
  onDone: () => void;
}) {
  const planosAtivos = planos.filter((p) => p.ativo);
  const horarios = gerarHorariosDisponiveis(expediente);
  const [planoId, setPlanoId] = useState(planosAtivos[0]?.id ?? "");
  const [diaSemana, setDiaSemana] = useState(() => new Date().getDay());
  const [horario, setHorario] = useState(() => horarios[0] ?? "09:00");
  const [dataInicio, setDataInicio] = useState(dataLocalHoje);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  if (planosAtivos.length === 0) {
    return (
      <p className="text-xs text-danger-600">
        Nenhum plano ativo — cadastre um em Planos &amp; Serviços antes de criar uma assinatura.
      </p>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!planoId) {
      setErro("Escolha um plano.");
      return;
    }
    if (!horario) {
      setErro("Nenhum horário disponível — confira o expediente em Configurações.");
      return;
    }

    startTransition(async () => {
      const resultado = await criarAssinatura(petshopId, {
        tutor_id: tutorId,
        pet_id: petId,
        plano_id: planoId,
        dia_semana_preferencial: diaSemana,
        horario_preferencial: horario,
        data_inicio: dataInicio,
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
      className="grid grid-cols-1 gap-3 rounded-lg border border-brand-200 bg-brand-50/60 p-4 sm:grid-cols-2"
    >
      <FormField label="Plano" htmlFor={`assinatura_plano_${petId}`}>
        <select
          id={`assinatura_plano_${petId}`}
          className={inputClass}
          value={planoId}
          onChange={(e) => setPlanoId(e.target.value)}
        >
          {planosAtivos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Dia da semana preferencial" htmlFor={`assinatura_dia_${petId}`}>
        <select
          id={`assinatura_dia_${petId}`}
          className={inputClass}
          value={diaSemana}
          onChange={(e) => setDiaSemana(Number(e.target.value))}
        >
          {DIAS_SEMANA.map((nome, i) => (
            <option key={nome} value={i}>
              {nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Horário preferencial"
        htmlFor={`assinatura_horario_${petId}`}
        hint={
          horarios.length === 0
            ? "Confira o expediente em Configurações."
            : "Só usado pra gerar a 1ª visita — o dia da semana se repete a partir dela."
        }
      >
        <select
          id={`assinatura_horario_${petId}`}
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
      <FormField label="Início" htmlFor={`assinatura_inicio_${petId}`}>
        <input
          id={`assinatura_inicio_${petId}`}
          type="date"
          className={inputClass}
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending || horarios.length === 0}
          className={botao({ tamanho: "sm" })}
        >
          {pending ? "Criando…" : "Criar assinatura"}
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

export { PetsSubsection };
