# Fase 6 — Cobrança com gateway de pagamento real (plano)

Plano detalhado da fase mais delicada tecnicamente do roadmap. Escrito antes
de qualquer código, no mesmo espírito da Fase 5: entender as regras do
provedor externo primeiro, porque são elas que mandam no desenho — não o
contrário.

**Decisões já tomadas** (conversa de planejamento, ago/2026):

- Meios de pagamento da v1: **cartão de crédito recorrente** (tokenizado) +
  **Pix por cobrança** (QR/copia-e-cola manual todo mês). Pix Automático e
  boleto ficam pra depois (seção 14).
- Portal do tutor: **agendar + pagar** — o tutor agenda uma visita avulsa
  pelo próprio celular, paga na hora e gerencia o cartão salvo (seção 7).
- Gateway: **em aberto** — decidir pela seção 1 antes de escrever código.

**Status da implementação:** todo o código abaixo foi escrito (15/ago/2026)
SEM conta no gateway aberta ainda — abrir conta em gateway financeiro exige
CPF/CNPJ e senha, ação que a automação deste projeto não executa por conta
própria; foi o Eduardo quem abriu.

**Atualização (16/ago/2026) — fatia 0 em andamento:** conta de produção no
Asaas criada e aprovada (situação cadastral completa, taxas reais já
lidas — seção 1b). Conta Sandbox também já foi criada, mas travou pedindo
verificação de e-mail antes de liberar a 1ª chave de API — passo que só o
Eduardo completa (é um link/código mandado pro e-mail dele). Ainda faltam:
verificar o e-mail, gerar a chave de API do sandbox, e pedir a habilitação
de tokenização em produção (não encontrada na UI até agora — provavelmente
precisa abrir chamado com o time comercial do Asaas, ver seção 1).

Migration 0006,
`_shared/asaas.ts`, `processar-cobrancas`, `gateway-webhook`, o portal do
tutor (`app/(public)/agendar/[tutorId]`) e a tela `/financeiro` existem no
repo, mas **nada disso foi testado contra um gateway de verdade** — payloads
seguem a documentação pública do Asaas, não uma chamada real. Antes de
confiar em qualquer parte disso, seguir o checklist da fatia 0-3 (seção 15).

Três gaps que só apareceram escrevendo o código (não estavam no plano
original — mesmo padrão de revelação tardia que a Fase 4 teve com a visita
avulsa):

1. **Tutor precisa de CPF.** O Asaas exige CPF/CNPJ pra criar um
   `customer`, e é o customer que QUALQUER cobrança referencia (cartão ou
   Pix) — não só cartão. `tutores` nunca coletou isso. Migration 0006
   adiciona `tutores.cpf` (opcional no banco, mas cobrança falha sem ele) —
   falta decidir ONDE no fluxo de cadastro/assinatura isso passa a ser
   pedido antes do piloto.
2. **Petshop não tem como salvar cartão próprio.** `metodos_pagamento.
   tutor_id` é `NOT NULL` — só serve pro tutor. A mensalidade da plataforma
   (cobrada do petshop) ficou Pix-only nesta v1 por causa disso; automatizar
   via cartão exigiria alterar essa tabela (ou criar uma equivalente) antes.
3. **Pagamento do portal do tutor não é síncrono ainda.** O plano (seção 7)
   previa mostrar o QR Pix/confirmação na mesma tela do agendamento. O
   scaffold atual cria a cobrança e deixa o cron (`processar-cobrancas`, a
   cada 15min) processar — o tutor não vê o resultado na hora. Fechar isso
   exige portar (ou reimplementar) o cliente do gateway pro runtime
   Next.js, o que não pareceu certo fazer antes de ter testado a versão
   Deno contra o sandbox nem uma vez.

---

## 1. Escolha do gateway

O que o nosso modelo exige do provedor, em ordem de importância:

1. **Split automático** — `cobrancas.valor_petshop` vs `valor_percentual` já
   sai calculado do trigger; o gateway precisa dividir o dinheiro na
   liquidação, sem a plataforma virar intermediadora manual de repasse.
2. **Tokenização de cartão** — cobrar todo mês sem o tutor redigitar o
   cartão. O schema (`metodos_pagamento`) já assume esse desenho.
3. **Cobrança avulsa de valor variável** — a mensalidade muda conforme o
   número de ocorrências do dia da semana no mês (4 ou 5). Não dá pra usar
   "assinatura de valor fixo" do gateway; precisamos criar uma cobrança nova
   por mês, via API, com o valor daquele mês (isso já está documentado em
   `0001_init.sql`, no comentário de `gateway_subscription_id`).
