-- ============================================================================
-- Clube de Assinatura de Banho e Tosa — schema inicial (Supabase / Postgres)
-- Modelo: SaaS por petshop (multi-tenant), cada petshop gerencia sua carteira.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TENANT: petshops
-- ----------------------------------------------------------------------------
create table petshops (
    id                     uuid primary key default gen_random_uuid(),
    nome                   text not null,
    cnpj                   text,
    telefone               text,
    endereco               text,
    fee_fixo_mensal        numeric(10,2) not null default 99.00,
    percentual_plataforma  numeric(5,4)  not null default 0.03,   -- 0.03 = 3%
    isento_fee_ate         date,                                   -- trial do piloto: fee fixo zerado ate essa data

    -- Parametros operacionais — nada fixo no codigo, cada petshop ajusta o
    -- proprio expediente, intervalo e janela de mensagens.
    hora_abertura                      time not null default '09:00',
    hora_fechamento                    time not null default '18:00',
    hora_inicio_intervalo              time,              -- pausa pro almoco, se houver (nulo = nao tem)
    hora_fim_intervalo                 time,
    hora_divisao_periodo               time not null default '12:00',  -- corte entre "manha" e "tarde" pros lembretes
    horario_envio_lembrete             time not null default '09:00', -- quando dispara a 1a confirmacao pro tutor (D-1)
    horario_corte_confirmacao_manha    time not null default '15:00', -- prazo do tutor p/ agendamento de manha
    horario_corte_confirmacao_tarde    time not null default '17:00', -- prazo do tutor p/ agendamento de tarde
    horario_limite_petshop_tarde       time not null default '18:00', -- prazo do petshop p/ resolver pendencia de tarde

    -- Politicas de negocio — decisoes que variam de petshop pra petshop,
    -- documentadas em detalhe no arquivo regras_padrao_petshop.md
    falta_consome_visita_paga          boolean not null default true, -- true = falta do tutor conta como visita usada, sem credito nem reposicao automatica

    criado_em              timestamptz not null default now()
);

-- Equipe do petshop, ligada ao login do Supabase Auth
create table usuarios_petshop (
    id             uuid primary key default gen_random_uuid(),
    petshop_id     uuid not null references petshops(id) on delete cascade,
    auth_user_id   uuid not null references auth.users(id) on delete cascade,
    nome           text not null,
    papel          text not null default 'atendente' check (papel in ('dono','atendente')),
    criado_em      timestamptz not null default now(),
    unique (petshop_id, auth_user_id)
);

-- ----------------------------------------------------------------------------
-- 2. LOOKUPS GLOBAIS (compartilhados entre todos os petshops, uteis pra BI)
-- ----------------------------------------------------------------------------
create table portes (
    id     smallint primary key,
    nome   text not null unique,
    ordem  smallint not null
);
insert into portes (id, nome, ordem) values
    (1, 'Pequeno', 1),
    (2, 'Medio',   2),
    (3, 'Grande',  3),
    (4, 'Gigante', 4);

create table categorias_servico (
    id    smallint primary key,
    nome  text not null unique
);
insert into categorias_servico (id, nome) values
    (1, 'Banho'),
    (2, 'Tosa Higienica'),
    (3, 'Tosa Completa'),
    (4, 'Hidratacao');

-- ----------------------------------------------------------------------------
-- 3. CATALOGO DE SERVICOS DO PETSHOP (cada petshop monta o proprio cardapio)
-- ----------------------------------------------------------------------------
create table servicos (
    id                     uuid primary key default gen_random_uuid(),
    petshop_id             uuid not null references petshops(id) on delete cascade,
    categoria_servico_id   smallint not null references categorias_servico(id),
    nome_customizado       text,          -- opcional: nome proprio do petshop pro servico
    ativo                  boolean not null default true,
    criado_em              timestamptz not null default now()
);

