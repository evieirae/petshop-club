-- ============================================================================
-- 0018 — Leads do site institucional (cotação do SaaS)
--
-- Motivação (pedido do Eduardo, 20/ago/2026): a Home pública
-- (app/page.tsx) vai ter um formulário de "quero uma cotação" pra petshops
-- interessados em contratar o PetClub. Isso NUNCA cria um petshop
-- automaticamente — só registra o interesse. Virar petshop de verdade
-- (com dono e login) é sempre uma ação manual do admin da plataforma, pela
-- tela /admin/leads (ver 0017_admin_plataforma_independente.sql).
--
-- Quem preenche esse formulário não tem sessão nenhuma (é um visitante do
-- site, não login de petshop) — por isso a policy de insert libera o papel
-- `anon` direto, sem precisar do createAdminClient()/service role (ver
-- lib/supabase/admin.ts): diferente do formulário de autopreenchimento de
-- tutor (que também grava em tutores/pets, tabelas com RLS baseada em
-- auth_petshop_id()), aqui a tabela não é multi-tenant e a operação é só
-- INSERT — nunca leitura, então não há nada sensível a vazar pelo anon key.
-- ============================================================================

create table leads_saas (
    id                  uuid primary key default gen_random_uuid(),
    nome_petshop        text,
    nome_responsavel    text,
    email               text not null,
    telefone            text,
    mensagem            text,
    status              text not null default 'novo'
                        check (status in ('novo', 'contatado', 'convertido', 'descartado')),
    -- Preenchido só quando o admin converte o lead num petshop de verdade
    -- (app/(admin)/admin/actions.ts, criarPetshopComDono) — liga o registro
    -- de interesse ao petshop que nasceu dele, sem apagar o lead.
    petshop_id          uuid references petshops(id) on delete set null,
    criado_em           timestamptz not null default now()
);

comment on table leads_saas is
    'Pedidos de cotação vindos da Home pública (app/page.tsx) — nunca criam petshop sozinhos. Conversão em petshop real é manual, pelo admin da plataforma (app/(admin)/admin/leads).';

alter table leads_saas enable row level security;

-- Insert público (visitante sem sessão) — nunca select/update/delete pra
-- quem não é admin.
create policy "insercao_publica" on leads_saas
    for insert
    to anon
    with check (true);

create policy "leitura_admin" on leads_saas
    for select
    using (auth_admin_plataforma());

create policy "atualizacao_admin" on leads_saas
    for update
    using (auth_admin_plataforma());

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION
--
--  [ ] Rodar 0017 antes desta (usa auth_admin_plataforma()).
--  [ ] Preencher o formulário da Home sem estar logado e conferir que a
--      linha aparece em leads_saas com status='novo'.
--  [ ] Conferir que um dono comum (não-admin) não consegue ler
--      leads_saas pela API, mesmo logado.
-- ============================================================================
