-- ============================================================================
-- 0006 — Fase 6: cobrança com gateway de pagamento real
--
-- Plano completo em docs/fase6_pagamentos.md. Esta migration é RASCUNHO —
-- escrita sem conta de gateway ainda aberta (fatia 0 do plano), então NUNCA
-- foi testada contra um projeto Supabase de verdade. Diferente das
-- migrations anteriores (que só entravam no repo depois de testadas), esta
-- fica marcada como pendente de teste em sandbox antes de aplicar contra
-- qualquer ambiente com dado real — ver checklist no fim do arquivo.
--
-- Gateway recomendado no plano é o Asaas (docs/fase6_pagamentos.md, seção
-- 1), mas o schema abaixo é agnóstico de provedor — `gateway_payment_id`,
-- `gateway_wallet_id` etc. já existiam com esse nome genérico desde
-- 0001_init.sql.
--
-- O QUE ESTA MIGRATION ADICIONA:
--   1. Identidade do petshop no gateway (split) + método de pagamento do
--      próprio fee da plataforma.
--   2. Status novos + controle de retry nas 3 tabelas de cobrança
--      (cobrancas, cobrancas_avulsas, mensalidades_petshop).
--   3. Preferência de forma de pagamento do tutor (cartão x Pix).
--   3b. Taxa de serviço somada ao tutor (não mais descontada do petshop) —
--       petshop passa a receber o valor cheio, split via fixedValue.
--   4. `eventos_gateway` — log bruto de webhook, pra idempotência e
--      auditoria (mesmo motivo de `janelas_whatsapp` na Fase 5).
--   5. Trava de horário único pro self-service (portal do tutor) — dois
--      tutores não conseguem mais reservar o mesmo slot.
--   6. Funções chamadas pelo webhook do gateway: registrar pagamento,
--      registrar falha (com retry D+1/D+4 e pausa automática da assinatura
--      depois de 3 tentativas).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Identidade do petshop no gateway
--
-- gateway_wallet_id é a subconta/carteira que recebe o split de cada
-- cobrança (seção 4 do plano) — sem isso preenchido,
-- processar-cobrancas pula o petshop e loga, nunca cobra sem saber pra onde
-- vai o dinheiro. gateway_customer_id é o petshop como PAGADOR do próprio
-- fee mensal (seção 9 do plano) — papel invertido do de wallet_id.
-- ----------------------------------------------------------------------------
alter table petshops
    add column gateway_wallet_id   text,
    add column gateway_customer_id text;

comment on column petshops.gateway_wallet_id is
    'Id da subconta/carteira do petshop no gateway de pagamento — destino do split de cada cobrança. Sem valor, processar-cobrancas pula o petshop.';
comment on column petshops.gateway_customer_id is
    'Id do petshop como CLIENTE do gateway (papel invertido de gateway_wallet_id) — usado só pra cobrar o fee_fixo_mensal da plataforma dele.';

-- ----------------------------------------------------------------------------
-- 2. Preferência de forma de pagamento do tutor
--
-- Decide, em processar-cobrancas, se a cobrança do mês sai cobrando o
-- cartão salvo (metodos_pagamento) ou gerando um Pix e mandando por
-- WhatsApp. Default 'cartao' porque é o caminho automático — Pix exige
-- ação manual do tutor todo mês, então só deveria ser a preferência de
-- quem escolheu isso explicitamente (ou ainda não cadastrou cartão).
-- ----------------------------------------------------------------------------
alter table tutores
    add column forma_pagamento_preferida text not null default 'cartao'
        check (forma_pagamento_preferida in ('cartao', 'pix'));

-- Gap descoberto só ao escrever processar-cobrancas (não estava no plano
-- original): o Asaas exige CPF/CNPJ pra cadastrar um "customer", e é o
-- customer que qualquer cobrança (cartão OU Pix) precisa referenciar — não
-- só cartão. `tutores` nunca teve CPF porque nenhuma tela anterior
-- precisava disso. Sem essa coluna, um tutor que só usa Pix (nunca passa
-- pela tokenização de cartão da seção 5, que é onde `metodos_pagamento.
-- gateway_customer_id` nasceria) nunca ganha um customer no gateway.
--
-- cpf fica opcional no banco de propósito (não quebra tutor já cadastrado),
-- mas processar-cobrancas não consegue cobrar sem ele — na prática precisa
-- virar campo obrigatório em algum ponto do fluxo de cadastro/assinatura
-- antes do piloto (Fase 7). Ver nota em docs/fase6_pagamentos.md.
alter table tutores
    add column cpf                 text,
    add column gateway_customer_id text;

