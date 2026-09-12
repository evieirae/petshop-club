-- ============================================================================
-- 0030 — tutores.bairro (texto estruturado, separado do endereço livre)
--
-- Motivação: Fase F2 do roadmap de identidade visual — endereco continua
-- sendo texto livre único (hoje com o placeholder "Rua, número, bairro" no
-- formulário público), sem nenhuma forma de agrupar/filtrar tutores por
-- região. bairro vira coluna própria pra isso ficar possível no futuro (ex.:
-- um KPI/gráfico de distribuição por bairro), sem tentar extrair bairro do
-- texto livre já digitado.
--
-- Nullable, mesmo padrão da 0010 (pets.especie) e da 0008 (pets.sexo):
-- tutores cadastrados antes dessa coluna existir ficam com bairro=null, e a
-- UI trata isso como "não informado" — não é preenchido retroativamente.
-- Sem check de valores (diferente de pets.especie): bairro é texto livre
-- dentro do campo (não há uma lista fechada de bairros no banco), só deixou
-- de ser parte do blob de endereço.
-- ============================================================================

alter table tutores add column if not exists bairro text;

comment on column tutores.bairro is
    'Bairro do tutor, separado do texto livre de endereco. Null = nao informado (tutor cadastrado antes dessa coluna existir, ou que ainda nao passou pelo formulario com o campo novo) — nao filtra nem restringe endereco.';
