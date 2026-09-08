# Trocar Asaas por Mercado Pago — o que muda e o que fazer

Escrito em 30/ago/2026, depois de descobrir que a tarifa de Pix do Asaas é
**R$ 1,99 fixo por transação** — 2,01% num ticket de R$ 99, pior que a taxa
de cartão à vista. No mesmo espírito da Fase 5 e da Fase 6: entender as
regras do provedor antes de escrever código.

Complementa `docs/plano-mei-pix.md` (plano vigente) e
`docs/fase6_pagamentos.md` (o plano original do Asaas, cujas decisões de
desenho continuam valendo em quase tudo).

---

## 0. Antes de tudo: essa é a pergunta certa?

Da análise de custo da conversa anterior, dois números que precisam estar na
mesa antes de qualquer linha de código:

| Caminho | Custo/petshop/mês | Esforço |
|---|---|---|
| Hoje — Asaas, 60 cobranças de ~R$ 99 | R$ 119,40 | — |
| **Trocar pra Mercado Pago**, mantendo 60 cobranças | **R$ 58,81** (−51%) | **54–70 h** |
| **Manter Asaas**, consolidar numa fatura mensal do petshop | **R$ 1,99** (−98%) | **16–24 h** |

Tarifa percentual não melhora com menos transações; tarifa fixa melhora
proporcionalmente. Por isso, **se a arquitetura de cobrança mudar para uma
fatura mensal por petshop, o Asaas volta a ser o mais barato** (R$ 1,99
contra R$ 4,54 do Mercado Pago).

Ou seja: a troca de gateway só é a resposta certa se você **quiser mesmo
manter o tutor pagando pelo app, cobrança a cobrança**. Se esse não for um
requisito de produto inegociável, o caminho mais barato e mais curto é o
outro. Este documento assume que é — mas a decisão vem antes.

---

## 1. O que já está pronto pra troca (a boa notícia)

O schema é **agnóstico de gateway**, e isso não foi acidente. As colunas se
chamam `gateway_payment_id`, `gateway_wallet_id`, `gateway_customer_id`, e a
tabela de auditoria é `eventos_gateway` — nenhuma menção a Asaas em lugar
nenhum do SQL.

Consequência prática: as funções `registrar_pagamento_confirmado()`,
`registrar_falha_pagamento()` e toda a lógica de dunning, retry, split
calculado e trava de slot **continuam valendo sem uma linha alterada**. A
migration 0006 sobrevive à troca inteira.

O acoplamento com o Asaas vive todo em 4 arquivos de Edge Function, 1.098
linhas somadas:

| Arquivo | Linhas | O que faz |
|---|---|---|
| `_shared/asaas.ts` | 219 | Cliente HTTP, tipos, split, classificação de evento |
| `processar-cobrancas/index.ts` | 501 | Cron de cobrança recorrente + composição de preço |
| `gateway-webhook/index.ts` | 152 | Recebe evento, dedupe, marca pago/falhou |
| `criar-pix-venda/index.ts` | 226 | Pix avulso de venda de balcão |

Mais dois pontos fora das functions: `app/(public)/agendar/[tutorId]/actions.ts`
(a fórmula de composição de preço duplicada no cliente) e a tela
`/admin/petshops`.

---

## 2. As sete diferenças que importam

| | Asaas | Mercado Pago |
|---|---|---|
| **Onboarding do petshop** | Subconta criada **via API** pela plataforma (R$ 12,90) | Petshop precisa **ter conta MP própria** e **autorizar via OAuth** |
| **Credencial** | 1 API key da plataforma | `access_token` + `refresh_token` **por petshop**, com renovação |
| **Quem cria o pagamento** | A plataforma, passando `split[]` | **O vendedor** — a chamada usa o `access_token` do petshop |
| **Comissão** | `split.fixedValue` (valor fixo em reais) | `application_fee` |
| **Ordem do desconto** | Split sobre o valor líquido | MP desconta a taxa dele primeiro, e o `application_fee` incide **sobre o restante** |
| **Pix QR** | 2 chamadas: `POST /payments` e depois `GET /payments/{id}/pixQrCode` | **1 chamada** — o `POST /v1/payments` já devolve `point_of_interaction.transaction_data.qr_code` e `qr_code_base64` |
| **Webhook** | Header `asaas-access-token`, e o corpo traz `event` + `payment.id` | `x-signature` (HMAC) + `topic`/`type`, e a notificação **não traz os dados** — é preciso consultar o pagamento por ID |