comment on column tutores.gateway_customer_id is
    'Id do tutor como customer no gateway — criado sob demanda por processar-cobrancas na 1ª cobrança (cartão OU Pix), usando tutores.cpf. Null até a 1ª cobrança processada.';

-- ----------------------------------------------------------------------------
-- 2b. Taxa de serviço somada ao tutor, não descontada do petshop
--     (docs/fase6_pagamentos.md, seção 1c — decisão de 16/ago/2026).
--
-- Até aqui (0001/0003), o petshop recebia valor_total − valor_percentual
-- (97% de R$99, por exemplo) — um desconto. Isso quebrava na prática
-- porque o split do gateway é calculado sobre o valor LÍQUIDO da cobrança
-- (depois da taxa do Asaas já ter sido descontada), então o petshop
-- receberia um valor imprevisível, menor do que o que o sistema registra
-- (ver seção 1b do plano pro exemplo numérico completo).
--
-- A partir de agora, o petshop recebe SEMPRE o valor cheio do serviço —
-- valor_petshop = valor_total, sem desconto nenhum. A receita da
-- plataforma (valor_percentual, mesma fórmula de sempre) + a taxa do
-- gateway do meio escolhido viram uma taxa de serviço SOMADA ao valor
-- cobrado do tutor, não mais subtraída do petshop. O split no gateway
-- passa a usar `fixedValue = valor_total` (não `percentualValue`) —
-- ver processar-cobrancas/index.ts.
--
-- valor_taxa_gateway/valor_cobrado_tutor só são preenchidos no momento de
-- processar a cobrança (processar-cobrancas ou o portal do tutor), porque
-- dependem do meio de pagamento escolhido — não são conhecidos no momento
-- em que o trigger abaixo cria a linha (por isso ficam nullable, sem
-- default). cobrancas_avulsas ganha as mesmas colunas, mesmo motivo.
-- mensalidades_petshop FICA DE FORA de propósito: não tem split (o valor
-- inteiro já é receita da plataforma), então a taxa do gateway ali só
-- reduz a própria margem da plataforma — não há "outro lado" a proteger.
-- ----------------------------------------------------------------------------
alter table cobrancas
    add column valor_taxa_gateway numeric(10,2),
    add column valor_cobrado_tutor numeric(10,2);

alter table cobrancas_avulsas
    add column valor_taxa_gateway numeric(10,2),
    add column valor_cobrado_tutor numeric(10,2);

comment on column cobrancas.valor_petshop is
    'A partir da Fase 6 (ver seção 2b/1c do plano): sempre igual a valor_total — o petshop recebe o valor cheio do serviço, nunca descontado. A receita da plataforma (valor_percentual) + a taxa do gateway são somadas ao tutor via valor_cobrado_tutor, não mais subtraídas daqui.';
comment on column cobrancas.valor_taxa_gateway is
    'Taxa do gateway (Asaas) pro meio de pagamento efetivamente usado nesta cobrança — R$0 se Pix, variável se cartão (docs/fase6_pagamentos.md, seção 1b). Null até processar-cobrancas decidir o meio.';
comment on column cobrancas.valor_cobrado_tutor is
    'valor_total + valor_percentual + valor_taxa_gateway — o total que sai do cartão/Pix do tutor, maior que valor_total. É esse valor, não valor_total, que vira o `value` da cobrança no gateway.';

