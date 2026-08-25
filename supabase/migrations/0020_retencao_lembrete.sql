-- ============================================================================
-- 0020 — lembretes.tipo ganha 'retencao_cliente' (SEM o lado de envio)
--
-- Contexto (pedido do Eduardo, 20/ago/2026): a tela de Pets ganhou um
-- botão "Chamar de volta" pra pet que não vem há um tempo — registra um
-- pedido de mensagem de reengajamento em `lembretes`
-- (app/(app)/tutores/actions.ts, dispararMensagemRetencao).
--
-- ESTA MIGRATION É DE PROPÓSITO SÓ METADE DO CAMINHO — decisão explícita
-- do Eduardo antes de escrever isto: "sentimos sua falta, quer agendar?" é
-- categoria MARKETING na Meta (diferente dos 8 templates que já existem,
-- todos UTILITY — mensagem sobre um serviço já contratado). MARKETING
-- custa mais por conversa e tem regra de aprovação/opt-in diferente (ver
-- docs/whatsapp_templates_meta.md, topo do arquivo). Em vez de inventar um
-- texto às pressas e arriscar submeter algo errado, o Eduardo escolheu
-- construir só a contagem de dias + o registro da intenção agora, e deixar
-- o desenho do template MARKETING (e a submissão na Meta) pra quando ele
-- decidir o texto com calma.
--
-- Efeito prático: uma linha 'retencao_cliente' fica 'pendente' até alguém
-- (1) desenhar o template, (2) submeter e aprovar na Meta, e (3) mapear o
-- tipo em supabase/functions/_shared/templates.ts (montarMensagem) e
-- enviar-lembretes/index.ts — nenhum dos três passos está feito aqui de
-- propósito. Até lá, se o cron (enviar-lembretes) pegar essa linha,
-- montarMensagem() cai no `default: return null` que já existe (mesmo
-- comportamento hoje reservado pra cobranca_falhou/cartao_vencendo/
-- aviso_cobranca/cadastro_cartao — tipos permitidos no CHECK, sem gerador
-- de mensagem ainda) e a linha vira status='falhou' com erro_envio
-- explicando "sem template mapeado". Seguro: nada sai errado, só não sai.
-- ============================================================================

alter table lembretes drop constraint if exists lembretes_tipo_check;
alter table lembretes add constraint lembretes_tipo_check
    check (tipo in (
        'confirmacao_agendamento', 'confirmacao_manual_petshop', 'pet_pronto', 'pet_entregue',
        'cadastro', 'cobranca_falhou', 'cartao_vencendo', 'cobranca_pix', 'aviso_cobranca',
        'cadastro_cartao', 'retencao_cliente'
    ));

comment on constraint lembretes_tipo_check on lembretes is
    'retencao_cliente (0020) fica reservado aqui sem gerador de mensagem ainda — ver comentário no topo da migration 0020_retencao_lembrete.sql sobre a categoria MARKETING pendente de definição.';

-- ============================================================================
-- CHECKLIST ANTES DE APLICAR ESTA MIGRATION
--
--  [ ] Clicar "Chamar de volta" num pet com pelo menos uma visita
--      'entregue' e conferir que nasce uma linha em `lembretes` com
--      tipo='retencao_cliente', status='pendente' e dados_extra
--      preenchido ({ petNome, dias }).
--  [ ] Se o cron enviar-lembretes rodar antes do template existir, conferir
--      que a linha vira status='falhou' com uma mensagem clara em
--      erro_envio (não deve travar nem afetar nenhum outro lembrete do
--      lote).
--
-- PRÓXIMO PASSO (fora desta migration, quando o Eduardo decidir o texto):
--  1. Escrever o template 9 em docs/whatsapp_templates_meta.md, categoria
--     MARKETING.
--  2. Adicionar o case 'retencao_cliente' em
--     supabase/functions/_shared/templates.ts (montarMensagem).
--  3. Buscar petshop/dados_extra em
--     supabase/functions/enviar-lembretes/index.ts, igual ao que já existe
--     pra cobranca_pix (dados_extra) e cadastro (buscarPetshopDoTutor).
--  4. Submeter o template no WhatsApp Manager e esperar aprovação antes do
--     primeiro envio real.
-- ============================================================================
