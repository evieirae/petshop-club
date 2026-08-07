# Roadmap — Clube de Banho e Tosa

Passo a passo da fundação técnica atual até uma versão beta rodando com um
petshop real. Pensado pra ser trabalhado fase por fase, cada uma numa
conversa nova com o Claude (clonando o repo no início de cada uma).

As fases 1–4 são principalmente CRUD sobre o schema que já existe — mais
previsíveis e rápidas. As fases 5 e 6 são as que trazem risco/incerteza de
verdade (integração externa com WhatsApp e gateway de pagamento) — vale
reservar mais tempo de exploração aí, inclusive testar as duas em paralelo
com dados fake antes de conectar num petshop real.

## Fase 0 — Fundação ✅ concluída

Next.js (App Router) + Supabase (auth + RLS) + Tailwind, login funcionando,
navegação, contexto de petshop logado, e as 4 áreas operacionais mapeadas
como placeholder. Schema, ER diagram e regras de negócio versionados em
`docs/` e `supabase/migrations/`.

## Fase 1 — Configuração do petshop

- [ ] Tela de configurações virando formulário de verdade sobre `petshops`:
      expediente e intervalo, janela de mensagens D-1, fee fixo +
      percentual da plataforma, `isento_fee_ate`, e a política
      `falta_consome_visita_paga`.

Primeiro passo porque literalmente tudo mais no schema lê parâmetros de
`petshops`.

## Fase 2 — Catálogo: serviços e planos

- [ ] CRUD de `servicos` + `precos_servico`.
- [ ] CRUD de `planos`, com `plano_servicos` e `plano_precos` por porte.

Sem isso não dá pra criar uma assinatura — é o que define o que existe pra
vender.

## Fase 3 — Cadastro de tutores e pets

- [ ] Tela de tutores puxando o formulário público de autopreenchimento
      (seção 6 das regras): petshop cadastra só telefone, manda o link, o
      tutor preenche nome/endereço/pets.
- [ ] UI pra cadastrar contato adicional por papel (ex.: quem busca o pet,
      se for diferente de quem agenda).

## Fase 4 — Assinaturas e agenda operacional

- [ ] Fluxo de criar assinatura (dispara o 1º agendamento via trigger).
- [ ] Tela de agenda do dia com as ações confirmar / marcar pronto / marcar
      entregue.

É a primeira tela que o petshop realmente usa no dia a dia.

## Fase 5 — Lembretes automáticos via WhatsApp

- [ ] Edge Function + `pg_cron` rodando nos horários configurados por
      petshop (`horario_envio_lembrete`, cortes de confirmação manhã/tarde).
- [ ] Integração com uma API de WhatsApp Business (Twilio, Z-API e Meta
      Cloud API são as opções mais comuns no Brasil).

A tabela `lembretes` e os triggers já geram os registros pendentes (D-1,
pet pronto, escalonamento, cadastro) — falta só o envio de fato.

## Fase 6 — Cobrança com gateway de pagamento real

- [ ] Tokenização de cartão e cobrança recorrente via gateway (Asaas,
      Pagar.me ou Stripe são os mais usados pra split automático no
      Brasil).
- [ ] Split automático petshop/plataforma no momento da cobrança.

O trigger já calcula o valor proporcional e o split
(`valor_petshop` vs `valor_percentual`) — falta ligar o gateway de verdade.
É o passo mais delicado tecnicamente.

## Fase 7 — Deploy + piloto com 1 petshop real → beta

- [ ] Vercel ligado ao repo (env vars cadastradas lá também).
- [ ] Projeto Supabase de produção.
- [ ] Uso real com um petshop parceiro (Pedra Branca ou Pagani) por 2–4
      semanas, cobrindo um ciclo mensal inteiro de cobrança.

Esse ciclo completo rodando sem intervenção manual é a definição prática de
**beta** aqui.
