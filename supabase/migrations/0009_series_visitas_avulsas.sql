-- ============================================================================
-- 0009 — Série de visitas avulsas (recorrência sem plano)
--
-- Motivação: a Agenda passou a ter um seletor "Única / Recorrente" na hora
-- de agendar (estilo Google Meet). Recorrente tem dois caminhos:
--
--   (a) POR PLANO       → cria uma linha em `assinaturas`. Já existia, não
--                         muda nada aqui: o plano é quem carrega
--                         intervalo_dias, serviços inclusos e preço por
--                         porte, e a cobrança é a mensal proporcional.
--   (b) REPETIÇÃO LIVRE → é o que esta migration habilita. O petshop escolhe
--                         "a cada 7/14/21/28 dias, N vezes" sem vincular a
--                         plano nenhum. Cada visita continua sendo uma
--                         avulsa comum: 1 cobrança por visita em
--                         cobrancas_avulsas, preço pelo porte do pet.
--
-- ----------------------------------------------------------------------------
-- POR QUE GERAR UMA DE CADA VEZ, E NÃO AS N DE UMA VEZ
-- ----------------------------------------------------------------------------
-- trg_agendamentos_processar_cobranca é AFTER INSERT (0001_init.sql, seção
-- 11). Inserir as 12 ocorrências de uma vez criaria as 12 linhas em
-- cobrancas_avulsas no mesmo instante — e processar-cobrancas/index.ts drena
-- TODA cobrança com status='pendente', sem filtro de data. O tutor levaria
-- 12 cobranças no cartão no dia em que a série foi criada.
--
-- Então a série segue exatamente o mesmo modelo que a assinatura já usa: só
-- existe UMA visita futura por vez, e a próxima nasce quando a atual chega a
-- um estado terminal (gerar_proximo_agendamento, 0001_init.sql seção 8). A
-- diferença é só de onde vem o intervalo — do plano, na assinatura; da
-- própria linha, na série.
--
-- Consequência de UX, de propósito: a agenda não mostra as N ocorrências
-- futuras de uma vez, só a próxima. É o mesmo comportamento das assinaturas,
-- e é o que mantém a cobrança honesta (uma por visita, na data da visita).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas de série
-- ----------------------------------------------------------------------------
alter table agendamentos
    add column if not exists serie_id             uuid,
    add column if not exists serie_intervalo_dias smallint,
    add column if not exists serie_restantes      smallint;

alter table agendamentos
    drop constraint if exists agendamentos_serie_intervalo_positivo;
alter table agendamentos
    add constraint agendamentos_serie_intervalo_positivo
    check (serie_intervalo_dias is null or serie_intervalo_dias > 0);

alter table agendamentos
    drop constraint if exists agendamentos_serie_restantes_nao_negativo;
alter table agendamentos
    add constraint agendamentos_serie_restantes_nao_negativo
    check (serie_restantes is null or serie_restantes >= 0);

-- As três colunas andam juntas: ou a visita faz parte de uma série (as três
-- preenchidas) ou não faz (as três nulas). Sem meio-termo, pra não existir
-- linha "de série" que o trigger não sabe continuar.
alter table agendamentos
    drop constraint if exists agendamentos_serie_completa;
alter table agendamentos
    add constraint agendamentos_serie_completa check (
        (serie_id is null and serie_intervalo_dias is null and serie_restantes is null)
        or
        (serie_id is not null and serie_intervalo_dias is not null and serie_restantes is not null)
    );

-- Série é conceito de visita avulsa. Quem tem plano tem assinatura, e a
-- recorrência vem de planos.intervalo_dias — dois donos pro mesmo intervalo
-- seria ambiguidade garantida.
alter table agendamentos
    drop constraint if exists agendamentos_serie_so_avulsa;
alter table agendamentos
    add constraint agendamentos_serie_so_avulsa
    check (serie_id is null or assinatura_id is null);

comment on column agendamentos.serie_id is
    'Agrupa as visitas geradas por uma mesma repetição livre (recorrência avulsa, sem plano). Null = visita única ou visita de assinatura. Usado pra cancelar a série inteira de uma vez.';
