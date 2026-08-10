"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { Petshop } from "@/types/database";
import { FormSection } from "@/components/ui/FormSection";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Toggle } from "@/components/ui/Toggle";
import { updatePetshopConfig, type PetshopConfigInput } from "./actions";

// O banco guarda "HH:MM:SS"; input[type=time] sem `step` so aceita "HH:MM".
function paraInputTime(valor: string | null): string {
  return valor ? valor.slice(0, 5) : "";
}

// 0.03 (fracao, como fica em petshops.percentual_plataforma) -> "3" (%, o
// que a pessoa realmente quer digitar). Arredonda em 2 casas pra evitar
// sobras de ponto flutuante tipo "3.0000000004".
function paraPercentualExibido(fracao: number): string {
  return String(Math.round(fracao * 10000) / 100);
}

type FormState = {
  hora_abertura: string;
  hora_fechamento: string;
  hora_inicio_intervalo: string;
  hora_fim_intervalo: string;
  hora_divisao_periodo: string;
  horario_envio_lembrete: string;
  horario_corte_confirmacao_manha: string;
  horario_corte_confirmacao_tarde: string;
  horario_limite_petshop_tarde: string;
  fee_fixo_mensal: string;
  percentual_plataforma: string;
  isento_fee_ate: string;
  falta_consome_visita_paga: boolean;
};

function estadoInicial(petshop: Petshop): FormState {
  return {
    hora_abertura: paraInputTime(petshop.hora_abertura),
    hora_fechamento: paraInputTime(petshop.hora_fechamento),
    hora_inicio_intervalo: paraInputTime(petshop.hora_inicio_intervalo),
    hora_fim_intervalo: paraInputTime(petshop.hora_fim_intervalo),
    hora_divisao_periodo: paraInputTime(petshop.hora_divisao_periodo),
    horario_envio_lembrete: paraInputTime(petshop.horario_envio_lembrete),
    horario_corte_confirmacao_manha: paraInputTime(
      petshop.horario_corte_confirmacao_manha
    ),
    horario_corte_confirmacao_tarde: paraInputTime(
      petshop.horario_corte_confirmacao_tarde
    ),
    horario_limite_petshop_tarde: paraInputTime(
      petshop.horario_limite_petshop_tarde
    ),
    fee_fixo_mensal: String(petshop.fee_fixo_mensal),
    percentual_plataforma: paraPercentualExibido(petshop.percentual_plataforma),
    isento_fee_ate: petshop.isento_fee_ate ?? "",
    falta_consome_visita_paga: petshop.falta_consome_visita_paga,
  };
}

