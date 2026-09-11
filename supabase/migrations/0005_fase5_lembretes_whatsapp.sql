-- ============================================================================
-- 0005 — Fase 5: geração + envio automático de lembretes via WhatsApp
--        (Meta WhatsApp Cloud API)
--
-- Contexto: a tabela `lembretes` e o trigger de "pet pronto" já existiam
-- desde 0001_init.sql, junto com um comentário-espec descrevendo 3
-- checkpoints diários (D-1, corte manhã, corte tarde) que nunca viraram
-- código de verdade — só documentação. Esta migration implementa esses 3
-- checkpoints como funções SQL chamadas por pg_cron, deixando as Edge
-- Functions responsáveis pelo I/O com a Meta:
--
--   supabase/functions/enviar-lembretes    → drena a fila status='pendente'
--   supabase/functions/whatsapp-webhook    → recebe status de entrega e
--                                            mensagens do tutor
--
-- O QUE MUDA POR SER META (e não um provedor-intermediário):
--
--  a) Mensagem business-initiated só sai como TEMPLATE aprovado. `lembretes`
--     ganha `template_nome` pra registrar qual template gerou cada envio —
--     quando a Meta reprova/pausa um template, é essa coluna que diz quais
--     mensagens pararam de sair.
--  b) Texto livre só é permitido dentro da janela de 24h, que abre quando o
--     usuário manda mensagem pro número. Como isso é um estado externo, ele
--     precisa ser materializado no banco: tabela `janelas_whatsapp`,
--     alimentada pelo webhook.
--  c) O ciclo de vida da mensagem não acaba no envio — a Meta manda
--     callbacks sent/delivered/read/failed. Daí os status novos
--     ('entregue','lido') e as colunas entregue_em/lido_em.
--  d) O tutor pode responder "sim" no próprio WhatsApp em vez de clicar no
--     link. `confirmar_agendamento_por_whatsapp()` cobre esse caminho com a
--     MESMA regra da rota pública (app/(public)/confirmar), sem duplicar a
--     lógica em TypeScript.
--
-- Fuso horário: todo o cálculo de "amanhã"/"já passou do horário" usa
-- `at time zone 'America/Sao_Paulo'` explicitamente — nunca now()/
-- current_date cru. Não existe coluna de timezone em `petshops`; fixo em
-- America/Sao_Paulo é aceitável pro escopo atual (petshops brasileiros).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em `lembretes` — snapshot de auditoria + rastro na Meta
--
-- telefone_destino/nome_destino são capturados no momento da GERAÇÃO da
-- linha (quando resolver_contato()/petshops já estão naturalmente
-- disponíveis via join), não do envio — registram fielmente "pra qual
-- contato a gente tentou mandar isso", mesmo que o cadastro mude depois.
-- provider_message_id/erro_envio existem porque, sem teste automatizado
-- nenhum no projeto, um status='falhou' sem nenhuma pista de causa é
-- impossível de depurar contra o Graph API.
-- ----------------------------------------------------------------------------
alter table lembretes
    add column telefone_destino     text,
    add column nome_destino         text,
    add column provider_message_id  text,
    add column template_nome        text,
    add column erro_envio           text,
    add column entregue_em          timestamptz,
    add column lido_em              timestamptz;

comment on column lembretes.telefone_destino is
    'Telefone resolvido (resolver_contato() ou petshops.telefone) no momento em que a linha foi gerada — snapshot de auditoria, não recalculado no envio.';
comment on column lembretes.provider_message_id is
    'wamid.* devolvido pela Meta no envio. É a chave que o webhook usa pra casar os callbacks de status com esta linha — sem ele, entregue/lido/falhou não têm onde pousar.';
comment on column lembretes.template_nome is
    'Nome do template aprovado usado no envio (ver docs/whatsapp_templates_meta.md). Nulo = saiu como texto livre dentro da janela de 24h.';
comment on column lembretes.erro_envio is
    'Mensagem de erro da Meta (error_data.details, que é bem mais específico que error.message) quando status vira falhou — sem isso não dá pra depurar.';

-- Status novos: a Meta reporta o ciclo completo da mensagem, e 'enviado'
-- (aceito pelo Graph API) é bem diferente de 'entregue' (chegou no
-- aparelho). Achatar os dois esconderia justamente o caso que interessa —
-- número errado/inativo, que responde 2xx no envio e nunca entrega.
-- 'falhou' agora acumula dois momentos distintos: erro síncrono na chamada
-- HTTP e callback assíncrono de falha; erro_envio distingue.
alter table lembretes drop constraint if exists lembretes_status_check;
alter table lembretes add constraint lembretes_status_check
    check (status in ('pendente','enviado','entregue','lido','falhou'));

