-- ============================================================================
-- 0028 — fechamento dos achados do checklist de segurança (07/set/2026)
-- antes da publicação da v1: claude/checklist-seguranca-producao.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. #15/#17 — view petshops_vitrine, RLS restringe linha, não coluna
--
-- Até aqui, a policy "vitrine_tutor" (0024) liberava a LINHA INTEIRA do
-- petshop pro tutor dono dela. O comentário da 0024 já avisava "o portal
-- NUNCA deve dar select * em petshops", mas isso é disciplina de aplicação,
-- não trava de banco: um tutor com o próprio JWT podia chamar a REST API
-- direto (GET /rest/v1/petshops?select=*) e ler fee_fixo_mensal,
-- percentual_plataforma, cnpj, gateway_wallet_id, comissao_percentual_*
-- etc. — nenhuma dessas colunas é assunto do cliente do petshop.
--
-- Fix: a policy "vitrine_tutor" sai da tabela base; o tutor passa a ler
-- petshops só através desta view, que expõe apenas colunas sem valor
-- comercial sensível e faz o próprio filtro de linha (não depende de RLS
-- na tabela base — que a partir de agora não libera nada pro tutor). Dono/
-- equipe e admin continuam acessando petshops normalmente pela policy
-- "isolamento_petshop", inalterada.
--
-- Consumida por: lib/auth/getTutorContext.ts e
-- app/(tutor)/minha-conta/agendar/actions.ts (buscarHorariosLivres).
-- ----------------------------------------------------------------------------

drop policy if exists "vitrine_tutor" on petshops;

create or replace view public.petshops_vitrine as
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
from petshops p
where p.id = (select tutores.petshop_id from tutores where tutores.id = auth_tutor_id());

comment on view public.petshops_vitrine is
    'Colunas públicas de petshops para o portal do tutor — nunca fee_fixo_mensal, '
    'percentual_plataforma, cnpj, comissao_percentual_*, fee_promocional ou ids de '
    'gateway. O filtro de linha está na própria view (auth_tutor_id()), não em RLS '
    'da tabela base. Ver migration 0028 e checklist-seguranca-producao.md #15/#17.';

grant select on public.petshops_vitrine to authenticated;

-- ----------------------------------------------------------------------------
-- 2. #20 (parcial) — search_path mutável em todas as funções de negócio
--
-- Sem search_path fixo, uma função SECURITY DEFINER (ou até INVOKER, se
-- chamada num contexto com search_path alterado) pode resolver nomes de
-- tabela/função contra um schema diferente do esperado — o clássico ataque
-- de "schema shadowing". auth_tutor_id() já usa search_path=public desde a
-- 0024; esta migration alinha as outras ~35 funções ao mesmo padrão.
--
-- search_path=public é seguro aqui: nenhuma função abaixo chama extensão
-- sem qualificar o schema (net.http_post já vem qualificado em
-- processar_checkpoints_lembretes; gen_random_uuid() só aparece em DEFAULT
-- de coluna, que resolve pelo search_path da sessão que insere, não pelo
-- da função) — conferido em pg_proc antes de aplicar.
-- ----------------------------------------------------------------------------

alter function public.auth_petshop_id() set search_path = public;
alter function public.auth_admin_plataforma() set search_path = public;
alter function public.resolver_contato(uuid, text) set search_path = public;
alter function public.trg_pet_pronto_lembrete() set search_path = public;
alter function public.gerar_proximo_agendamento(uuid, timestamptz) set search_path = public;
alter function public.trg_agendamento_resolvido() set search_path = public;
alter function public.trg_assinatura_primeiro_agendamento() set search_path = public;
alter function public.contar_ocorrencias_dia_semana_mes(smallint, date) set search_path = public;
alter function public.trg_agendamento_processar_cobranca() set search_path = public;
alter function public.gerar_mensalidade_petshop(uuid, date) set search_path = public;
alter function public.trg_petshops_protege_taxas() set search_path = public;
alter function public.gerar_lembretes_confirmacao() set search_path = public;
alter function public.escalar_confirmacao_pendente(text) set search_path = public;
alter function public.processar_checkpoints_lembretes() set search_path = public;
alter function public.registrar_mensagem_recebida(text, timestamptz) set search_path = public;
alter function public.janela_whatsapp_aberta(text) set search_path = public;
alter function public.confirmar_agendamento_por_whatsapp(text, text) set search_path = public;
alter function public.registrar_status_mensagem(text, text, text, timestamptz) set search_path = public;
alter function public.registrar_pagamento_gateway(text, text, timestamptz) set search_path = public;
alter function public.pausar_assinatura_por_inadimplencia(uuid) set search_path = public;
alter function public.registrar_falha_pagamento(text, text, text) set search_path = public;
alter function public.gerar_proxima_visita_serie(uuid) set search_path = public;
alter function public.marcar_pagamento_local(text, uuid) set search_path = public;
alter function public.trg_registrar_evento_status() set search_path = public;
alter function public.voltar_status_agendamento(uuid) set search_path = public;
alter function public.registrar_venda(uuid, uuid, uuid, text, jsonb, uuid) set search_path = public;
alter function public.criar_venda_pendente_pix(uuid, uuid, uuid, jsonb, uuid) set search_path = public;
alter function public.valor_base_agendamento(uuid) set search_path = public;
alter function public.resumo_comissoes(uuid, date, date) set search_path = public;
alter function public.trg_petshops_protege_status() set search_path = public;
alter function public.trg_produtos_respeita_reserva() set search_path = public;
alter function public.criar_reserva_tutor(uuid, jsonb) set search_path = public;
alter function public.devolver_estoque_reservado(uuid) set search_path = public;
alter function public.cancelar_reserva(uuid) set search_path = public;
alter function public.concluir_reserva(uuid, text) set search_path = public;
alter function public.expirar_reservas() set search_path = public;
