-- ============================================================================
-- 0019 — Tutores e pets ganham ativo/inativo (soft-delete)
--
-- Motivação (pedido do Eduardo, 20/ago/2026): pet tinha exclusão
-- DEFINITIVA (removerPet, hard delete) e tutor não tinha exclusão nenhuma.
-- Os dois viram desativar/reativar — mesmo padrão já usado em
-- funcionarios.ativo (0016_funcionarios_comissoes.sql) e produtos.ativo
-- (0012_produtos_estoque_vendas.sql): exclusão de verdade quebraria o
-- histórico de agendamentos/vendas/cobranças que referenciam esses ids
-- (e, no caso de pet com assinatura, nem seria possível — assinaturas.pet_id
-- referencia pets(id) sem cascade). "Poluir a tela com quem não é mais
-- ativo" é o problema de verdade, não a permanência do registro — resolvido
-- na UI (app/(app)/pets/PetsSection.tsx e app/(app)/tutores/TutoresSection.tsx),
-- não no banco.
-- ============================================================================

alter table tutores add column ativo boolean not null default true;
alter table pets    add column ativo boolean not null default true;

comment on column tutores.ativo is
    'false = tutor desativado (não é mais cliente ativo) — some das listas/pickers padrão, mas o histórico de agendamentos/vendas/cobranças continua íntegro. Reativável a qualquer momento. Substitui exclusão definitiva, que nunca existiu pra tutor.';
comment on column pets.ativo is
    'false = pet desativado — some das listas/pickers padrão, mas o histórico de agendamentos/vendas continua íntegro. Reativável a qualquer momento. Substitui a exclusão definitiva que existia antes (removerPet), removida junto com esta migration.';

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION
--
--  [ ] Desativar um pet com histórico de agendamento antigo e conferir que
--      a Agenda/Financeiro continuam mostrando o nome dele normalmente nas
--      visitas já existentes.
--  [ ] Conferir que um pet/tutor desativado não aparece mais nos pickers de
--      NOVO agendamento/venda (app/(app)/vendas/VendasSection.tsx,
--      app/(app)/pets/PetsSection.tsx, app/(app)/tutores/TutoresSection.tsx).
--  [ ] Reativar e conferir que ele volta a aparecer nesses pickers.
-- ============================================================================
