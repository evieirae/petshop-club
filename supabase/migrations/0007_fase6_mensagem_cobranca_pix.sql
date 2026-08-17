-- ============================================================================
-- 0007 — Fase 6: fecha o gap de geração da mensagem cobranca_pix
--
-- Até aqui (0006), lembretes.tipo aceitava 'cobranca_pix' no CHECK, mas
-- nada gerava essa linha de verdade: processar-cobrancas tinha um TODO no
-- lugar (ver histórico), e montarMensagem() em _shared/templates.ts
-- retornava null pra esse tipo. Esta migration só cuida do lado do schema
-- — o código vem em processar-cobrancas/index.ts, enviar-lembretes/index.ts
-- e _shared/templates.ts (mesmo commit).
--
-- dados_extra (jsonb) carrega o payload específico de cobranca_pix —
-- petNome, valorFormatado, pixCopiaCola — que não têm coluna dedicada
-- porque só esse tipo de lembrete usa. Mesma decisão de design de
-- eventos_gateway.payload (0006), só que por linha em vez de log bruto.
-- Aplicada em produção em 17/ago/2026.
-- ============================================================================

alter table lembretes add column if not exists dados_extra jsonb;

comment on column lembretes.dados_extra is
    'Payload extra específico do tipo de lembrete (ex.: cobranca_pix precisa de petNome/valorFormatado/pixCopiaCola, que não têm coluna dedicada) — usado por montarMensagem() em _shared/templates.ts. Null pros tipos que não precisam.';