-- ----------------------------------------------------------------------------
-- 2. Fix de RLS — bug pré-existente
--
-- A policy original (0001_init.sql) só cobria `agendamento_id in (select
-- ... from agendamentos ...)`. Pra linhas com agendamento_id IS NULL
-- (tipo='cadastro', e agora também as de escalonamento pro petshop, que
-- não têm agendamento associado num primeiro momento — na prática essas
-- SEMPRE têm agendamento_id preenchido, mas cadastro nunca tem), a
-- expressão `NULL IN (subquery)` avalia NULL, que RLS trata como
-- reprovado. Na prática isso faz o INSERT de app/(app)/tutores/actions.ts
-- (gerarLinkCadastro) falhar silenciosamente sob RLS hoje.
-- ----------------------------------------------------------------------------
drop policy "isolamento_petshop" on lembretes;

create policy "isolamento_petshop" on lembretes
    using (
        agendamento_id in (select id from agendamentos where petshop_id = auth_petshop_id())
        or tutor_id in (select id from tutores where petshop_id = auth_petshop_id())
    );

-- ----------------------------------------------------------------------------
-- 3. Checkpoint 1 — confirmação D-1 pro tutor
--
-- Pra todo agendamento de amanhã (não cancelado) cujo petshop já passou do
-- horario_envio_lembrete configurado hoje, gera lembrete
-- tipo='confirmacao_agendamento'. Ramifica assinatura x avulsa pra achar o
-- tutor certo (mesma ramificação documentada em
-- 0003_fase4_assinaturas_agenda.sql, seção "NOTA PRA FASE 5"): visita de
-- assinatura pega tutor_id via assinaturas; avulsa já tem tutor_id direto
-- em agendamentos.
--
-- Anti-duplicação: not exists() por (agendamento_id, tipo) — idempotente,
-- pode rodar de novo no mesmo dia sem duplicar (a condição de horário
-- continua verdadeira o resto do dia, mas o guard já bloqueia).
-- ----------------------------------------------------------------------------
create or replace function gerar_lembretes_confirmacao()
returns integer
language plpgsql
as $$
declare
    v_count integer;
begin
    insert into lembretes (agendamento_id, tipo, destinatario, papel_destino, canal, status, telefone_destino, nome_destino)
    select
        a.id, 'confirmacao_agendamento', 'tutor', 'busca_entrega', 'whatsapp', 'pendente',
        rc.telefone, rc.nome
    from agendamentos a
    join petshops p on p.id = a.petshop_id
    cross join lateral resolver_contato(
        case when a.assinatura_id is not null
            then (select tutor_id from assinaturas where id = a.assinatura_id)
            else a.tutor_id
        end,
        'busca_entrega'
    ) rc
    where a.status <> 'cancelado'
      and (a.data_hora at time zone 'America/Sao_Paulo')::date
          = ((now() at time zone 'America/Sao_Paulo')::date) + 1
      and (now() at time zone 'America/Sao_Paulo')
          >= (((now() at time zone 'America/Sao_Paulo')::date) + p.horario_envio_lembrete)
      and not exists (
          select 1 from lembretes l
          where l.agendamento_id = a.id and l.tipo = 'confirmacao_agendamento'
      );

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

comment on function gerar_lembretes_confirmacao() is
    'Checkpoint 1 (Fase 5): gera lembretes de confirmação D-1 pros agendamentos de amanhã, a partir de petshops.horario_envio_lembrete. Chamada por pg_cron via processar_checkpoints_lembretes().';

-- ----------------------------------------------------------------------------
-- 4. Checkpoints 2 e 3 — escalonamento pro petshop (manhã/tarde)
--
-- Pra agendamentos de amanhã ainda sem confirmado_em quando o corte
-- configurado (horario_corte_confirmacao_manha ou _tarde) já passou,
-- escala pro PETSHOP (destinatario='petshop'), notificando telefone da
-- própria linha em `petshops`. "Manhã"/"tarde" é definido comparando o
-- horário de data_hora com hora_divisao_periodo do petshop.
-- ----------------------------------------------------------------------------
create or replace function escalar_confirmacao_pendente(p_periodo text)
returns integer
language plpgsql
as $$
declare
    v_count   integer;
    v_amanha  date := ((now() at time zone 'America/Sao_Paulo')::date) + 1;