-- CREATE OR REPLACE da mesma função de 0001_init.sql/0003_fase4_assinaturas_agenda.sql
-- — nunca se edita uma migration já aplicada, a correção entra como uma
-- nova versão da função (mesmo padrão já usado por 0003 em cima de 0001).
-- Única mudança real: valor_petshop passa a ser sempre o valor cheio
-- (v_valor_total / new.preco_avulso), não mais descontado do percentual.
create or replace function trg_agendamento_processar_cobranca()
returns trigger
language plpgsql
as $$
declare
    v_assinatura         assinaturas%rowtype;
    v_plano               planos%rowtype;
    v_porte_id            smallint;
    v_preco_mensal_base   numeric(10,2);
    v_valor_por_visita    numeric(10,2);
    v_competencia         date;
    v_qtd_banhos          int;
    v_valor_total         numeric(10,2);
    v_percentual          numeric(5,4);
    v_valor_percentual    numeric(10,2);
begin
    -- Visita avulsa: cobrança única, sem ciclo mensal. O valor já vem
    -- travado em new.preco_avulso (definido pela Server Action no momento
    -- da criação, a partir de precos_servico pelo porte do pet).
    if new.assinatura_id is null then
        select percentual_plataforma into v_percentual
          from petshops where id = new.petshop_id;

        v_valor_percentual := round(new.preco_avulso * v_percentual, 2);

        insert into cobrancas_avulsas (
            petshop_id, agendamento_id, tutor_id,
            valor_total, valor_percentual, valor_petshop
        ) values (
            new.petshop_id, new.id, new.tutor_id,
            new.preco_avulso, v_valor_percentual, new.preco_avulso
        )
        on conflict (agendamento_id) do nothing;

        return new;
    end if;

    -- A partir daqui, lógica original de assinatura (mensal proporcional) —
    -- inalterada, exceto valor_petshop (ver comentário acima da função).
    select * into v_assinatura from assinaturas where id = new.assinatura_id;
    v_competencia := date_trunc('month', new.data_hora)::date;

    if v_assinatura.competencia_paga is not distinct from v_competencia then
        update assinaturas
           set banhos_restantes_mes = greatest(banhos_restantes_mes - 1, 0)
         where id = new.assinatura_id;
        return new;
    end if;

    select * into v_plano from planos where id = v_assinatura.plano_id;
    select porte_id into v_porte_id from pets where id = v_assinatura.pet_id;

    select preco_assinatura into v_preco_mensal_base
      from plano_precos
     where plano_id = v_assinatura.plano_id
       and porte_id = v_porte_id;

    v_valor_por_visita := v_preco_mensal_base / v_plano.ocorrencias_padrao_mes;
    v_qtd_banhos        := contar_ocorrencias_dia_semana_mes(v_assinatura.dia_semana_preferencial, v_competencia);
    v_valor_total        := round(v_valor_por_visita * v_qtd_banhos, 2);

    select percentual_plataforma into v_percentual from petshops where id = new.petshop_id;
    v_valor_percentual := round(v_valor_total * v_percentual, 2);

    insert into cobrancas (
        petshop_id, assinatura_id, agendamento_gatilho_id, competencia,
        quantidade_banhos, valor_total, valor_percentual, valor_petshop
    ) values (
        new.petshop_id, new.assinatura_id, new.id, v_competencia,
        v_qtd_banhos, v_valor_total, v_valor_percentual, v_valor_total
    )
    on conflict (assinatura_id, competencia) do nothing;

    update assinaturas
       set competencia_paga     = v_competencia,
           banhos_restantes_mes = v_qtd_banhos - 1
     where id = new.assinatura_id;

    return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Status novos + controle de retry — cobrancas, cobrancas_avulsas,
--    mensalidades_petshop
--
-- 'processando' = cobrança de cartão criada no gateway, aguardando o
-- webhook confirmar (não é sinônimo de 'pendente': já saiu daqui, só não
-- sabemos o resultado ainda). 'aguardando_pagamento' = QR Pix gerado,
-- esperando o tutor pagar (tem prazo — pix_expira_em).
--
-- tentativas/proxima_tentativa_em implementam o dunning da seção 8 do
-- plano: D+1 e D+4 de retry automático antes de desistir. erro_gateway
-- guarda o motivo da última falha, mesmo racional de lembretes.erro_envio
-- na Fase 5 — sem isso, uma cobrança 'falhou' é impossível de depurar.
-- ----------------------------------------------------------------------------
alter table cobrancas drop constraint if exists cobrancas_status_check;
alter table cobrancas add constraint cobrancas_status_check
    check (status in ('pendente', 'processando', 'aguardando_pagamento', 'pago', 'falhou', 'estornado'));

