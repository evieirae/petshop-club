# Fatia 0 — Mercado Pago é viável? (estudo antes do código)

Feito em 30/ago/2026, sobre a documentação oficial do Mercado Pago
Developers, a Central de Ajuda e busca em fóruns/GitHub. Mesmo método da
Fase 5 e da Fase 6: entender as regras do provedor antes de escrever
qualquer linha.

Pré-requisito de `docs/plano-troca-gateway-mercadopago.md`.

> **Decisão registrada (30/ago/2026):** a ideia de consolidar a cobrança
> numa fatura mensal por petshop está **descartada em definitivo**. A razão
> não é técnica: cobrar 3% do faturamento do parceiro faz a plataforma
> parecer sócia, não prestadora de serviço. Isso também confirma a regra já
> escrita na `0011_pagamento_local.sql` — *"a plataforma não cobra comissão
> numa cobrança que ela não processou"*. As duas coisas agora dizem o mesmo.

---

## Veredito

**Não é possível decidir só com documentação.** A pergunta central — se
`application_fee` funciona com Pix — **não está respondida em lugar nenhum**:
nem confirmada, nem negada.

| Pergunta | Resposta |
|---|---|
| `application_fee` funciona com Pix? | ⚠️ **Indeterminado** — a doc é silenciosa. Só um teste resolve |
| Split exige aprovação prévia? | ✅ **Não**, no modelo 1:1. É self-service |
| Qual a validade dos tokens? | ✅ **180 dias**, com refresh rotativo |
| Pix libera o dinheiro quando? | ✅ **Na hora** |
| Qual a taxa real? | ⚠️ **0,99% via API — mas 0,49% via QR Code** |

Três descobertas novas mudam o plano, e nenhuma delas estava no roadmap
anterior. Estão nas seções 3, 4 e 5.

---

## 1. A pergunta que decide tudo: `application_fee` + Pix

### O que a documentação diz

**Nada.** Literalmente:

- `application_fee` está documentado no `POST /v1/payments` como campo de
  primeiro nível, **sem nenhuma restrição declarada por
  `payment_method_id`**.
- **Todos** os exemplos oficiais de split usam cartão. Não há um único
  exemplo com Pix.
- **A palavra "Pix" não aparece na documentação de Split de Pagamentos.**
- Não existe tabela de "meios de pagamento suportados no split".
- Não encontrei nenhum relato comunitário — nem positivo nem negativo — de
  alguém usando `application_fee` com Pix. Nem no GitHub dos SDKs oficiais,
  nem no TabNews, nem no Stack Overflow.

Isso é **silêncio documental**, não confirmação.

### A frase ambígua que pode matar o projeto

Na página de integração de marketplace do Checkout Transparente:

> *"Tenha em mente que a solução Split de Pagamentos 1:1 permite a
> realização de pagamentos com saldo disponível entre contas Mercado Pago.
> **Não são permitidas transferências de instituições financeiras
> externas.**"*

Lida ao pé da letra, essa frase excluiria Pix vindo de outro banco — que é
99% dos casos. Duas leituras possíveis:

- **(a)** É sobre a *liquidação do split* — o repasse entre a conta do
  vendedor e a do marketplace acontece entre contas MP, não via TED.
- **(b)** É sobre o *meio de pagamento do comprador*, o que mataria o caso
  de uso.

**Evidência a favor de (a):** a versão do **mesmo** how-to publicada na
seção de Checkout Pro é idêntica parágrafo a parágrafo, **exceto que essa
frase não existe lá**. Duas páginas oficiais do mesmo conteúdo, uma com a
restrição e outra sem — cheiro forte de texto herdado, não de regra.

Mas "cheiro" não é base para construir 46–60 h em cima. **Isto precisa ser
confirmado por escrito.**

### O erro que vai confundir o teste

A referência da API documenta o erro **2059 — "You cannot use
`application_fee` with this payment"**. E documenta uma única causa:

