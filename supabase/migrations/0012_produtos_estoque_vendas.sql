-- ============================================================================
-- 0012 — Produtos, estoque e vendas
--
-- Motivação (pedido do dono, 18/ago/2026): todo petshop também vende
-- produtos físicos (caminhas, shampoos, coleiras, ração…), e isso não tinha
-- nenhuma modelagem no schema até aqui — nem produto, nem estoque, nem
-- venda. Segue os mesmos padrões já usados no resto do banco: RLS por
-- petshop_id (isolamento_petshop), preço travado no momento da venda (mesmo
-- espírito de agendamentos.preco_avulso), contador de estoque mantido só
-- por código de servidor (nunca a UI decrementa direto — mesmo espírito de
-- assinaturas.banhos_restantes_mes).
--
-- forma_pagamento em `vendas` reaproveita exatamente o desenho da 0011
-- (pagamento no local) — não existe um terceiro modelo de pagamento
-- paralelo: cartão/Pix/local funcionam igual pra visita, assinatura e
-- agora venda de produto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. produtos — catálogo por petshop. `categoria` é texto livre de
--    propósito (não uma tabela nova tipo categorias_servico): a variedade
--    de produto de petshop é grande demais pra travar numa lista fechada
--    logo na v1, e não tem RLS/leitura pública compartilhada envolvida
--    (diferente de portes/categorias_servico, que são a mesma lista pra
--    todo petshop).
-- ----------------------------------------------------------------------------
create table produtos (
    id             uuid primary key default gen_random_uuid(),
    petshop_id     uuid not null references petshops(id) on delete cascade,
    nome           text not null,
    categoria      text,
    preco_venda    numeric(10,2) not null check (preco_venda >= 0),
    custo          numeric(10,2),
    -- Cache mantido só por registrar_venda() (seção 5) — nunca editado
    -- direto por UPDATE da tela além da correção manual no formulário de
    -- edição do produto (reposição de estoque ainda não tem tela de
    -- "entrada" dedicada nesta fase — ver nota no fim do arquivo).
    estoque_atual  integer not null default 0 check (estoque_atual >= 0),
    estoque_minimo integer,
    ativo          boolean not null default true,
    criado_em      timestamptz not null default now()
);

alter table produtos enable row level security;
create policy isolamento_petshop on produtos for all using (petshop_id = auth_petshop_id());

comment on table produtos is
    'Catálogo de produtos físicos vendidos no balcão (ração, caminha, shampoo…) — Fase 3 do pedido de 18/ago/2026. estoque_atual é um cache decrementado só por registrar_venda(), nunca editado direto pela UI de venda.';
comment on column produtos.estoque_atual is
    'Cache do saldo — decrementado por registrar_venda() a cada venda confirmada. Reposição de estoque nesta fase é edição manual do campo (sem tela de "entrada" dedicada ainda — ver checklist no fim do arquivo).';

-- ----------------------------------------------------------------------------
-- 2. vendas — 1 linha por venda de balcão. tutor_id e agendamento_id são
--    OPCIONAIS de propósito (decisão do Eduardo, 18/ago): venda de balcão
--    rápida não deveria exigir cadastro de cliente, mas se a venda aconteceu
--    na entrega de um pet, linkar o agendamento é útil (contexto de quem
--    comprou o quê, quando).
--
--    status nasce sempre 'pago' (ver registrar_venda) — diferente de
--    cobrancas/cobrancas_avulsas, que nascem 'pendente' pra um ciclo futuro
--    de cobrança, uma venda de produto é um evento em tempo real no balcão:
--    o dinheiro (ou cartão/Pix/local) já foi resolvido na hora de confirmar.
--    'cancelada' existe pra estorno/venda desfeita (sem reposição automática
--    de estoque nesta fase — ver checklist).
-- ----------------------------------------------------------------------------
create table vendas (
    id               uuid primary key default gen_random_uuid(),
    petshop_id       uuid not null references petshops(id) on delete cascade,
    tutor_id         uuid references tutores(id),
    agendamento_id   uuid references agendamentos(id),
    forma_pagamento  text not null check (forma_pagamento in ('cartao', 'pix', 'local')),
    valor_total      numeric(10,2) not null check (valor_total >= 0),
    status           text not null default 'pago' check (status in ('pendente', 'pago', 'cancelada')),
    criado_em        timestamptz not null default now()
);

alter table vendas enable row level security;
create policy isolamento_petshop on vendas for all using (petshop_id = auth_petshop_id());

comment on table vendas is
    'Venda de produto no balcão — tutor_id/agendamento_id opcionais (venda sem cliente cadastrado é permitida). forma_pagamento reaproveita o desenho da 0011 (cartão/Pix pela plataforma, local = sem taxa).';

-- ----------------------------------------------------------------------------
-- 3. venda_itens — sem petshop_id direto, mesmo padrão de plano_precos/
--    plano_servicos/precos_servico (0001_init.sql): tabela filha, RLS via
--    subquery em vendas. preco_unitario é o snapshot do preço no momento da
--    venda (mesma lógica de agendamentos.preco_avulso) — mudar
--    produtos.preco_venda depois nunca reescreve uma venda já feita.
-- ----------------------------------------------------------------------------
create table venda_itens (
    id              uuid primary key default gen_random_uuid(),
    venda_id        uuid not null references vendas(id) on delete cascade,
    produto_id      uuid not null references produtos(id),
    quantidade      integer not null check (quantidade > 0),
    preco_unitario  numeric(10,2) not null check (preco_unitario >= 0),
    subtotal        numeric(10,2) not null check (subtotal >= 0)
);

