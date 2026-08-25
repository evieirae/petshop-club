# Regras e parâmetros por petshop

Este documento cataloga tudo que é específico de cada petshop parceiro — tanto
os **valores** (horários, taxas, preços) quanto as **políticas** (decisões de
negócio que podem variar de um petshop pro outro). Cada item aqui corresponde
a uma coluna real no banco (`clube_banho_tosa_schema.sql`); os valores
mostrados como "padrão" são o `default` que uma linha nova de `petshops`
recebe automaticamente, editável a qualquer momento sem mudar código.

Serve três propósitos: (1) checklist pra colocar um petshop novo no ar, (2)
espec pra quem for construir a tela de configurações, e (3) o lugar onde
qualquer decisão de negócio nova — tipo a de falta que originou este arquivo
— entra, em vez de ficar implícita dentro de uma trigger.

---

## 1. Expediente e intervalo

| Variável | Coluna (`petshops`) | Tipo | Padrão | O que controla |
|---|---|---|---|---|
| Horário de abertura | `hora_abertura` | time | 09:00 | Referência de expediente (o sistema ainda não bloqueia agendamento fora do horário — a equipe ajusta na mão se precisar). |
| Horário de fechamento | `hora_fechamento` | time | 18:00 | Idem. |
| Início do intervalo | `hora_inicio_intervalo` | time | *nulo* | Pausa pro almoço. Fica `null` se o petshop não para. |
| Fim do intervalo | `hora_fim_intervalo` | time | *nulo* | Idem. |
| Corte manhã/tarde | `hora_divisao_periodo` | time | 12:00 | Define o que conta como "agendamento de manhã" x "de tarde" pros checkpoints de confirmação (seção 2). |
| Intervalo entre horários | `intervalo_agendamento_minutos` | smallint | 60 | Espaçamento da grade de horários oferecida ao agendar visita avulsa, reagendar, ou escolher o horário preferencial de uma assinatura (`lib/horarios.ts`) — ver seção 8. |

> **Sobre a grade de horários (`intervalo_agendamento_minutos`)**: restringe
> a UI a horários "redondos" dentro do expediente (evita 09:07), mas ainda
> **não** faz nenhuma checagem de capacidade — mais de um pet pode cair no
> mesmo horário sem aviso. Duração por serviço/porte e limite de vagas
> simultâneas por horário são evolução natural disso, mas ficaram de fora
> de propósito na primeira versão (`supabase/migrations/0004_intervalo_agendamento.sql`)
> pra não misturar "grade de horários" com "capacidade" na mesma mudança.

## 2. Janela de mensagens (confirmação D-1)

| Variável | Coluna (`petshops`) | Tipo | Padrão | O que controla |
|---|---|---|---|---|
| Envio do lembrete | `horario_envio_lembrete` | time | 09:00 | Quando dispara a mensagem pedindo confirmação ao tutor, no dia anterior à visita. |
| Corte de manhã | `horario_corte_confirmacao_manha` | time | 15:00 | Se não confirmado até esse horário, escala pro **petshop** confirmar manualmente (agendamentos de amanhã de manhã). |
| Corte de tarde | `horario_corte_confirmacao_tarde` | time | 17:00 | Mesma escalada, pros agendamentos de amanhã à tarde. |
| Limite do petshop (tarde) | `horario_limite_petshop_tarde` | time | 18:00 | Prazo pra equipe resolver manualmente as pendências de tarde. |

> Todos os quatro horários existem porque cada petshop conhece melhor o
> próprio ritmo — uns respondem mensagem de manhã cedo, outros só à noite.
> Não há um "certo" universal.

**Como a confirmação chega** (Fase 5, WhatsApp Cloud API da Meta) — três
caminhos, todos terminando no mesmo lugar (`agendamentos.status =
'confirmado'`, que o trigger carimba em `confirmado_em`):

1. O tutor toca no botão da mensagem e cai na rota pública
   `/confirmar/[lembreteId]`.
2. O tutor responde **"sim"** na própria conversa — o webhook
   (`supabase/functions/whatsapp-webhook`) casa a resposta com o lembrete de
   confirmação mais recente daquele telefone e chama
   `confirmar_agendamento_por_whatsapp()`.
3. A equipe confirma na tela de Agenda, quando o cliente avisou por outro
   meio.

Resposta que não seja um "sim" seco (ex.: *"sim, mas dá pra ser 15h?"*) é
ignorada de propósito pelo caminho 2 — vira escalonamento normal pro
petshop, e alguém lê a mensagem. Confirmar um horário que o cliente está
justamente questionando seria pior do que não confirmar nada.

As mensagens saem por **templates aprovados na Meta** (obrigatório pra
mensagem que a gente inicia) — texto, parâmetros e regras de aprovação em
`docs/whatsapp_templates_meta.md`.

