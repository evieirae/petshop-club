"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { nomeServico } from "@/lib/agenda/resolver";
import { alerta, botao, cx, formulario, superficie } from "@/lib/ui/styles";
import type { CategoriaServico, Pet, PrecoServico, Servico } from "@/types/database";
import {
  buscarHorariosLivres,
  solicitarAgendamento,
  type HorarioLivre,
} from "./actions";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function hojeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AgendarTutorForm({
  pets,
  servicos,
  categorias,
  precos,
  temAssinaturaAtiva,
  nomePetshop,
}: {
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
  precos: PrecoServico[];
  temAssinaturaAtiva: boolean;
  nomePetshop: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [petId, setPetId] = useState(pets[0]?.id ?? "");
  const [servicoId, setServicoId] = useState(servicos[0]?.id ?? "");
  const [data, setData] = useState(hojeLocal());
  const [horario, setHorario] = useState("");

  const [grade, setGrade] = useState<HorarioLivre[]>([]);
  const [carregandoGrade, setCarregandoGrade] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState<{ status: string; valor: number } | null>(null);

  const petSelecionado = pets.find((p) => p.id === petId);

  // Preço vem do porte do pet — o mesmo número que a Server Action vai
  // travar em preco_avulso. Mostrar aqui evita a surpresa de descobrir o
  // valor só depois de marcar.
  const preco = useMemo(() => {
    if (!petSelecionado) return null;
    return (
      precos.find(
        (p) => p.servico_id === servicoId && p.porte_id === petSelecionado.porte_id
      )?.preco ?? null
    );
  }, [precos, servicoId, petSelecionado]);

  useEffect(() => {
    let cancelado = false;
    setCarregandoGrade(true);
    setHorario("");

    buscarHorariosLivres(data)
      .then((resultado) => {
        if (!cancelado) setGrade(resultado);
      })
      .finally(() => {
        if (!cancelado) setCarregandoGrade(false);
      });

    return () => {
      cancelado = true;
    };
  }, [data]);

  function handleSubmit() {
    setErro("");

    if (!petId || !servicoId || !horario) {
      setErro("Escolha o pet, o serviço e um horário.");
      return;
    }

    startTransition(async () => {
      const resultado = await solicitarAgendamento({ petId, servicoId, data, horario });
      if (resultado.ok) {
        setSucesso({ status: resultado.status, valor: resultado.valor });
        router.refresh();
      } else {
        setErro(resultado.erro);
        // O horário pode ter sido ocupado enquanto a tela estava aberta —
        // recarrega a grade pra pessoa não tentar o mesmo de novo.
        buscarHorariosLivres(data).then(setGrade);
        setHorario("");
      }
    });
  }

  if (sucesso) {
    const virouPedido = sucesso.status === "solicitado";
    return (
      <div className={`${superficie.cardPadded} text-center`}>
        <CalendarCheck size={28} className="mx-auto text-success-500" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl text-ink-900">
          {virouPedido ? "Pedido enviado" : "Visita marcada"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
          {virouPedido
            ? `O ${nomePetshop} vai confirmar esse horário. Ele já está segurado pra você enquanto isso, e o pedido aparece na sua conta como "Pedido do tutor".`
            : `Está na agenda do ${nomePetshop}. Você recebe a confirmação pelo WhatsApp no dia anterior.`}
        </p>
        <p className="mt-3 font-mono text-sm text-ink-900">
          {MOEDA.format(sucesso.valor)}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/minha-conta")}
            className={botao()}
          >
            Voltar pra minha conta
          </button>
        </div>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className={superficie.vazio}>
        <p className="text-sm text-ink-500">
          Você precisa de pelo menos um pet no cadastro pra marcar uma visita.
          Fale com o {nomePetshop} — eles mandam o link de cadastro.
        </p>
      </div>
    );
  }

  if (servicos.length === 0) {
    return (
      <div className={superficie.vazio}>
        <p className="text-sm text-ink-500">
          O {nomePetshop} ainda não publicou os serviços dele por aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!temAssinaturaAtiva && (
        <p className={alerta("info")}>
          Como você ainda não tem um plano ativo, o horário escolhido vai como
          <strong> pedido</strong>: fica segurado pra você e o {nomePetshop}
          confirma. Quem tem plano marca direto.
        </p>
      )}

      <div className={`${superficie.cardPadded} space-y-4`}>
        <div>
          <label htmlFor="agendar_pet" className={formulario.label}>
            Pet
          </label>
          <select
            id="agendar_pet"
            className={formulario.input}
            value={petId}
            onChange={(e) => setPetId(e.target.value)}
          >
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.nome}
                {pet.raca ? ` · ${pet.raca}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="agendar_servico" className={formulario.label}>
            Serviço
          </label>
          <select
            id="agendar_servico"
            className={formulario.input}
            value={servicoId}
            onChange={(e) => setServicoId(e.target.value)}
          >
            {servicos.map((servico) => (
              <option key={servico.id} value={servico.id}>
                {nomeServico(servico, categorias)}
              </option>
            ))}
          </select>
          <p className={formulario.dica}>
            {preco !== null
              ? `${MOEDA.format(preco)} para o porte do ${petSelecionado?.nome ?? "seu pet"}.`
              : "Sem preço cadastrado pro porte desse pet — fale com o petshop."}
          </p>
        </div>

        <div>
          <label htmlFor="agendar_data" className={formulario.label}>
            Dia
          </label>
          <input
            id="agendar_data"
            type="date"
            min={hojeLocal()}
            className={formulario.input}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
      </div>

      <div className={superficie.cardPadded}>
        <h2 className="font-display text-base text-ink-900">Horários</h2>
        <p className="mt-1 text-sm text-ink-500">
          Os ocupados aparecem apagados. Quem está neles é assunto do petshop —
          aqui você vê só livre ou ocupado.
        </p>

        {carregandoGrade ? (
          <p className="mt-4 text-sm text-ink-500">Carregando horários…</p>
        ) : grade.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">
            Nenhum horário nesse dia. Tente outra data.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {grade.map(({ horario: h, livre }) => {
              const selecionado = h === horario;
              return (
                <button
                  key={h}
                  type="button"
                  disabled={!livre}
                  aria-pressed={selecionado}
                  onClick={() => setHorario(h)}
                  className={cx(
                    "rounded-lg border px-3 py-2 font-mono text-sm transition-colors",
                    !livre &&
                      "cursor-not-allowed border-surface-border bg-surface-muted text-ink-400 line-through",
                    livre &&
                      !selecionado &&
                      "border-surface-border bg-surface-card text-ink-900 hover:border-brand-500 hover:bg-brand-50",
                    livre && selecionado && "border-brand-500 bg-brand-500 text-brand-contrast"
                  )}
                >
                  {h}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {erro && (
        <p role="alert" className={alerta("erro")}>
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || !horario || preco === null}
        className={botao({ tamanho: "lg", largura: "cheia" })}
      >
        {pending
          ? "Enviando…"
          : temAssinaturaAtiva
            ? "Marcar visita"
            : "Enviar pedido"}
      </button>
    </div>
  );
}
