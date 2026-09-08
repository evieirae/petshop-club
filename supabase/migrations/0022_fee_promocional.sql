-- ============================================================================
-- 0022 — Preço promocional por petshop, com data de virada
--
-- Contexto (decisão do Eduardo, 30/ago/2026): a mensalidade da plataforma
-- sobe de R$ 99 para **R$ 299**, com **R$ 199 nos primeiros 3 meses** de cada
-- parceiro, enquanto as funcionalidades existentes são validadas em operação
-- real.
--
-- O schema não suportava isso. `gerar_mensalidade_petshop()` (0001) tinha
-- exatamente dois caminhos:
--
--     isento_fee_ate no futuro?  →  valor 0, status 'isento'
--     senão                      →  valor = fee_fixo_mensal
--
-- Para fazer "R$ 199 até tal mês, R$ 299 depois" seria preciso editar
-- `fee_fixo_mensal` na mão, petshop por petshop, no mês certo. Com parceiros
-- entrando em datas diferentes isso é esquecimento garantido — e o
-- esquecimento é sempre a favor do petshop e contra a plataforma, porque
-- ninguém reclama de continuar pagando menos.
--
-- Esta migration adiciona um terceiro caminho, no mesmo padrão de
-- `isento_fee_ate`: uma data que, enquanto não vence, faz valer outro preço.
--
-- Precedência (a ordem importa):
--     1. isento_fee_ate   → R$ 0        (mais forte: trial de verdade)
--     2. fee_promocional  → preço promo (desconto de parceiro fundador)
--     3. fee_fixo_mensal  → preço cheio
--
-- As colunas novas entram na MESMA proteção das outras três de receita
-- (0002/0017): RLS + trigger rejeitam alteração por quem não é admin da
-- plataforma. Isso é receita, não parâmetro operacional do petshop.
--
-- ----------------------------------------------------------------------------
-- VALIDAÇÃO (30/ago/2026) — Postgres 16 limpo, cadeia 0001→0022 aplicada na
-- ordem (pg_cron stubbado), e depois os casos de comportamento:
--
--   ✓ colunas criadas; default de fee_fixo_mensal virou 299,00
--   ✓ CHECK rejeita fee_promocional sem fee_promocional_ate
--   ✓ petshop entrando em setembro com promo até 30/nov:
--       set/out/nov → 199,00 'promocional'   dez/jan → 299,00 'pendente'
--   ✓ precedência confirmada: com isento_fee_ate no futuro, vem 0,00 'isento'
--     mesmo havendo promoção ativa
--   ✓ parceiro fundador (fee_fixo_mensal = 199, sem promo) segue em 199
--     indefinidamente
--   ✓ petshop novo herda 299,00 do default
--   ✓ idempotente: rodar gerar_mensalidade_petshop() de novo não duplica
--
-- O teste também pegou um bug antes de o arquivo sair daqui: a primeira
-- versão consultava `admins_plataforma.usuario_id`, coluna que não existe (é
-- `auth_user_id`), e ignorava o helper `auth_admin_plataforma()` que já é o
-- padrão da 0017. Corrigido.
-- ----------------------------------------------------------------------------
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas
-- ----------------------------------------------------------------------------
alter table petshops
    add column if not exists fee_promocional     numeric(10,2),
    add column if not exists fee_promocional_ate date;

alter table petshops drop constraint if exists petshops_fee_promocional_check;
alter table petshops add constraint petshops_fee_promocional_check
    check (
        (fee_promocional is null and fee_promocional_ate is null)
        or (fee_promocional is not null and fee_promocional_ate is not null
            and fee_promocional >= 0)
    );

comment on column petshops.fee_promocional is
    'Mensalidade promocional da plataforma, válida até fee_promocional_ate. Null = sem promoção, vale fee_fixo_mensal. Nasceu do preço de lançamento de 30/ago/2026: R$ 199 nos 3 primeiros meses, R$ 299 depois. Só a administração da plataforma altera (mesma proteção de fee_fixo_mensal).';

comment on column petshops.fee_promocional_ate is
    'Última competência em que fee_promocional vale. A partir da competência seguinte, volta fee_fixo_mensal. Sempre preenchida junto com fee_promocional (CHECK).';

-- ----------------------------------------------------------------------------
-- 2. Novos padrões de lançamento
--
-- O default de fee_fixo_mensal sai de R$ 99 (padrão de 2026-08) para R$ 299.
-- Petshops JÁ CADASTRADOS não são afetados — alterar o default não mexe em
-- linha existente, e mexer no preço de quem já assinou seria outra decisão,
-- não uma migration.
-- ----------------------------------------------------------------------------
alter table petshops alter column fee_fixo_mensal set default 299.00;

comment on column petshops.fee_fixo_mensal is
    'Mensalidade cheia da plataforma cobrada do petshop (mensalidades_petshop), independente do nº de visitas. Default R$ 299 desde a 0022 (era R$ 99). Pode ser precedida por fee_promocional enquanto fee_promocional_ate não vencer, ou zerada por isento_fee_ate.';

