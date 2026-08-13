-- ============================================================================
-- 0004 — Grade de horários fixos pro agendamento
--
-- Contexto: até aqui, tanto a visita avulsa quanto o horário preferencial
-- da assinatura aceitavam qualquer horário digitado à mão. Restringir a uma
-- grade fixa (ex.: de hora em hora) evita horário quebrado tipo 09:07 e
-- prepara terreno pra um dia ter duração por serviço/porte + capacidade por
-- horário (fora do escopo agora — ver nota em docs/regras_padrao_petshop.md
-- seção 1).
--
-- Mesmo padrão de TODO parâmetro operacional do petshop: vira coluna em
-- `petshops`, nunca um valor fixo no código (ver regras_padrao_petshop.md).
-- ============================================================================

alter table petshops
    add column intervalo_agendamento_minutos smallint not null default 60
        check (intervalo_agendamento_minutos > 0);

comment on column petshops.intervalo_agendamento_minutos is
    'Espaçamento entre horários selecionáveis na agenda (avulsa, reagendamento, horário preferencial de assinatura) — grade fixa a partir de hora_abertura. Sem checagem de capacidade por horário ainda (MVP).';
