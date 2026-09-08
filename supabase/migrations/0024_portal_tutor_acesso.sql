-- ============================================================================
-- 0024 — ACESSO DO TUTOR (portal /minha-conta)
--
-- Ate aqui o tutor nunca teve sessao: ele so existia como LINHA de `tutores`,
-- e os tres fluxos publicos (cadastro, agendar, confirmar) funcionam com o
-- tutores.id cru na URL e service_role por tras (lib/supabase/admin.ts).
-- Esta migration cria a terceira identidade do produto, ao lado de
-- usuarios_petshop (equipe) e admins_plataforma (plataforma, 0017):
--
--     auth.users  ──┬── usuarios_petshop  → /painel
--                   ├── admins_plataforma → /admin
--                   └── tutores           → /minha-conta   (novo)
--
-- Decisoes que estao materializadas aqui:
--
--  1. Ter cadastro NAO da acesso. Quem libera e a administracao, tutor por
--     tutor (`acesso_liberado`). Um tutor sem essa flag continua exatamente
--     como e hoje: existe, recebe WhatsApp, usa os links publicos, e nao tem
--     login nenhum.
--
--  2. A senha inicial e provisoria e o portal fica TRANCADO ate a troca
--     (`senha_provisoria` + `senha_provisoria_expira_em`). Ver o bloco
--     "SOBRE A SENHA PADRAO" no fim deste arquivo — tem risco real ali e ele
--     esta documentado de proposito.
--
--  3. O tutor so LE. Nao existe policy de insert/update/delete pra
--     auth_tutor_id() nesta migration: marcar visita, trocar recorrencia e
--     reservar produto entram nas migrations seguintes (0025+), cada uma com
--     sua propria funcao SECURITY DEFINER e sua propria regra de negocio.
--     Um `for all` generoso aqui seria a forma mais facil de vazar a carteira
--     de um petshop inteiro.
-- ============================================================================

-- ORDEM DE APLICACAO: depois da 0002/0017 (usa auth_admin_plataforma()), da
-- 0003 (cobrancas_avulsas), da 0009 (agendamentos.tutor_id/pet_id), da 0012
-- (vendas/venda_itens) e da 0019 (tutores.ativo).
--
-- ----------------------------------------------------------------------------
-- 1. Colunas de acesso em tutores
-- ----------------------------------------------------------------------------
alter table tutores
    add column if not exists auth_user_id               uuid references auth.users(id) on delete set null,
    add column if not exists acesso_liberado            boolean not null default false,
    add column if not exists acesso_liberado_em         timestamptz,
    add column if not exists senha_provisoria           boolean not null default false,
    add column if not exists senha_provisoria_expira_em timestamptz,
    add column if not exists ultimo_login_em            timestamptz;

comment on column tutores.auth_user_id is
    'Login do tutor no Supabase Auth. Nulo enquanto a administracao nao liberar acesso — a grande maioria da carteira fica assim.';
comment on column tutores.acesso_liberado is
    'Interruptor do portal. false = o login (se existir) nao resolve pra tutor nenhum: auth_tutor_id() devolve null e todas as policies abaixo fecham.';
comment on column tutores.senha_provisoria is
    'true = a senha atual foi definida pela administracao, nao pelo tutor. Enquanto for true o portal so deixa abrir /minha-conta/nova-senha.';
comment on column tutores.senha_provisoria_expira_em is
    'Prazo de validade da senha provisoria. Depois disso o acesso e recusado no login e a administracao precisa gerar outra — e o que limita a janela de risco da senha padrao.';

-- Um login do Auth pertence a no maximo um tutor. Parcial porque a coluna e
-- nula na maior parte da tabela, e null nao colide com null em unique index.
create unique index if not exists tutores_auth_user_id_key
    on tutores (auth_user_id) where auth_user_id is not null;

-- Busca por e-mail acontece toda vez que a administracao cria um tutor com
-- acesso (pra recusar duplicata antes de chamar o Auth).
create index if not exists tutores_email_idx
    on tutores (lower(email)) where email is not null;