-- Preco avulso do servico por porte (usado como referencia ao montar planos)
create table precos_servico (
    id           uuid primary key default gen_random_uuid(),
    servico_id   uuid not null references servicos(id) on delete cascade,
    porte_id     smallint not null references portes(id),
    preco        numeric(10,2) not null check (preco >= 0),
    unique (servico_id, porte_id)
);

-- ----------------------------------------------------------------------------
-- 4. PLANOS DE ASSINATURA (estrutura em aberto: frequencia livre + combo de servicos)
-- ----------------------------------------------------------------------------
create table planos (
    id                     uuid primary key default gen_random_uuid(),
    petshop_id             uuid not null references petshops(id) on delete cascade,
    nome                   text not null,                 -- ex: "Quinzenal Banho + Tosa Higienica"
    intervalo_dias         smallint not null check (intervalo_dias > 0),  -- 7, 14, 30, ou qualquer outro
    ocorrencias_padrao_mes smallint not null default 4,    -- nº de banhos que o preco do plano pressupoe (ex.: 4 p/ semanal)
    ativo                  boolean not null default true,
    criado_em        timestamptz not null default now()
);

-- Quais servicos compoem cada plano (com ou sem tosa higienica/completa, etc.)
create table plano_servicos (
    plano_id     uuid not null references planos(id) on delete cascade,
    servico_id   uuid not null references servicos(id) on delete cascade,
    primary key (plano_id, servico_id)
);

-- Preco final da assinatura por porte (guardado explicito, nao recalculado a
-- cada cobranca — cobranca recorrente precisa de um valor estavel e previsivel)
create table plano_precos (
    id                  uuid primary key default gen_random_uuid(),
    plano_id            uuid not null references planos(id) on delete cascade,
    porte_id            smallint not null references portes(id),
    preco_assinatura    numeric(10,2) not null check (preco_assinatura >= 0),
    unique (plano_id, porte_id)
);

-- ----------------------------------------------------------------------------
-- 5. CLIENTES, PETS E METODO DE PAGAMENTO
-- ----------------------------------------------------------------------------
create table tutores (
    id                  uuid primary key default gen_random_uuid(),
    petshop_id          uuid not null references petshops(id) on delete cascade,
    nome                text not null,
    telefone            text not null,
    email               text,
    endereco            text,              -- preenchido pelo proprio tutor via link de cadastro, ou pela equipe
    cadastro_completo   boolean not null default false,  -- true quando o tutor preencheu o proprio link (ou a equipe preencheu na mao)
    criado_em           timestamptz not null default now()
);

-- Contatos alternativos por papel — SO existe uma linha aqui quando o
-- contato daquele papel e DIFERENTE do tutor principal (ex.: quem busca o
-- pet nao e quem marcou o banho). Quando nao existe linha, o papel usa os
-- dados do proprio tutor — ver resolver_contato() mais abaixo, essa funcao
-- e o unico lugar que deveria implementar esse fallback.
create table contatos_adicionais (
    id           uuid primary key default gen_random_uuid(),
    petshop_id   uuid not null references petshops(id) on delete cascade,
    tutor_id     uuid not null references tutores(id) on delete cascade,
    papel        text not null check (papel in ('agendamento','busca_entrega','cobranca')),
    nome         text not null,
    telefone     text not null,
    criado_em    timestamptz not null default now(),
    unique (tutor_id, papel)
);

-- Resolve o contato de um papel: usa o override em contatos_adicionais se
-- existir, senao cai pro proprio tutor. Todo lugar que precisar decidir
-- "pra quem eu mando essa mensagem" deveria passar por aqui, em vez de
-- reimplementar o fallback.
create or replace function resolver_contato(p_tutor_id uuid, p_papel text)
returns table(nome text, telefone text)
language sql
stable
as $$
    select coalesce(ca.nome, t.nome), coalesce(ca.telefone, t.telefone)
    from tutores t
    left join contatos_adicionais ca
      on ca.tutor_id = t.id and ca.papel = p_papel
    where t.id = p_tutor_id;