alter table venda_itens enable row level security;
create policy isolamento_petshop on venda_itens for all using (
    venda_id in (select id from vendas where petshop_id = auth_petshop_id())
);

comment on table venda_itens is
    'Linhas de uma venda — preco_unitario é snapshot de produtos.preco_venda no momento da venda, nunca recalculado depois. Sem petshop_id direto (mesmo padrão de plano_precos/plano_servicos/precos_servico) — RLS via venda_id.';

-- ----------------------------------------------------------------------------
-- 4. movimentos_estoque — log de toda entrada/saída/ajuste de estoque, pra
--    auditoria (mesmo espírito de eventos_gateway/lembretes: nunca perder o
--    "o que aconteceu e quando"). Só ganha linhas automáticas de
--    registrar_venda() nesta fase (tipo='saida', motivo='venda') — entrada
--    manual de reposição ainda não tem função/tela dedicada (ver checklist).
-- ----------------------------------------------------------------------------
create table movimentos_estoque (
    id           uuid primary key default gen_random_uuid(),
    petshop_id   uuid not null references petshops(id) on delete cascade,
    produto_id   uuid not null references produtos(id) on delete cascade,
    tipo         text not null check (tipo in ('entrada', 'saida', 'ajuste')),
    quantidade   integer not null check (quantidade > 0),
    motivo       text,
    venda_id     uuid references vendas(id),
    criado_em    timestamptz not null default now()
);

alter table movimentos_estoque enable row level security;
create policy isolamento_petshop on movimentos_estoque for all using (petshop_id = auth_petshop_id());

comment on table movimentos_estoque is
    'Log de toda entrada/saída/ajuste de estoque — auditoria (mesmo espírito de eventos_gateway/lembretes). Nesta fase só recebe linhas automáticas de registrar_venda() (saída por venda).';

-- ----------------------------------------------------------------------------
-- 5. registrar_venda() — único ponto de entrada pra criar uma venda. Uma
--    função (não um trigger em venda_itens) de propósito: a validação de
--    estoque precisa acontecer ANTES de gravar qualquer linha — uma venda
--    com um item sem saldo suficiente não deveria criar nem `vendas`, senão
--    sobra registro pela metade pra desfazer na mão. Chamada pela tela via
--    supabase.rpc('registrar_venda', …), SECURITY INVOKER (padrão — mesmo
--    motivo de marcar_pagamento_local na 0011): RLS de isolamento_petshop
--    protege cada INSERT sozinha, sem precisar checar petshop_id na mão.
--
--    p_itens é um array JSON: [{"produto_id": "...", "quantidade": 2}, …]
-- ----------------------------------------------------------------------------
create or replace function registrar_venda(
    p_petshop_id      uuid,
    p_tutor_id        uuid,
    p_agendamento_id  uuid,
    p_forma_pagamento text,
    p_itens           jsonb
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
begin
    if p_forma_pagamento not in ('cartao', 'pix', 'local') then
        raise exception 'registrar_venda: forma_pagamento % inválida', p_forma_pagamento;
    end if;
    if p_itens is null or jsonb_array_length(p_itens) = 0 then
        raise exception 'registrar_venda: venda sem nenhum item';
    end if;

    -- 1ª passada: só valida (estoque suficiente, produto existe/ativo nesse
    -- petshop) e soma o total — nada é gravado ainda. Se qualquer item
    -- falhar, a função inteira aborta (RAISE desfaz a transação implícita
    -- da chamada) e nenhuma linha órfã sobra em `vendas`.
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

    -- 2ª passada: agora que TODO item já foi validado, grava de verdade —
    -- venda, itens, log de estoque e o decremento do cache, item por item.
    insert into vendas (petshop_id, tutor_id, agendamento_id, forma_pagamento, valor_total, status)
    values (p_petshop_id, p_tutor_id, p_agendamento_id, p_forma_pagamento, v_valor_total, 'pago')
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

comment on function registrar_venda(uuid, uuid, uuid, text, jsonb) is
    'Único ponto de entrada pra criar uma venda de produto: valida estoque de TODOS os itens antes de gravar qualquer coisa, depois insere vendas/venda_itens/movimentos_estoque e decrementa produtos.estoque_atual, tudo numa chamada só. Chamada pela tela (Produtos), SECURITY INVOKER — sem GRANT/REVOKE especial, RLS de isolamento_petshop já protege cada INSERT.';

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION (mesmo cuidado das 0006/0011 —
-- rascunho, nunca testado contra um projeto Supabase de verdade):
--
--  [ ] Rodar 0009, 0010 e 0011 antes desta.
--  [ ] Cadastrar um produto de teste com estoque_atual = 2, chamar
--      registrar_venda com quantidade = 3 e conferir que dá erro e NADA foi
--      gravado (nem em vendas, nem em venda_itens, nem em movimentos_estoque).
--  [ ] Repetir com quantidade = 1 e conferir que produtos.estoque_atual caiu
--      pra 1, e que apareceu 1 linha em movimentos_estoque (tipo='saida').
--
-- GAPS CONHECIDOS, deixados de propósito fora da v1 (próxima fase, se fizer
-- sentido):
--  - Reposição de estoque (entrada) não tem função/tela dedicada — hoje é
--    edição manual de produtos.estoque_atual pela tela de catálogo, sem
--    gerar linha em movimentos_estoque.
--  - Cancelar uma venda (status='cancelada') não repõe o estoque
--    automaticamente — precisa reajustar manualmente se for o caso.
-- ============================================================================
