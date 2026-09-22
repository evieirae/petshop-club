-- ============================================================================
-- 0032 — Importação por planilha: infraestrutura (fatia C1) + tutores e pets
--        (fatia C2)
--
-- Plano: docs/plano-loja-publica-pagamentos-import.md, Frente C.
--
-- Por que 0032 e não 0031: o plano reserva a 0031 para o site do petshop
-- (A.2), e migracao-postgres/0031_rls_sem_supabase.sql já usa esse número.
-- A importação vem antes do site na ordem de execução, mas a numeração
-- segue a do plano — a 0031 fica livre para a A.2.
--
-- ORDEM DE APLICAÇÃO: depois da 0030 (tutores.bairro, que a função de
-- aplicar grava). Em 21/set/2026 a produção ainda NÃO tinha 0013, 0020 e
-- 0030 aplicadas (drift apontado em migracao-postgres/RESULTADO.md §2) —
-- aplicar essas três antes desta.
--
-- O que esta migration faz:
--   1. normalizar_telefone() + tutores.telefone_normalizado (coluna gerada)
--      + índice ÚNICO por petshop. O telefone sempre foi gravado do jeito
--      que foi digitado ("(48) 99999-0000", "48999990000", "+55 48 ..."),
--      então nenhuma comparação por igualdade funcionava. Com 5 tutores em
--      produção e zero duplicados por dígitos (consulta de 21/set), o índice
--      único ainda é possível — com carteira real, não seria mais.
--      Efeito colateral deliberado: o cadastro manual também passa a recusar
--      telefone repetido no mesmo petshop (as actions tratam o erro 23505).
--   2. tutores.origem — de onde o cadastro veio. Antecipa a A.5
--      (autocadastro), que usa o mesmo campo.
--   3. importacoes / importacao_linhas / importacao_registros — lote, linha
--      e o que cada linha criou. É a terceira tabela que torna o "desfazer"
--      (fatia C5) possível: uma linha de tutores+pets cria até DOIS
--      registros, então um único registro_id na linha (como estava no
--      rascunho do plano) não bastava.
--   4. aplicar_importacao_tutores_pets() — aplica um lote conferido, numa
--      transação só, com RLS valendo (security invoker).
--
-- O que ela NÃO faz:
--   - Não guarda o arquivo enviado. A Server Action lê o arquivo em memória
--     e grava só as linhas; o .xlsx/.csv com dados de 400 clientes não vai
--     para o Storage nem para lugar nenhum.
--   - Não dispara mensagem. Nenhuma trigger existe em insert de tutores ou
--     pets (conferido em 21/set). A supressão de gatilhos só vira assunto
--     na C4 (agendamentos).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Normalização — as MESMAS regras vivem em lib/importacao/normalizar.ts.
--    Mudou aqui, muda lá (e vice-versa).
-- ----------------------------------------------------------------------------

-- Só dígitos, sem zero de discagem à esquerda, sem o código do país.
-- DDD 55 (Santa Maria/RS) não é confundido com o código do país: número
-- nacional tem 10 ou 11 dígitos, então só 12/13 dígitos começando com 55
-- perdem o prefixo.
create or replace function normalizar_telefone(p_telefone text)
returns text
language sql
immutable
parallel safe
as $$
    select case
             when length(d) in (12, 13) and d like '55%' then substr(d, 3)
             else d
           end
    from (
        select regexp_replace(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '^0+', '') as d
    ) x;
$$;

comment on function normalizar_telefone(text) is
    'Telefone só com dígitos, sem zero de discagem e sem +55. É a chave de deduplicação de tutor dentro do petshop. Espelhada em lib/importacao/normalizar.ts.';

-- Nome comparável: minúsculo, sem acento, espaços colapsados. Usado para
-- decidir se "Thor" e "thór " são o mesmo pet do mesmo tutor. Não usa a
-- extensão unaccent de propósito (não é immutable, e não está instalada).
create or replace function normalizar_nome(p_nome text)
returns text
language sql
immutable
parallel safe
as $$
    select lower(translate(
        btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')),
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
    ));
$$;

comment on function normalizar_nome(text) is
    'Nome minúsculo, sem acento e com espaços colapsados — chave de deduplicação de pet dentro do tutor. Espelhada em lib/importacao/normalizar.ts.';


-- ----------------------------------------------------------------------------
-- 2. tutores: telefone normalizado (único por petshop) e origem
-- ----------------------------------------------------------------------------
alter table tutores
    add column if not exists telefone_normalizado text
        generated always as (normalizar_telefone(telefone)) stored,
    add column if not exists origem text not null default 'equipe'
        check (origem in ('equipe', 'autocadastro', 'importacao'));

