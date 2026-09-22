import { type CampoImportacao, type Mapeamento, valorCampo } from "./campos";
import type { LinhaLida } from "./leitor";
import {
  normalizarCpf,
  normalizarEmail,
  normalizarNome,
  normalizarTelefone,
  telefoneValido,
  textoLimpo,
} from "./normalizar";

// ============================================================================
// Fatia C2 — tutores + pets.
//
// Formato: UMA LINHA POR PET, com o tutor repetido nas linhas — é o que as
// ferramentas de petshop exportam. Linha sem pet vira só tutor.
//
// Regras (docs/plano-loja-publica-pagamentos-import.md §C.3 + decisões de
// 21/set/2026):
//   - telefone normalizado é a chave do tutor dentro do petshop; sem
//     telefone válido é erro, não cadastro pela metade;
//   - tutor que já existe é REAPROVEITADO (o pet é ligado a ele) e nunca
//     alterado — os dados de tutor daquela linha são ignorados;
//   - pet com o mesmo nome (sem acento/maiúscula) no mesmo tutor é duplicado;
//   - porte é obrigatório para pet (pets.porte_id é NOT NULL).
//
// Esta função é a CONFERÊNCIA: não grava nada. O aplicar é a função SQL
// aplicar_importacao_tutores_pets (migration 0032), que revalida tudo.
// ============================================================================

export const CAMPOS_TUTORES_PETS: CampoImportacao[] = [
  {
    chave: "tutor_nome",
    rotulo: "Nome do tutor",
    obrigatorio: false,
    dica: "Se faltar, o telefone vira o nome provisório.",
    sinonimos: ["nome", "tutor", "cliente", "nome do cliente", "nome cliente", "responsavel", "proprietario", "dono", "nome do responsavel"],
    exemplos: ["Ana Souza", "Ana Souza", "Carlos Lima"],
  },
  {
    chave: "tutor_telefone",
    rotulo: "Telefone",
    obrigatorio: true,
    dica: "Com DDD. É o que identifica o tutor.",
    sinonimos: ["celular", "whatsapp", "whats", "fone", "telefone celular", "contato", "tel", "numero"],
    exemplos: ["(48) 99999-1234", "(48) 99999-1234", "48988887777"],
  },
  {
    chave: "tutor_email",
    rotulo: "E-mail",
    obrigatorio: false,
    sinonimos: ["email", "e mail", "correio eletronico"],
    exemplos: ["ana@email.com", "ana@email.com", ""],
  },
  {
    chave: "tutor_endereco",
    rotulo: "Endereço",
    obrigatorio: false,
    sinonimos: ["endereco", "rua", "logradouro", "endereco completo"],
    exemplos: ["Rua das Flores, 120", "Rua das Flores, 120", ""],
  },
  {
    chave: "tutor_bairro",
    rotulo: "Bairro",
    obrigatorio: false,
    sinonimos: [],
    exemplos: ["Centro", "Centro", "Pagani"],
  },
  {
    chave: "tutor_cpf",
    rotulo: "CPF",
    obrigatorio: false,
    sinonimos: ["cpf do tutor", "cpf cliente", "documento"],
    exemplos: ["", "", ""],
  },
  {
    chave: "pet_nome",
    rotulo: "Nome do pet",
    obrigatorio: false,
    dica: "Vazio = a linha cadastra só o tutor.",
    sinonimos: ["pet", "animal", "nome do animal", "nome pet", "nome animal", "paciente"],
    exemplos: ["Thor", "Mel", ""],
  },
  {
    chave: "pet_especie",
    rotulo: "Espécie",
    obrigatorio: false,
    sinonimos: ["especie", "tipo", "tipo de animal"],
    exemplos: ["Cachorro", "Gato", ""],
  },
  {
    chave: "pet_raca",
    rotulo: "Raça",
    obrigatorio: false,
    sinonimos: ["raca"],
    exemplos: ["Shih Tzu", "SRD", ""],
  },
  {
    chave: "pet_porte",
    rotulo: "Porte",
    obrigatorio: false,
    dica: "Pequeno, Médio ou Grande. Obrigatório quando a linha tem pet.",
    sinonimos: ["tamanho", "porte do pet"],
    exemplos: ["Pequeno", "Pequeno", ""],
  },
  {
    chave: "pet_sexo",
    rotulo: "Sexo",
    obrigatorio: false,
    sinonimos: ["genero", "sexo do pet"],
    exemplos: ["Macho", "Fêmea", ""],
  },
  {
    chave: "pet_observacoes",
    rotulo: "Observações",
    obrigatorio: false,
    sinonimos: ["obs", "observacao", "anotacoes", "notas", "alergias", "cuidados"],
    exemplos: ["Tem medo de secador", "", ""],
  },
];

