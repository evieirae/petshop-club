-- ============================================================================
-- 0010 — pets.especie (cachorro/gato/outro)
--
-- Motivação: a UI de cadastro do pet (TutoresSection.tsx e o formulário
-- público de autopreenchimento) ganhou um select de espécie que, quando
-- cachorro ou gato, sugere uma lista das 15 raças mais comuns em vez de um
-- campo de texto livre puro — mais rápido de preencher no balcão. A lista de
-- raças em si NÃO vive no banco (ver lib/pets/racas.ts) — é a mesma lista
-- pra todo petshop, sem necessidade de tabela/RLS/seed. `pets.raca` continua
-- exatamente como sempre foi: texto livre, sem restrição — a espécie só
-- decide o que a tela SUGERE, nunca o que pode ser salvo.
--
-- Nullable, mesmo padrão da 0008 (pets.sexo): pets cadastrados antes dessa
-- coluna existir ficam com especie=null, e a UI trata isso como "espécie
-- não informada" (raça cai no texto livre, sem quebrar nada do que já
-- estava preenchido).
-- ============================================================================

alter table pets add column if not exists especie text
    check (especie in ('cachorro', 'gato', 'outro'));

comment on column pets.especie is
    'Usado só pra decidir se o cadastro do pet sugere raças mais comuns (cachorro/gato, ver lib/pets/racas.ts) ou texto livre direto (outro/null). Null pros pets cadastrados antes dessa coluna existir — raca continua sendo texto livre normalmente. Nunca restringe o valor salvo em pets.raca.';
