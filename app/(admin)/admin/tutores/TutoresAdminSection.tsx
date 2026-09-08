"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { FormField, inputClass } from "@/components/ui/FormField";
import { botao, formulario, superficie, texto, type TomBadge } from "@/lib/ui/styles";
import type { Petshop, Tutor } from "@/types/database";
import {
  criarTutorComAcesso,
  liberarAcessoTutor,
  revogarAcessoTutor,
} from "../actions";

// A senha de primeiro acesso aparece na tela UMA vez pra administração
// copiar — fallback de sempre, vale mesmo sem RESEND_API_KEY configurada
// (ver .env.example). Com o Resend configurado, o mesmo e-mail com a senha
// e o link de completar cadastro já sai automaticamente pro tutor
// (lib/email/, criarTutorComAcesso/liberarAcessoTutor em ../actions.ts).

type SituacaoAcesso = {
  rotulo: string;
  tom: TomBadge;
};

function situacao(tutor: Tutor): SituacaoAcesso {
  if (!tutor.acesso_liberado) return { rotulo: "Sem acesso", tom: "neutro" };

  if (tutor.senha_provisoria) {
    const vencida =
      tutor.senha_provisoria_expira_em !== null &&
      new Date(tutor.senha_provisoria_expira_em) < new Date();
    return vencida
      ? { rotulo: "Senha vencida", tom: "erro" }
      : { rotulo: "Aguardando 1º acesso", tom: "atencao" };
  }

  return { rotulo: "Ativo", tom: "sucesso" };
}

