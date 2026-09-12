"use client";

import { botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import type {
  Assinatura,
  ContatoAdicional,
  FormaPagamento,
  PapelContato,
  Plano,
  Porte,
  Pet,
  Tutor,
} from "@/types/database";
import { FormField, inputClass } from "@/components/ui/FormField";
import type { ExpedientePetshop } from "@/lib/horarios";
import {
  alternarAtivoTutor,
  atualizarTutor,
  gerarLinkCadastro,
  removerContatoAdicional,
  salvarContatoAdicional,
} from "./actions";
import { PetsSubsection } from "./TutorPets";

// Fase F1 do roadmap de identidade visual — parte da decomposição de
// TutoresSection.tsx (1.400 linhas). Este arquivo cobre o card do tutor em
// si: dados próprios (TutorDadosForm) e contato adicional por papel
// (ContatosSubsection) — a subseção de pets/assinatura mora em
// TutorPets.tsx. Nenhuma linha de lógica mudou, só o arquivo.

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

export function TutorCard({
  petshopId,
  expediente,
  tutor,
  portes,
  pets,
  contatos,
  planos,
  assinaturas,
  expandidoInicial,
}: {
  petshopId: string;
  expediente: ExpedientePetshop;
  tutor: Tutor;
  portes: Porte[];
  pets: Pet[];
  contatos: ContatoAdicional[];
  planos: Plano[];
  assinaturas: Assinatura[];
  expandidoInicial?: boolean;
}) {
  const [expandido, setExpandido] = useState(expandidoInicial ?? false);
  const [pendingAtivo, startTransitionAtivo] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);

  function alternarAtivo() {
    startTransitionAtivo(async () => {
      await alternarAtivoTutor(tutor.id, !tutor.ativo);
    });
  }

  // Rola até o card quando ele chega já aberto via ?tutor=<id> (link "Ver
  // tutor" da tela /pets) — sem isso, o card certo abre fora da área
  // visível numa lista longa e a equipe não percebe que já achou.
  useEffect(() => {
    if (expandidoInicial) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={cardRef} className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink-900">{tutor.nome}</p>
            <CadastroBadge completo={tutor.cadastro_completo} />
            {!tutor.ativo && <Badge tom="neutro">Inativo</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            {tutor.telefone} ·{" "}
            {pets.length === 0
              ? "sem pets cadastrados"
              : `${pets.length} pet${pets.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tutor.ativo && <CopiarLinkButton tutorId={tutor.id} />}
          <button
            type="button"
            disabled={pendingAtivo}
            onClick={alternarAtivo}
            className={botao({ variante: "neutra", tamanho: "sm" })}
          >
            {tutor.ativo ? "Desativar" : "Reativar"}
          </button>
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
  const [bairro, setBairro] = useState(tutor.bairro ?? "");
  const [cadastroCompleto, setCadastroCompleto] = useState(tutor.cadastro_completo);
  // Migration 0011 — preferência usada pelo trigger de cobrança (banco) pra
  // já nascer a cobrança marcada. 'local' é o pedido do dono: presencial é
  // mais barato pro tutor, sem taxa de serviço somada. O balcão ainda pode
  // trocar por cobrança individual em Financeiro, sem mexer aqui.
  const [formaPagamentoPreferida, setFormaPagamentoPreferida] = useState<FormaPagamento>(
    tutor.forma_pagamento_preferida
  );
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
        bairro: bairro.trim() || null,
        cadastro_completo: cadastroCompleto,
        forma_pagamento_preferida: formaPagamentoPreferida,
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
        <FormField label="Bairro" htmlFor={`tutor_bairro_${tutor.id}`} hint="Opcional.">
          <input
            id={`tutor_bairro_${tutor.id}`}
            className={inputClass}
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
          />
        </FormField>
        <FormField
          label="Forma de pagamento preferida"
          htmlFor={`tutor_forma_pagamento_${tutor.id}`}
          hint="Cartão/Pix cobram pela plataforma (Asaas). No local = presencial, sem taxa de serviço."
        >
          <select
            id={`tutor_forma_pagamento_${tutor.id}`}
            className={inputClass}
            value={formaPagamentoPreferida}
            onChange={(e) => setFormaPagamentoPreferida(e.target.value as FormaPagamento)}
          >
            <option value="cartao">Cartão (pela plataforma)</option>
            <option value="pix">Pix (pela plataforma)</option>
            <option value="local">No local (presencial, sem taxa)</option>
          </select>
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