4. **Pix com QR dinâmico + webhook de confirmação**.
5. **Onboarding simples do petshop** como recebedor do split (piloto = 1
   petshop, mas o modelo precisa escalar).

### Comparativo

| Critério | **Asaas** | **Pagar.me (Stone)** | **Stripe** |
|---|---|---|---|
| Split | Nativo via subcontas Asaas; split por cobrança via API ([docs](https://docs.asaas.com/docs/split-de-pagamentos)) | Nativo via "recebedores" com KYC próprio | Via Stripe Connect (contas conectadas) |
| Tokenização | Sim, mas **sujeita a habilitação/análise de risco** pelo gerente de contas ([docs](https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito)) | Sim, padrão da API | Sim, o melhor da categoria |
| Pix QR dinâmico | Sim, nativo | Sim, nativo | Sim, mas Pix é cidadão de 2ª classe |
| Pix Automático (futuro) | Sim, já disponível pra PJ ([release](https://blog.asaas.com/release/pix-automatico/)) | Sim | Sim (Connect Brasil) |
| Boleto (futuro) | Sim | Sim | Limitado |
| Onboarding do petshop | Criar subconta via API, aprovação simples | KYC por recebedor, mais burocrático | Connect onboarding, bom mas em inglês |
| Docs/DX | Boas, em PT | Boas, em PT | Excelentes, em EN |
| Sandbox | Sim (ambiente completo) | Sim | Sim |

### Recomendação: Asaas

É o único dos três em que **todas** as peças do nosso modelo (split por
subconta, Pix, cobrança avulsa de valor variável, e futuramente Pix
Automático e boleto) são caso de uso principal, não adaptação. O modelo de
subcontas casa direto com "cada petshop parceiro recebe sua parte
automaticamente".

Dois poréns que precisam ser resolvidos **antes** de escrever código
(viram o item 0 do checklist):

- A **tokenização em produção depende de aprovação** do Asaas (análise de
  risco). Abrir a conta e pedir a habilitação já, porque o prazo não é
  nosso. No sandbox funciona sem aprovação — dá pra desenvolver em paralelo.
- Confirmar as **taxas vigentes** (cartão, Pix, transferência) na proposta
  comercial — elas mudam e afetam se o `percentual_plataforma` de 3% cobre
  o custo ou se o custo do gateway sai da fatia do petshop (decidir e
  documentar na seção 3 de `regras_padrao_petshop.md`). **Feito — ver seção
  1b, taxas reais lidas direto da conta.**

Se a aprovação da tokenização travar, o plano B é Pagar.me (mesmo desenho,
troca de SDK); Stripe só se a gente abrisse mão de Pix como meio relevante —
não é o caso no Brasil.

## 1b. Taxas confirmadas (conta real, 16/ago/2026)

Lidas direto da aba Minha conta > Taxas depois que a conta do Eduardo foi
aprovada — substituem a estimativa da seção 1. Preços promocionais têm
validade (16/nov/2026); a tarifa "de tabela" ao lado é a que vale depois.

| Meio | Tarifa | Recebimento | Nota |
|---|---|---|---|
| Pix (QR dinâmico) | **Gratuito** | Imediato | Confirma a estratégia Pix-first da v1 — sem custo por cobrança. |
| Cartão de crédito à vista | 2,99% + R$0,49 (promo 1,99% até 16/11/2026) | **D+32** | Ver aviso de fluxo de caixa abaixo — é o número que mais muda a conta. |
| Cartão de débito | 1,89% + R$0,35 | D+3 | Não faz parte do escopo da v1 (só crédito recorrente + Pix). |
| Boleto | R$1,99 (promo R$0,99) | D+1 útil | Fora do escopo da v1 (seção 14). |
| Subconta (petshop novo) | **R$12,90 por subconta** | — | Custo direto de onboarding por petshop parceiro — ver aviso abaixo. |
| Transferência pra fora do Asaas | R$5,00 | Mesmo dia se pedida até 15h | Só relevante se o petshop quiser sacar o saldo pra outro banco em vez de deixar acumulando na carteira Asaas. |
| API e integrações | Gratuito | — | Sem custo de usar a API em si. |
| Notificação por WhatsApp (recurso próprio do Asaas) | R$0,55/mensagem | — | **Não usar** — já temos a Meta Cloud API própria (Fase 5); é fácil deixar esse toggle ligado sem querer e pagar em dobro pela mesma notificação. Conferir se vem desativado por padrão na criação da cobrança (`payment.postalService`/notificações automáticas do Asaas) na fatia 1. |

**Três avisos que mudam decisão de design, não só número:**

1. **Cartão de crédito liquida em D+32, não D+1.** Isso significa que numa
   assinatura cobrada todo dia 1º, o petshop só vê o dinheiro cair por volta
   do dia 2 do mês *seguinte* — quase 2 meses de defasagem entre "o tutor
   pagou" e "o petshop recebeu", mesmo com o split configurado corretamente
   (o split libera o valor pro saldo da subconta do petshop na liquidação,
   não na confirmação do pagamento). Pix não tem esse problema (recebimento
   imediato) — mais um motivo pra incentivar Pix como preferência, além do
   custo zero. Vale expor isso claramente na tela `/financeiro` (seção 12):
   "líquido a receber" precisa distinguir do "já caiu na conta", ou o
   petshop vai achar que o produto está atrasando repasse.
2. **Cada petshop parceiro custa R$12,90 de subconta**, só pra existir no
   gateway — antes de qualquer cobrança rodar. É custo fixo de onboarding,
   não recorrente (confirmar na documentação/suporte se é cobrança única ou
   por período; a tela de Taxas não deixa isso explícito). Em qualquer
   cenário, isso é uma linha a mais na conta de unit economics do piloto —
   1 petshop = R$12,90 só de setup, fora o fee fixo mensal que a plataforma
   já cobra dele.
3. **O split é calculado sobre o valor LÍQUIDO da cobrança, não o valor
   cheio** — confirmado na documentação (`docs.asaas.com/docs/duvidas-frequentes-split`:
   "O cálculo usa o valor líquido da cobrança"). Isso significa que a taxa
   do gateway não sai só "da plataforma" nem só "do petshop": ela reduz os
   dois lados do split PROPORCIONALMENTE, na mesma razão 97%/3% configurada.
   Exemplo com uma mensalidade de R$99 no cartão (taxa promo 1,99%+R$0,49 =
   R$2,46): sobra R$96,54 líquido; petshop recebe 97% disso = **R$93,65**;
   plataforma fica com 3% = **R$2,90**.

   O problema: `trg_agendamento_processar_cobranca` (0001_init.sql) calcula
   `valor_petshop`/`valor_percentual` **sem saber da taxa do gateway** —
   pro mesmo exemplo, o banco registra que o petshop tem direito a
   `R$96,03` (99 − 3%), não aos `R$93,65` que de fato caem na subconta dele.
   Diferença de ~R$2,40 por cobrança de cartão, silenciosa, que a tela
   `/financeiro` (seção 12) exibiria errada se não for corrigida.

   **Resolvido — decisão de 16/ago/2026, ver seção 1c.** Em vez de tentar
   estimar ou reconciliar uma taxa que sai da margem de alguém, a taxa do
   gateway deixa de ser um custo que a plataforma ou o petshop absorvem —
   vira parte de uma taxa de serviço somada e cobrada do tutor, visível na
   hora de pagar. O petshop passa a receber sempre o valor cheio do
   serviço (via `fixedValue` no split, não `percentualValue`), então o
   valor que cai na subconta dele bate exatamente com o que o sistema
   registra — sem estimativa, sem reconciliação.

## 1c. Decisão: taxa de serviço somada ao tutor, não descontada do petshop

Mudança de modelo (conversa de 16/ago/2026) que resolve de vez o aviso 3
acima: em vez de o gateway "comer" a margem de alguém de um jeito difícil
de prever, a taxa vira uma **linha visível cobrada do tutor**, por cima do
preço do serviço.

**Como fica o cálculo** (por cobrança, seja mensal de assinatura ou avulsa):

```
valor_servico       = preço do plano/serviço (o que já é calculado hoje,
                       sem mudança — plano_precos / precos_servico)
taxa_plataforma      = valor_servico × percentual_plataforma   (mesma fórmula de sempre)
taxa_gateway         = taxa do Asaas pro meio de pagamento escolhido:
                          Pix       → R$ 0,00 (gratuito, seção 1b)
                          Cartão    → percentual + fixo da tabela vigente
                                       (hoje: promo 1,99% + R$0,49 até 16/11/2026,
                                       depois 2,99% + R$0,49 — configurável via
                                       env var, nunca hardcoded, porque MUDA)
taxa_servico         = taxa_plataforma + taxa_gateway
valor_cobrado_tutor  = valor_servico + taxa_servico
```

**O que o tutor vê** (portal do tutor, seção 7, e nos templates de
cobrança): "Banho R$99,00 + taxa de serviço R$X,XX = **Total R$Y,YY**".
Pix mostra a taxa mais baixa (só `taxa_plataforma`) — reforça visualmente
o incentivo que o produto já queria dar pro Pix.

**Como fica o split no Asaas:** em vez de `percentualValue` (que a doc do
Asaas confirma ser calculado sobre o valor líquido — a raiz do problema do
aviso 3), a cobrança usa **`fixedValue = valor_servico`** na wallet do
petshop. Isso garante um valor fixo e previsível: contanto que
`valor_cobrado_tutor − taxa_gateway ≥ valor_servico` (o que é sempre
verdade pelo desenho acima, já que a taxa do gateway está embutida no
valor cobrado), o petshop recebe exatamente `valor_servico`, sem depender
de porcentagem nenhuma. O que sobra na conta principal (não especificado
no split) é `taxa_servico` líquido — a receita real da plataforma naquela
cobrança.

**O que muda no código (schema já escrito, precisa de ajuste — seção 11):**

- `trg_agendamento_processar_cobranca` (0001/0003, reescrita via `CREATE
  OR REPLACE` na 0006 — nunca se edita uma migration já aplicada) passa a
  gravar `valor_petshop = valor_total` sempre (o petshop recebe o valor
  cheio, não mais `valor_total − valor_percentual`). `valor_percentual`
  continua com a mesma fórmula (receita da plataforma), só que agora é
  **somada** no momento da cobrança, não descontada na hora do trigger.
- A taxa do gateway só é conhecida no momento de emitir a cobrança
  (`processar-cobrancas` ou o portal do tutor), não no momento em que o
  trigger cria a linha em `cobrancas`/`cobrancas_avulsas` — porque depende
  do meio de pagamento, que só é decidido depois. Por isso a migration
  0006 ganha colunas novas: `valor_taxa_gateway` e `valor_cobrado_tutor`,
  preenchidas só nesse momento (ficam `null` enquanto a cobrança está
  `pendente`).
- Cobrança recorrente de assinatura (cron mensal, sem o tutor "escolhendo"
  nada no momento) precisa comunicar esse valor com antecedência — o
  lembrete `aviso_cobranca` (D-1, seção 6) é o lugar natural pra mostrar o
  total já com a taxa, já que o meio de pagamento (`tutores.
  forma_pagamento_preferida`) já é conhecido nesse momento.

**Em aberto, não decidido ainda:**

- Cartão parcelado não faz sentido pra cobrança recorrente automática
  (não há "parcela" numa mensalidade que já é mensal) — a v1 assume sempre
  a taxa "à vista" do cartão. Se um dia a v1 dor de oferecer parcelamento
  no portal do tutor pra visita avulsa de valor alto, a taxa muda por
  parcela (seção 1b) e o cálculo acima precisa ramificar.
- A taxa promocional do cartão (1,99%+R$0,49) vale só até 16/11/2026. O
  valor cobrado do tutor vai **subir automaticamente** nessa data se a env
  var for atualizada pra taxa cheia (2,99%+R$0,49) — ou ficar defasado
  (cobrando barato demais, prejuízo pra plataforma) se ninguém lembrar de
  atualizar. Vale um lembrete de calendário separado, fora do código.

## 2. O que já existe no schema (inventário honesto)

Muita coisa da Fase 6 já foi desenhada na fundação — o trabalho agora é
ligar os fios, não redesenhar:

| Já existe | Onde | O que falta |
|---|---|---|
| Token do cartão (nunca o número) | `metodos_pagamento` (`gateway_customer_id`, `gateway_payment_method_id`) | Preencher de verdade via tokenização |
| Cobrança mensal proporcional com split calculado | `cobrancas` + `trg_agendamento_processar_cobranca` | Executar a cobrança no gateway |
| Cobrança por visita avulsa | `cobrancas_avulsas` | Idem |
| Fee fixo da plataforma | `mensalidades_petshop` + `gerar_mensalidade_petshop()` | Agendar no cron + cobrar de fato |
| Lembretes de falha e cartão vencendo | `lembretes.tipo` já aceita `cobranca_falhou` e `cartao_vencendo` | Gerar os registros + templates WhatsApp |
| Contato por papel `cobranca` | `contatos_adicionais` + `resolver_contato()` | Usar como destino das mensagens de cobrança |
| Campo pra referência no gateway | `gateway_payment_id` nas 3 tabelas de cobrança | Preencher |

O que **não** existe e entra na migration `0006` (seção 11): identidade do
petshop no gateway, log de webhooks, controle de retry, e os status
intermediários de cobrança.

## 3. Arquitetura geral

Mesmo padrão que já provou funcionar na Fase 5 — nada de serviço novo:

```
trigger SQL (já existe) ──▶ cobrancas/cobrancas_avulsas status='pendente'
                                      │
pg_cron (a cada 15 min) ──▶ edge function processar-cobrancas
                                      │  cartão: cobra com split + token
                                      │  pix:    gera QR + manda WhatsApp
                                      ▼
                            gateway ──▶ edge function gateway-webhook
                                      │  pago / falhou / estornado / chargeback
                                      ▼
                            atualiza status + dispara lembretes (Fase 5)
```

Princípios (aprendidos na Fase 5, valem dobrado com dinheiro):

- **O webhook é a fonte da verdade.** O 2xx do POST de cobrança significa
  "o gateway aceitou processar", não "pagou". Nenhum status vira `pago`
  fora do webhook.
- **Idempotência em tudo.** A edge function manda `externalReference` =
  `cobrancas.id` em cada criação; antes de criar, consulta se já existe
  cobrança com aquela referência (protege contra o cron rodar duas vezes).
  O webhook grava o evento em `eventos_gateway` com unique no id do evento
  — evento repetido é ignorado, não reprocessado.
- **A fila é o banco.** Igual `lembretes`: status no Postgres, lote pequeno
  por rodada (50), falha fica registrada com o erro pra alguém olhar.

## 4. Onboarding do petshop no gateway (split)

- Cada petshop vira uma **subconta** no gateway, criada via API na tela
  `/admin` (a mesma da Fase 1 que já concentra fee e percentual — é receita
  da plataforma, então é o admin da plataforma quem conecta, não o petshop).
- Migration: `petshops.gateway_wallet_id text` (id da subconta/carteira usada
  no split). Sem wallet cadastrada, `processar-cobrancas` pula o petshop e
  loga — nunca cobra sem saber pra onde vai o dinheiro.
- O split de cada cobrança usa os valores **já gravados** na linha de
  `cobrancas`/`cobrancas_avulsas` (snapshot do momento do trigger), não o
  `percentual_plataforma` atual — mudar o percentual amanhã não mexe em
  cobrança já criada.

## 5. Cadastro de cartão (tokenização, PCI)

- O número do cartão **nunca toca nosso servidor nem nosso banco** — a
  página usa a tokenização do gateway direto do browser do tutor
  (client-side). Nosso backend recebe só o token + bandeira + últimos 4
  dígitos + validade, que é exatamente o shape de `metodos_pagamento`.
  Isso nos mantém no escopo PCI mínimo (SAQ-A).
- Fluxo: petshop (ou o próprio fluxo de assinatura) dispara um link por
  WhatsApp → página pública `cartao/[token]` (mesmo padrão do
  `/cadastro/[tutorId]`: sem sessão, `lib/supabase/admin.ts` por trás) →
  tutor digita o cartão → token salvo em `metodos_pagamento` com
  `padrao=true` (desativando o anterior, nunca apagando — histórico).
- Template WhatsApp novo: `cadastro_cartao` (adicionar em
  `docs/whatsapp_templates_meta.md` e submeter junto com os demais da
  seção 9).

## 6. Cobrança recorrente automática (o coração da fase)

É aqui que "planos longos são debitados automaticamente". O ciclo já existe
— o trigger `trg_agendamento_processar_cobranca` cria a linha em `cobrancas`
quando o 1º agendamento do mês nasce. A fase 6 completa o circuito:

1. **Cron `cobrancas-processar`** (a cada 15 min, mesmo padrão do
   `lembretes-enviar`): pega `cobrancas` e `cobrancas_avulsas` com
   `status='pendente'`, lote de 50.
2. **Tutor com cartão padrão** → cria cobrança no gateway com o token +
   split → status local vira `processando`. O débito efetivo (e o `pago`)
   chega pelo webhook.
3. **Tutor sem cartão (optou por Pix)** → gera QR dinâmico com vencimento
   em D+3 → status `aguardando_pagamento` → gera lembrete `cobranca_pix`
   (implementado em 17/ago/2026 — `processar-cobrancas` insere a linha em
   `lembretes` com `dados_extra` já pronto; `enviar-lembretes` manda o
   template pro contato de papel `cobranca` com nome do pet, valor e
   copia-e-cola). Webhook confirma o pagamento.
4. **Pré-aviso** (recomendado, evita chargeback e susto): template
   `aviso_cobranca` D-1 antes de cobrar no cartão — "amanhã sai a
   mensalidade de R$X do plano do Thor". Barato de fazer: é um `lembrete`
   novo gerado no mesmo checkpoint diário da Fase 5.

Status de cobrança passam de 4 pra 6:
`pendente → processando → pago | falhou` (cartão) e
`pendente → aguardando_pagamento → pago | falhou` (Pix, falhou = QR
expirou), mais `estornado` que já existia. Migration ajusta o CHECK.

**Por que não usar a "assinatura" nativa do gateway**: o valor muda mês a
mês (4 vs 5 ocorrências) e o disparo é o nosso trigger (1º agendamento do
mês), não uma data fixa. Assinatura de valor fixo no gateway ia brigar com
o modelo proporcional que é justamente o diferencial do produto. O campo
`assinaturas.gateway_subscription_id` segue reservado, mas a v1 não o usa —
já era o desenho documentado em `0001_init.sql`.

## 7. Portal do tutor — agendar e pagar pelo celular

Extensão natural do formulário público da Fase 3, agora com dinheiro:

- **Rota**: `app/(public)/agendar/[tutorId]/` (mesmo padrão sem sessão do
  `/cadastro`). Link fixo por tutor, enviável por WhatsApp e salvável nos
  favoritos.
- **Fluxo**: escolhe o pet → escolhe o serviço (preços de `precos_servico`
  pelo porte, snapshot igual à avulsa de balcão) → escolhe dia/horário na
  grade de horários livres (`lib/horarios.ts` — mesma grade que o petshop
  usa, menos os horários já ocupados) → paga.
- **Pagamento antes da confirmação**: o agendamento nasce junto com a
  `cobranca_avulsa`, mas só fica visível como "agendado" na agenda do
  petshop depois do `pago`.
  - Cartão salvo ou cartão novo (tokeniza na hora, seção 5): cobra
    imediatamente, confirma na tela.
  - Pix: QR com **expiração de 30 min**; agendamento fica em estado
    provisório segurando o horário. Não pagou → um job do cron libera o
    horário e cancela a cobrança. Sem isso, self-service vira ferramenta de
    bloquear agenda de graça.
- **Limite conhecido**: a grade ainda não tem checagem de capacidade
  (nº de vagas simultâneas — pendência declarada da Fase 4). Com
  self-service isso fica mais sensível: dois tutores podem pegar o mesmo
  horário. Mitigação v1: constraint de unicidade por (petshop, data_hora)
  na criação do agendamento — o segundo recebe "horário acabou de ser
  ocupado, escolha outro". Capacidade de verdade (duração por serviço,
  vagas paralelas) continua sendo item da Fase 7.
- **Segurança**: mesmo modelo de exposição do `/cadastro/[tutorId]` (UUID
  não-enumerável como capability), + rate limit nas rotas públicas de
  pagamento e validação server-side de preço e horário (nunca confiar no
  valor vindo do browser).

## 8. Inadimplência (dunning) e cartão vencendo

Regra da Fase 5 vale aqui: retry cego contra falha permanente só queima
reputação (lá, do número WhatsApp; aqui, taxa de recusa no gateway).

- **Cartão recusado**: retry automático em D+1 e D+4 (colunas novas
  `tentativas` e `proxima_tentativa_em` em `cobrancas`). Na 1ª falha, gera
  `lembrete` tipo `cobranca_falhou` → template WhatsApp com duas saídas:
  link pra atualizar o cartão (seção 5) ou pagar aquele mês via Pix
  (fallback natural, já que Pix por cobrança existe na v1).
- **Esgotou os retries** (3 falhas): cobrança fica `falhou` definitivo,
  assinatura **pausa automaticamente** (mesma máquina de estados da Fase
  4 — pausar já cancela o agendamento pendente na ordem certa) e o petshop
  vê o motivo na tela financeira. Retomar = quitar a cobrança (Pix ou
  cartão novo) → retoma a assinatura. Não entregar serviço com mês não
  pago é política padrão; se algum petshop quiser tolerância, vira coluna
  em `petshops` na linha das políticas da seção 5 de
  `regras_padrao_petshop.md` — não regra fixa em trigger.
- **Cartão vencendo**: checkpoint mensal (junto com os da Fase 5) varre
  `metodos_pagamento` com validade no mês seguinte → `lembrete` tipo
  `cartao_vencendo` com o link de atualização. Os dois tipos já existem no
  CHECK de `lembretes` desde a fundação — só nunca foram gerados.

## 9. Mensalidade da plataforma (fee do petshop)

`gerar_mensalidade_petshop()` existe desde a fundação esperando um cron:

- **Cron dia 1** chama a função pra cada petshop ativo (respeita
  `isento_fee_ate` → linha nasce `isento` no trial do piloto).
- **Cobrar de fato, v1**: cobrança Pix/cartão normal contra o petshop
  (dono do petshop cadastra um método de pagamento próprio — reusa toda a
  máquina das seções 5–6, só muda quem paga).
- **Alternativa descartada por ora**: descontar o fee do repasse do split.
  É elegante (dinheiro nunca vai e volta), mas mistura os dois fluxos
  financeiros que a fundação fez questão de separar (`cobrancas` vs
  `mensalidades_petshop`) e complica a conciliação contábil do petshop.
  Reavaliar na Fase 7 com dados do piloto.

## 10. Estornos, cancelamentos e chargebacks

- **Visita cancelada pelo petshop** (único caso com devolução, seção 5 das
  regras): v1 mantém **manual** — botão "estornar" na cobrança avulsa
  (estorno total via API) e, no caso mensal, ajuste manual documentado
  (estorno parcial do valor da visita). Automatizar estorno parcial
  proporcional é refinamento pós-piloto.
- **Chargeback**: chega por webhook → status `estornado` + lembrete de
  escalonamento pro petshop (mesmo mecanismo de escalonamento da Fase 5).
  Sem contestação automatizada na v1 — volume esperado não justifica.
- **Falta do tutor** não estorna nada (`falta_consome_visita_paga`, seção
  5 das regras) — nenhuma mudança aqui.

## 11. Migration prevista — `0006_fase6_pagamentos.sql`

```sql
-- identidade do petshop no gateway (split) + método de pagamento do fee
alter table petshops add column gateway_wallet_id text;
alter table petshops add column gateway_customer_id text;  -- petshop como PAGADOR do fee

-- status novos + controle de retry
alter table cobrancas drop constraint ...status_check;
alter table cobrancas add constraint ... check (status in
  ('pendente','processando','aguardando_pagamento','pago','falhou','estornado'));
alter table cobrancas add column tentativas smallint not null default 0,
                      add column proxima_tentativa_em timestamptz,
                      add column erro_gateway text,
                      add column pix_qr_code text,          -- copia-e-cola do mes
                      add column pix_expira_em timestamptz;
-- (mesmas colunas em cobrancas_avulsas e status em mensalidades_petshop)

-- preferencia de pagamento do tutor (cartao x pix por cobranca)
alter table tutores add column forma_pagamento_preferida text not null
  default 'cartao' check (forma_pagamento_preferida in ('cartao','pix'));

-- log bruto de webhooks: idempotencia + auditoria + reprocesso
create table eventos_gateway (
    id               uuid primary key default gen_random_uuid(),
    gateway_event_id text not null unique,   -- dedupe de evento reentregue
    tipo             text not null,
    payload          jsonb not null,
    processado_em    timestamptz,
    erro             text,
    criado_em        timestamptz not null default now()
);

-- trava de horario pro self-service (dois tutores, mesmo slot)
create unique index agendamentos_slot_unico
  on agendamentos (petshop_id, data_hora)
  where status in ('agendado','confirmado');
```

(Esboço — a migration real segue o padrão dos anteriores: comentários longos
explicando o porquê, teste no projeto Supabase antes de entrar no repo.)

## 12. Tela financeira no painel

O petshop precisa **ver** o dinheiro pra confiar no automático:

- Nova área `/financeiro`: cobranças do mês por status (pendente,
  aguardando Pix, pago, falhou), com valor bruto, corte da plataforma e
  líquido do petshop; filtro por competência; inadimplentes em destaque
  com a ação de reenvio do link de cobrança.
- Admin da plataforma (`/admin`): visão espelho com `mensalidades_petshop`
  e o somatório de `valor_percentual` — a receita da plataforma.
- Conciliação: `eventos_gateway` + `gateway_payment_id` permitem cruzar
  qualquer linha nossa com o extrato do gateway. Relatório automático fica
  pra Fase 7; na v1 basta os ids estarem sempre preenchidos.

## 13. Segurança e compliance

- **PCI**: tokenização client-side (seção 5) → escopo SAQ-A. Nunca logar
  payload com dados de cartão; `eventos_gateway.payload` só guarda o que o
  webhook manda (que já vem sem PAN).
- **Webhook**: validar assinatura/token do gateway (mesmo desenho do
  `META_APP_SECRET` na Fase 5) + `gateway_event_id` unique contra replay.
- **Secrets**: `ASAAS_API_KEY` (ou equivalente) e `ASAAS_WEBHOOK_TOKEN` via
  `supabase secrets set`, nunca no repo — `secrets.txt` local segue fora do
  git (conferir `.gitignore`!).
- **RLS**: `eventos_gateway` sem policy de petshop (é da plataforma, só
  service_role); tabelas de cobrança já isoladas desde a fundação.
- **LGPD**: guardamos só bandeira/últimos 4/validade — o mínimo pra UI.
  Excluir tutor já cascateia `metodos_pagamento`; o token no gateway deve
  ser removido via API na exclusão (item do checklist).

## 14. Fora do escopo da v1 (fica pra Fase 7+)

- **Pix Automático** — recorrência sem cartão, tutor autoriza no app do
  banco. Já disponível nos gateways candidatos; entra como evolução natural
  quando a base de tutores justificar. O desenho da seção 6 não muda: só
  troca "token de cartão" por "autorização de recorrência".
- **Boleto**, antecipação de recebíveis, nota fiscal automática.
- Estorno parcial automático, contestação de chargeback.
- Checagem de capacidade real da agenda (duração por serviço, vagas
  simultâneas) — a trava de slot único da seção 7 é o paliativo.
- Relatório de conciliação automático.

## 15. Ordem de implementação sugerida

Fatias verticais — cada uma termina com algo testável no sandbox:

| # | Fatia | Critério de pronto |
|---|---|---|
| 0 | Conta no gateway + pedido de habilitação de tokenização + confirmar taxas | Sandbox acessível; pedido de produção protocolado |
| 1 | Migration 0006 + subconta do petshop via `/admin` | Split de teste chega na subconta sandbox |
| 2 | Tokenização: página `cartao/[token]` + `metodos_pagamento` real | Cartão de teste salvo, PAN nunca no nosso lado |
| 3 | `processar-cobrancas` (cartão) + `gateway-webhook` + `eventos_gateway` | Assinatura de teste cobrada e `pago` via webhook, com split |
| 4 | Pix por cobrança + templates WhatsApp (`cobranca_pix`, `aviso_cobranca`) | QR pago no sandbox vira `pago`; mensagem sai pro papel `cobranca` |
| 5 | Portal do tutor (agendar + pagar) | Avulsa agendada e paga de ponta a ponta pelo celular |
| 6 | Dunning: retries, `cobranca_falhou`, `cartao_vencendo`, pausa automática | Cartão de teste que recusa percorre o ciclo inteiro |
| 7 | Fee da plataforma (cron dia 1 + cobrança do petshop) | `mensalidades_petshop` gerada e paga no sandbox |
| 8 | Tela `/financeiro` + visão `/admin` | Petshop enxerga bruto/corte/líquido do mês |

As fatias 2–4 são o caminho crítico; 5–8 podem reordenar conforme a
necessidade do piloto. Igual à Fase 5: testar tudo com dados fake no
sandbox **antes** de conectar num petshop real.

## 16. Riscos conhecidos

- **Aprovação da tokenização** (Asaas) é externa e sem prazo garantido —
  por isso é a fatia 0. Plano B: Pagar.me.
- **Webhook fora do ar** = pagamento confirmado que ninguém viu. Mitigação:
  job diário de reconciliação que consulta no gateway toda cobrança presa
  em `processando`/`aguardando_pagamento` há mais de 24h.
- **Custo do gateway vs percentual de 3%**: validar a conta com as taxas
  reais antes do piloto — pode forçar ajuste do `percentual_plataforma` ou
  do fee.
- **Self-service sem checagem de capacidade**: a trava de slot único evita
  o conflito duro, mas não impede agenda lotada de um serviço longo.
  Observar no piloto.
- **Fuso**: continua fixo `America/Sao_Paulo` (limite herdado da Fase 5) —
  vencimentos e cortes de Pix seguem esse fuso.