$$;

create table pets (
    id             uuid primary key default gen_random_uuid(),
    petshop_id     uuid not null references petshops(id) on delete cascade,
    tutor_id       uuid not null references tutores(id) on delete cascade,
    porte_id       smallint not null references portes(id),
    nome           text not null,
    raca           text,
    observacoes    text,             -- temperamento, alergias, restricoes
    criado_em      timestamptz not null default now()
);

-- Metodo de pagamento do tutor: guardamos so o token/identificador que o
-- gateway (Asaas/Pagar.me/Iugu/Stripe) devolve, nunca o numero do cartao em
-- si. E o gateway quem tokeniza o cartao e dispara a cobranca recorrente —
-- isso NAO reserva limite do cliente antecipadamente, so afeta o limite no
-- momento exato de cada cobranca do ciclo.
create table metodos_pagamento (
    id                          uuid primary key default gen_random_uuid(),
    petshop_id                  uuid not null references petshops(id) on delete cascade,
    tutor_id                    uuid not null references tutores(id) on delete cascade,
    gateway_customer_id         text not null,     -- id do cliente no gateway
    gateway_payment_method_id   text not null,     -- token do cartao salvo no gateway
    bandeira                    text,              -- Visa, Mastercard...
    ultimos_4_digitos           text,
    validade_mes                smallint,
    validade_ano                smallint,
    padrao                      boolean not null default true,
    ativo                       boolean not null default true,
    criado_em                   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. ASSINATURAS (o "coracao" do produto: vaga recorrente, nao pacote de creditos)
-- ----------------------------------------------------------------------------
create table assinaturas (
    id                          uuid primary key default gen_random_uuid(),
    petshop_id                  uuid not null references petshops(id) on delete cascade,
    tutor_id                    uuid not null references tutores(id),
    pet_id                      uuid not null references pets(id),
    plano_id                    uuid not null references planos(id),
    status                      text not null default 'ativa' check (status in ('ativa','pausada','cancelada')),
    dia_semana_preferencial     smallint not null check (dia_semana_preferencial between 0 and 6),
    horario_preferencial        time not null default '09:00',   -- usado so pra gerar o 1o agendamento
    data_inicio                 date not null default current_date,
    proxima_data_agendamento    date,

    -- Controle da cobranca mensal proporcional (ver secao 7/10)
    competencia_paga            date,             -- mes (dia 1) ja cobrado/coberto no momento
    banhos_restantes_mes        smallint not null default 0,  -- quantos banhos desse mes ainda faltam acontecer

    metodo_pagamento_id         uuid references metodos_pagamento(id),
    gateway_subscription_id     text,    -- referencia do cliente no gateway; cobranca em si e avulsa por mes (valor varia), nao uma assinatura de valor fixo
    criado_em                   timestamptz not null default now()
);

-- Cada visita recorrente gerada a partir de uma assinatura
create table agendamentos (
    id               uuid primary key default gen_random_uuid(),
    petshop_id       uuid not null references petshops(id) on delete cascade,
    assinatura_id    uuid not null references assinaturas(id) on delete cascade,
    data_hora        timestamptz not null,
    status           text not null default 'agendado'
                     check (status in ('agendado','confirmado','pronto','entregue','faltou','reagendado','cancelado')),
    confirmado_em    timestamptz,     -- preenchido quando o tutor confirma o lembrete do D-1
    pronto_em        timestamptz,     -- preenchido quando a equipe marca o pet como pronto pra busca
    entregue_em      timestamptz,     -- preenchido quando o tutor retira o pet
    observacoes      text,
    criado_em        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. COBRANCAS (tutor -> petshop, uma por MES) E MENSALIDADE DA PLATAFORMA
--
-- Cobranca e mensal, nao por visita, mas proporcional ao numero real de
-- ocorrencias do dia da semana naquele mes. Ex.: plano semanal de 4 banhos
-- por R$99 -> R$24,75/banho; num mes com 5 segundas-feiras, a cobranca
-- daquele mes sai em R$123,75, cobrada inteira de uma vez, no momento em que
-- o 1o agendamento do mes e criado.
--
-- A cobranca antecipa o mes inteiro; agendamentos.faltou nao gera estorno
-- automatico aqui (visita perdida por falta do tutor nao devolve dinheiro,
-- so visita cancelada pelo PETSHOP e que seria caso de ajuste manual).
-- Esse comportamento agora e a politica petshops.falta_consome_visita_paga
-- (default true = comportamento atual). Se algum petshop pedir false
-- (repor a visita sem cobrar de novo), falta ainda implementar a logica de
-- reposicao dentro do mes — a coluna existe, a ramificacao nao. Ver
-- regras_padrao_petshop.md.
--
-- assinaturas.banhos_restantes_mes e o "contador" pedido: comeca em
-- quantidade_banhos - 1 (a 1a visita ja "gasta" uma unidade na hora), desce
-- 1 a cada agendamento seguinte dentro do mesmo competencia, e quando o
-- proximo agendamento cai num mes novo, dispara cobranca nova (ver trigger
-- na secao 10).
--
-- Antes essa tabela tambem misturava o fee fixo mensal (fluxo plataforma ->
-- petshop) com a cobranca do tutor. Separado em mensalidades_petshop abaixo,
-- que continua 1 linha por mes por petshop, independente do numero de
-- visitas.
-- ----------------------------------------------------------------------------
create table cobrancas (
    id                       uuid primary key default gen_random_uuid(),
    petshop_id               uuid not null references petshops(id) on delete cascade,
    assinatura_id            uuid not null references assinaturas(id) on delete cascade,
    agendamento_gatilho_id   uuid references agendamentos(id),   -- a 1a visita do mes, que disparou a cobranca
    competencia              date not null,               -- mes coberto por essa cobranca (dia 1)
    quantidade_banhos        smallint not null,            -- nº de ocorrencias do dia da semana nesse mes (4, 5...)
    valor_total              numeric(10,2) not null,       -- valor_por_visita * quantidade_banhos
    valor_percentual         numeric(10,2) not null default 0,  -- corte da plataforma (% sobre valor_total)
    valor_petshop            numeric(10,2) not null,       -- total - percentual (repassado via split)
    status                   text not null default 'pendente'
                            check (status in ('pendente','pago','falhou','estornado')),
    gateway_payment_id       text,
    pago_em                  timestamptz,
    criado_em                timestamptz not null default now(),
    unique (assinatura_id, competencia)   -- trava contra cobrar o mesmo mes duas vezes
);

-- Mensalidade fixa da plataforma, cobrada do PETSHOP (nao do tutor) — uma
-- linha por mes por petshop, independente de quantas visitas aconteceram.
create table mensalidades_petshop (
    id                  uuid primary key default gen_random_uuid(),
    petshop_id          uuid not null references petshops(id) on delete cascade,
    competencia         date not null,                -- sempre o dia 1 do mes de referencia
    valor               numeric(10,2) not null,        -- copiado de petshops.fee_fixo_mensal no momento da geracao
    status              text not null default 'pendente' check (status in ('pendente','pago','falhou','isento')),
    gateway_payment_id  text,
    pago_em             timestamptz,
    criado_em           timestamptz not null default now(),
    unique (petshop_id, competencia)
);

-- ----------------------------------------------------------------------------
-- 8. LEMBRETES — confirmacao de tosa no D-1, aviso de "pet pronto", e
--    escalonamento pro petshop. Todos os horarios usados pelos checkpoints
--    abaixo vem de petshops (horario_envio_lembrete, horario_corte_*,
--    horario_limite_petshop_tarde, hora_divisao_periodo) — nada fixo no
--    codigo, cada petshop ajusta conforme seu proprio expediente e janela
--    de resposta dos clientes.
--
-- Checkpoints diarios (pg_cron no Postgres do Supabase, ou Scheduled
-- Triggers chamando uma Edge Function):
--
--  1) as petshops.horario_envio_lembrete do dia anterior — para todo
--     agendamento de amanha, envia ao TUTOR a confirmacao via WhatsApp
--     (tipo='confirmacao_agendamento', destinatario='tutor',
--     papel_destino='busca_entrega' — quem vai levar o pet e quem precisa
--     confirmar que vai aparecer, resolvido via resolver_contato()).
--
--  2) as petshops.horario_corte_confirmacao_manha — agendamentos de amanha
--     classificados como "manha" (data_hora antes de hora_divisao_periodo)
--     ainda com confirmado_em is null: escala pro PETSHOP
--     (tipo='confirmacao_manual_petshop', destinatario='petshop').
--
--  3) as petshops.horario_corte_confirmacao_tarde — mesma logica pros
--     agendamentos de "tarde", com expectativa de resolver ate
--     petshops.horario_limite_petshop_tarde.
--
-- O tipo 'pet_pronto' nao depende de job agendado: e criado na hora pelo
-- trigger trg_agendamentos_pet_pronto (secao 9), assim que a equipe muda o
-- status do agendamento pra 'pronto' — vai pro papel_destino='busca_entrega',
-- porque e quem vai efetivamente retirar o pet que precisa saber.
--
-- O tipo 'cadastro' e diferente dos outros: nao existe agendamento ainda
-- quando ele e disparado (petshop cadastra o telefone do tutor e manda o
-- link antes de qualquer visita ou ate de qualquer pet existir no banco).
-- Por isso agendamento_id e opcional aqui e tutor_id entra no lugar. O
-- formulario publico atualizado por esse link escreve direto em tutores
-- (endereco, cadastro_completo), pets e contatos_adicionais — a resposta
-- aqui em `lembretes` e so o registro de que o convite foi enviado/usado.
--
-- papel_destino diz qual contato (ver resolver_contato) deve receber a
-- mensagem quando destinatario='tutor'. Sem isso, tudo iria pro tutor
-- principal — o que quebraria exatamente o caso que motivou essa tabela:
-- a esposa marca o banho, o marido busca, cada aviso vai pra pessoa certa.
--
-- A resposta do tutor (clique no link de confirmacao ou de cadastro) volta
-- via rota publica (nao webhook do WhatsApp — ver nota no topo do arquivo),
-- grava em `resposta` e atualiza `confirmado_em` aqui e, quando aplicavel,
-- em agendamentos. Confirmacao feita manualmente pelo petshop grava do
-- mesmo jeito, so que `resposta` registra que foi a equipe quem confirmou.
-- ----------------------------------------------------------------------------
create table lembretes (
    id               uuid primary key default gen_random_uuid(),
    agendamento_id   uuid references agendamentos(id) on delete cascade,  -- nulo pra tipo='cadastro'
    tutor_id         uuid references tutores(id) on delete cascade,       -- usado quando nao ha agendamento ainda
    tipo             text not null default 'confirmacao_agendamento'
                     check (tipo in ('confirmacao_agendamento','confirmacao_manual_petshop','pet_pronto','cadastro','cobranca_falhou','cartao_vencendo')),
    destinatario     text not null default 'tutor' check (destinatario in ('tutor','petshop')),
    papel_destino    text check (papel_destino in ('agendamento','busca_entrega','cobranca')),  -- so faz sentido quando destinatario='tutor'
    canal            text not null default 'whatsapp',
    status           text not null default 'pendente' check (status in ('pendente','enviado','falhou')),
    resposta         text,             -- resposta do tutor, ou nota de que o petshop confirmou manualmente
    confirmado_em    timestamptz,      -- quando a acao foi concluida (confirmar presenca, completar cadastro...)
    enviado_em       timestamptz,
    criado_em        timestamptz not null default now(),
    check (agendamento_id is not null or tutor_id is not null)
);

