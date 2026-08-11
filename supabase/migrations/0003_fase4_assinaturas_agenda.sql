-- ============================================================================
-- 0003 — Fase 4: assinaturas, agenda operacional e visita avulsa
--
-- Contexto: ao planejar a Fase 4 (fluxo de criar assinatura + tela de agenda
-- do dia), surgiu um caso que o schema original não cobria: cliente
-- interessado numa visita, mas sem plano nenhum — o "banho avulso" de
-- balcão. Até aqui `assinaturas.plano_id` e `agendamentos.assinatura_id` são
-- os dois `not null`, ou seja, todo agendamento pressupõe uma assinatura com
-- plano. Essa migration abre uma segunda porta pro mesmo `agendamentos`:
-- visita avulsa, sem assinatura, cobrada uma vez só (não no ciclo mensal
-- proporcional das assinaturas).
--
-- Ficou de fora de propósito, mesmo pedido: um cliente com cadastro mas
-- ainda sem NENHUM agendamento (nem assinatura, nem avulsa) não precisa de
-- tabela nova — é só um filtro (tutor com pets, zero assinatura ativa, zero
-- agendamento futuro), resolvido na consulta da tela de Agenda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. agendamentos passa a aceitar DOIS formatos de linha:
--    (a) vinculada a assinatura — comportamento original, cobrança mensal
--        proporcional via trg_agendamento_processar_cobranca.
--    (b) avulsa — tutor_id + pet_id + servico_id + preco_avulso preenchidos,
--        assinatura_id nulo, cobrança única por visita em cobrancas_avulsas.
-- O CHECK abaixo garante que é sempre um formato OU o outro, nunca os dois
-- nem nenhum — não existe agendamento "órfão" de contexto.
-- ----------------------------------------------------------------------------
alter table agendamentos
    alter column assinatura_id drop not null;

alter table agendamentos
    add column tutor_id     uuid references tutores(id),
    add column pet_id       uuid references pets(id),
    add column servico_id   uuid references servicos(id),
    add column preco_avulso numeric(10,2) check (preco_avulso >= 0);

alter table agendamentos
    add constraint agendamentos_assinatura_xor_avulsa check (
        (assinatura_id is not null and tutor_id is null and pet_id is null
            and servico_id is null and preco_avulso is null)
        or
        (assinatura_id is null and tutor_id is not null and pet_id is not null
            and servico_id is not null and preco_avulso is not null)
    );

comment on column agendamentos.assinatura_id is
    'Nulo quando a visita é avulsa (sem plano) — nesse caso tutor_id/pet_id/servico_id/preco_avulso é que descrevem a visita. Ver CHECK agendamentos_assinatura_xor_avulsa.';
comment on column agendamentos.preco_avulso is
    'Snapshot do preço no momento do agendamento (de precos_servico, pelo porte do pet) — mesma lógica de plano_precos não ser recalculado depois, pra cobrança ficar estável mesmo se o preço do serviço mudar depois.';

-- ----------------------------------------------------------------------------
-- 2. COBRANCAS_AVULSAS — cobrança de visita avulsa, tutor -> petshop.
--
-- Não reaproveitei `cobrancas` porque a semântica é bem diferente: lá é 1
-- linha por MÊS por assinatura (unique assinatura_id+competencia), valor
-- proporcional ao nº de ocorrências do mês. Aqui é 1 linha por VISITA
-- (unique agendamento_id), valor fixo = preco_avulso. Forçar isso nas
-- mesmas colunas exigiria tornar quantidade_banhos/competencia opcionais
-- sem sentido nenhum pra avulsa — tabela própria ficou mais simples de ler
-- e de dar RLS.
-- ----------------------------------------------------------------------------
create table cobrancas_avulsas (
    id                  uuid primary key default gen_random_uuid(),
    petshop_id          uuid not null references petshops(id) on delete cascade,
    agendamento_id      uuid not null references agendamentos(id) on delete cascade,
    tutor_id            uuid not null references tutores(id),
    valor_total         numeric(10,2) not null,
    valor_percentual    numeric(10,2) not null default 0,
    valor_petshop       numeric(10,2) not null,
    status              text not null default 'pendente'
                        check (status in ('pendente','pago','falhou','estornado')),
    gateway_payment_id  text,
    pago_em             timestamptz,
    criado_em           timestamptz not null default now(),
    unique (agendamento_id)
);

