-- ============================================================================
-- 0016 — Funcionários e comissão configurável
--
-- Motivação (pedido do dono, 20/ago/2026, na mesma conversa que separou
-- Catálogo de Vendas): "o cadastro de funcionários para caso o petshop
-- queira fazer um sistema de comissão configurável".
--
-- Decisões tomadas com o Eduardo antes de escrever isto:
--
--  1. Funcionário é CADASTRO SIMPLES, SEM LOGIN — tabela nova
--     `funcionarios`, separada de `usuarios_petshop`. Um banhista/tosador
--     precisa aparecer na lista de "quem atendeu" sem precisar de conta no
--     Supabase Auth. `usuarios_petshop` continua sendo só quem acessa o
--     sistema. Se um dia um funcionário também precisar de login, o
--     caminho é adicionar `auth_user_id uuid` aqui numa migration futura —
--     deixado de fora agora de propósito, pra não sugerir que o cadastro
--     depende de convite/e-mail.
--  2. A comissão vale pros DOIS lados do negócio: venda de produto e
--     serviço (banho/tosa). Percentual configurável nos dois.
--  3. Os percentuais PADRÃO ficam na tela de Configurações, junto com
--     horário de funcionamento (colunas em `petshops` abaixo) — decisão
--     explícita do Eduardo. Cada funcionário pode ter um percentual
--     próprio que sobrescreve o padrão (colunas nullable em
--     `funcionarios`): null = "usa o padrão do petshop".
--  4. `petshops.comissao_ativa` é o interruptor geral. Nasce FALSE — um
--     petshop que não trabalha com comissão nem vê o assunto, e nenhuma
--     venda existente muda de comportamento por causa desta migration.
--
-- Unidade dos percentuais: PONTO PERCENTUAL (5.00 = 5%), diferente de
-- `petshops.percentual_plataforma`, que é fração (0.03 = 3%). Escolha
-- deliberada: percentual_plataforma é campo de admin da plataforma e nunca
-- aparece cru na tela; comissão é digitada pelo dono do petshop, e o que
-- ele digita ("5") é o que fica gravado. As telas não convertem nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. funcionarios — equipe do petshop pra fins de atendimento/comissão.
--    `funcao` é lista fechada porque, diferente de produtos.categoria, o
--    conjunto de papéis de um petshop é pequeno e estável; 'outro' cobre a
--    exceção sem virar texto livre.
-- ----------------------------------------------------------------------------
create table funcionarios (
    id          uuid primary key default gen_random_uuid(),
    petshop_id  uuid not null references petshops(id) on delete cascade,
    nome        text not null,
    funcao      text not null default 'atendente'
                check (funcao in ('tosador','banhista','atendente','vendedor','veterinario','outro')),
    telefone    text,
    ativo       boolean not null default true,

    -- Override opcional do percentual padrão do petshop. NULL = herda o
    -- padrão (petshops.comissao_percentual_*). 0 = "esse funcionário não
    -- ganha comissão nisso", que é diferente de herdar — por isso nullable
    -- em vez de default 0.
    comissao_percentual_venda   numeric(5,2)
                                check (comissao_percentual_venda between 0 and 100),
    comissao_percentual_servico numeric(5,2)
                                check (comissao_percentual_servico between 0 and 100),

    criado_em   timestamptz not null default now()
);

create index idx_funcionarios_petshop on funcionarios (petshop_id) where ativo = true;

alter table funcionarios enable row level security;
create policy isolamento_petshop on funcionarios for all using (petshop_id = auth_petshop_id());

comment on table funcionarios is
    'Equipe do petshop pra atendimento e comissão. NÃO é login — quem acessa o sistema continua em usuarios_petshop. Um funcionário pode existir aqui sem nunca ter conta.';
comment on column funcionarios.comissao_percentual_venda is
    'Percentual próprio sobre venda de produto (5.00 = 5%). NULL = herda petshops.comissao_percentual_venda.';
comment on column funcionarios.comissao_percentual_servico is
    'Percentual próprio sobre serviço executado (5.00 = 5%). NULL = herda petshops.comissao_percentual_servico.';

-- ----------------------------------------------------------------------------
-- 2. petshops — interruptor geral + percentuais padrão. Ficam na tela de
--    Configurações (mesma tela dos horários), não numa tela nova.
-- ----------------------------------------------------------------------------
alter table petshops
    add column comissao_ativa                boolean      not null default false,
    add column comissao_percentual_venda     numeric(5,2) not null default 0
                                             check (comissao_percentual_venda between 0 and 100),
    add column comissao_percentual_servico   numeric(5,2) not null default 0
                                             check (comissao_percentual_servico between 0 and 100);

