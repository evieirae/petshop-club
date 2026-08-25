"use client";

// Campo de raça que se adapta à espécie do pet (migration 0010_pets_especie.sql):
// cachorro/gato ganham um <select> com as 15 raças mais comuns (lib/pets/racas.ts)
// + "Outra"; qualquer outra espécie (ou nenhuma informada) cai direto no texto
// livre de sempre. `pets.raca` continua sendo só texto no banco — este
// componente é puramente uma conveniência de preenchimento, nunca uma
// restrição do que pode ser salvo.
//
// Extraído como componente próprio (em vez de inline nos dois formulários que
// usam isso — TutoresSection.tsx e CadastroForm.tsx) porque o estado local de
// "modo outra" precisa sobreviver a re-renders independente de cada pai: um
// <select>/<input> derivado só de `raca` não dá pra distinguir "usuário
// limpou o campo de texto livre" de "usuário nunca saiu do modo lista".

import { useState } from "react";
import { inputClass } from "@/components/ui/FormField";
import { RACA_OUTRA, racasPorEspecie } from "@/lib/pets/racas";
import type { EspeciePet } from "@/types/database";

export function CampoRaca({
  id,
  especie,
  raca,
  onChange,
}: {
  id: string;
  especie: EspeciePet | null;
  raca: string | null;
  onChange: (valor: string | null) => void;
}) {
  const lista = racasPorEspecie(especie);
  const usaLista = lista.length > 0;

  // Começa em "modo outra" se já existe uma raça salva que não bate com
  // nenhum item da lista dessa espécie — ex.: pet cadastrado antes dessa
  // coluna existir, ou petshop antigo que já digitava raça de qualquer jeito.
  const [modoOutra, setModoOutra] = useState(
    () => usaLista && !!raca && !lista.includes(raca)
  );

  if (!usaLista) {
    return (
      <input
        id={id}
        className={inputClass}
        value={raca ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="ex.: SRD, Poodle…"
      />
    );
  }

  if (modoOutra) {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          className={inputClass}
          value={raca ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Digite a raça"
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setModoOutra(false);
            onChange(null);
          }}
          className="whitespace-nowrap text-xs font-medium text-brand-700 hover:underline"
        >
          Escolher da lista
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className={inputClass}
      value={raca && lista.includes(raca) ? raca : ""}
      onChange={(e) => {
        if (e.target.value === RACA_OUTRA) {
          setModoOutra(true);
          onChange(null);
        } else {
          onChange(e.target.value || null);
        }
      }}
    >
      <option value="">Selecione…</option>
      {lista.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
      <option value={RACA_OUTRA}>Outra (especifique)</option>
    </select>
  );
}