alter table cobrancas_avulsas enable row level security;
create policy "isolamento_petshop" on cobrancas_avulsas
    using (petshop_id = auth_petshop_id());

-- ----------------------------------------------------------------------------
-- 3. Cobrança no insert de agendamentos — branch novo pra avulsa, resto
--    idêntico ao original (0001_init.sql, seção 7/10).
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
            new.preco_avulso, v_valor_percentual, new.preco_avulso - v_valor_percentual
        )
        on conflict (agendamento_id) do nothing;

        return new;
    end if;

    -- A partir daqui, lógica original de assinatura (mensal proporcional) —
    -- inalterada.
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
        v_qtd_banhos, v_valor_total, v_valor_percentual, v_valor_total - v_valor_percentual
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
-- 4. Avanço de ciclo — só faz sentido pra assinatura. Visita avulsa não tem
--    "próxima" automática (cada uma é agendada na mão, uma de cada vez).
-- ----------------------------------------------------------------------------
create or replace function trg_agendamento_resolvido()
returns trigger
language plpgsql
as $$
begin
    if new.assinatura_id is not null
       and new.status in ('entregue','faltou','cancelado')
       and old.status is distinct from new.status then
        perform gerar_proximo_agendamento(new.assinatura_id, new.data_hora);
    end if;
    return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Carimbo automático de confirmado_em — a mesma trigger que já carimbava
--    pronto_em/entregue_em (trg_pet_pronto_lembrete, ver 0001_init.sql seção
--    9) ganha o terceiro carimbo. Faz sentido centralizar aqui: hoje quem
--    confirma é a equipe pela tela de Agenda (Fase 4); na Fase 5, quando o
--    tutor confirmar pelo link do WhatsApp, a rota pública só precisa dar
--    UPDATE status='confirmado' e o carimbo sai de graça, sem duplicar lógica.
-- ----------------------------------------------------------------------------
create or replace function trg_pet_pronto_lembrete()
returns trigger
language plpgsql
as $$
begin
    if new.status = 'confirmado' and old.status is distinct from 'confirmado' then
        new.confirmado_em := coalesce(new.confirmado_em, now());
    end if;

    if new.status = 'pronto' and old.status is distinct from 'pronto' then
        new.pronto_em := coalesce(new.pronto_em, now());
        insert into lembretes (agendamento_id, tipo, destinatario, papel_destino, canal, status)
        values (new.id, 'pet_pronto', 'tutor', 'busca_entrega', 'whatsapp', 'pendente');
    end if;

    if new.status = 'entregue' and old.status is distinct from 'entregue' then
        new.entregue_em := coalesce(new.entregue_em, now());
    end if;

    return new;
end;
$$;

-- Nenhum dos dois triggers muda de nome/tabela — CREATE OR REPLACE FUNCTION
-- já é suficiente, as triggers existentes (trg_agendamentos_resolvido,
-- trg_agendamentos_pet_pronto, trg_agendamentos_processar_cobranca) continuam
-- apontando pra elas sem precisar recriar.

-- ============================================================================
-- NOTA PRA FASE 5 (lembretes automáticos via WhatsApp)
--
-- resolver_contato() e a lógica de papel_destino (seção 5 de
-- regras_padrao_petshop.md) resolvem o contato a partir de um tutor_id. Pra
-- lembretes de agendamento avulso, esse tutor_id vem direto de
-- agendamentos.tutor_id; pra lembretes de assinatura, vem de
-- agendamentos.assinatura_id -> assinaturas.tutor_id. Quem for implementar o
-- envio de fato precisa ramificar por ali — não dá pra assumir só um caminho.
-- ============================================================================
