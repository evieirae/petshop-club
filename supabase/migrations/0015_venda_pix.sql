-- ============================================================================
-- Fase 3b — Pix pela plataforma na tela de Vendas (pedido de 18/ago/2026,
-- mesma conversa que separou Produtos em abas "Vendas"/"Catálogo").
--
-- Eduardo pediu pra conseguir gerar o QR Code Pix (via Asaas) direto na
-- tela de venda, em vez de só rotular a venda como "Pix" depois que o
-- cliente já pagou por fora. Reaproveita 100% da infra da Fase 6
-- (docs/fase6_pagamentos.md): mesmo cliente Asaas (garantirClienteTutor/
-- garantirClientePetshop, duplicados na nova Edge Function
-- criar-pix-venda/index.ts, mesmo padrão de duplicação intencional já usado
-- entre processar-cobrancas e o resto), mesmo webhook (gateway-webhook,
-- estendido pra reconhecer `vendas` como uma 4ª origem), mesma função
-- registrar_pagamento_gateway (estendida com um ramo 'venda').
--
-- AVISO — MESMO STATUS DE RASCUNHO DA FASE 6: depende inteiramente de
-- ASAAS_API_KEY estar configurada (ver checklist no fim do arquivo) e do
-- webhook do Asaas estar registrado no painel deles. Sem isso, "Gerar Pix"
-- na tela vai falhar com um erro claro, mas não quebra o resto do app —
-- "No local" e "Cartão (pela plataforma, ainda so rótulo)" continuam
-- funcionando exatamente como antes.
--
-- DECISÃO DE PRODUTO (confirmada com o Eduardo, 18/ago/2026): o estoque só
-- desconta quando o Pix é CONFIRMADO pago, nunca na hora de gerar o QR.
-- Isso evita "reservar" um produto pra um Pix que o cliente nunca chegou a
-- pagar (QR expira, cliente desiste, troca de ideia no balcão). Por isso a
-- venda por Pix nasce em duas etapas, diferente da venda "no local"
-- (que continua sendo `registrar_venda()`, sem mudança nenhuma):
--
--   1. criar_venda_pendente_pix() — valida estoque (só leitura, sem
--      decrementar) e grava `vendas` (status='pendente') + `venda_itens`.
--      Chamada direto pela tela (RLS de isolamento_petshop protege).
--   2. Edge Function criar-pix-venda gera a cobrança no Asaas e devolve o
--      QR Code + copia-e-cola pra tela mostrar.
--   3. Cliente paga → webhook do Asaas chama registrar_pagamento_gateway
--      (ramo 'venda', novo abaixo) → SÓ AGORA decrementa estoque e grava
--      movimentos_estoque, exatamente como registrar_venda() já fazia,
--      só que depois da confirmação em vez de na hora de criar.
--
-- Se o estoque tiver sumido nesse meio-tempo (outra venda consumiu o
-- último item entre o QR ser gerado e o Pix ser pago) o decremento é
-- travado em zero (greatest(0, …)) em vez de violar o check
-- estoque_atual >= 0 — o pagamento já caiu na conta do petshop e não tem
-- como devolver, então a venda fica 'pago' mesmo assim, e a divergência
-- fica visível em movimentos_estoque (quantidade pedida vs. quantidade
-- realmente decrementada) pra reconciliação manual. Gap conhecido,
-- registrado aqui de propósito em vez de resolvido — mesmo estilo do
-- resto do arquivo 0012.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. vendas.gateway_payment_id — mesmo nome genérico e mesmo formato (text,
--    nullable, sem constraint de unicidade no banco) que cobrancas/
--    cobrancas_avulsas/mensalidades_petshop já usam desde 0001_init.sql.
-- ----------------------------------------------------------------------------
alter table vendas add column gateway_payment_id text;

comment on column vendas.gateway_payment_id is
    'Id da cobrança no Asaas quando forma_pagamento é pix/cartão E a venda foi paga via QR/link gerado pela plataforma (não preenchido pra "local", nem pro caso antigo de pix/cartão só rotulado manualmente). Casa com o webhook (gateway-webhook) pra marcar a venda como paga.';

