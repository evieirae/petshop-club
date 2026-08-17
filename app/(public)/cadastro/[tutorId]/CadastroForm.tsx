"use client";

import { botao } from "@/lib/ui/styles";
import { useState, useTransition, type FormEvent } from "react";
import type { ContatoAdicional, Pet, Porte, Tutor } from "@/types/database";
import { FormField, inputClass } from "@/components/ui/FormField";
import { enviarCadastro, type CadastroPetInput } from "./actions";

// Cada pet em edicao tem uma chave local (pra key do React e pra remover
// linha antes de salvar) separada do id real no banco — pet novo nao tem id
// ate o formulario ser enviado.
type PetForm = CadastroPetInput & { chave: string };

function novaChave() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function CadastroForm({
  tutorId,
  tutor,
  portes,
  petsIniciais,
  contatoBuscaEntrega,
}: {
  tutorId: string;
  tutor: Tutor;
  portes: Porte[];
  petsIniciais: Pet[];
  contatoBuscaEntrega: ContatoAdicional | null;
}) {
  const [nome, setNome] = useState(tutor.nome === tutor.telefone ? "" : tutor.nome);
  const [telefone, setTelefone] = useState(tutor.telefone);
  const [endereco, setEndereco] = useState(tutor.endereco ?? "");
  const [pets, setPets] = useState<PetForm[]>(() =>
    petsIniciais.length > 0
      ? petsIniciais.map((p) => ({
          chave: p.id,
          id: p.id,
          nome: p.nome,
          porte_id: p.porte_id,
          raca: p.raca,
          observacoes: p.observacoes,
          sexo: p.sexo,
        }))
      : [
          {
            chave: novaChave(),
            nome: "",
            porte_id: portes[0]?.id ?? 0,
            raca: null,
            observacoes: null,
            sexo: null,
          },
        ]
  );
  const [temContatoBuscaEntrega, setTemContatoBuscaEntrega] = useState(!!contatoBuscaEntrega);
  const [nomeBusca, setNomeBusca] = useState(contatoBuscaEntrega?.nome ?? "");
  const [telefoneBusca, setTelefoneBusca] = useState(contatoBuscaEntrega?.telefone ?? "");

  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  function atualizarPet(chave: string, campo: keyof PetForm, valor: string | number | null) {
    setPets((atual) =>
      atual.map((p) => (p.chave === chave ? { ...p, [campo]: valor } : p))
    );
  }

  function adicionarPet() {
    setPets((atual) => [
      ...atual,
      {
        chave: novaChave(),
        nome: "",
        porte_id: portes[0]?.id ?? 0,
        raca: null,
        observacoes: null,
        sexo: null,
      },
    ]);
  }

  function removerPet(chave: string) {
    setPets((atual) => (atual.length > 1 ? atual.filter((p) => p.chave !== chave) : atual));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!nome.trim() || !telefone.trim()) {
      setErro("Preencha nome e telefone.");
      return;
    }
    if (pets.some((p) => !p.nome.trim())) {
      setErro("Todo pet precisa de um nome.");
      return;
    }
    if (temContatoBuscaEntrega && (!nomeBusca.trim() || !telefoneBusca.trim())) {
      setErro("Preencha nome e telefone de quem busca/entrega o pet, ou desmarque a opção.");
      return;
    }

    startTransition(async () => {
      const resultado = await enviarCadastro(tutorId, {
        nome: nome.trim(),
        telefone: telefone.trim(),
        endereco: endereco.trim() || null,
        pets: pets.map(({ chave: _chave, ...p }) => p),
        contatoBuscaEntrega: temContatoBuscaEntrega
          ? { nome: nomeBusca.trim(), telefone: telefoneBusca.trim() }
          : null,
      });

      if (resultado.ok) {
        setEnviado(true);
      } else {
        setErro(resultado.erro);
      }
    });
  }

  if (enviado) {
    return (
      <div className="rounded-xl border border-success-100 bg-success-50 px-6 py-8 text-center">
        <p className="font-display text-lg text-ink-900">Cadastro enviado!</p>
        <p className="mt-2 text-sm text-ink-700">
          Recebemos seus dados. Pode fechar essa página — o petshop já
          consegue ver as informações.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-card">
        <h2 className="font-display text-lg text-ink-900">Seus dados</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Nome" htmlFor="cadastro_nome" full>
            <input
              id="cadastro_nome"
              className={inputClass}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome completo"
            />
          </FormField>
          <FormField label="Telefone" htmlFor="cadastro_telefone">
            <input
              id="cadastro_telefone"
              className={inputClass}
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </FormField>
          <FormField label="Endereço" htmlFor="cadastro_endereco">
            <input
              id="cadastro_endereco"
              className={inputClass}
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro"
            />
          </FormField>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-ink-900">Seus pets</h2>
          <button
            type="button"
            onClick={adicionarPet}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            + Adicionar outro pet
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {pets.map((pet, indice) => (
            <div
              key={pet.chave}
              className="grid grid-cols-1 gap-3 rounded-lg border border-surface-border p-4 sm:grid-cols-2"
            >
              <FormField label="Nome do pet" htmlFor={`pet_nome_${pet.chave}`}>
                <input
                  id={`pet_nome_${pet.chave}`}
                  className={inputClass}
                  value={pet.nome}
                  onChange={(e) => atualizarPet(pet.chave, "nome", e.target.value)}
                  placeholder="ex.: Thor"
                />
              </FormField>
              <FormField label="Porte" htmlFor={`pet_porte_${pet.chave}`}>
                <select
                  id={`pet_porte_${pet.chave}`}
                  className={inputClass}
                  value={pet.porte_id}
                  onChange={(e) => atualizarPet(pet.chave, "porte_id", Number(e.target.value))}
                >
                  {portes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Raça" htmlFor={`pet_raca_${pet.chave}`} hint="Opcional.">
                <input
                  id={`pet_raca_${pet.chave}`}
                  className={inputClass}
                  value={pet.raca ?? ""}
                  onChange={(e) => atualizarPet(pet.chave, "raca", e.target.value)}
                />
              </FormField>
              <FormField label="Sexo" htmlFor={`pet_sexo_${pet.chave}`} hint="Opcional.">
                <select
                  id={`pet_sexo_${pet.chave}`}
                  className={inputClass}
                  value={pet.sexo ?? ""}
                  onChange={(e) => atualizarPet(pet.chave, "sexo", e.target.value || null)}
                >
                  <option value="">Não informado</option>
                  <option value="macho">Macho</option>
                  <option value="femea">Fêmea</option>
                </select>
              </FormField>
              <FormField
                label="Observações"
                htmlFor={`pet_obs_${pet.chave}`}
                hint="Temperamento, alergias, restrições…"
              >
                <input
                  id={`pet_obs_${pet.chave}`}
                  className={inputClass}
                  value={pet.observacoes ?? ""}
                  onChange={(e) => atualizarPet(pet.chave, "observacoes", e.target.value)}
                />
              </FormField>

              {pets.length > 1 && (
                <button
                  type="button"
                  onClick={() => removerPet(pet.chave)}
                  className={botao({ variante: "textoPerigo", tamanho: "sm", className: "justify-start text-left sm:col-span-2" })}
                >
                  Remover {pet.nome || `pet #${indice + 1}`}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-card">
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={temContatoBuscaEntrega}
            onChange={(e) => setTemContatoBuscaEntrega(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-surface-border text-brand-500 focus:ring-brand-500"
          />
          Quem busca/entrega o pet é uma pessoa diferente de mim
        </label>

        {temContatoBuscaEntrega && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nome" htmlFor="busca_nome">
              <input
                id="busca_nome"
                className={inputClass}
                value={nomeBusca}
                onChange={(e) => setNomeBusca(e.target.value)}
              />
            </FormField>
            <FormField label="Telefone" htmlFor="busca_telefone">
              <input
                id="busca_telefone"
                className={inputClass}
                value={telefoneBusca}
                onChange={(e) => setTelefoneBusca(e.target.value)}
              />
            </FormField>
          </div>
        )}
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={botao({ tamanho: "lg", largura: "cheia" })}
      >
        {pending ? "Enviando…" : "Enviar cadastro"}
      </button>
    </form>
  );
}
