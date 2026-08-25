-- ============================================================================
-- 0017 — Admin da plataforma independente de petshop
--
-- Motivação (pedido do Eduardo, 20/ago/2026): até aqui,
-- usuarios_petshop.eh_admin_plataforma (migration 0002) exigia que o admin
-- também fosse membro de ALGUM petshop — sem isso, o login caía direto em
-- "Acesso pendente" (app/(app)/layout.tsx). O Eduardo quer administrar a
-- plataforma inteira (KPIs de todos os petshops, cadastro de petshop/dono
-- novo, taxas, congelamento/encerramento de conta) sem estar vinculado a
-- nenhum petshop específico.
--
-- Por que uma TABELA NOVA em vez de tornar usuarios_petshop.petshop_id
-- opcional: petshop_id é not null, tem unique(petshop_id, auth_user_id), e
-- auth_petshop_id() (RLS de quase todo o schema) assume que uma linha ali
-- sempre tem petshop. Tornar isso nullable exigiria revisar toda RLS que
-- depende disso pra tratar o caso null sem abrir brecha. O próprio projeto
-- já resolveu um problema parecido assim: `funcionarios` ficou separado de
-- `usuarios_petshop` porque são conceitos diferentes (ver comentário da
-- seção 1 de 0016_funcionarios_comissoes.sql). Admin de plataforma é o
-- mesmo caso — uma identidade PARALELA, não um tipo de linha de
-- usuarios_petshop.
--
-- Uma pessoa pode ter as duas identidades ao mesmo tempo (o próprio
-- Eduardo: já é equipe de um petshop via usuarios_petshop, e agora também
-- vira admin da plataforma) — são independentes, uma linha em cada tabela,
-- mesmo auth_user_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. admins_plataforma — quem administra a plataforma inteira. Sem UI de
--    auto-promoção de propósito (mesma regra da 0002): só entra aqui via
--    SQL Editor, na mão.
-- ----------------------------------------------------------------------------
create table admins_plataforma (
    id             uuid primary key default gen_random_uuid(),
    auth_user_id   uuid not null unique references auth.users(id) on delete cascade,
    nome           text not null,
    criado_em      timestamptz not null default now()
);

comment on table admins_plataforma is
    'Quem administra a plataforma inteira (todos os petshops), independente de ser ou não equipe de algum petshop via usuarios_petshop. Só marcado na mão via SQL Editor — sem UI de auto-promoção.';

alter table admins_plataforma enable row level security;

-- Só a própria linha — não existe (ainda) tela de listar/gerenciar outros
-- admins, então não precisa de policy mais ampla que isso.
create policy "leitura_propria" on admins_plataforma
    for select
    using (auth_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. auth_admin_plataforma() — mesma assinatura de sempre (security definer,
--    stable), só troca ONDE olha. A policy de `petshops` e o trigger
--    trg_petshops_protege_taxas (ambos de 0002_admin_plataforma.sql) NÃO
--    mudam — continuam chamando esta função pelo nome, sem saber (nem
--    precisar saber) que a fonte da verdade trocou de tabela.
-- ----------------------------------------------------------------------------
create or replace function auth_admin_plataforma()
returns boolean
language sql
stable
security definer
as $$
    select exists (
        select 1 from admins_plataforma where auth_user_id = auth.uid()
    );
$$;

-- usuarios_petshop.eh_admin_plataforma vira coluna morta agora que
-- admins_plataforma é a fonte da verdade — removida em vez de deixada pra
-- trás sem uso (nada mais no schema/app lê ou escreve nela a partir desta
-- migration).
alter table usuarios_petshop drop column eh_admin_plataforma;

-- ----------------------------------------------------------------------------
-- 3. petshops.status — congelamento/encerramento de conta, mesma proteção
--    de dois níveis já usada pras 3 colunas de taxa (RLS + trigger BEFORE
--    UPDATE), pra ninguém conseguir se autoreativar ou congelar outro
--    petshop via chamada direta à API.
-- ----------------------------------------------------------------------------
alter table petshops
    add column status text not null default 'ativo'
        check (status in ('ativo', 'congelado', 'encerrado'));

comment on column petshops.status is
    'ativo (padrão) = equipe do petshop loga normalmente. congelado/encerrado = app/(app)/layout.tsx bloqueia o login de toda a equipe desse petshop (menos admin da plataforma, que não passa por essa checagem). Só quem tem auth_admin_plataforma() muda isso — ver trg_petshops_protege_status abaixo.';

create or replace function trg_petshops_protege_status()
returns trigger
language plpgsql
as $$
begin
    if new.status is distinct from old.status and not auth_admin_plataforma() then
        raise exception 'Somente a administração da plataforma pode mudar o status do petshop.';
    end if;
    return new;
end;
$$;

create trigger trg_petshops_protege_status
    before update on petshops
    for each row
    execute function trg_petshops_protege_status();

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION
--
--  [ ] O Eduardo já tem login no Supabase Auth deste projeto (é equipe de
--      um petshop hoje via usuarios_petshop) — depois de aplicar, promovê-lo
--      a admin da plataforma com o e-mail que ele já usa pra logar:
--
--        insert into admins_plataforma (auth_user_id, nome)
--        select id, 'Eduardo'
--          from auth.users
--         where email = 'eeduardoo.vieira@gmail.com'
--        on conflict (auth_user_id) do nothing;
--
--  [ ] Conferir que esse login passa a cair em /admin (não mais em "Acesso
--      pendente") mesmo continuando vinculado a um petshop em
--      usuarios_petshop.
--  [ ] Conferir que um dono comum (sem linha em admins_plataforma) não
--      enxerga /admin nem consegue mudar petshops.status/fee_fixo_mensal/
--      percentual_plataforma/isento_fee_ate — nem pela tela, nem via API
--      direta.
--
-- GAPS CONHECIDOS, deixados de propósito fora desta v1:
--  - Não existe tela de listar/promover outros admins — só via SQL Editor,
--    mesma regra que já valia pra eh_admin_plataforma na 0002.
--  - status='congelado' vs 'encerrado' têm o MESMO efeito técnico hoje
--    (bloqueiam login da equipe) — a diferença é só de intenção/mensagem
--    na tela (congelado = suspensão que pode reverter, ex. inadimplência;
--    encerrado = churn). Se um dia precisar de comportamento diferente
--    entre os dois (ex.: encerrado apaga dados depois de X dias), vira
--    lógica nova, não uma mudança neste enum.
-- ============================================================================