comment on column petshops.comissao_ativa is
    'Interruptor geral de comissão. False (padrão) = nenhuma venda/visita calcula comissão, e a tela esconde o assunto.';

-- ----------------------------------------------------------------------------
-- 3. vendas — quem vendeu + snapshot da comissão.
--
--    O percentual é gravado JUNTO com o valor (mesmo espírito de
--    venda_itens.preco_unitario e agendamentos.preco_avulso): mudar o
--    percentual padrão amanhã não pode reescrever a comissão de uma venda
--    de ontem que já foi paga pro funcionário.
-- ----------------------------------------------------------------------------
alter table vendas
    add column funcionario_id      uuid references funcionarios(id) on delete set null,
    add column comissao_percentual numeric(5,2)  not null default 0,
    add column valor_comissao      numeric(10,2) not null default 0;

comment on column vendas.valor_comissao is
    'Snapshot em R$ calculado por registrar_venda()/criar_venda_pendente_pix() no momento da venda. Não recalcular depois.';

-- ----------------------------------------------------------------------------
-- 4. agendamentos — quem executou o banho/tosa.
--
--    Aqui NÃO tem snapshot de comissão, diferente de `vendas`, e isso é de
--    propósito: o valor de uma visita de assinatura não existe por visita
--    (a cobrança é mensal, ver seção 7 da 0001), então não dá pra congelar
--    "o valor desta visita" na hora que a equipe marca quem atendeu. O
--    cálculo fica em resumo_comissoes() (seção 6), que rateia a cobrança
--    do mês pelas visitas daquele mês. Visita avulsa usa preco_avulso
--    direto.
-- ----------------------------------------------------------------------------
alter table agendamentos
    add column funcionario_id uuid references funcionarios(id) on delete set null;

comment on column agendamentos.funcionario_id is
    'Quem executou o serviço — base da comissão de serviço. Opcional: visita sem responsável marcado simplesmente não gera comissão.';

-- ----------------------------------------------------------------------------
-- 5. registrar_venda() e criar_venda_pendente_pix() ganham p_funcionario_id.
--
--    DROP antes do CREATE de propósito: acrescentar um parâmetro cria uma
--    sobrecarga (duas funções com o mesmo nome), e o PostgREST escolheria
--    uma delas pela lista de argumentos nomeados — ambiguidade que não vale
--    a pena manter. A tela é o único chamador, e ela é atualizada junto.
-- ----------------------------------------------------------------------------
drop function if exists registrar_venda(uuid, uuid, uuid, text, jsonb);

create function registrar_venda(
    p_petshop_id      uuid,
    p_tutor_id        uuid,
    p_agendamento_id  uuid,
    p_forma_pagamento text,
    p_itens           jsonb,
    p_funcionario_id  uuid default null
)
returns uuid
language plpgsql
as $$
declare
    v_venda_id      uuid;
    v_item          jsonb;
    v_produto_id    uuid;
    v_quantidade    integer;
    v_preco_venda   numeric(10,2);
    v_estoque_atual integer;
    v_subtotal      numeric(10,2);
    v_valor_total   numeric(10,2) := 0;
    v_comissao_pct  numeric(5,2)  := 0;
    v_comissao_val  numeric(10,2) := 0;