-- ----------------------------------------------------------------------------
-- 2. auth_tutor_id() — o espelho de auth_petshop_id() pro outro lado do balcao
--
-- SECURITY DEFINER pelo mesmo motivo de auth_petshop_id(): a funcao le
-- `tutores`, que tem RLS, e as policies de `tutores` chamam ela — sem definer
-- isso e recursao infinita.
--
-- As duas condicoes (auth_user_id E acesso_liberado) estao AQUI, num lugar so,
-- de proposito: qualquer policy nova de tutor que use essa funcao herda as
-- duas sem ter que lembrar delas.
-- ----------------------------------------------------------------------------
create or replace function auth_tutor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id
      from tutores
     where auth_user_id = auth.uid()
       and acesso_liberado
       and ativo
     limit 1;
$$;

comment on function auth_tutor_id() is
    'uuid do tutor logado, ou null. Devolve null pra equipe de petshop, pra admin e pra tutor com acesso revogado — as policies de tutor todas fecham sozinhas nesse caso.';

-- ----------------------------------------------------------------------------
-- 3. Policies de leitura do tutor
--
-- Policies permissivas se somam (OR), entao NADA aqui afrouxa o isolamento
-- por petshop que ja existe: elas so abrem, pra uma sessao que hoje nao
-- enxerga nada, exatamente as linhas do proprio tutor.
--
-- Repare que nao ha policy de tutor em `agendamentos` de OUTROS tutores, e
-- isso e intencional: a disponibilidade da agenda ("livre / ocupado", sem
-- nome de pet nenhum) vai vir de uma funcao SECURITY DEFINER na 0025, nao de
-- um select filtrado no cliente. Filtrar no cliente colocaria o nome dos
-- outros animais dentro do JSON da resposta.
-- ----------------------------------------------------------------------------

-- A administracao da plataforma precisa LER tutores de qualquer petshop pra
-- montar /admin/tutores (ela nao tem petshop, entao isolamento_petshop fecha
-- tudo pra ela). So leitura: criar tutor e liberar acesso passam por
-- app/(admin)/admin/actions.ts, que precisa de service role de qualquer jeito
-- (auth.admin.createUser nao existe com anon key).
drop policy if exists "leitura_admin_plataforma" on tutores;
create policy "leitura_admin_plataforma" on tutores
    for select using (auth_admin_plataforma());

-- O proprio cadastro
drop policy if exists "acesso_tutor" on tutores;
create policy "acesso_tutor" on tutores
    for select using (id = auth_tutor_id());

-- Os pets dele
drop policy if exists "acesso_tutor" on pets;
create policy "acesso_tutor" on pets
    for select using (tutor_id = auth_tutor_id());

-- As assinaturas dele
drop policy if exists "acesso_tutor" on assinaturas;
create policy "acesso_tutor" on assinaturas
    for select using (tutor_id = auth_tutor_id());

-- As visitas dele. Precisa das DUAS pernas: visita de plano pendura em
-- assinatura_id, e visita avulsa (0009) pendura direto em tutor_id com
-- assinatura_id nulo. Uma perna so deixaria metade do historico invisivel.
drop policy if exists "acesso_tutor" on agendamentos;
create policy "acesso_tutor" on agendamentos
    for select using (
        tutor_id = auth_tutor_id()
        or assinatura_id in (select id from assinaturas where tutor_id = auth_tutor_id())
    );

-- O que ele pagou: mensalidade de plano...
drop policy if exists "acesso_tutor" on cobrancas;
create policy "acesso_tutor" on cobrancas
    for select using (
        assinatura_id in (select id from assinaturas where tutor_id = auth_tutor_id())
    );

-- ...e visita avulsa, que tem cobranca propria por visita (0003).
drop policy if exists "acesso_tutor" on cobrancas_avulsas;
create policy "acesso_tutor" on cobrancas_avulsas
    for select using (tutor_id = auth_tutor_id());

-- As compras dele no balcao (a lojinha da 0027 vai depender disso)
drop policy if exists "acesso_tutor" on vendas;
create policy "acesso_tutor" on vendas
    for select using (tutor_id = auth_tutor_id());

drop policy if exists "acesso_tutor" on venda_itens;
create policy "acesso_tutor" on venda_itens
    for select using (
        venda_id in (select id from vendas where tutor_id = auth_tutor_id())
    );

-- Vitrine: o catalogo do petshop DELE. Nao e dado sensivel (e o mesmo preco
-- que esta na parede da loja), mas continua escopado ao petshop certo.
drop policy if exists "vitrine_tutor" on planos;
create policy "vitrine_tutor" on planos
    for select using (
        petshop_id = (select petshop_id from tutores where id = auth_tutor_id())
    );