-- ----------------------------------------------------------------------------
-- 2. criar_venda_pendente_pix() — valida estoque (leitura) e cria a venda
--    'pendente' + os itens, SEM tocar em estoque_atual/movimentos_estoque
--    (isso só acontece na confirmação, ver função 3 abaixo). Espelha a 1ª
--    passada de validação de registrar_venda() (mesma mensagem de erro,
--    prefixo "registrar_venda:" reaproveitado de propósito pra
--    produtos/actions.ts não precisar de um novo parser de erro).
--
--    Retorna venda_id e valor_total pra Edge Function criar-pix-venda usar
--    na hora de criar a cobrança no Asaas.
-- ----------------------------------------------------------------------------
create or replace function criar_venda_pendente_pix(
    p_petshop_id      uuid,
    p_tutor_id        uuid,
    p_agendamento_id  uuid,
    p_itens           jsonb  -- [{"produto_id": "...", "quantidade": 2}, …]
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
begin
    if p_itens is null or jsonb_array_length(p_itens) = 0 then
        raise exception 'registrar_venda: venda sem nenhum item';
    end if;

    -- Só valida (mesma checagem de registrar_venda) — nada é gravado nesta
    -- passada, e o estoque NÃO é decrementado aqui de propósito.
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

    insert into vendas (petshop_id, tutor_id, agendamento_id, forma_pagamento, valor_total, status)
    values (p_petshop_id, p_tutor_id, p_agendamento_id, 'pix', v_valor_total, 'pendente')
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

comment on function criar_venda_pendente_pix(uuid, uuid, uuid, jsonb) is
    'Passo 1 da venda por Pix pela plataforma: valida estoque (só leitura) e grava vendas (status=pendente) + venda_itens, sem decrementar estoque ainda. Chamada direto pela tela de Vendas (RLS de isolamento_petshop protege), SECURITY INVOKER — mesmo padrão de registrar_venda().';

-- ----------------------------------------------------------------------------
-- 3. registrar_pagamento_gateway() ganha o ramo 'venda' — diferente dos
--    outros três (só um UPDATE de status), aqui a confirmação também
--    precisa fazer o que registrar_venda() faz na hora de criar: decrementar
--    estoque e gravar movimentos_estoque. Só roda esse trabalho extra
--    quando o UPDATE de status realmente pegou uma linha 'pendente' (senão
--    é webhook reentregue — idempotência, mesmo espírito do resto da
--    função).
-- ----------------------------------------------------------------------------
create or replace function registrar_pagamento_gateway(
    p_origem             text,        -- 'cobranca' | 'cobranca_avulsa' | 'mensalidade' | 'venda'
    p_gateway_payment_id text,
    p_pago_em            timestamptz default now()
)
returns boolean
language plpgsql
as $$
declare
    v_atualizados integer;
    v_venda_id    uuid;
    v_item        record;
begin
    if p_origem = 'cobranca' then
        update cobrancas
           set status = 'pago', pago_em = p_pago_em,
               tentativas = 0, proxima_tentativa_em = null, erro_gateway = null
         where gateway_payment_id = p_gateway_payment_id
           and status <> 'pago';

        get diagnostics v_atualizados = row_count;
        return v_atualizados > 0;

    elsif p_origem = 'cobranca_avulsa' then
        update cobrancas_avulsas
           set status = 'pago', pago_em = p_pago_em,
               tentativas = 0, proxima_tentativa_em = null, erro_gateway = null
         where gateway_payment_id = p_gateway_payment_id
           and status <> 'pago';

        get diagnostics v_atualizados = row_count;
        return v_atualizados > 0;

    elsif p_origem = 'mensalidade' then
        update mensalidades_petshop
           set status = 'pago', pago_em = p_pago_em,
               tentativas = 0, proxima_tentativa_em = null, erro_gateway = null
         where gateway_payment_id = p_gateway_payment_id
           and status <> 'pago';

        get diagnostics v_atualizados = row_count;
        return v_atualizados > 0;

    elsif p_origem = 'venda' then
        update vendas
           set status = 'pago'
         where gateway_payment_id = p_gateway_payment_id
           and status = 'pendente'
        returning id into v_venda_id;

        get diagnostics v_atualizados = row_count;

        -- Só decrementa estoque se essa chamada foi quem realmente confirmou
        -- a venda agora (v_atualizados > 0) — webhook reentregue (venda já
        -- 'pago' de antes) não roda este bloco de novo.
        if v_atualizados > 0 then
            for v_item in select produto_id, quantidade from venda_itens where venda_id = v_venda_id
            loop
                -- greatest(0, …) em vez de deixar o check estoque_atual >= 0
                -- estourar: o dinheiro do Pix já caiu, não tem como desfazer
                -- o pagamento por causa de uma divergência de estoque. A
                -- diferença entre quantidade pedida (aqui embaixo, no motivo)
                -- e quantidade realmente decrementada fica registrada em
                -- movimentos_estoque pra reconciliação manual depois.
                update produtos
                   set estoque_atual = greatest(0, estoque_atual - v_item.quantidade)
                 where id = v_item.produto_id;

                insert into movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, venda_id)
                select petshop_id, v_item.produto_id, 'saida', v_item.quantidade, 'venda_pix_confirmada', v_venda_id
                  from vendas where id = v_venda_id;
            end loop;
        end if;

        return v_atualizados > 0;

    else
        raise exception 'registrar_pagamento_gateway: origem % desconhecida', p_origem;
    end if;
