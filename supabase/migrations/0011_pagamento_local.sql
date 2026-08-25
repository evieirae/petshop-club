-- ============================================================================
-- 0011 — Pagamento "no local"
--
-- Motivação (pedido do dono, 18/ago/2026): presencialmente é mais barato pro
-- tutor do que pagar pela plataforma (sem a taxa de serviço do Asaas), e o
-- petshop não pode obrigar ninguém a pagar pelo sistema só porque é mais
-- cômodo pra ele. "Infelizmente não posso obrigar o cliente a pagar pelo meu
-- sistema sendo que presencialmente é mais barato. Ganho pela comodidade e
-- não pela obrigação." Esta migration dá pra toda cobrança (assinatura OU
-- avulsa) uma 3ª forma de pagamento, além de cartão/Pix pelo Asaas (Fase 6,
-- 0006_fase6_pagamentos.sql) — sem passar pelo gateway, sem taxa nenhuma
-- somada ao tutor.
--
-- Isso NÃO é uma forma de pagamento a mais dentro do fluxo do gateway — é o
-- bypass inteiro dele. Quando forma_pagamento = 'local': valor_percentual e
-- valor_taxa_gateway zeram (a plataforma não cobra comissão numa cobrança
-- que ela não processou — mesma lógica de "ganho pela comodidade, não pela
-- obrigação"), valor_cobrado_tutor = valor_total (o tutor paga só o preço do
-- serviço, sem acréscimo), e status vai direto pra 'pago' quando o dinheiro é
-- confirmado no balcão — sem 'processando'/'aguardando_pagamento', que só
-- existem pro ciclo do gateway.
--
-- Igual à 0006 (que é rascunho — ver checklist no fim dela), esta migration
-- também não foi testada contra um projeto Supabase de verdade.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tutores.forma_pagamento_preferida ganha 'local' — é essa preferência
--    que o trigger da seção 3 usa pra já nascer a cobrança marcada (o balcão
--    ainda pode trocar por cobrança individual, ver marcar_pagamento_local
--    no fim do arquivo).
-- ----------------------------------------------------------------------------
alter table tutores drop constraint if exists tutores_forma_pagamento_preferida_check;
alter table tutores add constraint tutores_forma_pagamento_preferida_check
    check (forma_pagamento_preferida in ('cartao', 'pix', 'local'));

-- ----------------------------------------------------------------------------
-- 2. forma_pagamento por cobrança — só em cobrancas/cobrancas_avulsas, as
--    duas tabelas com split (o tutor paga, a plataforma tem comissão).
--    mensalidades_petshop fica de fora, mesmo motivo da 0006 seção 2b: quem
--    paga ali é o petshop pra plataforma — "pagamento local" não se aplica.
-- ----------------------------------------------------------------------------
alter table cobrancas add column forma_pagamento text
    check (forma_pagamento in ('cartao', 'pix', 'local'));
alter table cobrancas_avulsas add column forma_pagamento text
    check (forma_pagamento in ('cartao', 'pix', 'local'));

comment on column cobrancas.forma_pagamento is
    'Como esta cobrança específica foi/vai ser paga. Nasce copiada de tutores.forma_pagamento_preferida (trigger), mas o balcão pode trocar por cobrança individual — ver marcar_pagamento_local(). Null só em cobrança criada antes desta migration.';
comment on column cobrancas_avulsas.forma_pagamento is
    'Mesma coisa de cobrancas.forma_pagamento, por visita avulsa.';

-- ----------------------------------------------------------------------------
-- 3. trg_agendamento_processar_cobranca() — nova versão (mesmo padrão de
--    versionamento da 0003/0006: nunca edita a função já aplicada, substitui
--    por CREATE OR REPLACE). Única mudança de verdade: além de tudo que a
--    versão da 0006 já fazia, agora copia a preferência do tutor pra
--    forma_pagamento e, quando ela é 'local', já zera a taxa de serviço na
--    hora — não tem por que esperar um processar-cobrancas futuro decidir
--    depois algo que já sabemos de antemão.
-- ----------------------------------------------------------------------------
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
    v_forma_pagamento     text;