begin
    insert into lembretes (agendamento_id, tipo, destinatario, canal, status, telefone_destino, nome_destino)
    select a.id, 'confirmacao_manual_petshop', 'petshop', 'whatsapp', 'pendente', p.telefone, p.nome
    from agendamentos a
    join petshops p on p.id = a.petshop_id
    where (a.data_hora at time zone 'America/Sao_Paulo')::date = v_amanha
      and a.confirmado_em is null
      and a.status not in ('cancelado', 'faltou')
      and (
          (p_periodo = 'manha'
              and (a.data_hora at time zone 'America/Sao_Paulo')::time < p.hora_divisao_periodo
              and (now() at time zone 'America/Sao_Paulo')
                  >= (((now() at time zone 'America/Sao_Paulo')::date) + p.horario_corte_confirmacao_manha))
          or
          (p_periodo = 'tarde'
              and (a.data_hora at time zone 'America/Sao_Paulo')::time >= p.hora_divisao_periodo
              and (now() at time zone 'America/Sao_Paulo')
                  >= (((now() at time zone 'America/Sao_Paulo')::date) + p.horario_corte_confirmacao_tarde))
      )
      and not exists (
          select 1 from lembretes l
          where l.agendamento_id = a.id and l.tipo = 'confirmacao_manual_petshop'
      );

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

comment on function escalar_confirmacao_pendente(text) is
    'Checkpoints 2/3 (Fase 5): escala pro petshop (WhatsApp + badge na Agenda) agendamentos de amanhã ainda sem confirmação, a partir de horario_corte_confirmacao_manha/_tarde. p_periodo em (''manha'',''tarde''). Chamada por processar_checkpoints_lembretes().';

-- ----------------------------------------------------------------------------
-- 5. Dispatcher — é isso que o pg_cron chama
-- ----------------------------------------------------------------------------
create or replace function processar_checkpoints_lembretes()
returns void
language plpgsql
as $$
begin
    perform gerar_lembretes_confirmacao();
    perform escalar_confirmacao_pendente('manha');
    perform escalar_confirmacao_pendente('tarde');
end;
$$;

comment on function processar_checkpoints_lembretes() is
    'Dispatcher dos 3 checkpoints diários de lembretes (Fase 5) — agendado via pg_cron a cada 5 minutos, ver job "lembretes-checkpoints" no final desta migration.';

-- ----------------------------------------------------------------------------
-- 6. trg_pet_pronto_lembrete() ganha telefone_destino/nome_destino
--
-- Mesma trigger de sempre (0001_init.sql seção 9, substituída em
-- 0003_fase4_assinaturas_agenda.sql pra carimbar confirmado_em) — sem essa
-- atualização, a linha pet_pronto fica sem telefone pra Edge Function usar.
-- Mesma ramificação assinatura x avulsa do checkpoint 1.
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

    if new.status = 'pronto' and old.status is distinct from 'pronto' then
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
    end if;

    return new;
end;
$$;

-- Trigger existente (trg_agendamentos_pet_pronto) continua apontando pra
-- essa função sem precisar recriar — mesmo padrão já usado em 0003.

-- ----------------------------------------------------------------------------
-- 7. Janela de atendimento de 24h — específico da Meta
--
-- A Meta só aceita texto livre nas 24h seguintes à última mensagem que o
-- USUÁRIO mandou pro número. Esse é um estado que vive lá, não aqui — só
-- ficamos sabendo dele pelo webhook. Materializar numa tabela é o que
-- permite a Edge Function decidir template x texto livre sem uma chamada
-- extra ao Graph API a cada lembrete.
--
-- Chave é o telefone normalizado (E.164 sem '+'), não tutor_id: o
-- remetente que aparece no webhook pode ser um contato_adicional (o marido
-- que busca o pet), que não é tutor nenhum no nosso schema. Mesmo motivo
-- de `lembretes.telefone_destino` existir.
--
-- RLS ligada e SEM policy nenhuma, de propósito: no Supabase, tabela do
-- schema public sem RLS fica exposta pela API REST com a anon key — e essa
-- aqui é uma lista de telefones de clientes. As Edge Functions usam
-- service_role, que passa por cima da RLS, então nada quebra. Se um dia
-- virar tela, aí sim precisa de policy — o que exige resolver antes como
-- derivar petshop_id só do telefone, que hoje não dá.
-- ----------------------------------------------------------------------------
create table janelas_whatsapp (
    telefone                   text primary key,
    ultima_mensagem_recebida   timestamptz not null,
    atualizado_em              timestamptz not null default now()
);

alter table janelas_whatsapp enable row level security;

comment on table janelas_whatsapp is
    'Última mensagem recebida por telefone, alimentada pelo webhook da Meta. Base pra decidir se um lembrete pode sair como texto livre (janela de 24h aberta) ou precisa de template aprovado. RLS ligada sem policy: só service_role enxerga.';