function prazoLegivel(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Senha recém-gerada, mostrada uma vez só. */
type SenhaRevelada = {
  tutor: string;
  email: string;
  senha: string;
  padrao: boolean;
  expiraEm: string;
  emailEnviado: boolean;
};

export function TutoresAdminSection({
  petshops,
  tutores,
}: {
  petshops: Petshop[];
  tutores: Tutor[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [filtroPetshop, setFiltroPetshop] = useState<string>("todos");
  const [formAberto, setFormAberto] = useState(false);
  const [erro, setErro] = useState("");
  const [revelada, setRevelada] = useState<SenhaRevelada | null>(null);

  const [petshopId, setPetshopId] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  const nomePorPetshop = useMemo(
    () => new Map(petshops.map((p) => [p.id, p.nome])),
    [petshops]
  );

  const listaFiltrada = useMemo(
    () =>
      filtroPetshop === "todos"
        ? tutores
        : tutores.filter((t) => t.petshop_id === filtroPetshop),
    [tutores, filtroPetshop]
  );

  function limparForm() {
    setNome("");
    setTelefone("");
    setEmail("");
    setFormAberto(false);
  }

  function handleCriar() {
    setErro("");

    if (!petshopId) {
      setErro("Escolha o petshop do tutor.");
      return;
    }
    if (!nome.trim() || !telefone.trim() || !email.trim()) {
      setErro("Preencha nome, telefone e e-mail.");
      return;
    }

    startTransition(async () => {
      const resposta = await criarTutorComAcesso({ petshopId, nome, telefone, email });
      if (resposta.ok) {
        setRevelada({
          tutor: nome,
          email: email.trim().toLowerCase(),
          senha: resposta.senha,
          padrao: resposta.senhaPadrao,
          expiraEm: resposta.expiraEm,
          emailEnviado: resposta.emailEnviado,
        });
        limparForm();
        router.refresh();
      } else {
        setErro(resposta.erro);
      }
    });
  }

  function handleLiberar(tutor: Tutor) {
    setErro("");
    startTransition(async () => {
      const resposta = await liberarAcessoTutor(tutor.id);
      if (resposta.ok) {
        setRevelada({
          tutor: tutor.nome,
          email: tutor.email ?? "",
          senha: resposta.senha,
          padrao: resposta.senhaPadrao,
          expiraEm: resposta.expiraEm,
          emailEnviado: resposta.emailEnviado,
        });
        router.refresh();
      } else {
        setErro(resposta.erro);
      }
    });
  }

  function handleRevogar(tutor: Tutor) {
    setErro("");
    startTransition(async () => {
      const resposta = await revogarAcessoTutor(tutor.id);
      if (!resposta.ok) setErro(resposta.erro);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* ---------- senha recém-gerada ---------- */}
      {revelada && (
        <div className={superficie.blocoEdicao}>
          <p className="text-sm font-medium text-ink-900">
            Acesso de {revelada.tutor} liberado. Anote a senha agora — ela só
            aparece uma vez:
          </p>
          <p className="mt-3 select-all rounded-lg border border-brand-200 bg-surface-card px-4 py-3 text-center font-mono text-lg tracking-wide text-ink-900">
            {revelada.senha}
          </p>
          <p className="mt-2 text-xs text-ink-500">
            Login: <span className="font-mono">{revelada.email}</span> · vale
            até {prazoLegivel(revelada.expiraEm)}. Depois disso o acesso é
            recusado e você precisa liberar de novo.
          </p>
          <p className="mt-2 text-xs text-ink-500">
            {revelada.emailEnviado
              ? `Também mandamos um e-mail pra ${revelada.email} com essa senha.`
              : "Não deu pra mandar e-mail automático — envie essa senha pro tutor manualmente."}
          </p>
          {revelada.padrao && (
            <p className="mt-2 text-xs text-cta-700">
              Essa é a senha padrão, igual pra todos os tutores. Quem souber o
              padrão entra na conta de qualquer tutor que ainda não trocou —
              por isso o prazo curto e a troca obrigatória no primeiro acesso.
            </p>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setRevelada(null)}
              className={botao({ tamanho: "sm" })}
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {/* ---------- filtro + novo ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full max-w-xs">
          <label htmlFor="filtro_petshop" className={formulario.label}>
            Petshop
          </label>
          <select
            id="filtro_petshop"
            className={inputClass}
            value={filtroPetshop}
            onChange={(e) => setFiltroPetshop(e.target.value)}
          >
            <option value="todos">Todos os petshops</option>
            {petshops.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setErro("");
            setFormAberto((aberto) => !aberto);
            if (!petshopId && filtroPetshop !== "todos") setPetshopId(filtroPetshop);
          }}
          className={botao({ variante: formAberto ? "neutra" : "cta" })}
        >
          {formAberto ? "Cancelar" : "+ Novo tutor"}
        </button>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-danger-600">
          {erro}
        </p>
      )}

      {/* ---------- formulário ---------- */}
      {formAberto && (
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${superficie.blocoEdicao}`}>
          <FormField label="Petshop" htmlFor="novo_tutor_petshop" full>
            <select
              id="novo_tutor_petshop"
              className={inputClass}
              value={petshopId}
              onChange={(e) => setPetshopId(e.target.value)}
            >
              <option value="">Escolha o petshop…</option>
              {petshops.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Nome do tutor" htmlFor="novo_tutor_nome">
            <input
              id="novo_tutor_nome"
              className={inputClass}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex.: Ana Paula Souza"
            />
          </FormField>

          <FormField label="Telefone" htmlFor="novo_tutor_telefone" hint="Com DDD.">
            <input
              id="novo_tutor_telefone"
              className={inputClass}
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(48) 99999-9999"
            />
          </FormField>

          <FormField
            label="E-mail"
            htmlFor="novo_tutor_email"
            hint="Vira o login dele no portal."
            full
          >
            <input
              id="novo_tutor_email"
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tutor@email.com"
            />
          </FormField>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={handleCriar}
              disabled={pending}
              className={botao({ tamanho: "sm" })}
            >
              {pending ? "Criando…" : "Criar tutor e liberar acesso"}
            </button>
            <p className="mt-2 text-xs text-ink-500">
              O endereço e os pets continuam vindo do formulário público de
              autopreenchimento — aqui entra só o cadastro mínimo e o acesso.
            </p>
          </div>
        </div>
      )}

      {/* ---------- lista ---------- */}
      {listaFiltrada.length === 0 ? (
        <div className={superficie.vazio}>
          <p className="text-sm text-ink-500">
            Nenhum tutor {filtroPetshop === "todos" ? "cadastrado" : "nesse petshop"}{" "}
            ainda. Os que o próprio petshop cadastrar também aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card">
          {listaFiltrada.map((tutor) => {
            const { rotulo, tom } = situacao(tutor);
            return (
              <div
                key={tutor.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {tutor.nome}
                  </p>
                  <p className="truncate text-xs text-ink-500">
                    {nomePorPetshop.get(tutor.petshop_id) ?? "Petshop removido"}
                    {tutor.email ? ` · ${tutor.email}` : " · sem e-mail"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Badge tom={tom}>{rotulo}</Badge>
                  {tutor.acesso_liberado ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleLiberar(tutor)}
                        disabled={pending}
                        className={botao({ variante: "texto", tamanho: "sm" })}
                      >
                        Nova senha
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevogar(tutor)}
                        disabled={pending}
                        className={botao({ variante: "textoPerigo", tamanho: "sm" })}
                      >
                        Revogar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLiberar(tutor)}
                      disabled={pending || !tutor.email}
                      title={tutor.email ? undefined : "Sem e-mail no cadastro"}
                      className={botao({ variante: "contorno", tamanho: "sm" })}
                    >
                      Liberar acesso
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className={texto.subtitulo}>
        {listaFiltrada.length}{" "}
        {listaFiltrada.length === 1 ? "tutor" : "tutores"} nesta lista.
      </p>
    </div>
  );
}