-- ----------------------------------------------------------------------------
-- 9. TRIGGER — aviso automatico de "pet pronto pra busca"
--
-- Um clique na tela do dia muda o status do agendamento pra 'pronto'; o
-- trigger carimba pronto_em e ja cria o lembrete pendente pro tutor, sem
-- a equipe precisar fazer mais nada. Uma Edge Function (ou listener via
-- Supabase Realtime) fica de olho em lembretes com status='pendente' e
-- dispara a mensagem de fato. Mesma logica de carimbo pro clique de
-- 'entregue', so que sem gerar lembrete (nao precisa avisar ninguem).
-- ----------------------------------------------------------------------------
create or replace function trg_pet_pronto_lembrete()
returns trigger
language plpgsql
as $$
begin
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

create trigger trg_agendamentos_pet_pronto
    before update on agendamentos
    for each row
    execute function trg_pet_pronto_lembrete();

-- ----------------------------------------------------------------------------
-- 10. GERACAO AUTOMATICA DE AGENDAMENTOS E COBRANCAS A PARTIR DA ASSINATURA
--
-- Regra de espacamento: DIA DA SEMANA TRAVADO. O intervalo do plano (em
-- dias) e convertido pro numero de semanas mais proximo, e o proximo
-- agendamento sempre cai no mesmo dia da semana do anterior — e assim que a
-- maioria dos planos funciona na pratica (2x ou 4x por mes, sempre nos
-- mesmos dias). Em planos cujo intervalo nao e multiplo exato de 7 (ex.: 30
-- dias avulsos), o intervalo real pode variar 2-3 dias entre ciclos — troca
-- deliberada em favor de manter o dia da semana fixo.
--
-- A contagem sempre parte da data do agendamento que acabou de ser resolvido
-- (nao da data de hoje) — entao faltar ou cancelar uma visita nao empurra o
-- ciclo inteiro, so pula aquela ocorrencia. 'reagendado' NAO dispara geracao
-- do proximo: e a mesma visita mudando de data/hora, o ciclo so avanca
-- quando ELA chegar a um estado terminal.
--
-- dia_semana_preferencial + horario_preferencial so entram pra montar o 1o
-- agendamento (a partir de data_inicio) — dali em diante o dia da semana
-- que ele estabelece e o que se repete.
--
-- Sem checagem de capacidade/conflito de horario no MVP: o sistema propoe a
-- data ideal e a equipe ajusta na mao (editando data_hora, com status
-- 'reagendado') se bater com outro compromisso.
--
-- Cada agendamento gerado (1o ou seguintes) cria automaticamente sua propria
-- cobranca (trigger no final desta secao) — entao o numero de cobrancas do
-- mes segue o numero real de visitas, sem precisar de ajuste manual em
-- meses "de 5 semanas".
--
-- Cuidado operacional: se for cancelar a ASSINATURA inteira, atualize
-- assinaturas.status ANTES de cancelar o agendamento do ciclo atual — a
-- ordem inversa deixaria um agendamento futuro orfao gerado a mais.
-- ----------------------------------------------------------------------------