create or replace function registrar_mensagem_recebida(p_telefone text, p_recebida_em timestamptz default now())
returns void
language sql
as $$
    insert into janelas_whatsapp (telefone, ultima_mensagem_recebida)
    values (regexp_replace(p_telefone, '\D', '', 'g'), p_recebida_em)
    on conflict (telefone) do update
        set ultima_mensagem_recebida = greatest(janelas_whatsapp.ultima_mensagem_recebida, excluded.ultima_mensagem_recebida),
            atualizado_em = now();
$$;

create or replace function janela_whatsapp_aberta(p_telefone text)
returns boolean
language sql
stable
as $$
    -- 23h em vez de 24h de propósito: margem pro atraso entre a Edge
    -- Function decidir e a Meta processar. Enviar texto livre num limite
    -- apertado é falha (código 131047) e o lembrete morre como 'falhou';
    -- cair pro template é sempre seguro.
    select exists (
        select 1 from janelas_whatsapp
        where telefone = regexp_replace(p_telefone, '\D', '', 'g')
          and ultima_mensagem_recebida > now() - interval '23 hours'
    );
$$;

comment on function janela_whatsapp_aberta(text) is
    'True se dá pra mandar texto livre pro número (janela de 24h da Meta aberta, com margem de 1h). Falso => precisa de template aprovado.';

-- ----------------------------------------------------------------------------
-- 8. Confirmação por RESPOSTA no WhatsApp
--
-- Caminho novo que só existe por causa do webhook: em vez de clicar no
-- link, o tutor responde "sim" na conversa. A regra é a mesma da rota
-- pública (app/(public)/confirmar/[lembreteId]/actions.ts) — só os status
-- 'agendado'/'reagendado' são confirmáveis, e o UPDATE em agendamentos
-- deixa trg_pet_pronto_lembrete() carimbar confirmado_em sozinho.
--
-- Fica em SQL, e não na Edge Function, justamente pra não virar uma
-- terceira cópia dessa regra. O casamento é pelo lembrete de confirmação
-- mais recente ainda não confirmado daquele telefone — que é como o tutor
-- enxerga a conversa (ele responde à última mensagem que recebeu).
-- ----------------------------------------------------------------------------
create or replace function confirmar_agendamento_por_whatsapp(p_telefone text, p_resposta text)
returns uuid
language plpgsql
as $$
declare
    v_lembrete lembretes%rowtype;
    v_atualizados integer;
begin
    select l.* into v_lembrete
    from lembretes l
    where regexp_replace(l.telefone_destino, '\D', '', 'g') = regexp_replace(p_telefone, '\D', '', 'g')
      and l.tipo = 'confirmacao_agendamento'
      and l.confirmado_em is null
      and l.agendamento_id is not null
      and l.criado_em > now() - interval '3 days'
    order by l.criado_em desc
    limit 1;

    if not found then
        return null;
    end if;

    update agendamentos
       set status = 'confirmado'
     where id = v_lembrete.agendamento_id
       and status in ('agendado', 'reagendado');

    get diagnostics v_atualizados = row_count;

    -- Agendamento já cancelado/faltou/pronto: não confirma nada, mas o
    -- lembrete também não deve ficar rodando pra sempre esperando resposta.
    if v_atualizados = 0 then
        return null;
    end if;

    update lembretes
       set confirmado_em = now(),
           resposta = left(coalesce(p_resposta, ''), 500)
     where id = v_lembrete.id;

    return v_lembrete.agendamento_id;
end;
$$;

comment on function confirmar_agendamento_por_whatsapp(text, text) is
    'Confirma presença a partir de uma resposta recebida no WhatsApp (webhook da Meta), aplicando a mesma regra da rota pública /confirmar. Devolve o agendamento_id confirmado, ou null se não havia lembrete pendente casável.';

-- ----------------------------------------------------------------------------
-- 9. Status de entrega vindos do webhook
--
-- Mapeia o ciclo da Meta pro nosso status. Nunca regride: se 'lido' já
-- chegou, um callback atrasado de 'delivered' não pode rebaixar a linha —
-- os callbacks não têm ordem garantida.
-- ----------------------------------------------------------------------------
create or replace function registrar_status_mensagem(
    p_wamid   text,
    p_status  text,          -- sent | delivered | read | failed
    p_erro    text default null,
    p_ocorrido_em timestamptz default now()
)
returns boolean
language plpgsql
as $$
declare
    v_rank_novo  integer;
    v_atualizados integer;
