-- ============================================================================
-- 0008 — pets.sexo (macho/femea)
--
-- Motivação: mensagens automáticas (pet_pronto, por ex.) precisam
-- concordar em gênero — "pronto" vs "pronta". Nullable porque pets já
-- cadastrados não têm esse dado; telas/mensagens tratam null com fallback
-- neutro (nome do pet sem adjetivo flexionado, ou o masculino como default
-- genérico do português quando não há outra pista).
--
-- Aplicada em produção em 17/ago/2026.
-- ============================================================================

alter table pets add column if not exists sexo text check (sexo in ('macho', 'femea'));

comment on column pets.sexo is
    'Usado pra concordância de gênero em mensagens automáticas (ex.: pet_pronto). Null pros pets cadastrados antes dessa coluna existir — tratar com fallback neutro/masculino no texto.';