> *"Este erro ocorre porque o Access Token que está sendo utilizado não foi
> obtido através do OAuth."*

Ou seja: **se você testar com o token da sua própria conta em vez do token
OAuth do vendedor, vai tomar 2059 e concluir errado que o problema é o
Pix.** O teste da seção 7 evita essa armadilha de propósito.

### A armadilha pior: falha silenciosa

O cenário mais perigoso não é a API recusar. É ela **aceitar o campo na
criação e ignorá-lo na liquidação** — você vê `201 Created`, acha que
funcionou, e descobre meses depois que nunca reteve comissão nenhuma.

Por isso o teste não pode parar no status 201. Tem que ir até o
`fee_details` do pagamento **aprovado** e conferir se a entrada de
`application_fee` está lá.

---

## 2. O que a pesquisa resolveu (boas notícias)

### Split 1:1 é self-service — não precisa de aprovação

Este era o risco nº 2 do roadmap, e ele **não se confirmou**. Os
pré-requisitos documentados são seis, e nenhum é análise de risco:

1. Conta de vendedor com **nível KYC 6**
2. App do Mercado Pago instalado
3. OAuth para cada vendedor
4. Checkout Pro **ou** Transparente
5. Credenciais de produção/teste
6. Contas de teste

Habilitar o split é escolher **"modelo de integração Marketplace"** ao criar
a aplicação no painel. Self-service, sem formulário.

**Duas ressalvas:**

- O **modelo 1:N** (um pagamento dividido entre vários recebedores) é
  restrito a "carteira assessorada" com contato comercial. O nosso caso é
  1:1, então não afeta.
- **Configurar a data de liberação da comissão** exige executivo comercial,
  mesmo no 1:1. Isso afeta o fluxo de caixa da plataforma — vale perguntar
  qual é o padrão.

### Pix cai na hora

| Meio | Taxa | Dinheiro disponível |
|---|---|---|
| **Pix** | **0,99%** | **Na hora** |
| Cartão de crédito | 4,98% / 4,49% / 3,98% | Na hora / 14 dias / 30 dias |
| Boleto | R$ 3,49 | Até 3 dias |

Não existe D+14 para Pix — a tabela tem uma linha só. Empata com o Asaas
nesse ponto, e resolve o problema do D+32 do cartão de vez.

### Tokens: 180 dias, com rotação

| Item | Validade |
|---|---|
| `code` (authorization_code) | 10 minutos, uso único |
| `access_token` via OAuth | **180 dias** (`expires_in` = 15.552.000 s) |
| `refresh_token` | 6 meses |

A doc se contradiz sobre o refresh ser rotativo ou reutilizável. **Trate
como rotativo** — persista sempre o novo `refresh_token` a cada renovação.
Satisfaz as duas leituras.

---

## 3. Descoberta nova: a taxa dobra conforme o canal

Este ponto não estava no roadmap e muda a conta.

| Canal | Taxa Pix |
|---|---|
| **Checkout Transparente / API** | **0,99%** |
| **QR Code** | **0,49%** |

Ambas oficiais, mesma Central de Ajuda. **Cobrar por API custa o dobro de
cobrar por QR Code.**

Isso importa porque o desenho atual é exatamente "gerar QR dinâmico por
cobrança" — só que via API, onde a tarifa é 0,99%. Vale entender na fatia 0
se existe caminho para a tarifa de QR, ou se ela é exclusiva de maquininha e
Point.

E há um alerta explícito na própria página de QR: *"Suas taxas podem ser
diferentes das mostradas aqui, verifique suas condições comerciais atuais."*
**A tabela pública não é a sua tabela** — a definitiva fica atrás de login.
Mesmo aprendizado do Asaas, onde a taxa real (R$ 1,99) só apareceu na conta.

---

## 4. Descoberta nova: o split vive na API que o MP está aposentando

- O split é documentado **apenas** para `POST /v1/payments` (`application_fee`)
  e `/checkout/preferences` (`marketplace_fee`).
