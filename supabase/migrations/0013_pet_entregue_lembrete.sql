-- ============================================================================
-- 0013 — Mensagem de WhatsApp quando o pet é entregue
--
-- Contexto (pedido de 18/ago/2026): a Visão Geral ganhou um quadro de
-- botões horizontais com as visitas do dia — cada botão avança o
-- agendamento (agendado/confirmado -> pronto -> entregue) direto do
-- balcão, sem passar pela Agenda. "Pronto" já gerava lembrete (pet_pronto,
-- 0005_fase5_lembretes_whatsapp.sql); "Entregue" fechava o ciclo em
-- silêncio. Esta migration fecha a mesma lacuna do outro lado: um
-- agradecimento automático quando o pet sai da loja, no mesmo padrão de
-- pet_pronto (mesmo destinatário, mesmo papel de contato).
--
-- Mesmo desenho de tudo desde a 0005: a trigger só GRAVA a linha em
-- `lembretes` (status='pendente') — quem manda de fato é a Edge Function
-- enviar-lembretes, no próximo ciclo do pg_cron (a cada 2min, job
-- "lembretes-enviar"). O template ('pet_entregue') ainda precisa ser
-- criado e aprovado no WhatsApp Manager antes do primeiro envio real (ver
-- docs/whatsapp_templates_meta.md, template 8) — até lá, o envio falha com
-- "template name does not exist" e a linha vai pra status='falhou', sem
-- travar o fluxo de marcar entregue em si (a trigger só insere a linha,
-- quem processa é a Edge Function, de forma assíncrona).
-- ----------------------------------------------------------------------------

-- 1. lembretes.tipo ganha 'pet_entregue'.
alter table lembretes drop constraint if exists lembretes_tipo_check;
alter table lembretes add constraint lembretes_tipo_check
    check (tipo in (
        'confirmacao_agendamento', 'confirmacao_manual_petshop', 'pet_pronto', 'pet_entregue',
        'cadastro', 'cobranca_falhou', 'cartao_vencendo', 'cobranca_pix', 'aviso_cobranca', 'cadastro_cartao'
    ));

-- 2. trg_pet_pronto_lembrete() ganha o mesmo comportamento pra 'entregue'
--    que já tinha pra 'pronto'. Nome da função ficou de trás (0001 → 0003 →
--    0005) — continua sem recriar a trigger em si, que já aponta pra cá.
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

    return new;
end;
$$;

comment on function trg_pet_pronto_lembrete() is
    'Carimba confirmado_em/pronto_em/entregue_em conforme o status muda, e gera o lembrete de WhatsApp correspondente (pet_pronto e, desde a 0013, pet_entregue) via resolver_contato(busca_entrega). Nome ficou de trás (0001/0003/0005) — cobre bem mais que só "pronto" hoje.';