comment on column agendamentos.serie_intervalo_dias is
    'De quantos em quantos dias a série se repete. Equivale a planos.intervalo_dias, mas pra recorrência sem plano.';
comment on column agendamentos.serie_restantes is
    'Quantas ocorrências ainda devem ser geradas DEPOIS desta. Chega a 0 e a série acaba sozinha. Zerar essa coluna é o jeito de encerrar uma série sem cancelar a visita já marcada.';

-- Busca por série (cancelar/listar a série inteira). Parcial porque a
-- esmagadora maioria das linhas tem serie_id nulo.
create index if not exists idx_agendamentos_serie
    on agendamentos (serie_id, data_hora)
    where serie_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Geração da próxima ocorrência da série
--
-- Espelha gerar_proximo_agendamento (assinatura), com duas diferenças:
--   - o intervalo vem da própria linha, não do plano;
--   - o preço é RE-CONSULTADO em precos_servico na hora de gerar, não
--     copiado da visita anterior. Uma série pode durar meses; cobrar hoje o
--     preço da tabela de três meses atrás seria errado. Se o serviço perdeu
--     o preço pro porte do pet nesse meio tempo, cai no preço anterior como
--     fallback — melhor manter a série viva com o último preço conhecido do
--     que interromper a recorrência do cliente calado.
-- ----------------------------------------------------------------------------
create or replace function gerar_proxima_visita_serie(p_agendamento_id uuid)
returns void
language plpgsql
as $$
declare
    v_atual        agendamentos%rowtype;
    v_porte_id     smallint;
    v_preco        numeric(10,2);
    v_proxima_data timestamptz;
begin
    select * into v_atual from agendamentos where id = p_agendamento_id;

    if v_atual.serie_id is null or coalesce(v_atual.serie_restantes, 0) <= 0 then
        return;
    end if;

    v_proxima_data := v_atual.data_hora + make_interval(days => v_atual.serie_intervalo_dias);

    select porte_id into v_porte_id from pets where id = v_atual.pet_id;

    select preco into v_preco
      from precos_servico
     where servico_id = v_atual.servico_id
       and porte_id   = v_porte_id;

    -- Fallback: mantém o preço da visita anterior se a tabela mudou.
    v_preco := coalesce(v_preco, v_atual.preco_avulso);

    insert into agendamentos (
        petshop_id, tutor_id, pet_id, servico_id, preco_avulso,
        data_hora, status,
        serie_id, serie_intervalo_dias, serie_restantes
    ) values (
        v_atual.petshop_id, v_atual.tutor_id, v_atual.pet_id, v_atual.servico_id, v_preco,
        v_proxima_data, 'agendado',
        v_atual.serie_id, v_atual.serie_intervalo_dias, v_atual.serie_restantes - 1
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Avanço de ciclo — agora cobre os DOIS tipos de recorrência
--
-- Substitui a versão de 0003 (seção 4). A parte de assinatura está idêntica;
-- o que entrou foi o `elsif` da série. Os dois nunca colidem: o CHECK
-- agendamentos_serie_so_avulsa garante que uma linha não é as duas coisas.
--
-- Como encerrar uma série: zere serie_restantes NO MESMO UPDATE que cancela
-- a visita. O trigger é AFTER UPDATE e lê NEW, então enxerga 0 e não gera a
-- próxima. Cancelar a visita SEM zerar continua gerando a próxima — que é o
-- certo pra "cancelar só esta ocorrência", mesma distinção documentada em
-- app/(app)/tutores/actions.ts entre cancelar 1 visita e cancelar a
-- assinatura inteira.
-- ----------------------------------------------------------------------------
create or replace function trg_agendamento_resolvido()
returns trigger
language plpgsql
as $$
begin
    if new.status not in ('entregue','faltou','cancelado')
       or old.status is not distinct from new.status then
        return new;
    end if;

    if new.assinatura_id is not null then
        perform gerar_proximo_agendamento(new.assinatura_id, new.data_hora);
    elsif new.serie_id is not null and coalesce(new.serie_restantes, 0) > 0 then
        perform gerar_proxima_visita_serie(new.id);
    end if;

    return new;
end;
$$;