- A nova **Orders API** — que o MP apresenta como o futuro e para a qual
  publicou guia de migração — **não tem nenhum campo de comissão de
  marketplace**. Verifiquei o body completo da referência: não existe
  `application_fee`, `marketplace_fee` nem equivalente em nenhum nível.
- Não há aviso formal de descontinuação da Payments API, mas a página de
  overview dela já exibe *"Estamos evoluindo nossa forma de integrar.
  Descubra a nova API Orders"*.

**Risco de plataforma:** você construiria sobre a API que o próprio
fornecedor sinaliza estar substituindo, sem que a substituta suporte o
recurso de que você depende. Não é bloqueante hoje, mas é dívida com data
incerta.

---

## 5. Descoberta nova: estorno pode virar prejuízo seu

> *"Em modelos 1:1, o Marketplace **não poderá realizar o reembolso total se
> o vendedor não tiver dinheiro na conta**. Nesse caso, cabe à conta do
> Marketplace reembolsar o equivalente à sua parte e decidir se devolverá o
> restante, que é responsabilidade do vendedor, por outro meio."*

Como o Pix cai na hora e o petshop pode sacar no mesmo dia, o cenário é
concreto: tutor pede estorno, petshop já sacou, e você fica entre devolver
do próprio bolso ou explicar ao tutor que precisa cobrar do petshop.

O Asaas tem a mesma natureza de problema, mas aqui ele está documentado com
todas as letras. **Vale uma política escrita de estorno antes do primeiro
parceiro**, não depois.

---

## 6. Requisitos de onboarding que o roadmap não previa

Somando tudo, o que o petshop precisa fazer **antes** de conseguir receber:

1. Ter (ou abrir) conta Mercado Pago
2. Atingir **KYC 6** — a doc não explica publicamente o que isso exige
3. **Cadastrar uma chave Pix na conta MP dele** — *"Para cobrar com Pix,
   você deve cadastrar uma chave Pix na conta que criou a integração"*. Como
   no split 1:1 quem cria o pagamento é o vendedor, a chave tem que ser dele
4. Instalar o app do Mercado Pago
5. Passar pelo OAuth

Compare com o Asaas: **uma chamada de API sua**. Esta é a diferença
comercial real, e ela ficou maior depois da pesquisa, não menor.

E há seis formas documentadas de o vínculo quebrar depois — incluindo
**troca de senha do vendedor, que revoga todas as credenciais**. Existe
webhook de desautorização; assine-o, ou uma cobrança vai falhar em silêncio.

---

## 7. O teste que decide — protocolo

Escrito como script executável em `scripts/teste-fatia0-mercadopago.mjs`.
Ordem importa: cada passo elimina uma explicação alternativa para a falha do
seguinte.

| # | Passo | O que prova / elimina |
|---|---|---|
| 0 | Criar aplicação com modelo **Marketplace**, e duas contas de teste (vendedor e comprador) | Confirma que o modelo é self-service |
| 1 | OAuth completo com o vendedor de teste → guardar `access_token` e `user_id` | **Elimina o erro 2059 por token errado** — o passo que mais confunde |
| 2 | `POST /v1/payments` com Pix **sem** `application_fee`, usando o token do vendedor | Prova que Pix funciona nessa conta (chave Pix cadastrada, KYC ok) |
| 3 | Mesma chamada **com** `application_fee` | **A pergunta binária.** 201 ou 2059? |
| 4 | Conferir se o `application_fee` volta preenchido no response | Detecta o campo ser aceito e descartado |
| 5 | **Pagar o Pix de verdade** e consultar o pagamento aprovado | — |
| 6 | Inspecionar `fee_details[]` do pagamento aprovado | **Separa "aceitou o campo" de "fez o split".** É o passo que não pode ser pulado |
| 7 | Conferir o saldo das duas contas | Confirmação final de que o dinheiro se dividiu |

