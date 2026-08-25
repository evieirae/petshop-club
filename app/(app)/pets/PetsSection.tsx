"use client";

import Link from "next/link";
import { botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { useState, useTransition, type FormEvent } from "react";
import type { Pet, Porte, Tutor } from "@/types/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { PetForm } from "../tutores/TutoresSection";
import {
  alternarAtivoPet,
  criarPet,
  criarTutor,
  dispararMensagemRetencao,
  type PetInput,
} from "../tutores/actions";

// Fase 4 (pedido de 18/ago/2026 — "cadastro pela plataforma do Pet, com o
// link pro tutor depois"): esta é a nova tela principal de cadastro. O
// mesmo princípio já valia na Agenda (NovaVisitaForm busca por pet
// primeiro) — aqui ele chega no cadastro em si. `TutoresSection.tsx`
// continua existindo, sem mudança de papel: é onde fica o que é dado do
// TUTOR (endereço, e-mail, link de autopreenchimento, contato adicional,
// forma de pagamento) e onde a assinatura de cada pet é gerenciada — o
// "Ver tutor" de cada card daqui leva pra lá.

// Pedido de 20/ago/2026 — a partir de quantos dias sem visita o card
// destaca "faz tempo que não vem". Só um limiar de exibição (não trava
// nada); ajustável aqui sem precisar de tela de configuração nesta v1.
const LIMIAR_DIAS_SEM_VISITA = 30;

function nomeEspecie(especie: Pet["especie"]): string {
  if (especie === "cachorro") return "Cachorro";
  if (especie === "gato") return "Gato";
  if (especie === "outro") return "Outro";
  return "";
}

// "Última visita" só conta agendamento status='entregue' (decisão de
// 20/ago/2026) — resolvido no server (app/(app)/pets/page.tsx) e passado
// pronto aqui. Diferença em dias, arredondada pra baixo — "0 dias" é
// "esteve aqui hoje", não "ainda não passou um dia inteiro".
function diasDesde(dataISO: string): number {
  const umDiaMs = 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - new Date(dataISO).getTime()) / umDiaMs);
}

function formatarDataVisita(dataISO: string): string {
  return new Date(dataISO).toLocaleDateString("pt-BR");
}