-- Parcial: telefone vazio (não deveria existir, mas a coluna só é NOT NULL,
-- não "não vazia") não colide com outro vazio.
create unique index if not exists tutores_petshop_telefone_key
    on tutores (petshop_id, telefone_normalizado)
    where telefone_normalizado <> '';

comment on column tutores.telefone_normalizado is
    'Gerada: normalizar_telefone(telefone). Única por petshop — é o que impede tutor duplicado, venha ele do balcão, do formulário público ou de uma planilha.';
comment on column tutores.origem is
    'De onde o cadastro nasceu: equipe (balcão/painel), autocadastro (site do petshop, Frente A.5) ou importacao (planilha, Frente C). Nunca muda depois.';


-- ----------------------------------------------------------------------------
-- 3. Lote de importação
-- ----------------------------------------------------------------------------
create table importacoes (
    id                 uuid primary key default gen_random_uuid(),
    petshop_id         uuid not null references petshops(id) on delete cascade,
    entidade           text not null check (entidade in
                         ('tutores_pets', 'servicos', 'produtos', 'assinaturas', 'agendamentos')),
    arquivo_nome       text not null,
    arquivo_tipo       text not null check (arquivo_tipo in ('xlsx', 'csv')),
    -- analisando: lote criado, linhas sendo gravadas pela conferência
    -- pronta:     conferência terminou, esperando o "aplicar"
    -- aplicando:  trava contra clique duplo (dura só a transação de aplicar)
    -- aplicada:   registros criados
    -- falhou:     a conferência não conseguiu ler o arquivo (mensagem_erro)
    -- desfeita:   fatia C5
    status             text not null default 'analisando'
                         check (status in ('analisando', 'pronta', 'aplicando', 'aplicada', 'falhou', 'desfeita')),
    -- { "campo_interno": "Cabeçalho da planilha", ... } — o mapeamento que
    -- valeu na conferência, para o relatório mostrar de onde veio cada dado.
    mapeamento         jsonb not null default '{}'::jsonb,
    total_linhas       integer not null default 0,
    linhas_novas       integer not null default 0,
    linhas_duplicadas  integer not null default 0,
    linhas_erro        integer not null default 0,
    mensagem_erro      text,
    criado_por         uuid references usuarios_petshop(id) on delete set null,
    criado_em          timestamptz not null default now(),
    atualizado_em      timestamptz not null default now(),
    aplicada_em        timestamptz,
    desfeita_em        timestamptz
);

create index importacoes_petshop_idx on importacoes (petshop_id, criado_em desc);

comment on table importacoes is
    'Um arquivo enviado para importação. A conferência (dry-run) grava o lote e as linhas; nenhum tutor/pet/produto é criado antes do aplicar. Ver docs/plano-loja-publica-pagamentos-import.md, Frente C.';


-- ----------------------------------------------------------------------------
-- 4. Linha da planilha
-- ----------------------------------------------------------------------------
create table importacao_linhas (
    id                  uuid primary key default gen_random_uuid(),
    importacao_id       uuid not null references importacoes(id) on delete cascade,
    -- Denormalizado de importacoes só para a policy não precisar de subquery.
    petshop_id          uuid not null references petshops(id) on delete cascade,
    numero_linha        integer not null,           -- como o petshop vê na planilha (cabeçalho = 1)
    dados_brutos        jsonb not null,             -- a linha como veio, cabeçalho → valor
    dados_normalizados  jsonb,                      -- o que vai ser gravado; null quando situacao = 'erro'
    -- nova:      vai criar algo no aplicar
    -- duplicada: já existe (no banco ou mais acima no mesmo arquivo); não cria nada
    -- erro:      não dá para importar (motivo em erro)
    -- aplicada:  criou o que tinha de criar
    -- ignorada:  o petshop escolheu pular (C5)
    situacao            text not null check (situacao in ('nova', 'duplicada', 'erro', 'aplicada', 'ignorada')),
    erro                text,
    avisos              text[] not null default '{}',
    unique (importacao_id, numero_linha)
);

comment on column importacao_linhas.avisos is
    'Coisas que não impedem a importação mas o petshop deve ver na conferência: "tutor já cadastrado — o pet será ligado a ele", "nome diferente da linha 4", "porte não reconhecido"...';


