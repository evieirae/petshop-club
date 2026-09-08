-- ============================================================================
-- 0026 — LOJINHA DO TUTOR: RESERVA DE PRODUTO COM PRAZO
--
-- O tutor ve o catalogo do petshop no portal, monta um carrinho e RESERVA. A
-- reserva **segura o estoque** e **expira sozinha** (decisao do Eduardo,
-- 31/ago/2026) — nao e so um recado pro balcao.
--
-- Nao existe tabela nova. `vendas` ja tem tutor_id, ja tem venda_itens, e
-- criar_venda_pendente_pix() (0015) ja faz metade disso (grava a venda sem
-- baixar estoque). Reserva e um status a mais no mesmo fluxo, o que significa
-- que o Financeiro, o descritivo da venda e a comissao continuam funcionando
-- sem saber que reserva existe.
--
-- CICLO DE VIDA
--
--    tutor reserva
--         │  estoque_reservado += q     status='reservada'
--         ▼
--    ┌─────────────┐  petshop entrega  ┌────────┐
--    │  reservada  │──────────────────►│  pago  │  estoque_atual  -= q
--    │             │                   └────────┘  estoque_reservado -= q
--    │             │  prazo venceu     ┌───────────┐
--    │             │──────────────────►│ expirada  │  estoque_reservado -= q
--    │             │                   └───────────┘
--    │             │  alguem cancela   ┌───────────┐
--    └─────────────┴──────────────────►│ cancelada │  estoque_reservado -= q
--                                      └───────────┘
--
-- ORDEM: depois da 0012 (produtos/vendas/venda_itens/movimentos_estoque),
-- 0015 (venda por Pix) e 0024 (sessao do tutor).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Status novos em vendas
-- ----------------------------------------------------------------------------
alter table vendas drop constraint if exists vendas_status_check;
alter table vendas add constraint vendas_status_check
    check (status in ('pendente','reservada','pago','cancelada','expirada'));

alter table vendas
    add column if not exists reservado_ate timestamptz,
    add column if not exists criado_por text not null default 'balcao'
        check (criado_por in ('balcao','tutor'));

comment on column vendas.reservado_ate is
    'Ate quando a reserva segura o estoque. Nulo em venda normal. Depois disso expirar_reservas() devolve as unidades.';
comment on column vendas.criado_por is
    'balcao = registrada pela equipe; tutor = reservada pelo proprio cliente no portal (/minha-conta/loja). Mesmo nome e mesma ideia de agendamentos.criado_por (0025).';

-- Prazo por petshop, nao constante no codigo: petshop de bairro e petshop de
-- shopping tem paciencia diferente com produto parado esperando retirada.
alter table petshops
    add column if not exists reserva_prazo_horas smallint not null default 48
    check (reserva_prazo_horas > 0);

-- ----------------------------------------------------------------------------
-- 2. Estoque reservado
--
-- DISPONIVEL PRA VENDER = estoque_atual - estoque_reservado.
--
-- `estoque_atual` continua sendo "o que existe fisicamente na prateleira" —
-- reservar NAO tira o produto do estoque, so marca que ele tem dono. Por isso
-- a coluna e separada em vez de descontar direto: se fosse desconto, o
-- inventario do petshop passaria a mentir.
-- ----------------------------------------------------------------------------
alter table produtos
    add column if not exists estoque_reservado integer not null default 0
    check (estoque_reservado >= 0);

comment on column produtos.estoque_reservado is
    'Unidades com reserva ativa de algum tutor. Disponivel pra venda = estoque_atual - estoque_reservado. Mantido so pelas funcoes desta migration.';

-- ----------------------------------------------------------------------------
-- 3. A TRAVA — o que faz a reserva valer de verdade
--
-- Sem isto, o balcao venderia por cima da reserva: registrar_venda() (0012,
-- redefinida na 0016) valida contra estoque_atual e nao sabe que
-- estoque_reservado existe.
--
-- Reescrever registrar_venda() de novo aqui seria a solucao obvia e a pior:
-- ela ja foi redefinida duas vezes (0015, 0016) e copiar o corpo dela pra
-- dentro desta migration so pra somar uma condicao e a forma mais facil de
-- reintroduzir um bug ja corrigido. Um CHECK de linha tambem nao serve — a
-- mensagem seria ininteligivel pro balconista.
--
-- Uma trigger BEFORE UPDATE em `produtos` protege o invariante venha a
-- alteracao de onde vier — registrar_venda(), correcao manual de estoque no
-- formulario do produto, ou qualquer coisa que ainda nao existe.
-- ----------------------------------------------------------------------------
create or replace function trg_produtos_respeita_reserva()
returns trigger
language plpgsql
as $$
begin
    if new.estoque_atual < new.estoque_reservado then
        raise exception
            'Estoque insuficiente: % unidade(s) de "%" estao reservadas por um tutor e nao podem ser vendidas no balcao. Cancele a reserva em Vendas se precisar liberar.',
            new.estoque_reservado, new.nome
            using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_produtos_reserva on produtos;
