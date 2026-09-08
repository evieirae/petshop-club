-- ============================================================================
-- 0025 — O TUTOR MARCA A PRÓPRIA VISITA (portal /minha-conta/agendar)
--
-- A 0024 deu sessão ao tutor, mas só de LEITURA. Aqui ele passa a criar
-- visita. A regra de negócio decidida em 31/ago/2026:
--
--     tutor COM assinatura ativa  → a visita nasce 'agendado' (vale direto)
--     tutor SEM assinatura ativa  → a visita nasce 'solicitado' (pedido)
--
-- O racional é economico, nao tecnico: quem assina ja paga uma vaga
-- recorrente todo mes e o petshop ja conta com ele na semana — fazer esse
-- cliente esperar aprovacao pra marcar um banho extra e atrito sem
-- contrapartida. Quem nao assina esta pedindo venda nova, e o petshop tem o
-- direito de olhar a agenda antes de aceitar.
--
-- NAO CONFUNDIR com a visita recorrente do plano: aquela continua nascendo
-- sozinha pelo trigger de assinatura (0001, secao 10). O que esta migration
-- habilita e a visita EXTRA, avulsa, marcada pelo proprio tutor.
--
-- ORDEM: depois da 0003 (avulsas + cobrancas_avulsas), 0006 (indice
-- agendamentos_slot_unico), 0014 (status 'presente' + log de eventos) e
-- 0024 (sessao do tutor).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Dois status novos
--
-- 'solicitado' = o tutor pediu, o petshop ainda nao respondeu.
-- 'recusado'   = o petshop respondeu que nao. Deliberadamente diferente de
--                'cancelado': cancelar e desmarcar algo que valia; recusar e
--                nunca ter valido. Separar os dois deixa o petshop medir
--                quantos pedidos ele nega, o que 'cancelado' misturado nao
--                permitiria.
--
-- 'recusado' NAO entra na lista de status terminais de
-- trg_agendamento_resolvido() de proposito: recusar um pedido avulso nao tem
-- ciclo de assinatura nenhum pra avancar.
-- ----------------------------------------------------------------------------
alter table agendamentos drop constraint if exists agendamentos_status_check;
alter table agendamentos add constraint agendamentos_status_check
    check (status in ('solicitado','agendado','confirmado','presente','pronto',
                      'entregue','faltou','reagendado','cancelado','recusado'));

-- O log append-only da 0014 grava toda transicao, entao o CHECK dele precisa
-- aceitar exatamente a mesma lista — senao o primeiro pedido recusado derruba
-- o UPDATE inteiro.
alter table agendamento_status_eventos
    drop constraint if exists agendamento_status_eventos_status_check;
alter table agendamento_status_eventos
    add constraint agendamento_status_eventos_status_check
    check (status in ('solicitado','agendado','confirmado','presente','pronto',
                      'entregue','faltou','reagendado','cancelado','recusado'));

-- ----------------------------------------------------------------------------
-- 2. De onde veio a visita
--
-- Nome `criado_por` e nao `origem` de proposito: `origem` ja existe em
-- agendamento_status_eventos com outro significado (avanco/reversao), e duas
-- colunas de mesmo nome e semantica diferente na mesma area do schema e
-- pedido pra alguem ler errado daqui a seis meses.
-- ----------------------------------------------------------------------------
alter table agendamentos
    add column if not exists criado_por text not null default 'petshop'
    check (criado_por in ('petshop','tutor','automatico'));

comment on column agendamentos.criado_por is
    'Quem originou a visita: balcao (petshop), o proprio tutor pelo portal (tutor), ou o trigger de assinatura (automatico). Serve pra medir adocao do portal e pra tela do petshop dizer "marcado pelo tutor".';

-- ----------------------------------------------------------------------------
-- 3. O pedido SEGURA o horario
--
-- O indice da 0006 cobria so ('agendado','confirmado'). Se 'solicitado'
-- ficasse de fora, dois tutores poderiam pedir o mesmo slot e o petshop
-- aceitaria os dois sem perceber — ou pior, o tutor pediria, esperaria, e
-- descobriria depois que o horario ja tinha ido embora. Pedido pendente
-- ocupa a vaga; recusa ou expiracao devolve (os dois status finais estao
-- fora do WHERE, entao o slot volta sozinho).
-- ----------------------------------------------------------------------------
drop index if exists agendamentos_slot_unico;
create unique index agendamentos_slot_unico
    on agendamentos (petshop_id, data_hora)
    where status in ('solicitado', 'agendado', 'confirmado');