begin
    if p_forma_pagamento not in ('cartao', 'pix', 'local') then
        raise exception 'registrar_venda: forma_pagamento % inválida', p_forma_pagamento;
    end if;
    if p_itens is null or jsonb_array_length(p_itens) = 0 then
        raise exception 'registrar_venda: venda sem nenhum item';
    end if;

    -- Comissão (0016): resolvida ANTES de gravar qualquer coisa, junto com
    -- a validação dos itens — se o funcionário informado não existir nesse
    -- petshop, a venda inteira aborta em vez de gravar sem comissão.
    if p_funcionario_id is not null then
        select case when ps.comissao_ativa
                    then coalesce(f.comissao_percentual_venda, ps.comissao_percentual_venda)
                    else 0
               end
          into v_comissao_pct
          from funcionarios f
          join petshops ps on ps.id = f.petshop_id
         where f.id = p_funcionario_id
           and f.petshop_id = p_petshop_id
           and f.ativo = true;

        if v_comissao_pct is null then
            raise exception 'registrar_venda: funcionário % não encontrado (ou inativo) nesse petshop', p_funcionario_id;
        end if;
    end if;

    -- 1ª passada: só valida (estoque suficiente, produto existe/ativo nesse
    -- petshop) e soma o total — nada é gravado ainda.
    for v_item in select * from jsonb_array_elements(p_itens)
    loop
        v_produto_id := (v_item->>'produto_id')::uuid;
        v_quantidade := (v_item->>'quantidade')::integer;

        if v_quantidade is null or v_quantidade <= 0 then
            raise exception 'registrar_venda: quantidade inválida pro produto %', v_produto_id;
        end if;

        select preco_venda, estoque_atual into v_preco_venda, v_estoque_atual
          from produtos
         where id = v_produto_id and petshop_id = p_petshop_id and ativo = true;

        if v_preco_venda is null then
            raise exception 'registrar_venda: produto % não encontrado (ou inativo) nesse petshop', v_produto_id;
        end if;
        if v_estoque_atual < v_quantidade then
            raise exception 'registrar_venda: estoque insuficiente pro produto % (tem %, pediu %)',
                v_produto_id, v_estoque_atual, v_quantidade;
        end if;

        v_valor_total := v_valor_total + round(v_preco_venda * v_quantidade, 2);
    end loop;

    v_comissao_val := round(v_valor_total * v_comissao_pct / 100, 2);

    -- 2ª passada: agora que TODO item já foi validado, grava de verdade.
    insert into vendas (petshop_id, tutor_id, agendamento_id, forma_pagamento, valor_total, status,
                        funcionario_id, comissao_percentual, valor_comissao)
    values (p_petshop_id, p_tutor_id, p_agendamento_id, p_forma_pagamento, v_valor_total, 'pago',
            p_funcionario_id, v_comissao_pct, v_comissao_val)
    returning id into v_venda_id;

    for v_item in select * from jsonb_array_elements(p_itens)
    loop
        v_produto_id := (v_item->>'produto_id')::uuid;
        v_quantidade := (v_item->>'quantidade')::integer;

        select preco_venda into v_preco_venda from produtos where id = v_produto_id;
        v_subtotal := round(v_preco_venda * v_quantidade, 2);

        insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
        values (v_venda_id, v_produto_id, v_quantidade, v_preco_venda, v_subtotal);

        insert into movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, venda_id)
        values (p_petshop_id, v_produto_id, 'saida', v_quantidade, 'venda', v_venda_id);

        update produtos set estoque_atual = estoque_atual - v_quantidade where id = v_produto_id;
    end loop;

    return v_venda_id;
end;
$$;

comment on function registrar_venda(uuid, uuid, uuid, text, jsonb, uuid) is
    'Único ponto de entrada pra criar uma venda de produto paga na hora: valida estoque de TODOS os itens (e o funcionário, se informado) antes de gravar qualquer coisa, calcula a comissão do vendedor, depois insere vendas/venda_itens/movimentos_estoque e decrementa produtos.estoque_atual. SECURITY INVOKER — RLS de isolamento_petshop protege cada INSERT.';

drop function if exists criar_venda_pendente_pix(uuid, uuid, uuid, jsonb);

create function criar_venda_pendente_pix(
    p_petshop_id      uuid,
    p_tutor_id        uuid,
    p_agendamento_id  uuid,
    p_itens           jsonb,
    p_funcionario_id  uuid default null
)
returns table(venda_id uuid, valor_total numeric)
language plpgsql
as $$
declare
    v_item          jsonb;
    v_produto_id    uuid;
    v_quantidade    integer;
    v_preco_venda   numeric(10,2);
    v_estoque_atual integer;
    v_valor_total   numeric(10,2) := 0;
    v_venda_id      uuid;
    v_comissao_pct  numeric(5,2)  := 0;
    v_comissao_val  numeric(10,2) := 0;