end;
$$;

comment on function registrar_pagamento_gateway(text, text, timestamptz) is
    'Marca uma cobrança/venda (cobranca/cobranca_avulsa/mensalidade/venda) como paga a partir do gateway_payment_id que veio no webhook. Idempotente. Pro ramo venda, também decrementa estoque e grava movimentos_estoque — só na confirmação, nunca na hora de gerar o QR (ver criar_venda_pendente_pix).';

-- ----------------------------------------------------------------------------
-- 4. registrar_falha_pagamento() ganha o ramo 'venda' — bem mais simples
--    que os outros três: venda de balcão é um evento único, não uma
--    assinatura recorrente, então não existe "tentar cobrar de novo" nem
--    dunning (sem colunas tentativas/proxima_tentativa_em em vendas de
--    propósito). PAYMENT_OVERDUE num Pix de venda só quer dizer "o cliente
--    não pagou até o QR expirar" — a venda vira 'cancelada' e pronto, sem
--    reposição de estoque porque estoque nunca chegou a ser decrementado.
-- ----------------------------------------------------------------------------
create or replace function registrar_falha_pagamento(
    p_origem             text,       -- 'cobranca' | 'cobranca_avulsa' | 'mensalidade' | 'venda'
    p_gateway_payment_id text,
    p_erro                text
)
returns boolean
language plpgsql
as $$
declare
    v_tentativas    integer;
    v_assinatura_id uuid;
    v_atualizados   integer;
begin
    if p_origem = 'cobranca' then
        update cobrancas
           set tentativas = tentativas + 1,
               erro_gateway = p_erro,
               proxima_tentativa_em = case tentativas + 1
                   when 1 then now() + interval '1 day'
                   when 2 then now() + interval '4 days'
                   else null
               end,
               status = case when tentativas + 1 >= 3 then 'falhou' else status end
         where gateway_payment_id = p_gateway_payment_id
        returning tentativas, assinatura_id into v_tentativas, v_assinatura_id;

        if v_tentativas >= 3 and v_assinatura_id is not null then
            perform pausar_assinatura_por_inadimplencia(v_assinatura_id);
        end if;

        return v_tentativas is not null;

    elsif p_origem = 'cobranca_avulsa' then
        update cobrancas_avulsas
           set tentativas = tentativas + 1,
               erro_gateway = p_erro,
               proxima_tentativa_em = case tentativas + 1
                   when 1 then now() + interval '1 day'
                   when 2 then now() + interval '4 days'
                   else null
               end,
               status = case when tentativas + 1 >= 3 then 'falhou' else status end
         where gateway_payment_id = p_gateway_payment_id
        returning tentativas into v_tentativas;

        return v_tentativas is not null;

    elsif p_origem = 'mensalidade' then
        update mensalidades_petshop
           set tentativas = tentativas + 1,
               erro_gateway = p_erro,
               proxima_tentativa_em = case tentativas + 1
                   when 1 then now() + interval '1 day'
                   when 2 then now() + interval '4 days'
                   else null
               end,
               status = case when tentativas + 1 >= 3 then 'falhou' else status end
         where gateway_payment_id = p_gateway_payment_id
        returning tentativas into v_tentativas;

        return v_tentativas is not null;

    elsif p_origem = 'venda' then
        update vendas
           set status = 'cancelada'
         where gateway_payment_id = p_gateway_payment_id
           and status = 'pendente';

        get diagnostics v_atualizados = row_count;
        return v_atualizados > 0;

    else
        raise exception 'registrar_falha_pagamento: origem % desconhecida', p_origem;
    end if;