alter table cobrancas
    add column tentativas          smallint not null default 0,
    add column proxima_tentativa_em timestamptz,
    add column erro_gateway        text,
    add column pix_qr_code         text,
    add column pix_expira_em       timestamptz;

alter table cobrancas_avulsas drop constraint if exists cobrancas_avulsas_status_check;
alter table cobrancas_avulsas add constraint cobrancas_avulsas_status_check
    check (status in ('pendente', 'processando', 'aguardando_pagamento', 'pago', 'falhou', 'estornado'));

alter table cobrancas_avulsas
    add column tentativas          smallint not null default 0,
    add column proxima_tentativa_em timestamptz,
    add column erro_gateway        text,
    add column pix_qr_code         text,
    add column pix_expira_em       timestamptz;

alter table mensalidades_petshop drop constraint if exists mensalidades_petshop_status_check;
alter table mensalidades_petshop add constraint mensalidades_petshop_status_check
    check (status in ('pendente', 'processando', 'aguardando_pagamento', 'pago', 'falhou', 'isento'));

alter table mensalidades_petshop
    add column tentativas          smallint not null default 0,
    add column proxima_tentativa_em timestamptz,
    add column erro_gateway        text,
    add column pix_qr_code         text,
    add column pix_expira_em       timestamptz;

comment on column cobrancas.tentativas is
    'Nº de tentativas de cobrança de cartão já feitas. Em 3, status vira falhou definitivo e a assinatura é pausada automaticamente (ver pausar_assinatura_por_inadimplencia).';
comment on column cobrancas.proxima_tentativa_em is
    'Quando processar-cobrancas deve tentar de novo (D+1 na 1ª falha, D+4 na 2ª). Null = não é um retry pendente.';

-- ----------------------------------------------------------------------------
-- 4. eventos_gateway — log bruto de webhook (idempotência + auditoria)
--
-- Mesmo racional de janelas_whatsapp na Fase 5: RLS ligada e SEM policy —
-- só service_role (a Edge Function do webhook) enxerga. gateway_event_id
-- unique é a trava de replay: a Meta reenvia webhook que não respondeu 2xx
-- rápido o bastante, e gateways de pagamento fazem o mesmo — sem essa
-- trava, um evento reentregue processaria a mesma cobrança duas vezes.
-- ----------------------------------------------------------------------------
create table eventos_gateway (
    id               uuid primary key default gen_random_uuid(),
    gateway_event_id text not null unique,
    tipo             text not null,
    payload          jsonb not null,
    processado_em    timestamptz,
    erro             text,
    criado_em        timestamptz not null default now()
);

alter table eventos_gateway enable row level security;

comment on table eventos_gateway is
    'Log bruto de todo evento recebido do webhook do gateway de pagamento — dedupe por gateway_event_id + auditoria. RLS ligada sem policy: só service_role enxerga (mesmo padrão de janelas_whatsapp, Fase 5).';

-- ----------------------------------------------------------------------------
-- 5. Trava de horário único — self-service (portal do tutor, seção 7 do
--    plano)
--
-- Sem checagem de capacidade real no MVP (limite conhecido desde a Fase 4:
-- ver docs/regras_padrao_petshop.md seção 1), mas com o tutor agendando
-- sozinho pelo celular o risco de dois tutores pegarem o mesmo horário via
-- corrida de cliques deixa de ser hipotético. Este índice único é o
-- paliativo: o segundo INSERT simultâneo estoura a constraint, e a Server
-- Action devolve "horário acabou de ser ocupado, escolha outro" em vez de
-- criar dois agendamentos no mesmo slot.
-- ----------------------------------------------------------------------------
create unique index agendamentos_slot_unico
    on agendamentos (petshop_id, data_hora)
    where status in ('agendado', 'confirmado');

