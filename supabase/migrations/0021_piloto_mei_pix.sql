-- ============================================================================
-- 0021 — Política de mensagem do piloto (plano MEI + Pix)
--
-- Contexto: docs/plano-mei-pix.md, decisões de 24/ago/2026. O WhatsApp fica
-- ligado, mas deixa de ser "manda tudo por template pago" e passa a ser uma
-- política deliberada sobre o que paga e o que não paga. O custo por petshop
-- cai de R$ 61,65 pra R$ 34,00/mês (−45%) já contando a mensagem de retenção,
-- que antes nem estava na conta.
--
-- O que esta migration NÃO faz, de propósito (é código, não schema):
--
--   1. Preferir texto livre quando `janela_whatsapp_aberta()` diz que dá.
--      Isso vive em supabase/functions/enviar-lembretes/index.ts. A função
--      SQL já existe desde a 0005 — falta o envio consultá-la ANTES de montar
--      o template. É a maior economia isolada (~R$ 15/petshop/mês) e é a
--      única deste plano que não precisa de coluna nova.
--   2. Pagamento Pix síncrono no portal do tutor (gap #3 da Fase 6). Virou
--      bloqueante com a decisão de "Pix só pra pagamento remoto", porque
--      pagamento remoto É o portal. Também é código.
--   3. Pedir CPF no fluxo de cadastro. A coluna `tutores.cpf` já existe desde
--      a 0006; o que falta é a tela pedir. O Asaas exige CPF pra criar
--      `customer` mesmo quando a cobrança é Pix.
--
-- Todas as colunas aqui são parâmetro OPERACIONAL do petshop — editáveis por
-- ele em Configurações, diferente de fee_fixo_mensal/percentual_plataforma/
-- isento_fee_ate, que continuam travadas pro admin da plataforma (0002/0017).
--
-- ----------------------------------------------------------------------------
-- VALIDAÇÃO (24/ago/2026) — diferente das migrations da Fase 6, esta foi
-- testada antes de entrar no repo. Postgres 16 limpo, cadeia 0001→0021
-- aplicada na ordem (pg_cron stubbado, é o único bloco que não roda fora do
-- Supabase), e depois os casos de comportamento:
--
--   pode_disparar_retencao()
--     ✓ primeiro disparo do tutor → true
--     ✓ segundo disparo dentro de retencao_intervalo_dias → false
--     ✓ outro tutor do mesmo petshop, com teto disponível → true
--     ✓ teto mensal atingido → false para todos os tutores do petshop
--     ✓ retencao_teto_mensal = 0 → false (retenção desligada)
--     ✓ lembrete anterior com 100 dias → volta a true
--     ✓ tutor inexistente → false, sem exceção
--     ✓ CHECK rejeita retencao_intervalo_dias = 0
--
--   trg_pet_pronto_lembrete()
--     ✓ enviar_pet_entregue = false → gera só pet_pronto
--     ✓ enviar_pet_entregue = true  → gera pet_pronto e pet_entregue
--
--   escalar_confirmacao_pendente()
--     ✓ escalonar_por_whatsapp = false → lembrete com canal='painel'
--     ✓ escalonar_por_whatsapp = true  → lembrete com canal='whatsapp'
-- ----------------------------------------------------------------------------
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas de política de mensagem
-- ----------------------------------------------------------------------------
alter table petshops
    add column if not exists enviar_pet_entregue     boolean  not null default false,
    add column if not exists escalonar_por_whatsapp  boolean  not null default false,
    add column if not exists retencao_teto_mensal    smallint not null default 20,
    add column if not exists retencao_intervalo_dias smallint not null default 90;

alter table petshops
    drop constraint if exists petshops_retencao_teto_check;
alter table petshops
    add constraint petshops_retencao_teto_check
    check (retencao_teto_mensal >= 0 and retencao_intervalo_dias > 0);

comment on column petshops.enviar_pet_entregue is
    'Envia o template pet_entregue? Padrão FALSE. É a mensagem de menor valor percebido das três do dia — o tutor acabou de sair da loja com o pet no colo — e a mais cara em volume: 400 envios/mês num petshop médio, R$ 18,00. Desligada por padrão, o petshop liga se quiser.';

comment on column petshops.escalonar_por_whatsapp is
    'O escalonamento de confirmação pendente sai por WhatsApp? Padrão FALSE. Esse lembrete avisa a EQUIPE do petshop, que já está logada no painel — pagar template pra isso é pagar pra falar com quem está olhando a tela. Com FALSE o lembrete continua sendo criado (canal=''painel''), só não vai pro WhatsApp: a Agenda lê essas linhas e mostra o badge.';

comment on column petshops.retencao_teto_mensal is
    'Máximo de mensagens retencao_cliente por mês, por petshop. Padrão 20. retencao_cliente é categoria MARKETING na Meta (~R$ 0,35 — 7x o UTILITY): sem teto, uma campanha pra 100 tutores inativos custa R$ 35/mês num único petshop, mais que todos os templates transacionais somados. 0 desliga a retenção.';

comment on column petshops.retencao_intervalo_dias is
    'Intervalo mínimo, em dias, entre duas mensagens de retenção pro MESMO tutor. Padrão 90. Protege a reputação do número na Meta: reengajamento repetido vira denúncia, e denúncia derruba a qualidade da conta inteira — que é compartilhada por todos os petshops da plataforma.';

-- ----------------------------------------------------------------------------
-- 2. pet_entregue passa a respeitar a flag
--
-- Redefinição completa de trg_pet_pronto_lembrete() (última versão: 0013).
-- Único ponto alterado: o bloco de status='entregue' ganha a checagem da
-- coluna nova. O resto é idêntico — está reproduzido inteiro porque
-- `create or replace function` substitui o corpo todo.
-- ----------------------------------------------------------------------------
create or replace function trg_pet_pronto_lembrete()
returns trigger
language plpgsql
as $$
declare
    v_contato record;
    v_envia   boolean;
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

        select enviar_pet_entregue into v_envia
        from petshops where id = new.petshop_id;

        if coalesce(v_envia, false) then
            select * into v_contato from resolver_contato(
                case when new.assinatura_id is not null
                    then (select tutor_id from assinaturas where id = new.assinatura_id)
                    else new.tutor_id
                end,
                'busca_entrega'
            );

            insert into lembretes (agendamento_id, tipo, destinatario, papel_destino, canal, status, telefone_destino, nome_destino)
            values (new.id, 'pet_entregue', 'tutor', 'busca_entrega', 'whatsapp', 'pendente', v_contato.telefone, v_contato.nome);
        end if;
    end if;

    return new;
end;
$$;

comment on function trg_pet_pronto_lembrete() is
    'Carimba confirmado_em/pronto_em/entregue_em conforme o status muda, e gera o lembrete correspondente. pet_pronto sempre; pet_entregue só se petshops.enviar_pet_entregue (0021, padrão false). Nome ficou de trás (0001/0003/0005) — cobre bem mais que só "pronto" hoje.';

-- ----------------------------------------------------------------------------
-- 3. Escalonamento pro petshop: badge no painel em vez de WhatsApp
--
-- A linha em `lembretes` continua sendo criada — ela é o que a Agenda lê pra
-- mostrar o badge de "confirmação pendente". O que muda é o CANAL: com
-- escalonar_por_whatsapp = false, entra como canal='painel', e o
-- enviar-lembretes ignora tudo que não é canal='whatsapp'.
--
-- ⚠️ MUDANÇA DE CÓDIGO NECESSÁRIA JUNTO: supabase/functions/enviar-lembretes
-- precisa filtrar `canal = 'whatsapp'` na busca da fila. Sem isso, o lembrete
-- de painel é lido, não acha template mapeado e vira status='falhou' —
-- barulho no monitoramento, não cobrança indevida.
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
    select a.id,
           'confirmacao_manual_petshop',
           'petshop',
           case when p.escalonar_por_whatsapp then 'whatsapp' else 'painel' end,
           'pendente',
           p.telefone,
           p.nome
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
    'Checkpoints 2/3 (Fase 5): escala pro petshop agendamentos de amanhã ainda sem confirmação, a partir de horario_corte_confirmacao_manha/_tarde. Desde a 0021 o canal depende de petshops.escalonar_por_whatsapp: true = WhatsApp (template pago), false (padrão) = ''painel'', só o badge na Agenda. p_periodo em (''manha'',''tarde'').';

-- ----------------------------------------------------------------------------
-- 4. Teto de disparo da retenção
--
-- A 0020 criou o tipo 'retencao_cliente' de propósito sem o lado de envio. O
-- teto precisa existir ANTES de o template MARKETING ser submetido à Meta —
-- depois já é tarde: quem descobre que não tem limite é a fatura.
--
-- Quem chama: app/(app)/tutores/actions.ts, em dispararMensagemRetencao(),
-- antes do insert em `lembretes`.
-- ----------------------------------------------------------------------------
create or replace function pode_disparar_retencao(p_tutor_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
    v_petshop_id  uuid;
    v_teto        smallint;
    v_intervalo   smallint;
    v_no_mes      integer;
    v_ultimo      timestamptz;
begin
    select t.petshop_id, p.retencao_teto_mensal, p.retencao_intervalo_dias
      into v_petshop_id, v_teto, v_intervalo
    from tutores t
    join petshops p on p.id = t.petshop_id
    where t.id = p_tutor_id;

    if v_petshop_id is null then
        return false;              -- tutor inexistente
    end if;

    if v_teto = 0 then
        return false;              -- retenção desligada neste petshop
    end if;

    -- Teto mensal do petshop, contado no mês corrente em America/Sao_Paulo.
    select count(*)
      into v_no_mes
    from lembretes l
    join tutores t on t.id = l.tutor_id
    where t.petshop_id = v_petshop_id
      and l.tipo = 'retencao_cliente'
      and date_trunc('month', l.criado_em at time zone 'America/Sao_Paulo')
          = date_trunc('month', now() at time zone 'America/Sao_Paulo');

    if v_no_mes >= v_teto then
        return false;
    end if;

    -- Intervalo mínimo para o mesmo tutor.
    select max(l.criado_em)
      into v_ultimo
    from lembretes l
    where l.tutor_id = p_tutor_id
      and l.tipo = 'retencao_cliente';

    if v_ultimo is not null and v_ultimo > now() - make_interval(days => v_intervalo) then
        return false;
    end if;

    return true;
end;
$$;

comment on function pode_disparar_retencao(uuid) is
    'Aplica os dois tetos de retencao_cliente (0021): retencao_teto_mensal por petshop no mês corrente, e retencao_intervalo_dias por tutor. Retorna false também quando o teto é 0 (retenção desligada). Chamada por dispararMensagemRetencao() antes de inserir em lembretes. Existe porque retencao_cliente é MARKETING na Meta, ~7x o preço de um UTILITY.';

-- Índice de apoio pras duas contagens acima. Parcial: a fila de lembretes
-- cresce ~1.400 linhas/mês por petshop, e retencao_cliente é uma fração
-- pequena disso — não faz sentido indexar o resto.
create index if not exists idx_lembretes_retencao
    on lembretes (tutor_id, criado_em desc)
    where tipo = 'retencao_cliente';

-- ----------------------------------------------------------------------------
-- 5. Checklist do que falta no CÓDIGO depois desta migration
--
--   [ ] enviar-lembretes: filtrar `canal = 'whatsapp'` na leitura da fila
--       (senão o lembrete de painel vira status='falhou' à toa).
--   [ ] enviar-lembretes: consultar janela_whatsapp_aberta(telefone) e mandar
--       texto livre quando estiver aberta, caindo pro template só quando
--       fechada. Maior economia isolada do plano.
--   [ ] Agenda: ler lembretes com canal='painel' e tipo=
--       'confirmacao_manual_petshop' pra montar o badge de pendência.
--   [ ] Configurações: expor enviar_pet_entregue, escalonar_por_whatsapp,
--       retencao_teto_mensal e retencao_intervalo_dias.
--   [ ] tutores/actions.ts: chamar pode_disparar_retencao() antes do insert.
--   [ ] Cadastro de tutor: pedir CPF (coluna já existe desde a 0006).
--   [ ] Portal do tutor: Pix síncrono (gap #3 da Fase 6, agora bloqueante).
-- ----------------------------------------------------------------------------
