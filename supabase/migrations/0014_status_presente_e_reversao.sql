-- ============================================================================
-- 0014 — Status "Presente", log de eventos de status, e desfazer clique
--        errado no quadro de visitas do dia
--
-- Contexto (pedido de 18/ago/2026, depois de ver o quadro de botões da
-- Visão Geral rodando): faltava um status entre "confirmado" (pet ainda não
-- chegou) e "pronto" (atendimento já terminou) — o momento em que o pet está
-- fisicamente na loja, no banho/tosa. Junto vieram dois pedidos:
--   a) registrar o timestamp de toda mudança de status, pra dar métrica
--      futura de quanto tempo cada visita fica em cada etapa;
--   b) um jeito de desfazer um clique errado no quadro (voltar um passo).
--
-- Fluxo do quadro (Visão Geral e, opcionalmente, Agenda) a partir de agora:
--   agendado/confirmado/reagendado -> presente -> pronto -> entregue
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. agendamentos.status ganha 'presente'.
--
-- O nome do constraint (`agendamentos_status_check`) é o padrão que o
-- Postgres dá sozinho pra um `check` inline de coluna — mesma dedução já
-- usada em 0005 pra `lembretes_status_check` (também nascido inline em
-- 0001_init.sql).
-- ----------------------------------------------------------------------------
alter table agendamentos drop constraint if exists agendamentos_status_check;
alter table agendamentos add constraint agendamentos_status_check
    check (status in ('agendado','confirmado','presente','pronto','entregue','faltou','reagendado','cancelado'));

-- ----------------------------------------------------------------------------
-- 2. Log append-only de toda mudança de status (item "a" do pedido).
--
-- petshop_id fica denormalizado (copiado de agendamentos.petshop_id na hora
-- do INSERT) pra RLS direta, sem subquery — mesmo racional de `produtos`/
-- `vendas` (migration 0012) em vez do padrão indireto mais antigo de
-- `lembretes` (0005).
--
-- `origem` é calculado sozinho pela trigger, comparando um "rank" simples do
-- fluxo (agendado/confirmado/reagendado=0, presente=1, pronto=2,
-- entregue=3): rank subindo = 'avanco', rank descendo = 'reversao'. Serve
-- pra quem for consumir isso depois filtrar reversões fora de uma métrica de
-- "tempo até ficar pronto", por exemplo.
-- ----------------------------------------------------------------------------
create table agendamento_status_eventos (
    id             uuid primary key default gen_random_uuid(),
    petshop_id     uuid not null references petshops(id) on delete cascade,
    agendamento_id uuid not null references agendamentos(id) on delete cascade,
    status         text not null
                   check (status in ('agendado','confirmado','presente','pronto','entregue','faltou','reagendado','cancelado')),
    origem         text not null default 'outro' check (origem in ('avanco','reversao','outro')),
    criado_em      timestamptz not null default now()
);

create index agendamento_status_eventos_agendamento_id_idx
    on agendamento_status_eventos (agendamento_id, criado_em);

alter table agendamento_status_eventos enable row level security;

create policy "isolamento_petshop" on agendamento_status_eventos
    using (petshop_id = auth_petshop_id());

comment on table agendamento_status_eventos is
    'Log append-only de toda mudança de status em agendamentos (inclusive reversões) — 18/ago/2026, base pra métrica futura de quanto tempo cada visita fica em cada status. Gerado sozinho por trg_agendamentos_status_evento; nenhuma tela escreve aqui direto.';

create or replace function trg_registrar_evento_status()
returns trigger
language plpgsql
as $$
declare
    v_rank_antigo integer := 0;
    v_rank_novo   integer;
    v_origem      text;
begin
    if TG_OP = 'UPDATE' then
        if old.status is not distinct from new.status then
            return new;  -- UPDATE que não mexeu em status (ex.: reagendar só troca data_hora) não gera evento
        end if;
        v_rank_antigo := case old.status
            when 'presente' then 1 when 'pronto' then 2 when 'entregue' then 3 else 0 end;
    end if;

    v_rank_novo := case new.status
        when 'presente' then 1 when 'pronto' then 2 when 'entregue' then 3 else 0 end;

    v_origem := case
        when TG_OP = 'INSERT' then 'outro'
        when new.status in ('faltou','cancelado') then 'outro'
        when v_rank_novo > v_rank_antigo then 'avanco'
        when v_rank_novo < v_rank_antigo then 'reversao'
        else 'outro'
    end;

    insert into agendamento_status_eventos (petshop_id, agendamento_id, status, origem)
    values (new.petshop_id, new.id, new.status, v_origem);

    return new;
end;
$$;

create trigger trg_agendamentos_status_evento
    after insert or update of status on agendamentos
    for each row execute function trg_registrar_evento_status();

-- ----------------------------------------------------------------------------
-- 3. trg_pet_pronto_lembrete() ganha um guard: voltar de 'entregue' pra
--    'pronto' (via voltar_status_agendamento(), item 4) NÃO deve reenviar o
--    aviso "pet pronto pra buscar" — o tutor já recebeu essa mensagem quando
--    chegou em 'pronto' da primeira vez. Sem o `and old.status is distinct
--    from 'entregue'`, desfazer um clique errado mandaria a mensagem de novo
--    (e reescreveria pronto_em com o timestamp errado).
-- ----------------------------------------------------------------------------
create or replace function trg_pet_pronto_lembrete()
returns trigger
language plpgsql
as $$
declare
    v_contato record;