end;
$$;

comment on function registrar_falha_pagamento(text, text, text) is
    'Registra falha de cobrança/venda vinda do webhook. Pra cobranca/cobranca_avulsa/mensalidade agenda retry D+1/D+4 (dunning). Pro ramo venda (Pix expirado sem pagamento) é mais simples: só cancela a venda pendente, sem retry — sem impacto em estoque, porque nunca foi decrementado.';

-- ----------------------------------------------------------------------------
-- 5. Fechar EXECUTE de criar_venda_pendente_pix pra PUBLIC não é necessário
--    — ao contrário de registrar_pagamento_gateway/registrar_falha_pagamento
--    (que só o webhook, via service_role, deveria chamar — já fechadas pra
--    anon/authenticated desde a 0006), criar_venda_pendente_pix é pra ser
--    chamada DIRETO pela tela (equipe logada), então mantém o padrão de
--    registrar_venda(): sem REVOKE, RLS de isolamento_petshop protegendo
--    cada INSERT.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION (mesmo cuidado das 0006/0011/0012
-- — depende de infraestrutura que ainda não foi confirmada rodando):
--
--  [ ] Confirmar que a 0006 (Fase 6) já está aplicada neste projeto Supabase
--      — esta migration estende 2 funções que a 0006 cria.
--  [ ] ASAAS_API_KEY, ASAAS_SANDBOX e ASAAS_WEBHOOK_TOKEN configuradas como
--      secrets da Edge Function (supabase secrets set …) — sem isso "Gerar
--      Pix" na tela falha com um erro claro (não quebra o resto do app).
--  [ ] Webhook registrado no painel do Asaas apontando pra
--      /functions/v1/gateway-webhook, com o mesmo token de
--      ASAAS_WEBHOOK_TOKEN.
--  [ ] Deploy da nova Edge Function: supabase functions deploy criar-pix-venda
--  [ ] Redeploy do gateway-webhook (ganhou o 4º ramo 'venda' em resolverOrigem).
--  [ ] Teste ponta a ponta no sandbox do Asaas: gerar um Pix de venda,
--      pagar no simulador do sandbox, confirmar que (a) vendas.status vira
--      'pago', (b) produtos.estoque_atual decrementou, (c) apareceu 1 linha
--      em movimentos_estoque com motivo='venda_pix_confirmada'.
--  [ ] Teste do caminho de expiração: gerar um Pix e deixar vencer sem
--      pagar (ou simular PAYMENT_OVERDUE no sandbox) — confirmar que a
--      venda vira 'cancelada' e o estoque NÃO foi mexido.
--
-- GAPS CONHECIDOS, deixados de propósito fora da v1:
--  - Sem cron de limpeza pra vendas 'pendente' que nunca receberam nem
--    PAYMENT_RECEIVED nem PAYMENT_OVERDUE (ex.: petshop fechou o Asaas no
--    meio do dia) — ficam pendentes indefinidamente até alguém notar na
--    tela. Mesmo tipo de gap já registrado pra reconciliação de cobranças
--    presas (ver seção 16 do docs/fase6_pagamentos.md).
--  - "Cartão (pela plataforma)" na tela de Vendas continua sendo só um
--    rótulo — esta migration só liga o caminho de Pix. Cobrar cartão de um
--    cliente de balcão exigiria tokenização na hora (o cliente não tem
--    cartão salvo como um tutor com assinatura teria), fora de escopo
--    deste pedido.
-- ============================================================================