export function ConfiguracoesForm({ petshop }: { petshop: Petshop }) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(petshop));
  const [erros, setErros] = useState<Partial<Record<keyof FormState, string>>>(
    {}
  );
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "sucesso" | "erro">("idle");
  const [mensagemErro, setMensagemErro] = useState("");

  function atualizar<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setStatus("idle");
  }

  function validar(): boolean {
    const novosErros: Partial<Record<keyof FormState, string>> = {};

    if (
      form.hora_abertura &&
      form.hora_fechamento &&
      form.hora_abertura >= form.hora_fechamento
    ) {
      novosErros.hora_fechamento = "Precisa ser depois da abertura.";
    }

    const temInicio = Boolean(form.hora_inicio_intervalo);
    const temFim = Boolean(form.hora_fim_intervalo);
    if (temInicio !== temFim) {
      novosErros.hora_fim_intervalo =
        "Preencha os dois horários do intervalo, ou deixe os dois em branco.";
    } else if (
      temInicio &&
      temFim &&
      form.hora_inicio_intervalo >= form.hora_fim_intervalo
    ) {
      novosErros.hora_fim_intervalo = "Precisa ser depois do início do intervalo.";
    }

    const percentual = Number(form.percentual_plataforma);
    if (Number.isNaN(percentual) || percentual < 0 || percentual > 100) {
      novosErros.percentual_plataforma = "Use um valor entre 0 e 100.";
    }

    const fee = Number(form.fee_fixo_mensal);
    if (Number.isNaN(fee) || fee < 0) {
      novosErros.fee_fixo_mensal = "Use um valor maior ou igual a zero.";
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("idle");

    if (!validar()) return;

    const dados: PetshopConfigInput = {
      hora_abertura: form.hora_abertura,
      hora_fechamento: form.hora_fechamento,
      hora_inicio_intervalo: form.hora_inicio_intervalo || null,
      hora_fim_intervalo: form.hora_fim_intervalo || null,
      hora_divisao_periodo: form.hora_divisao_periodo,
      horario_envio_lembrete: form.horario_envio_lembrete,
      horario_corte_confirmacao_manha: form.horario_corte_confirmacao_manha,
      horario_corte_confirmacao_tarde: form.horario_corte_confirmacao_tarde,
      horario_limite_petshop_tarde: form.horario_limite_petshop_tarde,
      fee_fixo_mensal: Number(form.fee_fixo_mensal),
      percentual_plataforma: Number(form.percentual_plataforma) / 100,
      isento_fee_ate: form.isento_fee_ate || null,
      falta_consome_visita_paga: form.falta_consome_visita_paga,
    };

    startTransition(async () => {
      const resultado = await updatePetshopConfig(petshop.id, dados);
      if (resultado.ok) {
        setStatus("sucesso");
      } else {
        setStatus("erro");
        setMensagemErro(resultado.erro);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6 pb-24">
      <FormSection
        numero="1"
        titulo="Expediente e intervalo"
        descricao="Referência de horário — o sistema ainda não bloqueia agendamento fora dessa janela."
      >
        <FormField label="Abertura" htmlFor="hora_abertura">
          <input
            id="hora_abertura"
            type="time"
            required
            className={inputClass}
            value={form.hora_abertura}
            onChange={(e) => atualizar("hora_abertura", e.target.value)}
          />
        </FormField>
        <FormField
          label="Fechamento"
          htmlFor="hora_fechamento"
          error={erros.hora_fechamento}
        >
          <input
            id="hora_fechamento"
            type="time"
            required
            className={inputClass}
            value={form.hora_fechamento}
            onChange={(e) => atualizar("hora_fechamento", e.target.value)}
          />
        </FormField>
        <FormField
          label="Início do intervalo"
          htmlFor="hora_inicio_intervalo"
          hint="Deixe em branco se o petshop não para pro almoço."
        >
          <input
            id="hora_inicio_intervalo"
            type="time"
            className={inputClass}
            value={form.hora_inicio_intervalo}
            onChange={(e) => atualizar("hora_inicio_intervalo", e.target.value)}
          />
        </FormField>
        <FormField
          label="Fim do intervalo"
          htmlFor="hora_fim_intervalo"
          error={erros.hora_fim_intervalo}
        >
          <input
            id="hora_fim_intervalo"
            type="time"
            className={inputClass}
            value={form.hora_fim_intervalo}
            onChange={(e) => atualizar("hora_fim_intervalo", e.target.value)}
          />
        </FormField>
        <FormField
          label="Corte manhã/tarde"
          htmlFor="hora_divisao_periodo"
          hint="Define o que conta como agendamento de manhã x de tarde nos lembretes (seção 2)."
          full
        >
          <input
            id="hora_divisao_periodo"
            type="time"
            required
            className={inputClass}
            value={form.hora_divisao_periodo}
            onChange={(e) => atualizar("hora_divisao_periodo", e.target.value)}
          />
        </FormField>
      </FormSection>

      <FormSection
        numero="2"
        titulo="Janela de mensagens (confirmação D-1)"
        descricao="Cada petshop conhece o próprio ritmo — não existe um horário certo universal."
      >
        <FormField
          label="Envio do lembrete"
          htmlFor="horario_envio_lembrete"
          hint="Quando dispara a mensagem pro tutor, no dia anterior à visita."
        >
          <input
            id="horario_envio_lembrete"
            type="time"
            required
            className={inputClass}
            value={form.horario_envio_lembrete}
            onChange={(e) =>
              atualizar("horario_envio_lembrete", e.target.value)
            }
          />
        </FormField>
        <FormField
          label="Corte de manhã"
          htmlFor="horario_corte_confirmacao_manha"
          hint="Se não confirmado até aqui, escala pro petshop (visitas de amanhã de manhã)."
        >
          <input
            id="horario_corte_confirmacao_manha"
            type="time"
            required
            className={inputClass}
            value={form.horario_corte_confirmacao_manha}
            onChange={(e) =>
              atualizar("horario_corte_confirmacao_manha", e.target.value)
            }
          />
        </FormField>
        <FormField
          label="Corte de tarde"
          htmlFor="horario_corte_confirmacao_tarde"
          hint="Mesma escalada, pros agendamentos de amanhã à tarde."
        >
          <input
            id="horario_corte_confirmacao_tarde"
            type="time"
            required
            className={inputClass}
            value={form.horario_corte_confirmacao_tarde}
            onChange={(e) =>
              atualizar("horario_corte_confirmacao_tarde", e.target.value)
            }
          />
        </FormField>
        <FormField
          label="Limite do petshop (tarde)"
          htmlFor="horario_limite_petshop_tarde"
          hint="Prazo pra equipe resolver na mão as pendências de tarde."
        >
          <input
            id="horario_limite_petshop_tarde"
            type="time"
            required
            className={inputClass}
            value={form.horario_limite_petshop_tarde}
            onChange={(e) =>
              atualizar("horario_limite_petshop_tarde", e.target.value)
            }
          />
        </FormField>
      </FormSection>

      <FormSection
        numero="3"
        titulo="Cobrança e repasse"
        descricao="Mensalidade da plataforma e o corte sobre cada cobrança de tosa."
      >
        <FormField
          label="Fee fixo mensal"
          htmlFor="fee_fixo_mensal"
          error={erros.fee_fixo_mensal}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-500">R$</span>
            <input
              id="fee_fixo_mensal"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              required
              className={inputClass}
              value={form.fee_fixo_mensal}
              onChange={(e) => atualizar("fee_fixo_mensal", e.target.value)}
            />
          </div>
        </FormField>
        <FormField
          label="Percentual da plataforma"
          htmlFor="percentual_plataforma"
          hint="Corte sobre cada cobrança de tosa que passa pela plataforma."
          error={erros.percentual_plataforma}
        >
          <div className="flex items-center gap-2">
            <input
              id="percentual_plataforma"
              type="number"
              step="0.01"
              min="0"
              max="100"
              inputMode="decimal"
              required
              className={inputClass}
              value={form.percentual_plataforma}
              onChange={(e) =>
                atualizar("percentual_plataforma", e.target.value)
              }
            />
            <span className="text-sm text-ink-500">%</span>
          </div>
        </FormField>
        <FormField
          label="Isento até"
          htmlFor="isento_fee_ate"
          hint="Data até a qual o fee fixo sai zerado — período de piloto. Deixe em branco fora do piloto."
          full
        >
          <input
            id="isento_fee_ate"
            type="date"
            className={inputClass}
            value={form.isento_fee_ate}
            onChange={(e) => atualizar("isento_fee_ate", e.target.value)}
          />
        </FormField>
      </FormSection>

      <FormSection
        numero="5"
        titulo="Falta consome visita paga?"
        descricao="O que acontece quando o tutor falta numa visita dentro do mês já cobrado."
      >
        <div className="sm:col-span-2">
          <Toggle
            checked={form.falta_consome_visita_paga}
            onChange={(v) => atualizar("falta_consome_visita_paga", v)}
            labelOn="Sim, consome (padrão)"
            labelOff="Não, repor sem cobrar"
          />
          {form.falta_consome_visita_paga ? (
            <p className="mt-3 text-xs text-ink-500">
              A falta desce o contador normalmente, sem crédito nem
              reposição — é o que já está implementado de ponta a ponta.
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-pendente-bg px-3 py-2 text-xs text-pendente">
              Ainda não implementado de ponta a ponta: a coluna salva como
              &quot;não&quot;, mas a lógica de gerar uma visita de reposição
              sem cobrar de novo ainda não existe no banco (ver seção 5 de
              regras_padrao_petshop.md). Combine com a equipe antes de
              ativar isso pra um petshop parceiro.
            </p>
          )}
        </div>
      </FormSection>

      <div className="sticky bottom-4 flex items-center gap-4 rounded-xl border border-surface-border bg-surface-card/95 px-5 py-3 shadow-sm backdrop-blur">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-club px-5 py-2.5 font-medium text-white transition hover:bg-club-dark disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        {status === "sucesso" && (
          <p className="text-sm text-confirmado">Salvo.</p>
        )}
        {status === "erro" && (
          <p role="alert" className="text-sm text-pendente">
            {mensagemErro}
          </p>
        )}
      </div>
    </form>
  );
}