export function PetsSection({
  petshopId,
  portes,
  tutores,
  pets,
  ultimaVisitaPorPet,
}: {
  petshopId: string;
  portes: Porte[];
  tutores: Tutor[];
  pets: Pet[];
  // Migration 0020 — petId -> ISO da última visita 'entregue', resolvido
  // no server (app/(app)/pets/page.tsx). Pet sem entrada aqui nunca teve
  // visita concluída.
  ultimaVisitaPorPet: Record<string, string>;
}) {
  const [cadastrando, setCadastrando] = useState(false);
  // Migration 0019 (soft-delete) — inativos escondidos por padrão, atrás
  // desse toggle: mesma razão de app/(app)/tutores/TutoresSection.tsx (a
  // lista tende a crescer bastante, e deixar inativos sempre visíveis
  // volta a poluir a tela).
  const [mostrarInativos, setMostrarInativos] = useState(false);

  // Filtros (pedido de 20/ago/2026) — puramente client-side sobre o que já
  // veio do server, mesmo espírito do toggle de inativos acima.
  const [busca, setBusca] = useState("");
  const [especieFiltro, setEspecieFiltro] = useState<Pet["especie"] | "todas">("todas");
  const [porteFiltro, setPorteFiltro] = useState<number | "todos">("todos");
  const [semVisitaRecente, setSemVisitaRecente] = useState(false);

  const petsAtivos = pets.filter((p) => p.ativo);
  const inativosCount = pets.length - petsAtivos.length;
  const termoBusca = busca.trim().toLowerCase();

  const petsFiltrados = (mostrarInativos ? pets : petsAtivos).filter((pet) => {
    if (termoBusca && !pet.nome.toLowerCase().includes(termoBusca)) return false;
    if (especieFiltro !== "todas" && pet.especie !== especieFiltro) return false;
    if (porteFiltro !== "todos" && pet.porte_id !== porteFiltro) return false;
    if (semVisitaRecente) {
      const ultima = ultimaVisitaPorPet[pet.id];
      const dias = ultima ? diasDesde(ultima) : null;
      // Sem nenhuma visita registrada também conta como "sem visita
      // recente" — é o caso mais extremo do filtro, não uma exceção dele.
      if (dias !== null && dias < LIMIAR_DIAS_SEM_VISITA) return false;
    }
    return true;
  });
  const petsOrdenados = [...petsFiltrados].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const filtroAtivo =
    termoBusca.length > 0 || especieFiltro !== "todas" || porteFiltro !== "todos" || semVisitaRecente;

  // Picker de "já é cliente" (NovoPetFlow) só busca entre tutores ativos —
  // não faz sentido vincular um pet novo a um tutor desativado.
  const tutoresAtivos = tutores.filter((t) => t.ativo);

  function tutorDoPet(tutorId: string): Tutor | undefined {
    return tutores.find((t) => t.id === tutorId);
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-ink-900">Pets</h2>
          <p className="mt-1 text-sm text-ink-500">
            O cadastro começa pelo pet — o tutor é vinculado no mesmo fluxo,
            logo em seguida.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCadastrando((v) => !v)}
          className={botao({ variante: cadastrando ? "neutra" : "cta" })}
        >
          {cadastrando ? "Cancelar" : "+ Novo Pet"}
        </button>
      </div>

      {cadastrando && (
        <div className="mt-4">
          <NovoPetFlow petshopId={petshopId} tutores={tutoresAtivos} portes={portes} onDone={() => setCadastrando(false)} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-card p-3">
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="pets_busca" className="mb-1 block text-xs font-medium text-ink-500">
            Buscar por nome
          </label>
          <input
            id="pets_busca"
            className={inputClass}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="ex.: Thor"
          />
        </div>
        <div>
          <label htmlFor="pets_filtro_especie" className="mb-1 block text-xs font-medium text-ink-500">
            Espécie
          </label>
          <select
            id="pets_filtro_especie"
            className={inputClass}
            value={especieFiltro}
            onChange={(e) => setEspecieFiltro(e.target.value as Pet["especie"] | "todas")}
          >
            <option value="todas">Todas</option>
            <option value="cachorro">Cachorro</option>
            <option value="gato">Gato</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label htmlFor="pets_filtro_porte" className="mb-1 block text-xs font-medium text-ink-500">
            Porte
          </label>
          <select
            id="pets_filtro_porte"
            className={inputClass}
            value={porteFiltro}
            onChange={(e) => setPorteFiltro(e.target.value === "todos" ? "todos" : Number(e.target.value))}
          >
            <option value="todos">Todos</option>
            {portes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={semVisitaRecente}
            onChange={(e) => setSemVisitaRecente(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border text-brand-500 focus:ring-brand-500"
          />
          Sem visita há {LIMIAR_DIAS_SEM_VISITA}+ dias
        </label>
      </div>

      {inativosCount > 0 && (
        <button
          type="button"
          onClick={() => setMostrarInativos((v) => !v)}
          className="mt-3 text-xs font-medium text-brand-700 hover:underline"
        >
          {mostrarInativos ? "Ocultar inativos" : `Mostrar inativos (${inativosCount})`}
        </button>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {petsOrdenados.length === 0 && !cadastrando ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              titulo={filtroAtivo ? "Nenhum pet encontrado com esse filtro" : "Nenhum pet cadastrado"}
              descricao={
                filtroAtivo
                  ? "Ajuste a busca ou os filtros acima."
                  : "Comece por aqui: cadastre o pet primeiro, o tutor é vinculado no mesmo fluxo."
              }
            />
          </div>
        ) : (
          petsOrdenados.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              tutor={tutorDoPet(pet.tutor_id)}
              portes={portes}
              ultimaVisita={ultimaVisitaPorPet[pet.id]}
            />
          ))
        )}
      </div>
    </section>
  );
}

function PetCard({
  pet,
  tutor,
  portes,
  ultimaVisita,
}: {
  pet: Pet;
  tutor: Tutor | undefined;
  portes: Porte[];
  ultimaVisita: string | undefined;
}) {
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pendingRetencao, startTransitionRetencao] = useTransition();
  const [mensagemRegistrada, setMensagemRegistrada] = useState(false);
  const porte = portes.find((p) => p.id === pet.porte_id);
  const especie = nomeEspecie(pet.especie);
  const dias = ultimaVisita ? diasDesde(ultimaVisita) : null;
  const semVisitaHaTempo = dias !== null && dias >= LIMIAR_DIAS_SEM_VISITA;

  if (editando) {
    return (
      <div className="sm:col-span-2 lg:col-span-3">
        <PetForm pet={pet} portes={portes} onDone={() => setEditando(false)} onCancel={() => setEditando(false)} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-medium text-ink-900">{pet.nome}</p>
            {especie && <Badge tom="neutro">{especie}</Badge>}
            {!pet.ativo && <Badge tom="neutro">Inativo</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-500">
            {porte?.nome ?? "porte não definido"}
            {pet.raca ? ` · ${pet.raca}` : ""}
          </p>
          <p className="mt-1 truncate text-xs text-ink-500">
            {tutor ? `${tutor.nome} · ${tutor.telefone}` : "tutor removido"}
          </p>
        </div>
      </div>

      <div className="mt-2">
        {dias === null ? (
          <p className="text-xs text-ink-500">Nenhuma visita registrada ainda.</p>
        ) : semVisitaHaTempo ? (
          <Badge tom="atencao">
            Última visita: {formatarDataVisita(ultimaVisita!)} (há {dias} dias)
          </Badge>
        ) : (
          <p className="text-xs text-ink-500">
            Última visita: {formatarDataVisita(ultimaVisita!)} (há {dias} dia{dias === 1 ? "" : "s"})
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
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
          onClick={() => startTransition(async () => { await alternarAtivoPet(pet.id, !pet.ativo); })}
          className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-60"
        >
          {pet.ativo ? "Desativar" : "Reativar"}
        </button>
        {tutor && (
          <Link
            href={`/tutores?tutor=${tutor.id}`}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Ver tutor →
          </Link>
        )}
        {/* Só existe pra pet com pelo menos uma visita — não faz sentido
            "chamar de volta" quem nunca veio (ver PetsSection). Registra o
            pedido em `lembretes`; o envio de verdade ainda depende do
            template MARKETING ser desenhado (ver migration 0020). */}
        {dias !== null && !mensagemRegistrada && (
          <button
            type="button"
            disabled={pendingRetencao}
            onClick={() =>
              startTransitionRetencao(async () => {
                const resultado = await dispararMensagemRetencao(pet.id, dias);
                if (resultado.ok) setMensagemRegistrada(true);
              })
            }
            className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-60"
          >
            {pendingRetencao ? "Registrando…" : "Chamar de volta"}
          </button>
        )}
        {mensagemRegistrada && (
          <span className="text-xs text-success-700">
            Registrado — sai assim que o envio de retenção estiver configurado.
          </span>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// "+ Novo Pet" — Passo 1: dados do PET (nome, espécie, raça, porte, sexo,
// observações). Passo 2: identificar o tutor (buscar existente ou cadastrar
// novo, só telefone). O pet só é de fato gravado no banco no final do passo
// 2, junto com o tutor_id — mas quem preenche vê o pet primeiro, batendo com
// o que a própria tela promete ("O cadastro começa pelo pet").
//
// Bug corrigido em 18/ago/2026 (reportado pelo Eduardo testando a tela): a
// versão anterior mostrava o formulário de TUTOR (telefone/nome, botão
// "Cadastrar tutor e continuar") como primeira tela de "+ Novo Pet" — sem
// nenhum campo do pet visível ainda. Fazia sentido pro banco (pet precisa de
// tutor_id), mas não pra quem está com a intenção de "cadastrar um pet" e
// esbarra numa tela inteira sobre tutor. Não dá pra eliminar o vínculo com
// tutor (todo pet precisa de um, e o telefone é o que gera o link de
// WhatsApp de autopreenchimento — ver `regras_padrao_petshop.md` seção 6),
// então a solução foi inverter a ordem: pet primeiro, tutor depois.
// ----------------------------------------------------------------------------

function NovoPetFlow({
  petshopId,
  tutores,
  portes,
  onDone,
}: {
  petshopId: string;
  tutores: Tutor[];
  portes: Porte[];
  onDone: () => void;
}) {
  const [dadosPet, setDadosPet] = useState<PetInput | null>(null);
  const [busca, setBusca] = useState("");
  const [criandoTutor, setCriandoTutor] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  const termo = busca.trim().toLowerCase();
  const resultados =
    termo.length === 0
      ? []
      : tutores
          .filter((t) => t.nome.toLowerCase().includes(termo) || t.telefone.includes(termo))
          .slice(0, 8);

  function finalizarComTutor(tutorId: string) {
    setErro("");
    startTransition(async () => {
      const resultado = await criarPet(petshopId, tutorId, dadosPet!);
      if (resultado.ok) {
        onDone();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  // Passo 1: só coleta os dados do pet — nada é salvo ainda.
  if (!dadosPet) {
    return <PetForm portes={portes} onCollect={setDadosPet} onCancel={onDone} labelSubmit="Continuar" />;
  }

  // Passo 2, caminho "cliente novo": cadastra o tutor (só telefone) e, assim
  // que ele existir, grava o pet na sequência — um único fluxo do ponto de
  // vista de quem preenche, mesmo sendo duas chamadas ao banco.
  if (criandoTutor) {
    return (
      <div>
        <NovoTutorInline
          petshopId={petshopId}
          telefoneInicial={termo.match(/\d/) ? busca.trim() : ""}
          petNome={dadosPet.nome}
          finalizando={pending}
          onCriado={finalizarComTutor}
          onCancel={() => setCriandoTutor(false)}
        />
        {erro && (
          <p role="alert" className="mt-2 text-sm text-danger-600">
            {erro}
          </p>
        )}
      </div>
    );
  }

  // Passo 2, caminho "já é cliente": busca o tutor existente.
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-5">
      <p className="text-sm text-ink-700">
        Passo 2 de 2 — de quem é <span className="font-medium text-ink-900">{dadosPet.nome}</span>?
      </p>

      <div className="mt-3">
        <FormField
          label="Já é cliente? Busque pelo nome ou telefone do tutor"
          htmlFor="busca_tutor_novo_pet"
        >
          <input
            id="busca_tutor_novo_pet"
            className={inputClass}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="ex.: Maria ou (48) 99999-0000"
            autoFocus
          />
        </FormField>
      </div>

      {termo.length > 0 && (
        <div className="mt-3 space-y-1">
          {resultados.length === 0 ? (
            <p className="text-sm text-ink-500">Nenhum tutor encontrado com esse nome/telefone.</p>
          ) : (
            resultados.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={pending}
                onClick={() => finalizarComTutor(t.id)}
                className="flex w-full items-center justify-between rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-left text-sm hover:border-brand-500 disabled:opacity-60"
              >
                <span className="text-ink-900">{t.nome}</span>
                <span className="text-xs text-ink-500">{t.telefone}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-3">
        <button
          type="button"
          onClick={() => setCriandoTutor(true)}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          Cliente novo — cadastrar tutor (só telefone)
        </button>
        {/* Nota: volta pro passo 1 com o formulário em branco (o nome/raça
            digitados antes não ficam pré-preenchidos) — simplificação
            aceita por ora; se incomodar no uso real, dá pra guardar os
            valores digitados e passar como default do PetForm. */}
        <button
          type="button"
          onClick={() => setDadosPet(null)}
          className="text-xs font-medium text-ink-500 hover:text-ink-700"
        >
          ← Voltar aos dados do pet
        </button>
      </div>

      {pending && <p className="mt-2 text-sm text-ink-500">Salvando…</p>}
      {erro && (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {erro}
        </p>
      )}
    </div>
  );
}

function NovoTutorInline({
  petshopId,
  telefoneInicial,
  petNome,
  finalizando,
  onCriado,
  onCancel,
}: {
  petshopId: string;
  telefoneInicial: string;
  petNome: string;
  // true enquanto o passo seguinte (gravar o pet, já com este tutor_id)
  // ainda está rodando — mantém o botão "ocupado" nas duas chamadas ao
  // banco (criar tutor + criar pet) como se fosse uma única ação.
  finalizando: boolean;
  onCriado: (tutorId: string) => void;
  onCancel: () => void;
}) {
  const [telefone, setTelefone] = useState(telefoneInicial);
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
        onCriado(resultado.id);
      } else {
        setErro(resultado.erro);
      }
    });
  }

  const salvando = pending || finalizando;

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:grid-cols-2"
    >
      <p className="text-sm text-ink-700 sm:col-span-2">
        Só o telefone é obrigatório — é o que vincula{" "}
        <span className="font-medium">{petNome}</span> a um tutor. O resto
        (nome, endereço) o tutor preenche depois pelo link de
        autopreenchimento.
      </p>
      <FormField label="Telefone" htmlFor="novo_tutor_inline_telefone">
        <input
          id="novo_tutor_inline_telefone"
          className={inputClass}
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(48) 99999-0000"
        />
      </FormField>
      <FormField label="Nome" htmlFor="novo_tutor_inline_nome" hint="Opcional.">
        <input
          id="novo_tutor_inline_nome"
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex.: Maria Silva"
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={salvando} className={botao({ tamanho: "sm" })}>
          {salvando ? "Salvando…" : "Concluir cadastro do pet"}
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