create or replace function gerar_proximo_agendamento(p_assinatura_id uuid, p_data_base timestamptz)
returns void
language plpgsql
as $$
declare
    v_assinatura   assinaturas%rowtype;
    v_intervalo    smallint;
    v_semanas      int;
    v_proxima_data timestamptz;
begin
    select * into v_assinatura from assinaturas where id = p_assinatura_id;

    -- so gera o proximo se a assinatura continuar ativa
    if v_assinatura.status <> 'ativa' then
        return;
    end if;

    select intervalo_dias into v_intervalo from planos where id = v_assinatura.plano_id;

    -- arredonda pro numero de semanas mais proximo, pra manter o mesmo dia
    -- da semana do agendamento anterior (minimo de 1 semana)
    v_semanas := greatest(round(v_intervalo::numeric / 7.0)::int, 1);

    v_proxima_data := p_data_base + make_interval(weeks => v_semanas);

    insert into agendamentos (petshop_id, assinatura_id, data_hora, status)
    values (v_assinatura.petshop_id, p_assinatura_id, v_proxima_data, 'agendado');

    update assinaturas
       set proxima_data_agendamento = v_proxima_data::date
     where id = p_assinatura_id;
end;
$$;

-- Avanca o ciclo assim que uma visita chega a um estado terminal
create or replace function trg_agendamento_resolvido()
returns trigger
language plpgsql
as $$
begin
    if new.status in ('entregue','faltou','cancelado')
       and old.status is distinct from new.status then
        perform gerar_proximo_agendamento(new.assinatura_id, new.data_hora);
    end if;
    return new;
