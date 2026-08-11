-- ============================================================================
-- 0002 — Administração da plataforma (taxas editáveis só pelo dono do app)
--
-- Contexto: ate aqui, qualquer usuario com papel='dono' de um petshop podia
-- editar fee_fixo_mensal/percentual_plataforma/isento_fee_ate do proprio
-- petshop pela tela de Configuracoes — e, tecnicamente, tambem via chamada
-- direta a API do Supabase (a RLS de `petshops` so restringe por LINHA, nao
-- por coluna, entao esconder o campo na tela nao bloqueava de verdade).
-- Esses 3 campos sao a receita da plataforma: quem decide o valor tem que
-- ser SO quem opera a plataforma, nunca o petshop parceiro — o petshop deve
-- so ser avisado/notificado do que esta sendo cobrado (ver
-- docs/regras_padrao_petshop.md, secao 3).
--
-- Reaproveita o MESMO login/tela de sempre (usuarios_petshop), sem sistema
-- de auth separado: uma linha marcada com eh_admin_plataforma=true passa a
-- enxergar e editar `petshops` de QUALQUER petshop (nao so o proprio); os
-- demais continuam limitados ao proprio petshop, como sempre.
--
-- Reforcado em dois niveis, nao so escondido na tela:
--   1. RLS em `petshops` passa a liberar SELECT/UPDATE tambem pra quem tem
--      auth_admin_plataforma() = true, alem da regra de sempre (petshop_id
--      = auth_petshop_id()).
--   2. Trigger BEFORE UPDATE bloqueia a alteracao especifica das 3 colunas
--      de taxa por qualquer um que nao seja admin — mesmo que alguem chame
--      a API do Supabase direto, fora da tela de Configuracoes, o UPDATE e
--      rejeitado no banco. app/(app)/configuracoes/actions.ts (equipe do
--      petshop) nem envia mais essas 3 colunas; quem edita de verdade e
--      app/(app)/admin/actions.ts, so acessivel a quem tem a flag.
--
-- Como marcar alguem como admin: nao existe UI de auto-promocao de
-- proposito (evita um dono virar admin sozinho). Faca direto no SQL Editor:
--   update usuarios_petshop set eh_admin_plataforma = true where auth_user_id = '<uid>';
-- ============================================================================

alter table usuarios_petshop
    add column eh_admin_plataforma boolean not null default false;

comment on column usuarios_petshop.eh_admin_plataforma is
    'true = enxerga/edita petshops de TODOS os petshops (taxas da plataforma). So marcado na mao via SQL Editor.';

-- security definer + stable, mesmo padrao de auth_petshop_id() logo acima
-- no schema — evita recursao de RLS (a leitura de usuarios_petshop aqui
-- dentro roda com privilegio do dono da funcao, ignorando a policy da
-- propria tabela).
create or replace function auth_admin_plataforma()
returns boolean
language sql
stable
security definer
as $$
    select coalesce(
        (select eh_admin_plataforma
           from usuarios_petshop
          where auth_user_id = auth.uid()
          limit 1),
        false
    );
$$;

-- Substitui a policy original: continua liberando o proprio petshop (regra
-- de sempre) e agora tambem libera qualquer linha pra quem for admin da
-- plataforma — e o que permite o admin listar/editar TODOS os petshops em
-- app/(app)/admin.
drop policy "isolamento_petshop" on petshops;
create policy "isolamento_petshop" on petshops
    using (id = auth_petshop_id() or auth_admin_plataforma());

-- Trava as 3 colunas de taxa no nivel do banco — funciona mesmo se algum
-- dia alguem tentar um UPDATE direto via API, nao so pela tela.
create or replace function trg_petshops_protege_taxas()
returns trigger
language plpgsql
as $$
begin
    if (new.fee_fixo_mensal is distinct from old.fee_fixo_mensal
        or new.percentual_plataforma is distinct from old.percentual_plataforma
        or new.isento_fee_ate is distinct from old.isento_fee_ate)
       and not auth_admin_plataforma() then
        raise exception 'Somente a administração da plataforma pode alterar fee_fixo_mensal, percentual_plataforma ou isento_fee_ate.';
    end if;
    return new;
end;
$$;

create trigger trg_petshops_protege_taxas
    before update on petshops
    for each row
    execute function trg_petshops_protege_taxas();
