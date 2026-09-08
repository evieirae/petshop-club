-- ============================================================================
-- 0029 — corrige 0028: petshops_vitrine não pode ser "security definer"
--
-- O linter do Supabase apontou (ERROR) que a view criada na 0028 herda os
-- privilégios de quem a criou (dona/service role), não de quem consulta —
-- efetivamente uma view "security definer", que é um padrão mais arriscado
-- do que RLS normal: se o filtro da view tiver um erro, ela vaza a tabela
-- inteira pra qualquer authenticated, sem a rede de segurança do RLS.
--
-- Fix: recriar a view com security_invoker=true (ela passa a rodar com o
-- privilégio de quem consulta, e portanto RESPEITA a RLS da tabela base) e
-- devolver a policy "vitrine_tutor" em petshops (removida na 0028) — sem
-- ela, a view não devolveria nenhuma linha pro tutor.
--
-- O que a 0028 quis fechar (RLS restringe linha, não coluna: um tutor podia
-- pedir petshops?select=* e ler fee_fixo_mensal/percentual_plataforma/etc)
-- continua fechado NO CAMINHO NORMAL: app/(tutor) e lib/auth/getTutorContext
-- só leem petshops_vitrine, que só expõe colunas públicas. O que muda é que
-- a trava de linha volta a ser RLS de verdade (auditável, com a rede de
-- segurança de sempre), em vez de um WHERE dentro da view rodando com
-- privilégio elevado.
-- ============================================================================

create policy "vitrine_tutor" on petshops
    for select using (
        id = (select petshop_id from tutores where id = auth_tutor_id())
    );

create or replace view public.petshops_vitrine
with (security_invoker = true) as
select
    p.id,
    p.nome,
    p.telefone,
    p.endereco,
    p.hora_abertura,
    p.hora_fechamento,
    p.hora_inicio_intervalo,
    p.hora_fim_intervalo,
    p.intervalo_agendamento_minutos
from petshops p;

comment on view public.petshops_vitrine is
    'Colunas públicas de petshops para o portal do tutor — nunca fee_fixo_mensal, '
    'percentual_plataforma, cnpj, comissao_percentual_*, fee_promocional ou ids de '
    'gateway. security_invoker=true: roda com o privilégio de quem consulta, então '
    'quem pode ver a linha continua sendo decidido pela policy "vitrine_tutor" em '
    'petshops — esta view só limita as COLUNAS. Ver migrations 0028/0029 e '
    'checklist-seguranca-producao.md #15/#17.';

grant select on public.petshops_vitrine to authenticated;