create trigger trg_produtos_reserva
    before update on produtos
    for each row
    execute function trg_produtos_respeita_reserva();

-- ----------------------------------------------------------------------------
-- 4. Criar a reserva
--
-- p_itens: jsonb [{ "produto_id": "...", "quantidade": 2 }, ...]
--
-- `for update` em cada produto e o que impede dois tutores reservarem a
-- ultima unidade ao mesmo tempo: a segunda transacao espera a primeira
-- terminar e ai enxerga o estoque_reservado ja atualizado.
--
-- forma_pagamento nasce 'local' porque reserva NAO cobra nada: o tutor retira
-- e paga no balcao. Cobranca online do produto entra quando o gateway voltar
-- a ser assunto — hoje esta desligado.
-- ----------------------------------------------------------------------------
create or replace function criar_reserva_tutor(p_tutor_id uuid, p_itens jsonb)
returns uuid
language plpgsql
as $$
declare
    v_petshop_id  uuid;
    v_prazo_horas smallint;
    v_venda_id    uuid;
    v_total       numeric(10,2) := 0;
    v_item        jsonb;
    v_produto     produtos%rowtype;
    v_qtd         integer;
begin
    select t.petshop_id, p.reserva_prazo_horas
      into v_petshop_id, v_prazo_horas
      from tutores t
      join petshops p on p.id = t.petshop_id
     where t.id = p_tutor_id
       and t.acesso_liberado
       and t.ativo;

    if v_petshop_id is null then
        raise exception 'Tutor sem acesso liberado ao portal.' using errcode = 'check_violation';
    end if;

    if jsonb_array_length(p_itens) = 0 then
        raise exception 'Carrinho vazio.' using errcode = 'check_violation';
    end if;

    insert into vendas (petshop_id, tutor_id, forma_pagamento, valor_total, status,
                        reservado_ate, criado_por)
    values (v_petshop_id, p_tutor_id, 'local', 0, 'reservada',
            now() + make_interval(hours => v_prazo_horas), 'tutor')
    returning id into v_venda_id;

    for v_item in select * from jsonb_array_elements(p_itens)
    loop
        v_qtd := (v_item->>'quantidade')::int;

        if v_qtd is null or v_qtd <= 0 then
            raise exception 'Quantidade invalida.' using errcode = 'check_violation';
        end if;

        select * into v_produto
          from produtos
         where id = (v_item->>'produto_id')::uuid
           and petshop_id = v_petshop_id
           and ativo
           for update;

        if v_produto.id is null then
            raise exception 'Produto indisponivel.' using errcode = 'check_violation';
        end if;

        if v_produto.estoque_atual - v_produto.estoque_reservado < v_qtd then
            raise exception 'Só restam % unidade(s) de "%".',
                greatest(v_produto.estoque_atual - v_produto.estoque_reservado, 0),
                v_produto.nome
                using errcode = 'check_violation';
        end if;

        insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
        values (v_venda_id, v_produto.id, v_qtd, v_produto.preco_venda,
                round(v_produto.preco_venda * v_qtd, 2));

        update produtos
           set estoque_reservado = estoque_reservado + v_qtd
         where id = v_produto.id;

        v_total := v_total + round(v_produto.preco_venda * v_qtd, 2);
    end loop;

    update vendas set valor_total = v_total where id = v_venda_id;

    return v_venda_id;
end;
$$;

comment on function criar_reserva_tutor(uuid, jsonb) is
    'Reserva do portal do tutor: valida disponivel (estoque_atual - estoque_reservado) com lock de linha, grava vendas+venda_itens e segura o estoque ate reservado_ate.';

-- ----------------------------------------------------------------------------
-- 5. Devolver o estoque — cancelamento, expiracao e a retirada de fato
-- ----------------------------------------------------------------------------

-- Uso interno das tres funcoes abaixo.
create or replace function devolver_estoque_reservado(p_venda_id uuid)
returns void
language sql
as $$
    update produtos p
       set estoque_reservado = greatest(p.estoque_reservado - i.quantidade, 0)
      from venda_itens i
     where i.venda_id = p_venda_id
       and p.id = i.produto_id;
$$;