begin
    -- Visita avulsa: cobrança única, sem ciclo mensal. O valor já vem
    -- travado em new.preco_avulso (definido pela Server Action no momento
    -- da criação, a partir de precos_servico pelo porte do pet).
    if new.assinatura_id is null then
        select percentual_plataforma into v_percentual
          from petshops where id = new.petshop_id;

        select forma_pagamento_preferida into v_forma_pagamento
          from tutores where id = new.tutor_id;

        v_valor_percentual := round(new.preco_avulso * v_percentual, 2);

        insert into cobrancas_avulsas (
            petshop_id, agendamento_id, tutor_id,
            valor_total, valor_percentual, valor_petshop,
            forma_pagamento, valor_taxa_gateway, valor_cobrado_tutor
        ) values (
            new.petshop_id, new.id, new.tutor_id,
            new.preco_avulso,
            case when v_forma_pagamento = 'local' then 0 else v_valor_percentual end,
            new.preco_avulso,
            v_forma_pagamento,
            case when v_forma_pagamento = 'local' then 0 else null end,
            case when v_forma_pagamento = 'local' then new.preco_avulso else null end
        )
        on conflict (agendamento_id) do nothing;

        return new;
    end if;

    -- A partir daqui, lógica original de assinatura (mensal proporcional) —
    -- inalterada, exceto forma_pagamento/valor_taxa_gateway/valor_cobrado_tutor.
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

    select forma_pagamento_preferida into v_forma_pagamento
      from tutores where id = v_assinatura.tutor_id;

    insert into cobrancas (
        petshop_id, assinatura_id, agendamento_gatilho_id, competencia,
        quantidade_banhos, valor_total, valor_percentual, valor_petshop,
        forma_pagamento, valor_taxa_gateway, valor_cobrado_tutor
    ) values (
        new.petshop_id, new.assinatura_id, new.id, v_competencia,
        v_qtd_banhos, v_valor_total,
        case when v_forma_pagamento = 'local' then 0 else v_valor_percentual end,
        v_valor_total,
        v_forma_pagamento,
        case when v_forma_pagamento = 'local' then 0 else null end,
        case when v_forma_pagamento = 'local' then v_valor_total else null end
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
-- 4. marcar_pagamento_local() — chamada pela TELA (Financeiro), não pelo
--    webhook: diferente de registrar_pagamento_gateway/registrar_falha_
--    pagamento (0006, seções 6-8), que são REVOKE de authenticated porque só
--    a Edge Function do webhook deveria chamá-las, esta função nasce com
--    EXECUTE aberto (padrão do Postgres) de propósito — é a própria equipe
--    do petshop, autenticada, confirmando que recebeu o dinheiro no balcão.
--
--    SECURITY INVOKER é o padrão (não especificado = invoker), então o
--    UPDATE dentro dela roda com o papel de quem chamou — a RLS de
--    isolamento_petshop já embutida em cobrancas/cobrancas_avulsas garante
--    sozinha que ninguém marca cobrança de outro petshop como paga, mesmo
--    sabendo o id, sem precisar checar petshop_id explicitamente aqui.
--
--    Idempotente: chamar de novo não causa efeito colateral, só reconfirma.
-- ----------------------------------------------------------------------------
create or replace function marcar_pagamento_local(
    p_origem text,     -- 'cobranca' | 'cobranca_avulsa'
    p_id      uuid
)
returns boolean
language plpgsql
as $$
declare
    v_atualizados integer;
begin
    if p_origem = 'cobranca' then
        update cobrancas
           set forma_pagamento     = 'local',
               status               = 'pago',
               pago_em              = now(),
               valor_percentual     = 0,
               valor_taxa_gateway   = 0,
               valor_cobrado_tutor  = valor_total,
               tentativas           = 0,
               proxima_tentativa_em = null,
               erro_gateway         = null
         where id = p_id;
    elsif p_origem = 'cobranca_avulsa' then
        update cobrancas_avulsas
           set forma_pagamento     = 'local',
               status               = 'pago',
               pago_em              = now(),
               valor_percentual     = 0,
               valor_taxa_gateway   = 0,
               valor_cobrado_tutor  = valor_total,
               tentativas           = 0,
               proxima_tentativa_em = null,
               erro_gateway         = null
         where id = p_id;
    else
        raise exception 'marcar_pagamento_local: origem % desconhecida', p_origem;
    end if;

    get diagnostics v_atualizados = row_count;
    return v_atualizados > 0;
end;
$$;

comment on function marcar_pagamento_local(text, uuid) is
    'Marca uma cobrança (assinatura ou avulsa) como paga no local — sem gateway, sem taxa de serviço somada ao tutor. Chamada pela tela (Financeiro), autenticada — SECURITY INVOKER, respeita isolamento_petshop normalmente. Diferente de registrar_pagamento_gateway (0006), esta NÃO é restrita a service_role.';

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION (mesmo cuidado da 0006 — rascunho
-- nunca testado contra um projeto Supabase de verdade):
--
--  [ ] Rodar 0009 e 0010 antes desta (dependem de agendamentos.serie_* e
--      pets.especie não existirem ainda não bloqueia esta migration, mas a
--      ordem numérica dos arquivos pressupõe que já rodaram).
--  [ ] Criar uma visita avulsa de teste com um tutor cujo
--      forma_pagamento_preferida = 'local' e conferir que a
--      cobranca_avulsa já nasce com valor_percentual = 0 e
--      forma_pagamento = 'local'.
--  [ ] Chamar marcar_pagamento_local('cobranca_avulsa', <id>) numa cobrança
--      'cartao'/'pix' pendente e conferir que ela vira 'pago', zera a taxa e
--      valor_cobrado_tutor = valor_total.
-- ============================================================================