begin
    v_rank_novo := case p_status
        when 'sent' then 1
        when 'delivered' then 2
        when 'read' then 3
        else 0
    end;

    if p_status = 'failed' then
        update lembretes
           set status = 'falhou',
               erro_envio = coalesce(p_erro, 'Falha reportada pelo webhook da Meta, sem detalhe.')
         where provider_message_id = p_wamid;
    else
        update lembretes
           set status = case p_status
                   when 'sent' then 'enviado'
                   when 'delivered' then 'entregue'
                   when 'read' then 'lido'
                   else status
               end,
               entregue_em = case when p_status in ('delivered','read')
                   then coalesce(entregue_em, p_ocorrido_em) else entregue_em end,
               lido_em = case when p_status = 'read'
                   then coalesce(lido_em, p_ocorrido_em) else lido_em end
         where provider_message_id = p_wamid
           and case status
                   when 'enviado' then 1
                   when 'entregue' then 2
                   when 'lido' then 3
                   else 0
               end < v_rank_novo;
    end if;

    get diagnostics v_atualizados = row_count;
    return v_atualizados > 0;
end;
$$;

comment on function registrar_status_mensagem(text, text, text, timestamptz) is
    'Aplica um callback de status da Meta (sent/delivered/read/failed) sobre o lembrete de wamid correspondente. Monotônico: callback fora de ordem não rebaixa o status já alcançado.';

create index lembretes_provider_message_id_idx on lembretes (provider_message_id)
    where provider_message_id is not null;

-- ----------------------------------------------------------------------------
-- 9b. Fechar as funções pra anon/authenticated
--
-- No Postgres, toda função nasce com EXECUTE pra PUBLIC — e o PostgREST do
-- Supabase expõe qualquer função do schema public como POST /rpc/<nome>.
-- Sem isto, quem tiver a anon key (que é pública por definição, roda no
-- browser) poderia confirmar agendamento alheio, forjar status de entrega
-- ou ir renovando janela de 24h. Essas quatro só devem ser chamadas pelas
-- Edge Functions (service_role) e pelo pg_cron.
--
-- SECURITY DEFINER não entra aqui de propósito: quem chama já é
-- service_role, que passa por cima da RLS por conta própria.
-- ----------------------------------------------------------------------------
revoke execute on function janela_whatsapp_aberta(text) from public, anon, authenticated;
revoke execute on function registrar_mensagem_recebida(text, timestamptz) from public, anon, authenticated;
revoke execute on function registrar_status_mensagem(text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function confirmar_agendamento_por_whatsapp(text, text) from public, anon, authenticated;
revoke execute on function gerar_lembretes_confirmacao() from public, anon, authenticated;
revoke execute on function escalar_confirmacao_pendente(text) from public, anon, authenticated;
revoke execute on function processar_checkpoints_lembretes() from public, anon, authenticated;

grant execute on function janela_whatsapp_aberta(text) to service_role;
grant execute on function registrar_mensagem_recebida(text, timestamptz) to service_role;
grant execute on function registrar_status_mensagem(text, text, text, timestamptz) to service_role;
grant execute on function confirmar_agendamento_por_whatsapp(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 10. pg_cron — dois jobs
--
-- Job A (checkpoints, a cada 5min): granularidade suficiente pra
-- confirmação D-1/escalonamento, que não são notificações instantâneas.
--
-- Job B (envio, a cada 2min): mais frequente que o Job A porque
-- pet_pronto/cadastro são gerados a qualquer hora do dia (trigger/ação
-- manual da equipe), não só nos checkpoints — precisam sair "quase na
-- hora". Chama a Edge Function via pg_net, autenticado por um header
-- custom (não a service_role key, que ficaria visível em `select * from
-- cron.job` pra qualquer um com acesso ao banco).
--
-- O webhook NÃO tem job: quem chama é a Meta, direto na Edge Function
-- pública (whatsapp-webhook), autenticada por assinatura HMAC.
--
-- app.cron_secret é setado UMA VEZ, fora desta migration versionada (é
-- credencial, não schema):
--   alter database postgres set app.cron_secret = '<valor-aleatorio>';
-- A Edge Function confere isso contra CRON_SECRET (supabase secrets set).
-- Troque <PROJECT_REF> pela referência real do projeto Supabase antes de
-- rodar isto contra produção.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
    'lembretes-checkpoints',
    '*/5 * * * *',
    $$select processar_checkpoints_lembretes()$$
);

select cron.schedule(
    'lembretes-enviar',
    '*/2 * * * *',
    $$
    select net.http_post(
        url := 'https://<PROJECT_REF>.supabase.co/functions/v1/enviar-lembretes',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', current_setting('app.cron_secret', true)
        ),
        body := '{}'::jsonb
    );
    $$
);
