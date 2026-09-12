"use client";

import { botao, superficie, texto } from "@/lib/ui/styles";
import { useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { Assinatura, ContatoAdicional, Pet, Plano, Porte, Tutor } from "@/types/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import type { ExpedientePetshop } from "@/lib/horarios";
import { criarTutor } from "./actions";
import { TutorCard } from "./TutorCard";

// Fase F1 do roadmap de identidade visual (10/set/2026) — este arquivo era
// 1.400 linhas (o maior arquivo de tela do projeto, dívida já registrada em
// plano-refatoracoes-cadastro-estoque-pagamento-agenda.md desde agosto).
// Virou a casca de lista/busca/KPIs; o card do tutor foi pra TutorCard.tsx
// (dados do tutor + contato adicional) e TutorPets.tsx (pets + assinatura
// dentro do card). Nenhuma linha de lógica de negócio mudou — só o arquivo
// em que ela mora, mais os 3 KPIs novos abaixo (agregação trivial, sem
// query nova) e a troca dos títulos pra texto.tituloSecao/subtitulo.

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
  // Migration 0019 (soft-delete) — inativos ficam escondidos por padrão,
  // atrás desse toggle: diferente de funcionários/produtos, a lista de
  // tutores tende a crescer bastante, e deixar os inativos sempre visíveis
  // voltaria a poluir a tela (a queixa original que motivou o
  // ativo/inativo).
  const [mostrarInativos, setMostrarInativos] = useState(false);
  // Filtros (pedido de 20/ago/2026) — mesmo espírito do toggle acima,
  // client-side sobre o que já veio do server.
  const [busca, setBusca] = useState("");
  const [statusCadastro, setStatusCadastro] = useState<"todos" | "completo" | "pendente">("todos");
  // Fase 4 (cadastro pelo Pet) — a tela nova de /pets linka "Ver tutor" pra
  // cá com ?tutor=<id>, pra abrir direto no card certo em vez de forçar a
  // equipe a procurar numa lista que pode ter dezenas de tutores.
  const searchParams = useSearchParams();
  const tutorIdFoco = searchParams.get("tutor");

  const inativosCount = tutores.filter((t) => !t.ativo).length;
  const termoBusca = busca.trim().toLowerCase();

  // KPIs (Fase F1 do roadmap de identidade visual) — agregação simples
  // sobre os arrays já buscados no server, mesmo racional do Painel/Pets:
  // "assinaturas ativas" conta a mesma coisa que o KPI homônimo do Painel
  // (linhas de `assinaturas` com status='ativa', não tutores) — mesmo
  // número em qualquer tela que mostrar esse rótulo.
  const assinaturasAtivas = assinaturas.filter((a) => a.status === "ativa").length;
  const tutoresAtivos = tutores.filter((t) => t.ativo);
  const tutoresSemAssinaturaAtiva = tutoresAtivos.filter(
    (t) => !assinaturas.some((a) => a.tutor_id === t.id && a.status === "ativa")
  ).length;
  const kpis: { label: string; valor: string | number }[] = [
    { label: "Tutores cadastrados", valor: tutores.length },
    { label: "Assinaturas ativas", valor: assinaturasAtivas },
    { label: "Ativos sem assinatura", valor: tutoresSemAssinaturaAtiva },
  ];

  // O tutor "em foco" (via ?tutor=) aparece mesmo se estiver inativo ou não
  // bater com o filtro atual — um link direto de outra tela não pode cair
  // num card que simplesmente não existe na lista.
  const tutoresExibidos = tutores.filter((tutor) => {
    if (tutor.id === tutorIdFoco) return true;
    if (!tutor.ativo && !mostrarInativos) return false;
    if (termoBusca && !tutor.nome.toLowerCase().includes(termoBusca) && !tutor.telefone.includes(termoBusca)) {
      return false;
    }
    if (statusCadastro === "completo" && !tutor.cadastro_completo) return false;
    if (statusCadastro === "pendente" && tutor.cadastro_completo) return false;
    return true;
  });
  const filtroAtivo = termoBusca.length > 0 || statusCadastro !== "todos";

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className={texto.tituloSecao}>Tutores</h2>
          <p className={texto.subtitulo}>
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

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={superficie.kpi}>
            <p className="text-xs text-ink-500">{kpi.label}</p>
            <p className="mt-1 font-mono text-2xl text-ink-900">{kpi.valor}</p>
          </div>
        ))}
      </div>

      {criando && (
        <div className="mt-4">
          <NovoTutorForm petshopId={petshopId} onDone={() => setCriando(false)} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-card p-3">
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="tutores_busca" className="mb-1 block text-xs font-medium text-ink-500">
            Buscar por nome ou telefone
          </label>
          <input
            id="tutores_busca"
            className={inputClass}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="ex.: Maria ou (48) 99999-0000"
          />
        </div>
        <div>
          <label htmlFor="tutores_filtro_cadastro" className="mb-1 block text-xs font-medium text-ink-500">
            Cadastro
          </label>
          <select
            id="tutores_filtro_cadastro"
            className={inputClass}
            value={statusCadastro}
            onChange={(e) => setStatusCadastro(e.target.value as "todos" | "completo" | "pendente")}
          >
            <option value="todos">Todos</option>
            <option value="completo">Completo</option>
            <option value="pendente">Pendente</option>
          </select>
        </div>
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

      <div className="mt-4 space-y-3">
        {tutoresExibidos.length === 0 && !criando ? (
          <EmptyState
            titulo={filtroAtivo ? "Nenhum tutor encontrado com esse filtro" : "Nenhum tutor cadastrado"}
            descricao={
              filtroAtivo
                ? "Ajuste a busca ou os filtros acima."
                : "Comece cadastrando só o telefone — depois copie o link de autopreenchimento pra mandar por WhatsApp."
            }
            itens={
              filtroAtivo
                ? undefined
                : [
                    "O tutor preenche nome, endereço e pets pelo próprio link",
                    "Contato adicional por papel — ex.: quem busca o pet, se for diferente de quem agenda",
                    "O link também sai sozinho por WhatsApp assim que o tutor é cadastrado — copiar e mandar na mão é só o atalho",
                  ]
            }
          />
        ) : (
          tutoresExibidos.map((tutor) => (
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
              expandidoInicial={tutor.id === tutorIdFoco}
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
        onDone?.();
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