-- ----------------------------------------------------------------------------
-- 5. O que cada linha criou — é o que o "desfazer" (C5) percorre
-- ----------------------------------------------------------------------------
create table importacao_registros (
    id             uuid primary key default gen_random_uuid(),
    importacao_id  uuid not null references importacoes(id) on delete cascade,
    linha_id       uuid not null references importacao_linhas(id) on delete cascade,
    petshop_id     uuid not null references petshops(id) on delete cascade,
    -- Ampliado nas próximas fatias (servicos, precos_servico, produtos,
    -- movimentos_estoque, assinaturas, agendamentos).
    tabela         text not null check (tabela in ('tutores', 'pets')),
    registro_id    uuid not null,
    criado_em      timestamptz not null default now(),
    unique (tabela, registro_id)
);

create index importacao_registros_importacao_idx on importacao_registros (importacao_id);

comment on table importacao_registros is
    'Só registros CRIADOS pela importação. A importação nunca altera um registro que já existia (decisão de 21/set/2026: tutor repetido é reaproveitado, não atualizado), então desfazer é apagar o que está aqui — enquanto ninguém tiver mexido nele.';


-- ----------------------------------------------------------------------------
-- 6. RLS — mesmo padrão de sempre, mais leitura para o admin da plataforma
--    (suporte: "minha importação deu erro na linha 212").
-- ----------------------------------------------------------------------------
alter table importacoes          enable row level security;
alter table importacao_linhas    enable row level security;
alter table importacao_registros enable row level security;

create policy isolamento_petshop on importacoes for all
    using (petshop_id = auth_petshop_id())
    with check (petshop_id = auth_petshop_id());
create policy leitura_admin on importacoes for select
    using (auth_admin_plataforma());

create policy isolamento_petshop on importacao_linhas for all
    using (petshop_id = auth_petshop_id())
    with check (petshop_id = auth_petshop_id());
create policy leitura_admin on importacao_linhas for select
    using (auth_admin_plataforma());

create policy isolamento_petshop on importacao_registros for all
    using (petshop_id = auth_petshop_id())
    with check (petshop_id = auth_petshop_id());
create policy leitura_admin on importacao_registros for select
    using (auth_admin_plataforma());


-- ----------------------------------------------------------------------------
-- 7. Aplicar um lote de tutores + pets
--
-- SECURITY INVOKER (o padrão) de propósito: a função roda com as permissões
-- de quem chamou, então a RLS de tutores/pets/importacoes vale — um usuário
-- não consegue aplicar lote de outro petshop, nem via RPC direto.
--
-- Uma transação só: ou o lote inteiro entra, ou nada entra (e o status volta
-- a 'pronta' junto com o rollback, então dá para tentar de novo).
--
-- Revalida duplicados na hora de aplicar, não confia na conferência:
-- alguém pode ter cadastrado aquele telefone no balcão entre a conferência
-- e o clique em "aplicar". Nesse caso a linha vira 'duplicada' em vez de
-- estourar o índice único.
--
-- Formato esperado de dados_normalizados (gerado por
-- lib/importacao/tutoresPets.ts):
--   { "tutor": { "nome", "telefone", "email", "endereco", "bairro", "cpf" },
--     "pet":   { "nome", "porte_id", "raca", "especie", "sexo", "observacoes" } | null }
-- ----------------------------------------------------------------------------
create or replace function aplicar_importacao_tutores_pets(p_importacao_id uuid)
returns jsonb
language plpgsql
as $$
declare
    v_petshop_id      uuid;
    v_linha           record;
    v_tutor           jsonb;
    v_pet             jsonb;
    v_tutor_id        uuid;
    v_pet_id          uuid;
    v_tutor_criado    boolean;
    v_tutores_criados integer := 0;
    v_pets_criados    integer := 0;
    v_duplicadas      integer := 0;