export type PorteRef = { id: number; nome: string };
export type TutorExistente = { id: string; nome: string; telefone_normalizado: string };
export type PetExistente = { tutor_id: string; nome: string };

export type SituacaoConferencia = "nova" | "duplicada" | "erro";

export type DadosTutorPet = {
  tutor: {
    nome: string;
    telefone: string;
    email: string | null;
    endereco: string | null;
    bairro: string | null;
    cpf: string | null;
  };
  pet: {
    nome: string;
    porte_id: number;
    raca: string | null;
    especie: "cachorro" | "gato" | "outro" | null;
    sexo: "macho" | "femea" | null;
    observacoes: string | null;
  } | null;
};

export type LinhaConferida = {
  numero_linha: number;
  dados_brutos: Record<string, string>;
  dados_normalizados: DadosTutorPet | null;
  situacao: SituacaoConferencia;
  erro: string | null;
  avisos: string[];
};

// ----------------------------------------------------------------------------
// Vocabulário de porte, espécie e sexo
// ----------------------------------------------------------------------------

const SINONIMOS_PORTE: Record<string, string> = {
  p: "pequeno", pp: "pequeno", mini: "pequeno", toy: "pequeno", pequena: "pequeno",
  m: "medio", media: "medio",
  g: "grande", gg: "grande", gigante: "grande", "extra grande": "grande",
};

function resolverPorte(bruto: string, portes: PorteRef[]): number | null {
  let chave = normalizarNome(bruto).replace(/^porte\s+/, "").replace(/\.$/, "");
  chave = SINONIMOS_PORTE[chave] ?? chave;
  return portes.find((p) => normalizarNome(p.nome) === chave)?.id ?? null;
}

type Especie = NonNullable<DadosTutorPet["pet"]>["especie"];

function resolverEspecie(bruto: string): Especie {
  const v = normalizarNome(bruto);
  if (!v) return null;
  if (["cachorro", "cachorra", "cao", "cadela", "canino", "canina", "dog"].includes(v)) return "cachorro";
  if (["gato", "gata", "felino", "felina", "cat"].includes(v)) return "gato";
  return "outro";
}

function resolverSexo(bruto: string): "macho" | "femea" | null | undefined {
  const v = normalizarNome(bruto);
  if (!v) return null;
  if (["m", "macho", "masculino", "mac"].includes(v)) return "macho";
  if (["f", "femea", "feminino", "fem"].includes(v)) return "femea";
  return undefined; // preenchido, mas não reconhecido
}

// ----------------------------------------------------------------------------
// Conferência
// ----------------------------------------------------------------------------

