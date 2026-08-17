"use client";

import { botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import type { TomBadge } from "@/lib/ui/styles";
import { useState, useTransition, type FormEvent } from "react";
import type {
  Assinatura,
  ContatoAdicional,
  PapelContato,
  Pet,
  Plano,
  Porte,
  StatusAssinatura,
  Tutor,
} from "@/types/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { gerarHorariosDisponiveis, type ExpedientePetshop } from "@/lib/horarios";
import {
  atualizarPet,
  atualizarTutor,
  cancelarAssinatura,
  criarAssinatura,
  criarPet,
  criarTutor,
  gerarLinkCadastro,
  pausarAssinatura,
  removerContatoAdicional,
  removerPet,
  retomarAssinatura,
  salvarContatoAdicional,
  type ActionResult,
} from "./actions";

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

const PAPEIS: { value: PapelContato; label: string; hint: string }[] = [
  {
    value: "agendamento",
    label: "Agendamento",
    hint: "Quem marca o banho, se for diferente do tutor principal.",
  },
  {
    value: "busca_entrega",
    label: "Busca/entrega",
    hint: "Quem leva e busca o pet — recebe a confirmação D-1 e o aviso de pet pronto.",
  },
  {
    value: "cobranca",
    label: "Cobrança",
    hint: "Quem recebe mensagens sobre pagamento/cartão.",
  },
];

function CadastroBadge({ completo }: { completo: boolean }) {
  // "Pendente" é amarelo, não vermelho: é uma tarefa em aberto, não um erro.
  return (
    <Badge tom={completo ? "sucesso" : "atencao"} ponto={!completo}>
      {completo ? "Cadastro completo" : "Cadastro pendente"}
    </Badge>
  );
}

export function TutoresSection({
  petshopId,
  expediente,
  portes,
  tutores,
  pets,
  contatosAdicionais,
  planos,
  assinaturas,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  portes: Porte[];
  tutores: Tutor[];
  pets: Pet[];
  contatosAdicionais: ContatoAdicional[];
  planos: Plano[];
  assinaturas: Assinatura[];
}) {
  const [criando, setCriando] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-ink-900">Tutores</h2>
          <p className="mt-1 text-sm text-ink-500">
            Cadastre só o telefone e mande o link de autopreenchimento — o
            próprio tutor preenche nome, endereço e pets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCriando((v) => !v)}
          className={botao({ variante: criando ? "neutra" : "cta" })}
        >
          {criando ? "Cancelar" : "+ Novo tutor"}
        </button>
      </div>

      {criando && (
        <div className="mt-4">
          <NovoTutorForm petshopId={petshopId} onDone={() => setCriando(false)} />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {tutores.length === 0 && !criando ? (
          <EmptyState
            titulo="Nenhum tutor cadastrado"
            descricao="Comece cadastrando só o telefone — depois copie o link de autopreenchimento pra mandar por WhatsApp."
            itens={[
              "O tutor preenche nome, endereço e pets pelo próprio link",
              "Contato adicional por papel — ex.: quem busca o pet, se for diferente de quem agenda",
              "O link também sai sozinho por WhatsApp assim que o tutor é cadastrado — copiar e mandar na mão é só o atalho",
            ]}
          />
        ) : (
          tutores.map((tutor) => (
            <TutorCard
              key={tutor.id}
              petshopId={petshopId}
              expediente={expediente}
              tutor={tutor}
              portes={portes}
              pets={pets.filter((p) => p.tutor_id === tutor.id)}
              contatos={contatosAdicionais.filter((c) => c.tutor_id === tutor.id)}
              planos={planos}
              assinaturas={assinaturas.filter((a) => a.tutor_id === tutor.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function NovoTutorForm({ petshopId, onDone }: { petshopId: string; onDone: () => void }) {
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!telefone.trim()) {
      setErro("Informe pelo menos o telefone do tutor.");
      return;
    }

    startTransition(async () => {
      const resultado = await criarTutor(petshopId, {
        telefone: telefone.trim(),
        nome: nome.trim() || null,
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
      <FormField
        label="Telefone"
        htmlFor="novo_tutor_telefone"
        hint="Único campo obrigatório — o resto o tutor preenche pelo link."
      >
        <input
          id="novo_tutor_telefone"
          className={inputClass}
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(48) 99999-0000"
        />
      </FormField>
      <FormField
        label="Nome"
        htmlFor="novo_tutor_nome"
        hint="Opcional — preencha só se a equipe já souber (ex.: cliente de balcão)."
      >
        <input
          id="novo_tutor_nome"
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex.: Maria Silva"
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className={botao()}
        >
          {pending ? "Adicionando…" : "Adicionar tutor"}
        </button>
        <p className="text-xs text-ink-500">
          Depois de criar, copie o link de autopreenchimento pra mandar pro tutor.
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

function CopiarLinkButton({ tutorId }: { tutorId: string }) {
  const [pending, startTransition] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");

  function handleClick() {
    setErro("");
    const url = `${window.location.origin}/cadastro/${tutorId}`;

    startTransition(async () => {
      // Copia primeiro (nao depende do servidor) e so depois registra o
      // lembrete pendente — se o registro falhar, a equipe ainda tem o link
      // na area de transferencia.
      try {
        await navigator.clipboard.writeText(url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      } catch {
        setErro("Não deu pra copiar automaticamente — copie manualmente: " + url);
        return;
      }

      const resultado = await gerarLinkCadastro(tutorId);
      if (!resultado.ok) {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className={botao({ variante: "neutra", tamanho: "sm" })}
      >
        {copiado ? "Link copiado!" : "Copiar link de cadastro"}
      </button>
      {erro && <p className="max-w-xs text-right text-xs text-danger-600">{erro}</p>}
    </div>
  );
}

function TutorCard({
  petshopId,
  expediente,
  tutor,
  portes,
  pets,
  contatos,
  planos,
  assinaturas,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  tutor: Tutor;
  portes: Porte[];
  pets: Pet[];
  contatos: ContatoAdicional[];
  planos: Plano[];
  assinaturas: Assinatura[];
}) {
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink-900">{tutor.nome}</p>
            <CadastroBadge completo={tutor.cadastro_completo} />
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            {tutor.telefone} ·{" "}
            {pets.length === 0
              ? "sem pets cadastrados"
              : `${pets.length} pet${pets.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopiarLinkButton tutorId={tutor.id} />
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className={botao({ variante: "neutra", tamanho: "sm" })}
          >
            {expandido ? "Fechar" : "Detalhes"}
          </button>
        </div>
      </div>

      {expandido && (
        <div className="mt-5 space-y-6 border-t border-surface-border pt-5">
          <TutorDadosForm tutor={tutor} />
          <PetsSubsection
            petshopId={petshopId}
            expediente={expediente}
            tutorId={tutor.id}
            portes={portes}
            pets={pets}
            planos={planos}
            assinaturas={assinaturas}
          />
          <ContatosSubsection petshopId={petshopId} tutorId={tutor.id} contatos={contatos} />
        </div>
      )}
    </div>
  );
}

function TutorDadosForm({ tutor }: { tutor: Tutor }) {
  const [nome, setNome] = useState(tutor.nome);
  const [telefone, setTelefone] = useState(tutor.telefone);
  const [email, setEmail] = useState(tutor.email ?? "");
  const [endereco, setEndereco] = useState(tutor.endereco ?? "");
  const [cadastroCompleto, setCadastroCompleto] = useState(tutor.cadastro_completo);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setSalvo(false);

    if (!nome.trim() || !telefone.trim()) {
      setErro("Nome e telefone não podem ficar em branco.");
      return;
    }

    startTransition(async () => {
      const resultado = await atualizarTutor(tutor.id, {
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim() || null,
        endereco: endereco.trim() || null,
        cadastro_completo: cadastroCompleto,
      });
      if (resultado.ok) {
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3 className="text-sm font-medium text-ink-900">Dados do tutor</h3>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Nome" htmlFor={`tutor_nome_${tutor.id}`}>
          <input
            id={`tutor_nome_${tutor.id}`}
            className={inputClass}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </FormField>
        <FormField label="Telefone" htmlFor={`tutor_telefone_${tutor.id}`}>
          <input
            id={`tutor_telefone_${tutor.id}`}
            className={inputClass}
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </FormField>
        <FormField label="E-mail" htmlFor={`tutor_email_${tutor.id}`} hint="Opcional.">
          <input
            id={`tutor_email_${tutor.id}`}
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label="Endereço" htmlFor={`tutor_endereco_${tutor.id}`}>
          <input
            id={`tutor_endereco_${tutor.id}`}
            className={inputClass}
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm text-ink-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={cadastroCompleto}
            onChange={(e) => setCadastroCompleto(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border text-brand-500 focus:ring-brand-500"
          />
          Cadastro completo
          <span className="text-xs text-ink-500">
            — normalmente marcado sozinho quando o tutor envia o link; use aqui só se a equipe completou tudo no balcão.
          </span>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={botao()}
        >
          {pending ? "Salvando…" : "Salvar dados do tutor"}
        </button>
        {salvo && <p className="text-sm text-success-700">Salvo.</p>}
        {erro && (
          <p role="alert" className="text-sm text-danger-600">
            {erro}
          </p>
        )}
      </div>
    </form>
  );
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

function PetForm({
  petshopId,
  tutorId,
  portes,
  pet,
  onDone,
  onCancel,
}: {
  petshopId?: string;
  tutorId?: string;
  portes: Porte[];
  pet?: Pet;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [nome, setNome] = useState(pet?.nome ?? "");
  const [porteId, setPorteId] = useState(pet?.porte_id ?? portes[0]?.id ?? 0);
  const [raca, setRaca] = useState(pet?.raca ?? "");
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

    const dados = {
      nome: nome.trim(),
      porte_id: porteId,
      raca: raca.trim() || null,
      observacoes: observacoes.trim() || null,
      sexo: sexo || null,
    };

    startTransition(async () => {
      const resultado = pet
        ? await atualizarPet(pet.id, dados)
        : await criarPet(petshopId!, tutorId!, dados);

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
      <FormField label="Raça" htmlFor={`pet_raca_${pet?.id ?? "novo"}_${tutorId}`} hint="Opcional.">
        <input
          id={`pet_raca_${pet?.id ?? "novo"}_${tutorId}`}
          className={inputClass}
          value={raca}
          onChange={(e) => setRaca(e.target.value)}
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
          {pending ? "Salvando…" : pet ? "Salvar" : "Adicionar pet"}
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
          <p className="text-sm font-medium text-ink-900">{pet.nome}</p>
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
                const resultado = await removerPet(pet.id);
                if (!resultado.ok) setErro(resultado.erro);
              })
            }
            className={botao({ variante: "textoPerigo", tamanho: "sm" })}
          >
            Remover
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

function ContatosSubsection({
  petshopId,
  tutorId,
  contatos,
}: {
  petshopId: string;
  tutorId: string;
  contatos: ContatoAdicional[];
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-ink-900">Contato adicional por papel</h3>
      <p className="mt-0.5 text-xs text-ink-500">
        Só cadastre aqui quando quem exerce o papel é diferente do tutor
        principal — sem contato, a mensagem cai automaticamente no tutor (ver
        docs/regras_padrao_petshop.md, seção 5).
      </p>

      <div className="mt-3 space-y-2">
        {PAPEIS.map((papel) => {
          const contato = contatos.find((c) => c.papel === papel.value);
          return (
            <ContatoPapelRow
              key={papel.value}
              petshopId={petshopId}
              tutorId={tutorId}
              papel={papel}
              contato={contato}
            />
          );
        })}
      </div>
    </div>
  );
}

function ContatoPapelRow({
  petshopId,
  tutorId,
  papel,
  contato,
}: {
  petshopId: string;
  tutorId: string;
  papel: { value: PapelContato; label: string; hint: string };
  contato?: ContatoAdicional;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(contato?.nome ?? "");
  const [telefone, setTelefone] = useState(contato?.telefone ?? "");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSalvar(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!nome.trim() || !telefone.trim()) {
      setErro("Preencha nome e telefone.");
      return;
    }

    startTransition(async () => {
      const resultado = await salvarContatoAdicional(petshopId, tutorId, {
        papel: papel.value,
        nome: nome.trim(),
        telefone: telefone.trim(),
      });
      if (resultado.ok) {
        setEditando(false);
      } else {
        setErro(resultado.erro);
      }
    });
  }

  function handleRemover() {
    if (!contato) return;
    setErro("");
    startTransition(async () => {
      const resultado = await removerContatoAdicional(contato.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  if (editando) {
    return (
      <form
        onSubmit={handleSalvar}
        className="grid grid-cols-1 gap-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          aria-label={`Nome do contato de ${papel.label}`}
        />
        <input
          className={inputClass}
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="Telefone"
          aria-label={`Telefone do contato de ${papel.label}`}
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className={botao({ tamanho: "sm" })}
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-sm font-medium text-ink-500 hover:text-ink-700"
          >
            Cancelar
          </button>
        </div>
        {erro && (
          <p role="alert" className="text-xs text-danger-600 sm:col-span-3">
            {erro}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border px-3 py-2">
      <div>
        <p className="text-sm font-medium text-ink-900">{papel.label}</p>
        <p className="text-xs text-ink-500">
          {contato ? `${contato.nome} · ${contato.telefone}` : papel.hint}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {contato ? "Editar" : "Adicionar"}
        </button>
        {contato && (
          <button
            type="button"
            disabled={pending}
            onClick={handleRemover}
            className={botao({ variante: "textoPerigo", tamanho: "sm" })}
          >
            Remover
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-danger-600">{erro}</p>}
    </div>
  );
}