### 2a. A diferença que mais dói: o onboarding

Esta é a mudança de verdade, e ela é **comercial antes de ser técnica**.

No Asaas, colocar um petshop pra receber é uma chamada de API sua. No
Mercado Pago, o petshop precisa:

1. ter (ou abrir) uma conta Mercado Pago própria;
2. clicar num link de autorização;
3. logar na conta dele;
4. autorizar sua aplicação.

Num piloto em que você está pedindo pro dono do petshop testar um produto
novo de graça, essa é uma fricção real. Vale ensaiar essa conversa antes de
construir o fluxo.

### 2b. A armadilha da ordem do desconto

A decisão de 16/ago/2026 (`fase6_pagamentos.md`, seção 1c) existiu
justamente porque o split do Asaas incide sobre o valor **líquido** — o que
faria o petshop receber menos do que o sistema registra. A solução foi usar
`fixedValue`.

**O Mercado Pago recria exatamente esse problema**, na documentação de
marketplace: *"primeiro, a comissão do Mercado Pago é descontada e, em
seguida, a comissão do Marketplace é descontada sobre o valor restante."*

Como o `application_fee` também é um valor absoluto, dá pra reproduzir a
mesma garantia — mas a fórmula de `calcularComposicaoPreco()` precisa ser
refeita com a taxa do MP (0,99%) no lugar da do Asaas, nos **dois** lugares
onde ela vive hoje (a Edge Function e o portal do tutor).

### 2c. O ganho de brinde

O Pix do Mercado Pago devolve o QR **na mesma resposta** da criação do
pagamento. Isso resolve o **gap #3** da Fase 6 — *"o pagamento do portal do
tutor ainda não é síncrono"* — que no plano MEI+Pix estava estimado em 8–12 h
e classificado como o trabalho mais delicado.

Ou seja: das 54–70 h desta troca, umas 10 já estavam no backlog de qualquer
jeito.

---

## 3. Fatia 0 — o portão (fazer ANTES de escrever código)

Mesmo método da Fase 6. Três perguntas que a documentação pública não
respondeu e que mudam o desenho:

1. **`application_fee` funciona com Pix?** A documentação de marketplace usa
   cartão em todos os exemplos. Se o `application_fee` só valer para cartão,
   **a troca inteira não faz sentido** — o modelo é Pix-first. Testar no
   sandbox com uma conta de vendedor de teste antes de qualquer outra coisa.
2. **Split exige habilitação prévia?** A doc lista "pré-requisitos" sem
   detalhar. Se houver análise de risco como a da tokenização do Asaas, o
   prazo não é seu — descobrir agora.
3. **Qual a validade do `refresh_token`?** Define se o petshop vai precisar
   reautorizar periodicamente. Se precisar, isso é um problema operacional
   recorrente que não existe no Asaas.

**Não escreva nada até as três terem resposta.** Foi essa a lição da Fase 6:
todo o código do Asaas foi escrito contra a documentação, sem sandbox, e até
hoje nunca rodou.

---

## 4. Roadmap

### Fatia 1 — OAuth e credenciais por petshop (o item novo)

Não existe equivalente no Asaas. É a maior fatia, e é pré-requisito de todo
o resto.

- [ ] Migration `0022`: `petshops.gateway_access_token`,
      `gateway_refresh_token`, `gateway_token_expira_em`,
      `gateway_conta_conectada_em`. `gateway_wallet_id` passa a guardar o
      `user_id` do MP. RLS: mesma proteção das colunas de taxa — só admin da
      plataforma lê/escreve, nunca a equipe do petshop.
- [ ] Rota de callback OAuth (`app/(admin)/admin/petshops/oauth/callback`).
- [ ] Rotina de refresh do token, com margem de segurança, no
      `processar-cobrancas`.