begin
    if new.status = 'confirmado' and old.status is distinct from 'confirmado' then
        new.confirmado_em := coalesce(new.confirmado_em, now());
    end if;

    if new.status = 'pronto'
       and old.status is distinct from 'pronto'
       and old.status is distinct from 'entregue' then
        new.pronto_em := coalesce(new.pronto_em, now());

        select * into v_contato from resolver_contato(
            case when new.assinatura_id is not null
                then (select tutor_id from assinaturas where id = new.assinatura_id)
                else new.tutor_id
            end,
            'busca_entrega'
        );

        insert into lembretes (agendamento_id, tipo, destinatario, papel_destino, canal, status, telefone_destino, nome_destino)
        values (new.id, 'pet_pronto', 'tutor', 'busca_entrega', 'whatsapp', 'pendente', v_contato.telefone, v_contato.nome);
    end if;

    if new.status = 'entregue' and old.status is distinct from 'entregue' then
        new.entregue_em := coalesce(new.entregue_em, now());

        select * into v_contato from resolver_contato(
            case when new.assinatura_id is not null
                then (select tutor_id from assinaturas where id = new.assinatura_id)
                else new.tutor_id
            end,
            'busca_entrega'
        );

        insert into lembretes (agendamento_id, tipo, destinatario, papel_destino, canal, status, telefone_destino, nome_destino)
        values (new.id, 'pet_entregue', 'tutor', 'busca_entrega', 'whatsapp', 'pendente', v_contato.telefone, v_contato.nome);
    end if;

    return new;
end;
$$;

comment on function trg_pet_pronto_lembrete() is
    'Carimba confirmado_em/pronto_em/entregue_em e gera o lembrete de WhatsApp correspondente (pet_pronto, pet_entregue). Desde a 0014, o branch de "pronto" ignora a transição vinda de "entregue" — isso é voltar_status_agendamento() desfazendo um clique errado, não um novo atendimento, então não reenvia aviso nem reescreve pronto_em.';

-- ----------------------------------------------------------------------------
-- 4. Desfazer um clique errado (item "b" do pedido) — um passo por chamada:
--    entregue -> pronto -> presente -> agendado.
--
-- SEM security definer de propósito: roda com o privilégio de quem chama
-- (o usuário logado da equipe), então a policy "isolamento_petshop" de
-- agendamentos já barra tentativa de mexer em agendamento de outro petshop
-- — mesma proteção que `.from("agendamentos").update(...)` já tem hoje em
-- mudarStatus() (app/(app)/agenda/actions.ts), sem precisar reimplementar a
-- checagem aqui.
--
-- Limpa o lembrete ainda 'pendente' gerado pela transição desfeita
-- (pet_pronto ao voltar de pronto, pet_entregue ao voltar de entregue) —
-- evita mandar um aviso de um clique que já foi corrigido antes do pg_cron
-- passar (a cada 2min). Se o lembrete já tiver saído (status != 'pendente'),
-- não tem mais o que fazer — a mensagem já chegou no WhatsApp do tutor.
--
-- NÃO desfaz outros efeitos colaterais de já ter chegado em 'entregue' (ex.:
-- próxima visita de assinatura já gerada, cobrança já criada por outras
-- triggers) — é undo do status/aviso, não rollback transacional completo do
-- que aconteceu desde então. Pra esse caso raro, a correção é manual
-- (Agenda), igual qualquer outro ajuste fora do comum.
-- ----------------------------------------------------------------------------
create or replace function voltar_status_agendamento(p_agendamento_id uuid)
returns text
language plpgsql
as $$
declare
    v_atual text;
    v_novo  text;
begin
    select status into v_atual from agendamentos where id = p_agendamento_id for update;

    if not found then
        return null;
    end if;

    v_novo := case v_atual
        when 'entregue' then 'pronto'
        when 'pronto' then 'presente'
        when 'presente' then 'agendado'
        else null
    end;

    if v_novo is null then
        return null;
    end if;

    update agendamentos set status = v_novo where id = p_agendamento_id;

    if v_atual in ('pronto', 'entregue') then
        delete from lembretes
         where agendamento_id = p_agendamento_id
           and status = 'pendente'
           and tipo = case v_atual when 'pronto' then 'pet_pronto' when 'entregue' then 'pet_entregue' end;
    end if;

    return v_novo;
end;
$$;

comment on function voltar_status_agendamento(uuid) is
    'Desfaz um clique errado no quadro de status (Visão Geral/Agenda): entregue->pronto->presente->agendado, um passo por chamada. Cancela o lembrete de WhatsApp ainda pendente da transição desfeita, mas não desfaz outros efeitos colaterais já disparados (próxima visita de assinatura, cobrança). Retorna o novo status, ou null se não havia passo anterior (já em agendado, é faltou/cancelado, ou o agendamento não é visível pro chamador via RLS).';