-- ----------------------------------------------------------------------------
-- 3. gerar_mensalidade_petshop() — terceiro caminho
--
-- Redefinição completa (última versão: 0001). Única mudança: o bloco
-- promocional entre o isento e o preço cheio. `status` novo 'promocional'
-- deixa o desconto visível no histórico — importante pra você saber, meses
-- depois, por que aquela competência veio mais barata.
-- ----------------------------------------------------------------------------
create or replace function gerar_mensalidade_petshop(p_petshop_id uuid, p_competencia date)
returns void
language plpgsql
as $$
declare
    v_petshop  petshops%rowtype;
    v_valor    numeric(10,2);
    v_status   text := 'pendente';
begin
    select * into v_petshop from petshops where id = p_petshop_id;

    if v_petshop.isento_fee_ate is not null and p_competencia <= v_petshop.isento_fee_ate then
        v_valor  := 0;
        v_status := 'isento';

    elsif v_petshop.fee_promocional is not null
          and v_petshop.fee_promocional_ate is not null
          and p_competencia <= v_petshop.fee_promocional_ate then
        v_valor  := v_petshop.fee_promocional;
        v_status := 'promocional';

    else
        v_valor := v_petshop.fee_fixo_mensal;
    end if;

    insert into mensalidades_petshop (petshop_id, competencia, valor, status)
    values (p_petshop_id, date_trunc('month', p_competencia)::date, v_valor, v_status)
    on conflict (petshop_id, competencia) do nothing;
end;
$$;

comment on function gerar_mensalidade_petshop(uuid, date) is
    'Gera a mensalidade da plataforma de um petshop numa competência. Precedência: isento_fee_ate (R$ 0) > fee_promocional (até fee_promocional_ate) > fee_fixo_mensal. Idempotente por (petshop_id, competencia). Chamar 1x/mês por petshop.';

-- ----------------------------------------------------------------------------
-- 4. status 'promocional' aceito em mensalidades_petshop
-- ----------------------------------------------------------------------------
do $$
declare v_def text;
begin
    select pg_get_constraintdef(oid) into v_def
    from pg_constraint
    where conrelid = 'mensalidades_petshop'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%';

    if v_def is not null and v_def not like '%promocional%' then
        execute 'alter table mensalidades_petshop drop constraint '
             || (select conname from pg_constraint
                 where conrelid = 'mensalidades_petshop'::regclass
                   and contype = 'c'
                   and pg_get_constraintdef(oid) like '%status%'
                 limit 1);
        execute $ck$alter table mensalidades_petshop add constraint mensalidades_petshop_status_check
                 check (status in ('pendente','pago','isento','promocional','falhou','processando','aguardando_pagamento','estornado'))$ck$;
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Proteção: as colunas novas são receita, não parâmetro operacional
--
-- Estende o trigger da 0002 (revisado na 0017) pras duas colunas novas. Sem
-- isso, o petshop poderia se dar um desconto eterno via chamada direta à API
-- do Supabase, sem passar por tela nenhuma.
-- ----------------------------------------------------------------------------
create or replace function trg_petshops_protege_taxas()
returns trigger
language plpgsql
as $$
begin
    if (new.fee_fixo_mensal        is distinct from old.fee_fixo_mensal
        or new.percentual_plataforma is distinct from old.percentual_plataforma
        or new.isento_fee_ate      is distinct from old.isento_fee_ate
        or new.fee_promocional     is distinct from old.fee_promocional
        or new.fee_promocional_ate is distinct from old.fee_promocional_ate)
       and not auth_admin_plataforma()
    then
        raise exception 'Somente a administração da plataforma pode alterar fee_fixo_mensal, percentual_plataforma, isento_fee_ate ou o fee promocional.';
    end if;
    return new;
end;
$$;

comment on function trg_petshops_protege_taxas() is
    'Impede que qualquer um fora de admins_plataforma altere as colunas de receita da plataforma, inclusive por chamada direta à API. Desde a 0022 cobre também fee_promocional e fee_promocional_ate.';

-- ----------------------------------------------------------------------------
-- 6. Como usar, no cadastro de um petshop novo
--
--   update petshops set
--       fee_fixo_mensal     = 299.00,
--       fee_promocional     = 199.00,
--       fee_promocional_ate = (date_trunc('month', current_date) + interval '2 months')::date
--   where id = '<petshop>';
--
-- "+ 2 months" e não 3: a competência do mês de entrada já conta como o
-- primeiro dos três. Entrando em setembro, o promocional cobre set/out/nov e
-- o preço cheio começa em dezembro.
--
-- Se o parceiro for fundador e você quiser travar o preço pra sempre, é só
-- não preencher a data de virada — deixe fee_fixo_mensal = 199 e os dois
-- campos promocionais nulos. Fica explícito no cadastro que aquele petshop
-- tem preço próprio, em vez de virar uma exceção esquecida numa planilha.
-- ----------------------------------------------------------------------------