-- ----------------------------------------------------------------------------
-- 4. Pedido nao cobra; aceite cobra
--
-- trg_agendamento_processar_cobranca() cria a linha em cobrancas_avulsas no
-- INSERT do agendamento (0003, secao 3). Um pedido que ainda pode ser
-- recusado NAO pode gerar cobranca — o cron de processar-cobrancas pegaria
-- ela e debitaria o tutor por uma visita que o petshop ia negar.
--
-- A funcao NAO foi reescrita aqui de proposito: ela ja foi redefinida na 0006
-- (valor_petshop = valor_total) e copiar 100 linhas dela pra dentro desta
-- migration so pra acrescentar um `if` seria a forma mais facil de
-- reintroduzir um bug ja corrigido. A clausula WHEN do proprio trigger
-- resolve sem tocar no corpo.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_agendamentos_processar_cobranca on agendamentos;
create trigger trg_agendamentos_processar_cobranca
    after insert on agendamentos
    for each row
    when (new.status <> 'solicitado')
    execute function trg_agendamento_processar_cobranca();

-- O aceite do petshop ('solicitado' -> 'agendado') e o momento em que a
-- cobranca finalmente nasce. Recusa e cancelamento nao passam por aqui.
-- A mesma funcao serve nos dois gatilhos: o branch de avulsa dela le so
-- new.assinatura_id / new.petshop_id / new.preco_avulso / new.id, todos
-- disponiveis em UPDATE.
drop trigger if exists trg_agendamentos_cobranca_ao_aceitar on agendamentos;
create trigger trg_agendamentos_cobranca_ao_aceitar
    after update on agendamentos
    for each row
    when (old.status = 'solicitado' and new.status = 'agendado')
    execute function trg_agendamento_processar_cobranca();

-- ============================================================================
-- O QUE ESTA MIGRATION NAO FAZ (e por que)
--
--  * Nao cria lembrete pro petshop quando chega um pedido. `lembretes.tipo`
--    teria que ganhar um valor novo e um template aprovado na Meta — por
--    enquanto o aviso e a faixa "Pedidos aguardando resposta" no topo da
--    Agenda. Se o petshop deixar pedido morrendo sem resposta no piloto,
--    esse e o primeiro lugar pra mexer.
--
--  * Nao expira pedido sozinho. Um pedido esquecido segura o horario pra
--    sempre. Como o slot fica visivelmente ocupado na agenda do petshop, o
--    balcao percebe; um pg_cron de "recusa automatica depois de N horas"
--    entra quando isso incomodar de verdade.
--
--  * Nao deixa o tutor remarcar nem cancelar visita pelo portal. So criar.
--    Remarcar mexe em visita ja cobrada (do plano, inclusive) e merece a
--    propria regra — nao cabia junto.
--
--  * Nao valida capacidade por porte nem duracao por servico. Continua uma
--    visita por horario por petshop (o indice unico da 0006), que e a regra
--    que ja valia pro balcao.
--
-- ============================================================================
-- CHECKLIST DE TESTE
--
--  [ ] Tutor COM assinatura ativa marca pelo portal -> nasce 'agendado' e
--      cobrancas_avulsas ganha 1 linha 'pendente' na hora.
--  [ ] Tutor SEM assinatura marca -> nasce 'solicitado' e cobrancas_avulsas
--      NAO ganha linha nenhuma.
--  [ ] Petshop aceita o pedido -> status vira 'agendado' e SO ENTAO aparece a
--      linha em cobrancas_avulsas.
--  [ ] Petshop recusa -> status 'recusado', nenhuma cobranca, e o horario
--      volta a aparecer livre pra outro tutor.
--  [ ] Dois pedidos no mesmo horario: o segundo estoura
--      agendamentos_slot_unico (23505) e a tela devolve "horario acabou de
--      ser ocupado".
--  [ ] Reagendamento pelo balcao continua funcionando (status 'reagendado'
--      esta fora do WHERE do indice, entao libera o slot antigo).
--  [ ] O log agendamento_status_eventos aceita 'solicitado' e 'recusado' sem
--      estourar CHECK.
-- ============================================================================