## 3. Cobrança e repasse (split de pagamento)

| Variável | Coluna (`petshops`) | Tipo | Padrão | O que controla |
|---|---|---|---|---|
| Fee fixo mensal | `fee_fixo_mensal` | numeric | R$ 99,00 | Mensalidade da plataforma cobrada do petshop (`mensalidades_petshop`), independente do nº de visitas. |
| Percentual da plataforma | `percentual_plataforma` | numeric | 0,03 (3%) | Receita da plataforma sobre cada cobrança de tosa — ver mudança de modelo abaixo. |
| Isento até | `isento_fee_ate` | date | *nulo* | Data até a qual o fee fixo sai zerado — usado pro período de teste do piloto. |
| Falta consome visita paga | `falta_consome_visita_paga` | boolean | **true** | Ver seção 5 — política de negócio, não só um valor. |

> **Mudança de modelo na Fase 6** (`docs/fase6_pagamentos.md`, decisão de
> 16/ago/2026): até a Fase 4, `percentual_plataforma` era descrito como um
> **corte** — o petshop recebia `valor_total − percentual` (97% de R$99).
> Isso mudou: com gateway de pagamento real, a taxa de transação do
> próprio gateway (Asaas) reduziria a margem de um jeito imprevisível se
> continuasse saindo do que o petshop recebe (ver "unit economics" no
> plano). A partir da Fase 6, **o petshop recebe 100% do valor do
> serviço/plano**, e `percentual_plataforma` + a taxa do gateway daquele
> meio de pagamento (Pix = R$0, cartão = variável) formam uma **taxa de
> serviço somada por cima**, cobrada do tutor, exibida separada do preço
> do serviço ("Banho R$99,00 + taxa de serviço R$X,XX = Total R$Y,YY").
> Pix continua sendo o meio mais barato pro tutor, porque só carrega a
> parte da plataforma, nunca a do gateway.

> **Quem edita isso**: só a administração da plataforma (uma linha em
> `admins_plataforma`, identidade independente de qualquer petshop — ver
> `supabase/migrations/0017_admin_plataforma_independente.sql`), pela tela
> `/admin/petshops` — nunca o petshop parceiro. É a receita da plataforma,
> não um parâmetro operacional do petshop. O petshop só visualiza os
> próprios valores em Configurações (fica claro ali que é "só consulta").
> Reforçado em dois níveis (não é só a tela que esconde o campo): a RLS de
> `petshops` e um trigger `BEFORE UPDATE` rejeitam qualquer alteração
> dessas 3 colunas por quem não tem essa linha em `admins_plataforma`, mesmo
> via chamada direta à API do Supabase — ver
> `supabase/migrations/0002_admin_plataforma.sql`. Não existe UI de
> auto-promoção a admin; a linha só é criada na mão via SQL Editor.
>
> **Congelamento/encerramento de conta** (`petshops.status`, mesma
> migration 0017): mesma proteção de dois níveis das 3 colunas de taxa.
> `status != 'ativo'` bloqueia o login de toda a equipe desse petshop
> (`app/(app)/layout.tsx`) — não afeta um login que também seja admin da
> plataforma, que continua acessando `/admin` normalmente.

## 4. Planos (por plano, não por petshop)

Diferente do resto deste documento, estas variáveis vivem em `planos`, uma
linha por plano — um mesmo petshop pode ter vários planos com combinações
diferentes.

| Variável | Coluna (`planos`) | Tipo | Padrão | O que controla |
|---|---|---|---|---|
| Intervalo | `intervalo_dias` | smallint | — (obrigatório) | Cadência da visita: 7 (semanal), 14 (quinzenal), 30, ou qualquer outro. |
| Ocorrências padrão/mês | `ocorrencias_padrao_mes` | smallint | 4 | Base pra calcular o valor por visita (`preco_assinatura / ocorrencias_padrao_mes`) e, portanto, a cobrança proporcional em meses "de 5 semanas". |

## 5. Políticas de negócio

Esta seção é diferente das anteriores: não são só valores, são **decisões**
que mudam o comportamento do sistema. Cada uma vira uma coluna booleana (ou
enum) em `petshops`, nunca uma regra fixa dentro de uma trigger.

### Falta consome visita paga? (`falta_consome_visita_paga`, padrão: `true`)

Quando o tutor falta numa visita dentro do mês já cobrado:

- **`true` (padrão atual)** — a falta conta como uma visita usada. O
  contador (`assinaturas.banhos_restantes_mes`) desce normalmente, sem
  crédito nem reposição. É o comportamento mais simples e o que já está
  implementado de ponta a ponta.