drop policy if exists "vitrine_tutor" on plano_precos;
create policy "vitrine_tutor" on plano_precos
    for select using (
        plano_id in (
            select id from planos
             where petshop_id = (select petshop_id from tutores where id = auth_tutor_id())
        )
    );

drop policy if exists "vitrine_tutor" on servicos;
create policy "vitrine_tutor" on servicos
    for select using (
        petshop_id = (select petshop_id from tutores where id = auth_tutor_id())
    );

drop policy if exists "vitrine_tutor" on precos_servico;
create policy "vitrine_tutor" on precos_servico
    for select using (
        servico_id in (
            select id from servicos
             where petshop_id = (select petshop_id from tutores where id = auth_tutor_id())
        )
    );

-- Nome e telefone do petshop, pro portal saber de quem ele e cliente. Colunas
-- de dinheiro (fee, percentual da plataforma) tambem passam por essa policy —
-- por isso o portal NUNCA deve dar `select *` em petshops: veja o comentario
-- em app/(tutor)/layout.tsx, que lista as colunas na mao.
drop policy if exists "vitrine_tutor" on petshops;
create policy "vitrine_tutor" on petshops
    for select using (
        id = (select petshop_id from tutores where id = auth_tutor_id())
    );

-- ============================================================================
-- SOBRE A SENHA PADRAO — leia antes de mexer
--
-- A senha inicial do tutor e FIXA e igual pra todo mundo (decisao do Eduardo,
-- 31/ago/2026). Ela vive na env TUTOR_SENHA_PADRAO, nunca no repositorio, e a
-- criacao do login acontece em app/(admin)/admin/actions.ts.
--
-- O risco e concreto e vale escrever: e-mail de tutor nao e segredo. Quem
-- souber o e-mail de um tutor E a senha padrao consegue entrar na conta dele
-- enquanto ela ainda estiver provisoria — e, pior, consegue TROCAR a senha
-- primeiro, trancando o dono de fora. Tres coisas seguram isso:
--
--   1. `acesso_liberado`: so existe login pra quem a administracao liberou,
--      um por um. A base inteira nao vira alvo.
--   2. `senha_provisoria_expira_em`: a senha padrao vale por poucos dias
--      (72h no codigo). Passou o prazo, o login e recusado mesmo com a senha
--      certa, e a administracao precisa liberar de novo. A janela de ataque
--      e essa, nao "pra sempre".
--   3. A troca e obrigatoria: o portal fica trancado em /minha-conta/nova-senha
--      ate o tutor definir a dele.
--
-- Isso reduz a janela, nao elimina o buraco. O jeito de fechar de verdade e
-- senha por tutor (a funcao gerarSenhaTemporaria() de admin/actions.ts, que ja
-- faz exatamente isso pro dono do petshop desde a 0017): basta NAO setar
-- TUTOR_SENHA_PADRAO na Vercel — o codigo ja cai nesse caminho sozinho, sem
-- precisar de migration nem deploy de codigo.
--
-- ============================================================================
-- CHECKLIST DE TESTE (rodar no SQL Editor, com dois tutores de petshops
-- diferentes, depois de aplicar)
--
--  [X] Tutor A logado enxerga a propria linha em `tutores` e SO ela.
--  [X] Tutor A nao enxerga nenhum pet, assinatura, agendamento ou cobranca
--      do tutor B — nem do mesmo petshop, nem de outro.
--  [X] Tutor A enxerga tanto visita de plano quanto visita AVULSA propria
--      (as duas pernas da policy de agendamentos).
--  [X] Tutor A com acesso_liberado = false: auth_tutor_id() devolve null e
--      todo select acima volta vazio.
--  [X] Tutor A com ativo = false: idem (soft-delete da 0019 continua valendo).
--  [X] Equipe do petshop continua enxergando a carteira inteira, como antes.
--  [X] Admin da plataforma continua sem petshop e sem quebrar em lugar nenhum.
--  [X] `select * from petshops` como tutor devolve 1 linha (a do petshop
--      dele) — confirmar que a tela nao expoe fee_fixo_mensal nem
--      percentual_plataforma.
-- ============================================================================