begin
    if p_itens is null or jsonb_array_length(p_itens) = 0 then
        raise exception 'registrar_venda: venda sem nenhum item';
    end if;

    if p_funcionario_id is not null then
        select case when ps.comissao_ativa
                    then coalesce(f.comissao_percentual_venda, ps.comissao_percentual_venda)
                    else 0
               end
          into v_comissao_pct
          from funcionarios f
          join petshops ps on ps.id = f.petshop_id
         where f.id = p_funcionario_id
           and f.petshop_id = p_petshop_id
           and f.ativo = true;

        if v_comissao_pct is null then
            raise exception 'registrar_venda: funcionário % não encontrado (ou inativo) nesse petshop', p_funcionario_id;
        end if;
    end if;

    -- Só valida (mesma checagem de registrar_venda) — o estoque NÃO é
    -- decrementado aqui de propósito: isso só acontece quando o webhook do
    -- Asaas confirma o Pix (ver 0015).
    for v_item in select * from jsonb_array_elements(p_itens)
    loop
        v_produto_id := (v_item->>'produto_id')::uuid;
        v_quantidade := (v_item->>'quantidade')::integer;

        if v_quantidade is null or v_quantidade <= 0 then
            raise exception 'registrar_venda: quantidade inválida pro produto %', v_produto_id;
        end if;

        select preco_venda, estoque_atual into v_preco_venda, v_estoque_atual
          from produtos
         where id = v_produto_id and petshop_id = p_petshop_id and ativo = true;

        if v_preco_venda is null then
            raise exception 'registrar_venda: produto % não encontrado (ou inativo) nesse petshop', v_produto_id;
        end if;
        if v_estoque_atual < v_quantidade then
            raise exception 'registrar_venda: estoque insuficiente pro produto % (tem %, pediu %)',
                v_produto_id, v_estoque_atual, v_quantidade;
        end if;

        v_valor_total := v_valor_total + round(v_preco_venda * v_quantidade, 2);
    end loop;

    v_comissao_val := round(v_valor_total * v_comissao_pct / 100, 2);

    insert into vendas (petshop_id, tutor_id, agendamento_id, forma_pagamento, valor_total, status,
                        funcionario_id, comissao_percentual, valor_comissao)
    values (p_petshop_id, p_tutor_id, p_agendamento_id, 'pix', v_valor_total, 'pendente',
            p_funcionario_id, v_comissao_pct, v_comissao_val)
    returning id into v_venda_id;

    for v_item in select * from jsonb_array_elements(p_itens)
    loop
        v_produto_id := (v_item->>'produto_id')::uuid;
        v_quantidade := (v_item->>'quantidade')::integer;

        select preco_venda into v_preco_venda from produtos where id = v_produto_id;

        insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
        values (v_venda_id, v_produto_id, v_quantidade, v_preco_venda, round(v_preco_venda * v_quantidade, 2));
    end loop;

    return query select v_venda_id, v_valor_total;
end;
$$;

comment on function criar_venda_pendente_pix(uuid, uuid, uuid, jsonb, uuid) is
    'Passo 1 da venda por Pix pela plataforma: valida estoque (só leitura) e grava vendas (status=pendente) + venda_itens, sem decrementar estoque ainda. Já grava a comissão do vendedor — se o Pix expirar, a venda vira cancelada e a comissão morre junto com ela.';

-- ----------------------------------------------------------------------------
-- 6. valor_base_agendamento() — quanto "vale" uma visita, pra fins de
--    comissão de serviço.
--
--    Visita avulsa é direto (preco_avulso, ou o valor da cobrança avulsa se
--    ela existir). Visita de assinatura não tem preço próprio: a cobrança é
--    mensal e cobre N visitas (cobrancas.quantidade_banhos, ver seção 7 da
--    0001). Então o valor por visita é o rateio da cobrança daquele mês —
--    exatamente a mesma conta que o comentário original da tabela já
--    descreve ("plano semanal de 4 banhos por R$99 -> R$24,75/banho").
--
--    Retorna 0 (não NULL) quando não dá pra determinar — visita de
--    assinatura num mês sem cobrança gerada, por exemplo. Comissão de zero
--    é mais honesto do que sumir com a linha do funcionário no resumo.
-- ----------------------------------------------------------------------------
create or replace function valor_base_agendamento(p_agendamento_id uuid)
returns numeric
language sql
stable
as $$
    select coalesce(
        case
            when a.assinatura_id is not null then (
                select round(c.valor_total / nullif(c.quantidade_banhos, 0), 2)
                  from cobrancas c
                 where c.assinatura_id = a.assinatura_id
                   and c.competencia   = date_trunc('month', a.data_hora)::date
                 limit 1
            )
            else coalesce(
                (select ca.valor_total from cobrancas_avulsas ca where ca.agendamento_id = a.id limit 1),
                a.preco_avulso
            )
        end,
        0
    )
    from agendamentos a
   where a.id = p_agendamento_id;
$$;

comment on function valor_base_agendamento(uuid) is
    'Valor de UMA visita pra fins de comissão: preço da avulsa, ou o rateio da cobrança mensal da assinatura (valor_total / quantidade_banhos). 0 quando indeterminado.';