begin
    -- Trava: só um "aplicar" por lote. A linha de importacoes fica presa até
    -- o fim da transação; uma segunda chamada simultânea espera e depois
    -- não encontra mais status 'pronta'.
    update importacoes
       set status = 'aplicando', atualizado_em = now(), mensagem_erro = null
     where id = p_importacao_id
       and entidade = 'tutores_pets'
       and status = 'pronta'
    returning petshop_id into v_petshop_id;

    if v_petshop_id is null then
        raise exception 'Importação % não está pronta para aplicar (ou não é de tutores e pets).', p_importacao_id
            using errcode = 'P0001';
    end if;

    for v_linha in
        select id, dados_normalizados
          from importacao_linhas
         where importacao_id = p_importacao_id
           and situacao = 'nova'
         order by numero_linha
    loop
        v_tutor        := v_linha.dados_normalizados -> 'tutor';
        v_pet          := v_linha.dados_normalizados -> 'pet';
        v_tutor_criado := false;
        v_pet_id       := null;

        -- Tutor: reaproveita se o telefone já existe no petshop (inclusive
        -- se foi criado por uma linha anterior deste mesmo lote).
        select id into v_tutor_id
          from tutores
         where petshop_id = v_petshop_id
           and telefone_normalizado = normalizar_telefone(v_tutor ->> 'telefone');

        if v_tutor_id is null then
            insert into tutores (petshop_id, nome, telefone, email, endereco, bairro, cpf, origem)
            values (
                v_petshop_id,
                v_tutor ->> 'nome',
                v_tutor ->> 'telefone',
                nullif(v_tutor ->> 'email', ''),
                nullif(v_tutor ->> 'endereco', ''),
                nullif(v_tutor ->> 'bairro', ''),
                nullif(v_tutor ->> 'cpf', ''),
                'importacao'
            )
            returning id into v_tutor_id;

            v_tutor_criado := true;
            v_tutores_criados := v_tutores_criados + 1;

            insert into importacao_registros (importacao_id, linha_id, petshop_id, tabela, registro_id)
            values (p_importacao_id, v_linha.id, v_petshop_id, 'tutores', v_tutor_id);
        end if;

        -- Pet: pula se o mesmo tutor já tem um pet com o mesmo nome.
        if v_pet is not null and jsonb_typeof(v_pet) = 'object' then
            if not exists (
                select 1 from pets
                 where tutor_id = v_tutor_id
                   and normalizar_nome(nome) = normalizar_nome(v_pet ->> 'nome')
            ) then
                insert into pets (petshop_id, tutor_id, porte_id, nome, raca, especie, sexo, observacoes)
                values (
                    v_petshop_id,
                    v_tutor_id,
                    (v_pet ->> 'porte_id')::smallint,
                    v_pet ->> 'nome',
                    nullif(v_pet ->> 'raca', ''),
                    nullif(v_pet ->> 'especie', ''),
                    nullif(v_pet ->> 'sexo', ''),
                    nullif(v_pet ->> 'observacoes', '')
                )
                returning id into v_pet_id;

                v_pets_criados := v_pets_criados + 1;

                insert into importacao_registros (importacao_id, linha_id, petshop_id, tabela, registro_id)
                values (p_importacao_id, v_linha.id, v_petshop_id, 'pets', v_pet_id);
            end if;
        end if;

        if v_tutor_criado or v_pet_id is not null then
            update importacao_linhas set situacao = 'aplicada' where id = v_linha.id;
        else
            -- Nada a criar: o tutor (e o pet, se havia) apareceu entre a
            -- conferência e o aplicar.
            update importacao_linhas
               set situacao = 'duplicada',
                   avisos   = array_append(avisos, 'Já estava cadastrado quando a importação foi aplicada.')
             where id = v_linha.id;
            v_duplicadas := v_duplicadas + 1;
        end if;
    end loop;

    update importacoes
       set status            = 'aplicada',
           aplicada_em       = now(),
           atualizado_em     = now(),
           linhas_novas      = linhas_novas - v_duplicadas,
           linhas_duplicadas = linhas_duplicadas + v_duplicadas
     where id = p_importacao_id;

    return jsonb_build_object(
        'tutores_criados', v_tutores_criados,
        'pets_criados',    v_pets_criados,
        'duplicadas',      v_duplicadas
    );
end;
$$;

comment on function aplicar_importacao_tutores_pets(uuid) is
    'Aplica um lote conferido de tutores + pets numa transação, com RLS valendo (security invoker). Só cria; nunca altera tutor ou pet existente. Chamada por app/(app)/importar/actions.ts.';

revoke all on function aplicar_importacao_tutores_pets(uuid) from public, anon;
grant execute on function aplicar_importacao_tutores_pets(uuid) to authenticated;


-- ============================================================================
-- CHECKLIST ANTES DE APLICAR EM PRODUÇÃO
--
--  [ ] 0013, 0020 e 0030 já aplicadas (conferir: tutores.bairro existe).
--  [ ] Nenhum telefone duplicado por petshop, senão o índice único falha:
--        select petshop_id, normalizar_telefone(telefone), count(*)
--          from tutores group by 1, 2 having count(*) > 1;
--      (rodar DEPOIS de criar a função, ou trocar pela regexp equivalente)
--  [ ] Cadastrar pelo painel um tutor com telefone já existente, formatado
--      de outro jeito, e ver a mensagem amigável (não o erro genérico).
--  [ ] Importar a planilha de exemplo (modelo baixado em /importar) num
--      petshop de teste, conferir, aplicar, e clicar aplicar de novo: a
--      segunda vez tem que recusar.
--  [ ] Logado como petshop A, chamar
--        rpc('aplicar_importacao_tutores_pets', { p_importacao_id: <lote de B> })
--      e confirmar que recusa.
-- ============================================================================