export function conferirTutoresPets(
  linhas: LinhaLida[],
  mapeamento: Mapeamento,
  contexto: { portes: PorteRef[]; tutores: TutorExistente[]; pets: PetExistente[] }
): LinhaConferida[] {
  const tutorPorTelefone = new Map(contexto.tutores.map((t) => [t.telefone_normalizado, t]));
  const petsPorTutor = new Map<string, Set<string>>();
  for (const p of contexto.pets) {
    const set = petsPorTutor.get(p.tutor_id) ?? new Set<string>();
    set.add(normalizarNome(p.nome));
    petsPorTutor.set(p.tutor_id, set);
  }

  // Estado do próprio arquivo: a primeira linha de cada telefone "cria" o
  // tutor; as seguintes reaproveitam (é o que o aplicar faz, na mesma ordem).
  const primeiraLinhaDoTelefone = new Map<string, { numero: number; nome: string }>();
  const petsNoArquivo = new Map<string, number>(); // telefone|nome do pet → linha

  return linhas.map((linha): LinhaConferida => {
    const v = (chave: string) => valorCampo(linha.valores, mapeamento, chave);
    const base = { numero_linha: linha.numero, dados_brutos: linha.valores };
    const erro = (mensagem: string): LinhaConferida => ({
      ...base, dados_normalizados: null, situacao: "erro", erro: mensagem, avisos: [],
    });
    const avisos: string[] = [];

    // --- Tutor ------------------------------------------------------------
    const telefoneBruto = v("tutor_telefone");
    if (!telefoneBruto) return erro("Sem telefone — é o telefone que identifica o tutor.");
    const telefone = normalizarTelefone(telefoneBruto);
    if (!telefoneValido(telefone)) {
      return erro(`Telefone "${telefoneBruto}" não parece válido (precisa de DDD + número).`);
    }

    let nomeTutor = textoLimpo(v("tutor_nome"), 200);
    if (!nomeTutor) {
      nomeTutor = telefone;
      avisos.push("Sem nome do tutor — o telefone foi usado como nome provisório.");
    }

    const emailBruto = v("tutor_email");
    const email = normalizarEmail(emailBruto);
    if (emailBruto && !email) avisos.push(`E-mail "${emailBruto}" inválido — ficou em branco.`);

    const cpfBruto = v("tutor_cpf");
    const cpf = normalizarCpf(cpfBruto);
    if (cpfBruto && !cpf) avisos.push(`CPF "${cpfBruto}" não tem 11 dígitos — ficou em branco.`);

    // --- Pet --------------------------------------------------------------
    const nomePet = textoLimpo(v("pet_nome"), 100);
    const temDadoDePet = ["pet_especie", "pet_raca", "pet_porte", "pet_sexo", "pet_observacoes"].some(
      (c) => v(c) !== ""
    );

    let pet: DadosTutorPet["pet"] = null;
    if (nomePet) {
      const porteBruto = v("pet_porte");
      if (!porteBruto) return erro("Pet sem porte — preencha Pequeno, Médio ou Grande.");
      const porteId = resolverPorte(porteBruto, contexto.portes);
      if (porteId == null) {
        return erro(`Porte "${porteBruto}" não reconhecido — use Pequeno, Médio ou Grande.`);
      }

      const sexoBruto = v("pet_sexo");
      const sexo = resolverSexo(sexoBruto);
      if (sexo === undefined) avisos.push(`Sexo "${sexoBruto}" não reconhecido — ficou em branco.`);

      pet = {
        nome: nomePet,
        porte_id: porteId,
        raca: textoLimpo(v("pet_raca"), 100),
        especie: resolverEspecie(v("pet_especie")),
        sexo: sexo ?? null,
        observacoes: textoLimpo(v("pet_observacoes"), 1000),
      };
    } else if (temDadoDePet) {
      return erro("Tem dados de pet, mas falta o nome do pet.");
    }

    const dados: DadosTutorPet = {
      tutor: {
        nome: nomeTutor,
        telefone,
        email,
        endereco: textoLimpo(v("tutor_endereco"), 300),
        bairro: textoLimpo(v("tutor_bairro"), 100),
        cpf,
      },
      pet,
    };
    const resultado = (situacao: SituacaoConferencia, avisosExtras: string[] = []): LinhaConferida => ({
      ...base,
      dados_normalizados: dados,
      situacao,
      erro: null,
      avisos: [...avisosExtras, ...avisos],
    });

    const chavePet = pet ? `${telefone}|${normalizarNome(pet.nome)}` : null;
    const linhaPetRepetido = chavePet ? petsNoArquivo.get(chavePet) : undefined;

    // --- Tutor já cadastrado no petshop -------------------------------------
    const existente = tutorPorTelefone.get(telefone);
    if (existente) {
      if (!pet) return resultado("duplicada", [`Tutor já cadastrado (${existente.nome}).`]);
      if (petsPorTutor.get(existente.id)?.has(normalizarNome(pet.nome))) {
        return resultado("duplicada", [`${pet.nome} já está cadastrado para ${existente.nome}.`]);
      }
      if (linhaPetRepetido) return resultado("duplicada", [`Repete o pet da linha ${linhaPetRepetido}.`]);
      petsNoArquivo.set(chavePet!, linha.numero);
      return resultado("nova", [
        `Tutor já cadastrado (${existente.nome}) — o pet será ligado a ele; os dados de tutor desta linha são ignorados.`,
      ]);
    }

    // --- Tutor que apareceu mais acima no arquivo ---------------------------
    const anterior = primeiraLinhaDoTelefone.get(telefone);
    if (anterior) {
      if (!pet) return resultado("duplicada", [`Tutor repetido — já aparece na linha ${anterior.numero}.`]);
      if (linhaPetRepetido) return resultado("duplicada", [`Repete o pet da linha ${linhaPetRepetido}.`]);
      petsNoArquivo.set(chavePet!, linha.numero);
      const extras =
        normalizarNome(anterior.nome) !== normalizarNome(nomeTutor)
          ? [`Mesmo telefone da linha ${anterior.numero} com outro nome ("${nomeTutor}") — vale o cadastro da linha ${anterior.numero}.`]
          : [];
      return resultado("nova", extras);
    }

    // --- Tutor novo ---------------------------------------------------------
    primeiraLinhaDoTelefone.set(telefone, { numero: linha.numero, nome: nomeTutor });
    if (chavePet) petsNoArquivo.set(chavePet, linha.numero);
    return resultado("nova");
  });
}