end;
$$;

create trigger trg_agendamentos_resolvido
    after update on agendamentos
    for each row
    execute function trg_agendamento_resolvido();

-- Gera o 1o agendamento assim que a assinatura nasce ativa
create or replace function trg_assinatura_primeiro_agendamento()
returns trigger
language plpgsql
as $$
declare
    v_dow_atual      int;
    v_dias_ate_pref  int;
    v_primeira_data  date;
begin
    if new.status = 'ativa' then
        v_dow_atual     := extract(dow from new.data_inicio)::int;
        v_dias_ate_pref := (new.dia_semana_preferencial - v_dow_atual + 7) % 7;
        v_primeira_data := new.data_inicio + v_dias_ate_pref;

        insert into agendamentos (petshop_id, assinatura_id, data_hora, status)
        values (new.petshop_id, new.id, v_primeira_data + new.horario_preferencial, 'agendado');

        update assinaturas
           set proxima_data_agendamento = v_primeira_data
         where id = new.id;
    end if;
    return new;
end;
$$;

create trigger trg_assinaturas_primeiro_agendamento
    after insert on assinaturas
    for each row
    execute function trg_assinatura_primeiro_agendamento();

-- Funcao auxiliar: conta quantas vezes um dia da semana (0=domingo..6=sabado)
-- ocorre num mes especifico. E o que da o "5" numa segunda-feira de agosto.
create or replace function contar_ocorrencias_dia_semana_mes(p_dia_semana smallint, p_competencia date)
returns int
language sql
stable
as $$
    select count(*)::int
    from generate_series(
        date_trunc('month', p_competencia)::date,
        (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
        interval '1 day'
    ) as d
    where extract(dow from d) = p_dia_semana;
$$;

-- Processa a cobranca sempre que um agendamento e inserido — seja o 1o (via
-- trg_assinatura_primeiro_agendamento) ou os seguintes (via
-- gerar_proximo_agendamento). Se o agendamento cai num mes (competencia)
-- ainda nao cobrado, gera a cobranca proporcional do mes inteiro e reseta o
-- contador. Se o mes ja foi cobrado, so decrementa banhos_restantes_mes.
create or replace function trg_agendamento_processar_cobranca()
returns trigger
language plpgsql
as $$
declare
    v_assinatura         assinaturas%rowtype;
    v_plano              planos%rowtype;
    v_porte_id           smallint;
    v_preco_mensal_base  numeric(10,2);
    v_valor_por_visita   numeric(10,2);
    v_competencia        date;
    v_qtd_banhos         int;
    v_valor_total        numeric(10,2);
    v_percentual         numeric(5,4);
    v_valor_percentual   numeric(10,2);
begin
    select * into v_assinatura from assinaturas where id = new.assinatura_id;
    v_competencia := date_trunc('month', new.data_hora)::date;

    if v_assinatura.competencia_paga is not distinct from v_competencia then
        -- mes ja cobrado: essa visita so consome uma unidade do contador
        update assinaturas
           set banhos_restantes_mes = greatest(banhos_restantes_mes - 1, 0)
         where id = new.assinatura_id;
        return new;
    end if;

    -- mes novo: calcula a cobranca proporcional e cobra o mes inteiro agora
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
           banhos_restantes_mes = v_qtd_banhos - 1   -- essa 1a visita do mes ja "gasta" uma unidade
     where id = new.assinatura_id;

    return new;
end;
$$;

create trigger trg_agendamentos_processar_cobranca
    after insert on agendamentos
    for each row
    execute function trg_agendamento_processar_cobranca();

-- Mensalidade fixa da plataforma (independente de numero de visitas) — sem
-- trigger automatico: chame 1x por mes por petshop a partir de um pg_cron /
-- Edge Function agendada pro dia 1. on conflict evita cobrar duas vezes o
-- mesmo mes se o job rodar de novo por engano.
create or replace function gerar_mensalidade_petshop(p_petshop_id uuid, p_competencia date)
returns void
language plpgsql
as $$
declare
    v_petshop  petshops%rowtype;
    v_valor    numeric(10,2);
    v_status   text := 'pendente';
begin
    select * into v_petshop from petshops where id = p_petshop_id;

    if v_petshop.isento_fee_ate is not null and p_competencia <= v_petshop.isento_fee_ate then
        v_valor  := 0;
        v_status := 'isento';
    else
        v_valor := v_petshop.fee_fixo_mensal;
    end if;

    insert into mensalidades_petshop (petshop_id, competencia, valor, status)
    values (p_petshop_id, date_trunc('month', p_competencia)::date, v_valor, v_status)
    on conflict (petshop_id, competencia) do nothing;
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY — isolamento por petshop
-- ============================================================================

create or replace function auth_petshop_id()
returns uuid
language sql
stable
security definer
as $$
    select petshop_id from usuarios_petshop where auth_user_id = auth.uid() limit 1;
$$;

alter table petshops           enable row level security;
alter table usuarios_petshop   enable row level security;
alter table servicos           enable row level security;
alter table precos_servico     enable row level security;
alter table planos             enable row level security;
alter table plano_servicos     enable row level security;
alter table plano_precos       enable row level security;
alter table tutores            enable row level security;
alter table contatos_adicionais enable row level security;
alter table pets               enable row level security;
alter table metodos_pagamento  enable row level security;
alter table assinaturas        enable row level security;
alter table agendamentos       enable row level security;
alter table cobrancas          enable row level security;
alter table mensalidades_petshop enable row level security;
alter table lembretes          enable row level security;

create policy "isolamento_petshop" on petshops
    using (id = auth_petshop_id());

create policy "isolamento_petshop" on usuarios_petshop
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on servicos
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on precos_servico
    using (servico_id in (select id from servicos where petshop_id = auth_petshop_id()));

create policy "isolamento_petshop" on planos
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on plano_servicos
    using (plano_id in (select id from planos where petshop_id = auth_petshop_id()));

create policy "isolamento_petshop" on plano_precos
    using (plano_id in (select id from planos where petshop_id = auth_petshop_id()));

create policy "isolamento_petshop" on tutores
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on contatos_adicionais
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on pets
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on metodos_pagamento
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on assinaturas
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on agendamentos
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on cobrancas
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on mensalidades_petshop
    using (petshop_id = auth_petshop_id());

create policy "isolamento_petshop" on lembretes
    using (agendamento_id in (select id from agendamentos where petshop_id = auth_petshop_id()));

-- Lookups globais: leitura liberada pra qualquer usuario autenticado
alter table portes enable row level security;
alter table categorias_servico enable row level security;
create policy "leitura_publica" on portes for select using (true);
create policy "leitura_publica" on categorias_servico for select using (true);
