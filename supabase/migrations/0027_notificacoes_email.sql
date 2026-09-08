-- ============================================================================
-- 0027 — E-MAIL DE NOTIFICAÇÃO DO PETSHOP + BASE PRA E-MAILS TRANSACIONAIS
--
-- Primeira fatia do plano registrado no projeto "Aplicativo"
-- (claude/plano-notificacoes-email-multicanal.md): e-mail entra como canal
-- complementar ao WhatsApp, começando pelos e-mails transacionais de acesso
-- (convite + senha temporária + reset — ver lib/email/) e por um e-mail de
-- contato do petshop pra receber esse tipo de aviso administrativo.
--
-- Essa migration NÃO mexe em `lembretes`/`canal` — os e-mails de convite e
-- reset são SÍNCRONOS (disparados na hora, dentro da própria Server Action
-- que já cria/reseta o acesso em app/(admin)/admin/actions.ts), não passam
-- pela fila de lembretes + pg_cron. Estender `lembretes` pros tipos
-- redundantes do plano (cadastro, cobrança recusada) e pros e-mail-só
-- (recibo, cartão vencendo, avisos internos do petshop) fica pra uma fase
-- seguinte — D-1 e pet-pronto continuam só WhatsApp, por decisão explícita
-- registrada no plano.
-- ============================================================================

alter table petshops
    add column if not exists email_notificacoes text;

comment on column petshops.email_notificacoes is
$$Pra onde vão avisos administrativos por e-mail deste petshop. Distinto do e-mail de LOGIN de cada usuário em usuarios_petshop -> auth.users: aqui pode ser um inbox compartilhado (contato@petshop.com.br), não precisa ser login de ninguém. Opcional — nenhum fluxo hoje depende dele; reservado pras próximas fases do plano de notificações por e-mail (avisos de escalonamento, pedidos, reservas).$$;