- **`false`** — a visita perdida por falta do tutor **não** deveria consumir
  o crédito do mês, abrindo espaço pra uma reposição sem cobrança extra.
  **Ainda não implementado**: a coluna existe, mas a lógica de "gerar uma
  visita de reposição dentro do mesmo mês, sem disparar cobrança nova" não
  foi construída. Fica registrado aqui como próximo passo técnico caso
  algum petshop parceiro peça esse comportamento.

### Áreas ainda sem política definida (candidatos a entrar aqui)

Situações que já apareceram na conversa mas ainda não viraram uma coluna,
porque o comportamento exato ainda não foi decidido:

- **Quem cancelou a visita** — hoje `agendamentos.status = 'cancelado'` não
  distingue se foi o tutor ou o petshop que cancelou. Se algum dia isso
  precisar de tratamento diferente (ex.: cancelamento do petshop *sempre*
  gera reposição, do tutor depende da política acima), vai precisar de um
  campo `cancelado_por` antes de virar uma regra aqui.
- **Follow-up de "pet pronto" sem retirada** — decidido explicitamente como
  "fica de fora por enquanto, depende da abordagem de cada petshop com os
  clientes". Quando/se algum petshop quiser um lembrete de atraso na
  retirada, a política (ex.: "avisar de novo depois de X horas") entra
  aqui, com o X virando coluna.

### Contato por papel (`contatos_adicionais` + `resolver_contato()`)

Não é bem uma política de petshop — é uma regra fixa do produto, mas vale
documentar aqui porque muda pra quem cada mensagem automática vai:

- Cada tutor tem, por padrão, **um único contato** (o próprio cadastro).
- Quando quem agenda não é quem leva/busca o pet (o exemplo que motivou
  isso: esposa marca, marido busca porque trabalha home office), o petshop
  cadastra um contato adicional com `papel='busca_entrega'` — só esse papel
  específico, sem duplicar o cadastro inteiro.
- Toda mensagem automática já sai com um `papel_destino` fixo:
  confirmação D-1 e aviso de "pet pronto" vão pra `busca_entrega` (é quem
  precisa efetivamente aparecer); mensagens de cobrança iriam pra
  `cobranca`. Sem contato cadastrado pra aquele papel, cai automaticamente
  no tutor principal — não existe estado "sem destinatário".
- Isso é regra de produto, não de petshop individual, mas se algum petshop
  quiser mudar pra qual papel uma mensagem vai (ex.: preferir sempre mandar
  pro tutor principal, nunca pro busca_entrega), essa preferência viraria
  uma política nova aqui.

## 6. Cadastro do tutor e do pet (link de autopreenchimento)

Mesma lógica do link de confirmação de presença: em vez da equipe digitar os
dados do cliente no balcão (rápido, mas sujeito a erro e a campo em branco),
o petshop cadastra só o telefone e a plataforma manda um link de WhatsApp
pro próprio tutor preencher.

- Reaproveita a estrutura de `lembretes` — não é uma tabela nova. O disparo
  usa `tipo='cadastro'`, `destinatario='tutor'`, e como ainda não existe
  nenhum agendamento nesse momento, `agendamento_id` fica nulo e `tutor_id`
  aponta direto pro tutor (por isso `lembretes` agora aceita as duas formas
  de referência — ver o CHECK na tabela).
- O formulário público preenche: dados do tutor (`nome`, `telefone`,
  `endereco`), dados do(s) pet(s) (`nome`, `porte`, `raça`, `observacoes`) e,
  opcionalmente, um contato adicional (seção 5, "Contato por papel") se quem
  busca o pet for diferente de quem cadastrou.
- `tutores.cadastro_completo` vira `true` quando o formulário é enviado — dá
  pra equipe ver de relance quem ainda está com cadastro pendente.
- O link pode ser reenviado a qualquer momento (não é uma ação única) — útil
  se o tutor mudar de endereço ou telefone.
- **Tutor/pet que não é mais atendido não é excluído, é desativado**
  (`tutores.ativo`/`pets.ativo`, `supabase/migrations/0019_tutores_pets_ativo.sql`)
  — some das listas e dos pickers de agendamento/venda NOVOS, mas o
  histórico (agendamentos, vendas, cobranças) continua intacto, e dá pra
  reativar a qualquer momento. Mesmo padrão já usado em
  `funcionarios.ativo`/`produtos.ativo`.

## 7. Checklist de onboarding de um petshop novo

Na prática, colocar um petshop parceiro novo no ar é preencher esta lista:

> **De onde vem o pedido**: a Home pública (`app/page.tsx`) tem um
> formulário de cotação que grava um pedido de interesse em `leads_saas`
> (`supabase/migrations/0018_leads_saas.sql`) — isso NUNCA cria petshop
> sozinho. O passo 1 abaixo (criar a linha em `petshops` + o login do dono)
> é sempre manual, feito pelo admin da plataforma em `/admin/petshops`
> ("+ Novo petshop") ou, a partir de um lead específico, em `/admin/leads`
> ("Converter em petshop") — os dois caminhos levam ao mesmo formulário.

