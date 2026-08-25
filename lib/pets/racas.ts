// Raças mais comuns por espécie — usado só pra popular o select de "Raça" no
// cadastro do pet (app/(app)/tutores/TutoresSection.tsx e
// app/(public)/cadastro/[tutorId]/CadastroForm.tsx), facilitando o
// preenchimento sem travar em nenhuma lista fechada: a opção "Outra" sempre
// libera o campo de texto livre — pets.raca continua sendo texto no banco,
// isso aqui não é uma tabela nova (ver migration 0010_pets_especie.sql).
//
// Lista fixa no frontend (mesmo padrão de FREQUENCIAS em
// app/(app)/agenda/AgendaSection.tsx) porque é a mesma lista pra todo
// petshop — não é algo que cada petshop customiza. Se um dia precisar ser
// editável por petshop, migra pra tabela global (mesmo padrão de
// `portes`/`categorias_servico` em 0001_init.sql) sem quebrar nada do que
// usa isso hoje.

export const RACAS_CACHORRO = [
  "SRD (Sem Raça Definida)",
  "Poodle",
  "Shih Tzu",
  "Yorkshire Terrier",
  "Lhasa Apso",
  "Bulldog Francês",
  "Maltês",
  "Pinscher",
  "Spitz Alemão (Lulu da Pomerânia)",
  "Chihuahua",
  "Labrador Retriever",
  "Golden Retriever",
  "Pug",
  "Beagle",
  "Dachshund (Salsicha)",
] as const;

export const RACAS_GATO = [
  "SRD (Sem Raça Definida)",
  "Persa",
  "Siamês",
  "Maine Coon",
  "Angorá",
  "Ragdoll",
  "British Shorthair",
  "Sphynx",
  "Bengal",
  "Munchkin",
  "Himalaia",
  "Exótico de Pelo Curto",
  "Azul Russo",
  "Scottish Fold",
  "Norueguês da Floresta",
] as const;

// Valor sentinela pra "essa raça não está na lista, deixa eu digitar" — não é
// gravado no banco de jeito nenhum (CampoRaca troca isso pelo texto livre
// antes de chamar onChange). Usado só como `value` de uma <option>.
export const RACA_OUTRA = "__outra__";

/** Lista de raças pra espécie (cachorro/gato). Vazia pra "outro"/null — nesses casos o campo de raça é sempre texto livre. */
export function racasPorEspecie(especie: string | null | undefined): readonly string[] {
  if (especie === "cachorro") return RACAS_CACHORRO;
  if (especie === "gato") return RACAS_GATO;
  return [];
}
