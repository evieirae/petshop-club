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

## Fase 1 — Configuração do petshop ✅ concluída

- [x] Tela de configurações virando formulário de verdade sobre `petshops`:
      expediente e intervalo, janela de mensagens D-1, fee fixo +
      percentual da plataforma, `isento_fee_ate`, e a política
      `falta_consome_visita_paga`.

Primeiro passo porque literalmente tudo mais no schema lê parâmetros de
`petshops`.

**Revisão pós-Fase 3**: fee fixo, percentual da plataforma e `isento_fee_ate`
saíram da tela de Configurações do petshop (virou só consulta) e ganharam
tela própria em `/admin`, restrita a quem tem
`usuarios_petshop.eh_admin_plataforma = true` — são a receita da
plataforma, não deveriam ser editáveis pelo petshop parceiro. Ver
`supabase/migrations/0002_admin_plataforma.sql` e seção 3 de
`docs/regras_padrao_petshop.md`.

## Fase 2 — Catálogo: serviços e planos ✅ concluída

- [x] CRUD de `servicos` + `precos_servico`.
- [x] CRUD de `planos`, com `plano_servicos` e `plano_precos` por porte.

Sem isso não dá pra criar uma assinatura — é o que define o que existe pra
vender.

## Fase 3 — Cadastro de tutores e pets ✅ concluída

- [x] Tela de tutores puxando o formulário público de autopreenchimento
      (seção 6 das regras): petshop cadastra só telefone, manda o link, o
      tutor preenche nome/endereço/pets.
- [x] UI pra cadastrar contato adicional por papel (ex.: quem busca o pet,
      se for diferente de quem agenda).

Implementado: `app/(app)/tutores/` (lista com indicador de
`cadastro_completo`, CRUD de pets, contato adicional por papel) +
`app/(public)/cadastro/[tutorId]/` (formulário público, sem sessão, usando
`lib/supabase/admin.ts` com a service_role key pra contornar a RLS). O envio
automático por WhatsApp continua pendente pra Fase 5 — por enquanto a tela
só copia o link e registra o lembrete `tipo='cadastro'` como pendente.
Requer `SUPABASE_SERVICE_ROLE_KEY` em `.env.local` (ver `.env.example`).

## Fase 4 — Assinaturas e agenda operacional ✅ concluída

- [x] Fluxo de criar assinatura (dispara o 1º agendamento via trigger).
- [x] Tela de agenda do dia com as ações confirmar / marcar pronto / marcar
      entregue — mais faltou / cancelar / reagendar (schema já suportava, o
      escopo cresceu na revisão desta fase).

É a primeira tela que o petshop realmente usa no dia a dia.

**Revisão da Fase 4**: no planejamento, surgiu um caso fora do desenho
original — cliente com cadastro mas sem NENHUM agendamento ainda, geralmente
porque quer uma visita avulsa (sem plano/assinatura). O schema original não
suportava isso (`assinaturas.plano_id` e `agendamentos.assinatura_id` eram
ambos `not null`). Em vez de adiar, o escopo da fase cresceu pra cobrir os
dois:

- **Visita avulsa** — `supabase/migrations/0003_fase4_assinaturas_agenda.sql`
  torna `agendamentos.assinatura_id` opcional e adiciona `tutor_id`/`pet_id`/
  `servico_id`/`preco_avulso` pro caso sem assinatura (CHECK garante que é
  sempre um formato OU o outro). Cobrança de avulsa é por visita, não mensal
  proporcional — tabela nova `cobrancas_avulsas`. Ver seção 8 de
  `docs/regras_padrao_petshop.md`.
- **Gerenciamento de assinatura** — criar ficou só insert (trigger já cobre o
  resto), mas pausar/retomar/cancelar não tinham trigger nenhum cobrindo —
  implementados em `app/(app)/tutores/actions.ts`, com o cuidado de ordem já
  documentado em `0001_init.sql` (status da assinatura muda antes de mexer no
  agendamento pendente).
- **Ações da agenda** — confirmar/pronto/entregue (escopo original) mais
  faltou/cancelar/reagendar, porque o schema (`agendamentos.status`) já
  previa os 7 estados e a trigger de avanço de ciclo já reagia a todos eles
  — não fazia sentido construir a tela só com 3 das 7 ações possíveis.
- **"Sem agendamento ainda"** ficou de propósito sem tabela nova — é um
  filtro na consulta da Agenda (tutor sem assinatura e sem agendamento
  avulso), não um novo conceito de dado.
- **Grade de horários fixos** — `supabase/migrations/0004_intervalo_agendamento.sql`
  adiciona `petshops.intervalo_agendamento_minutos` (editável em
  Configurações, padrão 60min). Agendar avulsa, reagendar e escolher o
  horário preferencial de uma assinatura agora oferecem só os horários
  válidos dentro do expediente (`lib/horarios.ts`), em vez de campo livre.
  Ainda sem checagem de capacidade — ver seção 8 de
  `docs/regras_padrao_petshop.md` pra próximos passos (duração por
  serviço/porte, limite de vagas simultâneas).

Toda a migration foi testada direto no projeto Supabase (avulsa, ciclo de
assinatura, pausa/retomada, split de cobrança) antes de entrar no repo.

**Revisão 2 da Fase 4 — quadro semanal**: a Agenda deixou de ser só "hoje" e
virou um quadro (linhas = horários da grade, colunas = domingo a sábado),
navegável pra semanas passadas/futuras via `?data=YYYY-MM-DD` na URL
(`lib/semana.ts`) — sem mecanismo de fetch novo, é `<Link>` mudando a query
string e o Server Component (`app/(app)/agenda/page.tsx`) re-renderiza com o
range certo. Clicar numa visita no quadro abre o painel de ações
(confirmar/pronto/entregue/faltou/cancelar/reagendar) embaixo; clicar em
"+ novo" numa célula vazia abre o formulário de avulsa já com dia e horário
daquela célula preenchidos.

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