/* O tutor desistiu, ou o balcao precisou liberar a unidade. */
create or replace function cancelar_reserva(p_venda_id uuid)
returns void
language plpgsql
as $$
begin
    perform devolver_estoque_reservado(p_venda_id);
    update vendas set status = 'cancelada', reservado_ate = null
     where id = p_venda_id and status = 'reservada';
end;
$$;

/* Tutor apareceu e levou: vira venda paga e o estoque sai de verdade.
   As duas colunas caem no MESMO update, senao a trigger da secao 3 pegaria o
   estado intermediario (estoque_atual ja menor, estoque_reservado ainda
   cheio) e derrubaria a operacao. */
create or replace function concluir_reserva(p_venda_id uuid, p_forma_pagamento text default 'local')
returns void
language plpgsql
as $$
declare
    v_venda vendas%rowtype;
begin
    select * into v_venda from vendas where id = p_venda_id and status = 'reservada';

    if v_venda.id is null then
        raise exception 'Reserva nao encontrada ou ja resolvida.' using errcode = 'check_violation';
    end if;

    update produtos p
       set estoque_atual     = p.estoque_atual - i.quantidade,
           estoque_reservado = greatest(p.estoque_reservado - i.quantidade, 0)
      from venda_itens i
     where i.venda_id = p_venda_id
       and p.id = i.produto_id;

    insert into movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, venda_id)
    select v_venda.petshop_id, i.produto_id, 'saida', i.quantidade,
           'Retirada de reserva do portal do tutor', p_venda_id
      from venda_itens i
     where i.venda_id = p_venda_id;

    update vendas
       set status = 'pago',
           forma_pagamento = p_forma_pagamento,
           reservado_ate = null
     where id = p_venda_id;
end;
$$;

/* Roda de hora em hora no pg_cron. Devolve o estoque de tudo que venceu. */
create or replace function expirar_reservas()
returns integer
language plpgsql
as $$
declare
    v_venda record;
    v_total integer := 0;
begin
    for v_venda in
        select id from vendas
         where status = 'reservada'
           and reservado_ate is not null
           and reservado_ate < now()
    loop
        perform devolver_estoque_reservado(v_venda.id);
        update vendas set status = 'expirada' where id = v_venda.id;
        v_total := v_total + 1;
    end loop;

    return v_total;
end;
$$;

comment on function expirar_reservas() is
    'Chame 1x por hora (pg_cron). Devolve o estoque das reservas vencidas e marca status=expirada. Sem isso, reserva esquecida segura produto pra sempre.';

-- ----------------------------------------------------------------------------
-- 6. Vitrine: o tutor precisa VER o catalogo
--
-- Nao e dado sensivel — e o mesmo preco que esta na prateleira. `custo` vem
-- junto na linha, entao a tela do portal NUNCA deve dar `select *` em
-- produtos: ver a lista de colunas escrita na mao em
-- app/(tutor)/minha-conta/loja/page.tsx.
-- ----------------------------------------------------------------------------
drop policy if exists "vitrine_tutor" on produtos;
create policy "vitrine_tutor" on produtos
    for select using (
        ativo
        and petshop_id = (select petshop_id from tutores where id = auth_tutor_id())
    );

-- ============================================================================
-- DEPOIS DE APLICAR
--
--   [ ] Agendar a expiracao (uma vez, fora de migration):
--       select cron.schedule('expirar-reservas', '0 * * * *', 'select expirar_reservas()');
--
-- CHECKLIST DE TESTE
--
--  [ ] Produto com estoque 3: tutor reserva 2 -> estoque_atual continua 3 e
--      estoque_reservado vira 2.
--  [ ] O MESMO produto no PDV do balcao: vender 2 falha com a mensagem da
--      trigger (so 1 disponivel). Vender 1 funciona.
--  [ ] concluir_reserva() -> vendas.status='pago', estoque_atual 3->1,
--      estoque_reservado 2->0, e 1 linha em movimentos_estoque por item.
--  [ ] cancelar_reserva() -> estoque_reservado volta a 0 e nada sai do
--      estoque_atual.
--  [ ] Reserva com reservado_ate no passado + expirar_reservas() -> status
--      'expirada' e estoque_reservado devolvido.
--  [ ] Dois tutores reservando a ultima unidade ao mesmo tempo: o segundo
--      recebe "So restam 0 unidade(s)".
--  [ ] Tutor A nao enxerga produto de petshop que nao e o dele.
--  [ ] Financeiro do petshop continua somando so venda 'paga' — reserva nao
--      entra no total do mes enquanto nao for retirada.
-- ============================================================================
