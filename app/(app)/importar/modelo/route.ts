import { NextResponse } from "next/server";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { gerarModeloXlsx } from "@/lib/importacao/modelo";
import { CAMPOS_TUTORES_PETS } from "@/lib/importacao/tutoresPets";

// GET /importar/modelo — planilha modelo de tutores e pets (.xlsx).
// Exige sessão da equipe só para não virar arquivo público indexável; o
// conteúdo em si não tem dado de ninguém (só exemplos).
export async function GET() {
  const contexto = await getUsuarioContext();
  if (!contexto?.petshop?.id) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const buffer = await gerarModeloXlsx({
    nomeAba: "Tutores e pets",
    campos: CAMPOS_TUTORES_PETS,
    listas: {
      pet_porte: ["Pequeno", "Médio", "Grande"],
      pet_especie: ["Cachorro", "Gato", "Outro"],
      pet_sexo: ["Macho", "Fêmea"],
    },
    instrucoes: [
      "Uma linha por pet. Se o tutor tem dois pets, repita os dados do tutor nas duas linhas (é o jeito que a maioria dos sistemas exporta).",
      "Tutor sem pet: deixe as colunas do pet em branco — a linha cadastra só o tutor.",
      "O telefone (com DDD) é o que identifica o tutor. Pode ser com ou sem parênteses, traço, espaço ou +55.",
      "Se o telefone já estiver cadastrado no PetClub, o tutor NÃO é alterado: o pet novo é ligado a ele.",
      "Porte é obrigatório para cada pet: Pequeno, Médio ou Grande (P, M e G também valem).",
      "As 3 linhas cinzas são exemplos. Apague antes de importar, senão elas viram cadastros.",
      "Pode usar a planilha exportada do seu sistema antigo em vez deste modelo: na importação você diz qual coluna é qual.",
      "Antes de gravar, o PetClub mostra uma conferência com o que vai ser criado, o que já existe e o que tem erro. Nada é gravado até você clicar em Aplicar.",
    ],
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-tutores-e-pets.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