-- ----------------------------------------------------------------------------
-- 5b. lembretes.tipo ganha 3 valores novos — cobranca_pix (QR do mês),
--     aviso_cobranca (D-1 antes de debitar o cartão) e cadastro_cartao
--     (link de tokenização, seção 5 do plano). 'cobranca_falhou' e
--     'cartao_vencendo' já existiam desde 0001_init.sql (nunca tinham sido
--     gerados de verdade até esta fase).
-- ----------------------------------------------------------------------------
alter table lembretes drop constraint if exists lembretes_tipo_check;
alter table lembretes add constraint lembretes_tipo_check
    check (tipo in (
        'confirmacao_agendamento', 'confirmacao_manual_petshop', 'pet_pronto', 'cadastro',
        'cobranca_falhou', 'cartao_vencendo', 'cobranca_pix', 'aviso_cobranca', 'cadastro_cartao'
    ));

-- ----------------------------------------------------------------------------
-- 6. registrar_pagamento_gateway() — chamada pelo webhook quando o gateway
--    confirma um pagamento (cartão ou Pix), pra qualquer uma das 3
--    tabelas de cobrança.
--
-- p_origem decide a tabela — não usei EXECUTE/SQL dinâmico de propósito
-- (mesma escolha de estilo do resto do projeto: lógica explícita por
-- ramo, não abstração genérica sobre nome de tabela). Idempotente: só
-- atualiza linhas que ainda não estão 'pago' — webhook reentregue não gera
-- efeito colateral duplo.
-- ----------------------------------------------------------------------------
create or replace function registrar_pagamento_gateway(
    p_origem             text,        -- 'cobranca' | 'cobranca_avulsa' | 'mensalidade'
    p_gateway_payment_id text,
    p_pago_em            timestamptz default now()
)
returns boolean
language plpgsql
as $$
declare
    v_atualizados integer;
begin
    if p_origem = 'cobranca' then
        update cobrancas
           set status = 'pago', pago_em = p_pago_em,
               tentativas = 0, proxima_tentativa_em = null, erro_gateway = null
         where gateway_payment_id = p_gateway_payment_id
           and status <> 'pago';
    elsif p_origem = 'cobranca_avulsa' then
        update cobrancas_avulsas
           set status = 'pago', pago_em = p_pago_em,
               tentativas = 0, proxima_tentativa_em = null, erro_gateway = null
         where gateway_payment_id = p_gateway_payment_id
           and status <> 'pago';
    elsif p_origem = 'mensalidade' then
        update mensalidades_petshop
           set status = 'pago', pago_em = p_pago_em,
               tentativas = 0, proxima_tentativa_em = null, erro_gateway = null
         where gateway_payment_id = p_gateway_payment_id
           and status <> 'pago';
    else
        raise exception 'registrar_pagamento_gateway: origem % desconhecida', p_origem;
    end if;

    get diagnostics v_atualizados = row_count;
    return v_atualizados > 0;
end;
$$;

comment on function registrar_pagamento_gateway(text, text, timestamptz) is
    'Marca uma cobrança (cobranca/cobranca_avulsa/mensalidade) como paga a partir do gateway_payment_id que veio no webhook. Idempotente — chamada repetida sem efeito extra.';

-- ----------------------------------------------------------------------------
-- 7. pausar_assinatura_por_inadimplencia() — mesma lógica de
--    pausarAssinatura() em app/(app)/tutores/actions.ts, só que em SQL.
--
-- Duplicada de propósito (mesmo motivo de confirmar_agendamento_por_whatsapp
-- na Fase 5): quem chama isso é a Edge Function do webhook, que roda no
-- runtime Deno e não importa Server Actions do Next.js. 'pronto' fica de
-- fora igual à versão TS — visita já em preparo não é interrompida por
-- inadimplência descoberta agora.
-- ----------------------------------------------------------------------------
create or replace function pausar_assinatura_por_inadimplencia(p_assinatura_id uuid)
returns void
language plpgsql
as $$
begin
    update assinaturas
       set status = 'pausada'
     where id = p_assinatura_id
       and status = 'ativa';

    update agendamentos
       set status = 'cancelado'
     where assinatura_id = p_assinatura_id
       and status in ('agendado', 'confirmado', 'reagendado');