- [ ] Tela em `/admin/petshops`: "Conectar conta Mercado Pago" com o link de
      autorização, e o estado da conexão visível.

**Estimativa: 12–16 h.**

### Fatia 2 — cliente do gateway

- [ ] `_shared/mercadopago.ts`, **mantendo a mesma interface pública** de
      `_shared/asaas.ts` (`criarCobrancaPix`, `consultarCobranca`,
      `classificarEventoWebhook`…). Assim as três Edge Functions mudam só o
      `import`, e um eventual retorno ao Asaas continua barato.
- [ ] Mapear `status`/`status_detail` do MP para o vocabulário interno.
- [ ] Refazer `calcularComposicaoPreco()` com a taxa de 0,99% e a ordem de
      desconto da seção 2b — nos dois lugares.

**Estimativa: 11–16 h.**

### Fatia 3 — webhook

- [ ] Validação de assinatura `x-signature` (HMAC) no lugar do
      `asaas-access-token`.
- [ ] Buscar o pagamento por ID: a notificação do MP só traz a referência.
- [ ] Dedupe: definir o que vira `eventos_gateway.gateway_event_id` (o id da
      notificação, não o do pagamento).
- [ ] Manter as quatro buscas por `gateway_payment_id` — essa parte não muda.

**Estimativa: 6–8 h.**

### Fatia 4 — cobrança e Pix

- [ ] `processar-cobrancas`: usar o token do petshop, não o da plataforma.
- [ ] `criar-pix-venda`: **simplifica** — o QR vem junto.
- [ ] Portal do tutor: mostrar o QR na hora. **Fecha o gap #3.**

**Estimativa: 9–12 h.**

### Fatia 5 — teste ponta a ponta em sandbox

- [ ] Conta de teste vendedor + comprador, OAuth completo, Pix pago,
      webhook recebido, `registrar_pagamento_confirmado()` disparado.
- [ ] Conferir que o petshop recebeu exatamente o valor cheio do serviço.

**Estimativa: 8 h.** Inegociável — nada da Fase 6 jamais rodou de verdade.

### Total: 46–60 h de desenvolvimento

Mais o tempo da fatia 0, que não é seu.

---

## 5. Ganhos e perdas

**Ganha**

- Tarifa 0,99% no lugar de R$ 1,99 fixo — 51% mais barato no desenho atual.
- Pix síncrono nativo: fecha o gap #3 sem trabalho extra.
- Sem os R$ 12,90 de subconta por petshop.
- A marca "Mercado Pago" é reconhecida pelo dono do petshop, o que ajuda na
  conversa de confiança.

**Perde**

- **Onboarding deixa de ser automático.** É a maior perda, e ela é comercial.
- **Gestão de token por petshop** — um estado novo que pode expirar e quebrar
  a cobrança de um parceiro específico, silenciosamente.
- Recebimento em D+14 no padrão do MP (contra Pix imediato do Asaas), a menos
  que se configure liberação antecipada, que tem custo.
- Você joga fora código que já existe, ainda que nunca testado.

---

## 6. Recomendação

**Antes de decidir a troca, decida a arquitetura de cobrança.** Se a
consolidação numa fatura mensal por petshop for aceitável comercialmente,
ela economiza mais (98% contra 51%), custa um terço do trabalho, e ainda
remove a subconta, a tokenização, o CPF obrigatório do tutor e o gap #3.
Nesse cenário o Asaas fica, e este documento vira arquivo morto.

**Se o tutor pagando pelo app for requisito de produto**, então a troca vale
— mas só depois da fatia 0. A pergunta "`application_fee` funciona com Pix?"
é binária e derruba o projeto inteiro se a resposta for não.

Um caminho intermediário que não exige escolher agora: manter o Asaas e
**mudar a cadência das assinaturas de mensal para trimestral**. Cai de 60
para 20 transações por petshop, o custo vai de R$ 119,40 para R$ 39,80
(−67%), o esforço é de umas 4 h, e não depende de gateway nenhum. Não
resolve o problema de vez, mas compra tempo pra decidir com o GMV real do
piloto na mão em vez de estimativa.