1. Cadastrar a linha em `petshops` e o login do dono (`/admin/petshops`,
   nome, CNPJ, telefone, endereço — CNPJ/telefone/endereço ainda entram
   direto no SQL Editor por enquanto, só nome + dono têm tela).
2. Confirmar ou ajustar expediente e intervalo (seção 1) — os padrões
   (09h–18h, sem pausa) servem de ponto de partida, mas vale confirmar com
   o dono.
3. Confirmar os horários de mensagem (seção 2) — perguntar quando os
   clientes desse petshop costumam responder WhatsApp.
4. Definir `fee_fixo_mensal` e `percentual_plataforma` (seção 3) — ou manter
   o padrão de lançamento (R$ 99 + 3%) e usar `isento_fee_ate` pro período
   de piloto.
5. Cadastrar o catálogo de `servicos` e `precos_servico` (banho, tosa
   higiênica, tosa completa × porte).
6. Montar os `planos` (combinação de serviços + `intervalo_dias` +
   `ocorrencias_padrao_mes`) e os preços em `plano_precos` por porte.
7. Revisar a seção 5 com o dono do petshop — em especial
   `falta_consome_visita_paga` — mesmo sabendo que hoje só o valor `true`
   está de fato implementado.
8. Ao cadastrar o primeiro tutor, usar o link de autopreenchimento (seção 6)
   em vez de digitar tudo na mão — já testa o fluxo real que os próximos
   clientes vão usar.

## 8. Visita avulsa (sem plano)

Adicionado na revisão da Fase 4, pra cobrir o cliente que quer uma visita
sem entrar numa assinatura — banho de balcão, ou um "vamos testar antes de
assinar". Ver `supabase/migrations/0003_fase4_assinaturas_agenda.sql`.

- `agendamentos.assinatura_id` fica nulo; `tutor_id`, `pet_id`, `servico_id`
  e `preco_avulso` é que descrevem a visita (CHECK no banco garante que é
  sempre um formato OU o outro — nunca os dois, nunca nenhum).
- Preço é travado no momento do agendamento — snapshot de `precos_servico`
  pelo porte do pet, mesma lógica de `plano_precos` não ser recalculado
  depois. Se o preço do serviço mudar amanhã, a visita já agendada mantém o
  valor de quando foi marcada.
- Cobrança é **por visita**, não mensal proporcional — tabela própria
  `cobrancas_avulsas` (1 linha por `agendamento_id`), separada de `cobrancas`
  (1 linha por mês por assinatura). Mesmo split `percentual_plataforma` da
  seção 3 se aplica.
- Visita avulsa **não gera a próxima sozinha** — cada uma é agendada na mão,
  uma de cada vez. `trg_agendamento_resolvido` só chama
  `gerar_proximo_agendamento` quando `assinatura_id is not null`.
- **Resolvido na Fase 5** (lembretes via WhatsApp): `resolver_contato()`
  precisa de um `tutor_id` pra achar o contato certo. Pra visita de
  assinatura, esse `tutor_id` vem de `agendamentos.assinatura_id ->
  assinaturas.tutor_id`; pra avulsa, vem direto de `agendamentos.tutor_id`.
  Essa ramificação está implementada em `gerar_lembretes_confirmacao()` e
  em `trg_pet_pronto_lembrete()`
  (`supabase/migrations/0005_fase5_lembretes_whatsapp.sql`), e o telefone
  resolvido fica gravado em `lembretes.telefone_destino` como snapshot —
  mudança de cadastro depois não reescreve pra quem a mensagem foi mandada.
- "Cliente com cadastro mas sem NENHUM agendamento ainda" (nem assinatura,
  nem avulsa) não virou tabela nova — é só um filtro na tela de Agenda
  (tutor sem assinatura e sem agendamento avulso), útil pra equipe saber
  quem ainda não fechou a primeira visita.
- O horário da visita avulsa (e o horário preferencial da assinatura, e o
  reagendamento) vêm da grade fixa da seção 1 (`intervalo_agendamento_minutos`),
  não de um campo de texto livre — ver `lib/horarios.ts`.

### Próximo passo natural: duração por serviço/porte + capacidade

Hoje a grade de horários (seção 1) só evita horário quebrado — não impede
dois pets grandes caindo no mesmo horário se o petshop só tem uma banheira,
por exemplo. Quando algum petshop parceiro precisar disso de verdade, os
candidatos a virar coluna/tabela são: duração estimada por combinação
serviço × porte (hoje só existe preço por essa combinação, em
`precos_servico`), e um limite de atendimentos simultâneos (por petshop, ou
por horário). Nenhum dos dois existe ainda — registrado aqui pra não se
perder quando a demanda aparecer.
