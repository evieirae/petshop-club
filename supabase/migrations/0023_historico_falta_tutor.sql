-- ============================================================================
-- 0023 — Histórico de falta por tutor
--
-- Contexto (30/ago/2026): o discurso de venda promete "previsão de faltas",
-- mas o app não tinha nada disso — só a taxa de comparecimento agregada do
-- mês, no painel. Não existia nenhuma leitura por TUTOR, que é o que a equipe
-- do balcão precisa pra agir.
--
-- Esta migration NÃO cria um modelo de previsão, e é de propósito. O que ela
-- entrega é uma contagem honesta e explicável — "faltou 2 das últimas 6" —
-- que a equipe entende, confere e confia. Um score opaco de 0 a 100 seria
-- mais impressionante numa demo e menos útil no balcão, além de prometer uma
-- precisão que 6 pontos de dado não sustentam.
--
-- Nenhuma tabela nova: tudo sai de `agendamentos.status`, que já registra
-- 'faltou' desde a 0001.
--
-- ----------------------------------------------------------------------------
-- Decisões de desenho
--
-- 1. SÓ VISITAS RESOLVIDAS. Conta apenas status 'entregue' e 'faltou' — mesma
--    base da taxa de comparecimento do painel (app/(app)/painel/page.tsx).
--    Visita ainda em aberto não é acerto nem erro, e 'cancelado' foi um
--    combinado, não um furo. Manter as duas telas na mesma base evita a
--    pergunta "por que o painel diz 90% e a agenda acusa esse tutor?".
--
-- 2. JANELA DE 6, NÃO HISTÓRICO INTEIRO. Quem faltou 3 vezes há um ano e vem
--    certinho há seis meses não é risco — é cliente recuperado. A janela
--    móvel esquece o passado distante sozinha, sem ninguém precisar zerar
--    nada na mão.
--
-- 3. MÍNIMO DE 3 VISITAS. Com uma visita e uma falta a taxa é 100%, o que é
--    aritmeticamente verdade e operacionalmente inútil. Abaixo de 3
--    resolvidas o nível é 'sem_historico' — a tela não mostra selo nenhum, em
--    vez de mostrar um alarme falso pro cliente novo.
--
-- 4. TUTOR VEM DOS DOIS CAMINHOS. Visita de assinatura guarda o tutor em
--    `assinaturas.tutor_id`; avulsa guarda em `agendamentos.tutor_id` (0003).
--    O coalesce cobre os dois, igual ao que trg_pet_pronto_lembrete() já faz.
--
-- 5. security_invoker. A view roda com a permissão de quem consulta, então a
--    RLS de `agendamentos` continua valendo — um petshop não enxerga o
--    histórico do outro. Sem isso, uma view é um buraco na RLS.
-- ============================================================================

create or replace view historico_falta_tutor
with (security_invoker = on)
as
with resolvidas as (
    select
        coalesce(asg.tutor_id, a.tutor_id) as tutor_id,
        a.petshop_id,
        a.data_hora,
        (a.status = 'faltou')              as faltou,
        row_number() over (
            partition by coalesce(asg.tutor_id, a.tutor_id)
            order by a.data_hora desc
        )                                   as pos
    from agendamentos a
    left join assinaturas asg on asg.id = a.assinatura_id
    where a.status in ('entregue', 'faltou')
      and coalesce(asg.tutor_id, a.tutor_id) is not null
),
agregado as (
    select
        tutor_id,
        petshop_id,
        count(*)::int                                          as visitas_resolvidas,
        count(*) filter (where faltou)::int                    as faltas_total,
        count(*) filter (where pos <= 6)::int                  as janela,
        count(*) filter (where pos <= 6 and faltou)::int       as faltas_janela,
        max(data_hora) filter (where faltou)                   as ultima_falta_em
    from resolvidas
    group by tutor_id, petshop_id
)
select
    tutor_id,
    petshop_id,
    visitas_resolvidas,
    faltas_total,
    janela                as janela_considerada,
    faltas_janela,
    ultima_falta_em,
    case when janela > 0
         then round(faltas_janela::numeric / janela, 4)
    end                   as taxa_falta_janela,
    case
        when visitas_resolvidas < 3 then 'sem_historico'
        when faltas_janela = 0      then 'ok'
        when faltas_janela = 1      then 'atencao'
        else 'alto'
    end                   as nivel
from agregado;

comment on view historico_falta_tutor is
    'Histórico de falta por tutor, para o selo de atenção na Agenda (0023). Conta só visitas resolvidas (entregue/faltou), numa janela móvel das 6 últimas. nivel: sem_historico (<3 resolvidas, não mostra selo), ok (0 faltas na janela), atencao (1), alto (2+). Não é previsão nem score — é contagem explicável, do tipo que a equipe do balcão confere e confia. security_invoker=on mantém a RLS de agendamentos valendo.';

-- ----------------------------------------------------------------------------
-- Índice de apoio
--
-- A view varre agendamentos filtrando por status resolvido e ordenando por
-- data. Parcial porque 'entregue'/'faltou' são uma fração do total — não faz
-- sentido indexar visita ainda em aberto, que é justamente a que muda o tempo
-- todo.
-- ----------------------------------------------------------------------------
create index if not exists idx_agendamentos_resolvidos_tutor
    on agendamentos (petshop_id, data_hora desc)
    where status in ('entregue', 'faltou');

-- ----------------------------------------------------------------------------
-- Como a Agenda usa
--
--   select tutor_id, nivel, faltas_janela, janela_considerada
--     from historico_falta_tutor
--    where petshop_id = <petshop>
--      and nivel in ('atencao','alto');
--
-- Uma consulta por semana carregada, não uma por célula. O componente
-- SeloRiscoFalta recebe o mapa pronto.
-- ----------------------------------------------------------------------------