end;
$$;

comment on function pausar_assinatura_por_inadimplencia(uuid) is
    'Pausa a assinatura e cancela a próxima visita pendente depois de esgotar as tentativas de cobrança (ver registrar_falha_pagamento). Espelha pausarAssinatura() em app/(app)/tutores/actions.ts — duplicada em SQL porque quem chama é a Edge Function do webhook, não o Next.js.';

-- ----------------------------------------------------------------------------
-- 8. registrar_falha_pagamento() — chamada pelo webhook quando o gateway
--    reporta falha de cobrança (cartão recusado) ou Pix expirado.
--
-- Dunning da seção 8 do plano: 1ª falha agenda retry pra D+1, 2ª falha pra
-- D+4 (a partir de agora, não da falha original), 3ª falha desiste —
-- status vira 'falhou' definitivo e, só pra origem='cobranca' (tem
-- assinatura associada; avulsa não tem o que pausar), a assinatura pausa
-- sozinha via pausar_assinatura_por_inadimplencia().
-- ----------------------------------------------------------------------------
create or replace function registrar_falha_pagamento(
    p_origem             text,       -- 'cobranca' | 'cobranca_avulsa' | 'mensalidade'
    p_gateway_payment_id text,
    p_erro                text
)
returns boolean
language plpgsql
as $$
declare
    v_tentativas   integer;
    v_assinatura_id uuid;
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
        -- Sem assinatura pra pausar aqui — avulsa que esgota tentativa fica
        -- 'falhou' e o petshop resolve na tela financeira (reenviar cobrança
        -- ou cancelar a visita).

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

    else
        raise exception 'registrar_falha_pagamento: origem % desconhecida', p_origem;
    end if;

    return v_tentativas is not null;
end;
$$;

comment on function registrar_falha_pagamento(text, text, text) is
    'Registra falha de cobrança vinda do webhook: agenda retry D+1/D+4 e, na 3ª falha, marca falhou definitivo — pausando a assinatura automaticamente quando origem=cobranca.';

-- ----------------------------------------------------------------------------
-- 9. Fechar as funções novas pra anon/authenticated — mesma razão da Fase 5
--    (0005, seção 9b): toda função Postgres nasce com EXECUTE pra PUBLIC, e
--    o PostgREST expõe isso como POST /rpc/<nome>. Essas três só devem ser
--    chamadas pela Edge Function do webhook (service_role).
-- ----------------------------------------------------------------------------
revoke execute on function registrar_pagamento_gateway(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function registrar_falha_pagamento(text, text, text) from public, anon, authenticated;
revoke execute on function pausar_assinatura_por_inadimplencia(uuid) from public, anon, authenticated;

grant execute on function registrar_pagamento_gateway(text, text, timestamptz) to service_role;
grant execute on function registrar_falha_pagamento(text, text, text) to service_role;
grant execute on function pausar_assinatura_por_inadimplencia(uuid) to service_role;

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION CONTRA QUALQUER PROJETO SUPABASE
-- (rascunho — ver docs/fase6_pagamentos.md, fatia 0 e fatia 1):
--
--  [ ] Conta no gateway aberta, sandbox acessível.
--  [ ] Migration rodada num projeto Supabase de TESTE (branch/projeto
--      descartável), não direto no projeto usado pelas Fases 1-5.
--  [ ] Testar registrar_pagamento_gateway/registrar_falha_pagamento com
--      dados fake antes de ligar o webhook de verdade.
--  [ ] Testar trg_agendamento_processar_cobranca (versão nova): criar uma
--      assinatura e uma avulsa de teste, conferir que valor_petshop sai
--      IGUAL a valor_total nas duas (não mais 97%).
--  [ ] Confirmar que agendamentos_slot_unico não quebra nenhum fluxo
--      existente (reagendamento, por exemplo, precisa liberar o slot antigo
--      antes — status vira 'reagendado', que já está fora do WHERE do
--      índice, então deveria ser seguro, mas vale testar o caminho todo).
-- ============================================================================