-- ----------------------------------------------------------------------------
-- 7. resumo_comissoes() — o que cada funcionário produziu num período.
--
--    Venda usa o SNAPSHOT gravado na venda (vendas.valor_comissao); serviço
--    é calculado na hora, pelo percentual VIGENTE. Essa assimetria é
--    deliberada e está documentada na seção 4: venda tem valor fechado no
--    ato, visita de assinatura não tem.
--
--    Só conta venda com status='pago' — Pix pendente ou venda cancelada não
--    vira comissão. Do lado do serviço, só visita 'entregue' (o serviço
--    aconteceu de verdade; agendado/confirmado/faltou não paga ninguém).
-- ----------------------------------------------------------------------------
create or replace function resumo_comissoes(
    p_petshop_id uuid,
    p_inicio     date,
    p_fim        date          -- exclusivo
)
returns table (
    funcionario_id     uuid,
    funcionario_nome   text,
    funcionario_funcao text,
    qtd_vendas         bigint,
    total_vendas       numeric,
    comissao_vendas    numeric,
    qtd_servicos       bigint,
    total_servicos     numeric,
    comissao_servicos  numeric,
    comissao_total     numeric
)
language sql
stable
as $$
    with pct as (
        select f.id,
               f.nome,
               f.funcao,
               case when ps.comissao_ativa
                    then coalesce(f.comissao_percentual_servico, ps.comissao_percentual_servico)
                    else 0
               end as pct_servico
          from funcionarios f
          join petshops ps on ps.id = f.petshop_id
         where f.petshop_id = p_petshop_id
    ),
    v as (
        select ve.funcionario_id,
               count(*)                     as qtd,
               sum(ve.valor_total)          as total,
               sum(ve.valor_comissao)       as comissao
          from vendas ve
         where ve.petshop_id = p_petshop_id
           and ve.status = 'pago'
           and ve.funcionario_id is not null
           and ve.criado_em >= p_inicio
           and ve.criado_em <  p_fim
         group by ve.funcionario_id
    ),
    s as (
        select a.funcionario_id,
               count(*)                                  as qtd,
               sum(valor_base_agendamento(a.id))         as total
          from agendamentos a
         where a.petshop_id = p_petshop_id
           and a.status = 'entregue'
           and a.funcionario_id is not null
           and a.data_hora >= p_inicio
           and a.data_hora <  p_fim
         group by a.funcionario_id
    )
    select pct.id,
           pct.nome,
           pct.funcao,
           coalesce(v.qtd, 0),
           coalesce(v.total, 0),
           coalesce(v.comissao, 0),
           coalesce(s.qtd, 0),
           coalesce(s.total, 0),
           round(coalesce(s.total, 0) * pct.pct_servico / 100, 2),
           coalesce(v.comissao, 0) + round(coalesce(s.total, 0) * pct.pct_servico / 100, 2)
      from pct
      left join v on v.funcionario_id = pct.id
      left join s on s.funcionario_id = pct.id
     where coalesce(v.qtd, 0) > 0 or coalesce(s.qtd, 0) > 0
     order by 10 desc, pct.nome;
$$;

comment on function resumo_comissoes(uuid, date, date) is
    'Comissão por funcionário num período [p_inicio, p_fim). Venda usa o snapshot de vendas.valor_comissao; serviço calcula na hora, pelo percentual vigente, sobre visitas entregues. Só aparece quem teve movimento no período.';

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION
--
--  [ ] Rodar 0012 e 0015 antes desta (esta redefine funções criadas lá).
--  [ ] Depois de aplicar, conferir que uma venda SEM funcionário continua
--      funcionando igual (comissão 0, nada muda).
--  [ ] Cadastrar um funcionário, ligar comissao_ativa em Configurações com
--      5% em venda, vender R$100 pra ele e conferir vendas.valor_comissao = 5.00.
--  [ ] Marcar esse mesmo funcionário como responsável por uma visita
--      avulsa, marcar a visita como 'entregue' e conferir que
--      resumo_comissoes() traz a linha de serviço.
--  [ ] Desligar comissao_ativa e conferir que uma venda nova grava
--      valor_comissao = 0 (mas as antigas continuam com o valor de antes —
--      snapshot, de propósito).
--
-- GAPS CONHECIDOS, deixados de propósito fora desta v1:
--  - Não existe fechamento/pagamento de comissão (marcar "já paguei o mês
--    do fulano"). resumo_comissoes() é relatório, não contas a pagar.
--  - Percentual por produto/serviço específico (ex.: ração 3%, tosa 15%)
--    ficou de fora — hoje é um percentual por funcionário, com o padrão do
--    petshop como fallback. O caminho seria uma tabela
--    comissao_regras(produto_id|servico_id, percentual).
--  - Comissão de serviço não é congelada: mudar o percentual recalcula
--    meses anteriores no relatório. Se isso incomodar, o caminho é uma
--    tabela de fechamento mensal por funcionário.
-- ============================================================================