### Por que o passo 5 provavelmente precisa ser em produção

Pix no sandbox do Mercado Pago fica pendente — não há como pagá-lo de
verdade, e sem pagamento aprovado não existe `fee_details`. O teste
definitivo é em **produção, com valor mínimo**: uma cobrança de R$ 1,00
entre duas contas suas, com `application_fee` de R$ 0,10. Custo total do
experimento: cerca de um centavo de tarifa.

Faça o sandbox primeiro para validar OAuth e a criação do pagamento (passos
1 a 4). Só depois o teste de R$ 1,00 em produção para os passos 5 a 7.

### Perguntas para o suporte, em paralelo ao teste

Mandar junto, porque a resposta demora e não custa nada:

1. *"`application_fee` é suportado em pagamentos via Pix no Split 1:1?"*
2. *"A frase 'não são permitidas transferências de instituições financeiras
   externas' na doc de Split 1:1 se refere à liquidação do split ou ao meio
   de pagamento do comprador? Um Pix pago de outro banco funciona?"*
3. *"Qual a data padrão de liberação do `application_fee` para a conta do
   marketplace?"*
4. *"Existe caminho para a tarifa de 0,49% (QR Code) em cobrança gerada por
   API, ou 0,99% é a única para Checkout Transparente?"*
5. *"O Split 1:1 será suportado na Orders API? Há prazo de descontinuação da
   Payments API?"*
6. *"O vendedor vinculado também precisa ser KYC 6, ou só a conta
   integradora?"*

---

## 8. Recomendação

**Não escreva código ainda.** O teste da seção 7 custa cerca de meio dia e
um centavo, e a resposta é binária:

- **Se `application_fee` funcionar com Pix e o `fee_details` confirmar o
  split:** o projeto é viável. Seguir para a Fatia 1 do roadmap, ciente de
  que o onboarding ficou mais pesado (seção 6) e de que a taxa real precisa
  ser confirmada na sua conta, não na tabela pública (seção 3).
- **Se não funcionar:** o Mercado Pago está fora, e a alternativa mais
  próxima é a **Efí** (1,19%, split de Pix documentado explicitamente para
  Pix, com a limitação de só repassar entre contas Efí). Aí este documento
  se repete para ela.

Enquanto o teste não acontece, a mudança que **não depende de gateway
nenhum** continua disponível: passar as assinaturas de cadência mensal para
trimestral derruba de 60 para 20 transações por petshop, o custo cai de
R$ 119,40 para R$ 39,80 (−67%) e custa cerca de 4 h. É reversível e não
compromete a decisão.

---

## Fontes

Documentação oficial consultada:

- [API Reference — POST /v1/payments](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-payment/post)
- [Split 1:1 — Pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites)
- [Split 1:1 — Integrar checkout em marketplace](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace)
- [Split 1:1 — Criar configuração](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/create-configuration)
- [OAuth — Criação](https://www.mercadopago.com.br/developers/pt/docs/split-payments/additional-content/security/oauth/creation)
- [OAuth — Renovação](https://www.mercadopago.com.br/developers/pt/docs/split-payments/additional-content/security/oauth/renewal)
- [OAuth — Gerenciamento e revogação](https://www.mercadopago.com.br/developers/pt/docs/split-payments/additional-content/security/oauth/management)
- [API Reference — Create order (Orders API)](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/create-order/post)
- [Pix na Orders API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix)
- [Quanto custa receber com Checkout](https://www.mercadopago.com.br/knowledge-hub/33399)
- [Quanto custa receber com QR Code](https://www.mercadopago.com.br/knowledge-hub/3605)
- [O que é necessário para cobrar com Pix](https://www.mercadolivre.com.br/ajuda/36543)

> Dica de pesquisa que economiza tempo: acrescentar `.md` ao final de
> qualquer URL do portal de docs (`.../prerequisites.md`) devolve o markdown
> da página, sem o JavaScript do site.
