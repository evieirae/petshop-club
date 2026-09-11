# Templates de WhatsApp (Meta Cloud API)

Fonte da verdade do texto submetido pra aprovação no **WhatsApp Manager >
Modelos de mensagem**. O mapeamento em código vive em
`supabase/functions/_shared/templates.ts` — os dois precisam bater
exatamente em **nome**, **idioma** e **ordem dos parâmetros**. Divergiu, a
API rejeita com `template name does not exist` ou
`number of parameters does not match`.

## Por que template, e não texto livre

Toda mensagem que a gente manda é *business-initiated*: o petshop começa a
conversa, o cliente não pediu nada naquele momento. A Meta só permite isso
com template previamente aprovado. Texto livre (`type: "text"`) é aceito
apenas dentro da **janela de atendimento de 24h**, que abre quando o próprio
cliente escreve pro número — e fecha 24h depois da última mensagem dele.

Por isso cada lembrete tem duas formas: o template (padrão) e o texto livre
equivalente, usado só quando `janela_whatsapp_aberta()` diz que dá. Quando o
lembrete sai como texto livre, `lembretes.template_nome` fica nulo.

## Regras da Meta que afetam o texto

- Parâmetro (`{{1}}`) **não pode** ser vazio, ter quebra de linha, tab ou 4+
  espaços seguidos. `templates.ts` sanitiza tudo em `param()`.
- Parâmetros precisam ser numerados em sequência a partir de `{{1}}`, sem
  pular, e não podem ficar no começo nem no fim do corpo sem texto ao redor.
- Botão de URL dinâmica guarda a **base** no template aprovado; a API recebe
  só o sufixo variável. Mandar a URL inteira gera link duplicado — é o erro
  clássico dessa integração.
- Categoria importa no preço e na aprovação: `UTILITY` (o nosso caso —
  transacional, sobre um serviço já contratado) é mais barato e aprova mais
  fácil que `MARKETING`. Nenhum destes templates pode virar oferta/promoção,
  ou a Meta reclassifica e a conta pode ser penalizada.
- Nome de quem recebe a mensagem: nos templates que **falam diretamente com
  o tutor** ("Olá {{1}}!"), o parâmetro leva só o **primeiro nome**
  (`primeiroNome()` em `templates.ts`, recorte por espaço em branco — sem
  mudar cadastro nem schema, o nome completo continua salvo pro gateway de
  pagamento). Templates **internos**, que avisam a equipe do petshop sobre
  um tutor (ex.: `confirmacao_pendente_petshop`), continuam com o nome
  completo — ali o objetivo é identificar o cliente, não soar humano.

---

## 1. `confirmacao_agendamento`

- **Categoria:** UTILITY · **Idioma:** `pt_BR`
- **Gerado por:** checkpoint D-1 (`gerar_lembretes_confirmacao()`)
- **Vai para:** contato de `papel='busca_entrega'` do tutor

**Corpo:**

```
Olá {{1}}! Passando pra confirmar o banho/tosa do {{2}} amanhã, dia {{3}} às {{4}}, na {{5}}. Se estiver tudo certo, é só confirmar.
```

| # | Conteúdo | Exemplo |
|---|----------|---------|
| 1 | Primeiro nome de quem leva o pet | Marina |
| 2 | Nome do pet | Thor |
| 3 | Data da visita | 15/08/2026 |
| 4 | Horário | 09:00 |
| 5 | Nome do petshop | Petshop Pedra Branca |

**Botão (Call to action > Visitar site, URL dinâmica):**
`https://SEU-DOMINIO/confirmar/{{1}}` — parâmetro enviado: `lembretes.id`.
Texto do botão: `Confirmar`.

> O tutor também pode simplesmente responder **"sim"** — o webhook trata
> isso em `confirmar_agendamento_por_whatsapp()`, mesma regra da rota
> pública. O botão continua existindo porque é o caminho mais explícito.

---

## 2. `pet_pronto`

- **Categoria:** UTILITY · **Idioma:** `pt_BR`
- **Gerado por:** trigger `trg_pet_pronto_lembrete()` (equipe marca "pronto"
  na Agenda)
- **Vai para:** contato de `papel='busca_entrega'`

**Corpo:**

```
Olá {{1}}! O {{2}} já está {{3}} pra buscar na {{4}}. Estamos te esperando!
```

| # | Conteúdo | Exemplo |
|---|----------|---------|
| 1 | Primeiro nome de quem busca | Rafael |
| 2 | Nome do pet | Thor |
| 3 | "pronto" ou "pronta" — concordância com `pets.sexo` (migration 0008); sem sexo informado, cai em "pronto" | pronto |
| 4 | Nome do petshop | Petshop Pedra Branca |

Sem botão.

---

## 3. `confirmacao_pendente_petshop`

- **Categoria:** UTILITY · **Idioma:** `pt_BR`
- **Gerado por:** `escalar_confirmacao_pendente('manha'|'tarde')`
- **Vai para:** `petshops.telefone` (a equipe, não o cliente)

**Corpo:**

```
Confirmação pendente: {{1}} (tutor {{2}}) tem visita amanhã às {{3}} e ainda não confirmou. Vale checar direto com o cliente.
```

| # | Conteúdo | Exemplo |
|---|----------|---------|
| 1 | Nome do pet | Thor |
| 2 | Nome do tutor | Marina Souza |
| 3 | Horário | 09:00 |

Sem botão.

---

## 4. `cadastro_tutor`

- **Categoria:** UTILITY · **Idioma:** `pt_BR`
- **Gerado por:** `gerarLinkCadastro` em `app/(app)/tutores/actions.ts`
- **Vai para:** telefone que a equipe cadastrou (único dado que existe do
  tutor nesse momento)

**Corpo:**

```
Olá! A {{1}} preparou um cadastro rapidinho pra você — leva menos de dois minutos e é só preencher os dados do seu pet.
```

| # | Conteúdo | Exemplo |
|---|----------|---------|
| 1 | Nome do petshop | Petshop Pedra Branca |

**Botão (Call to action > Visitar site, URL dinâmica):**
`https://SEU-DOMINIO/cadastro/{{1}}` — parâmetro enviado: `tutores.id`.
Texto do botão: `Preencher cadastro`.

---

## 5. `cobranca_pix`

- **Categoria:** UTILITY · **Idioma:** `pt_BR`
- **Gerado por:** `processar-cobrancas` (Fase 6 — quando o tutor não tem
  cartão salvo, ou prefere Pix), tanto pra mensalidade de assinatura quanto
  pra visita avulsa
- **Vai para:** contato de `papel='cobranca'` do tutor

**Corpo (revisado em 17/ago/2026 — generalizado de "mensalidade" pra
"cobrança" pra servir os dois casos; nunca tinha sido submetido à Meta, daí
dar pra mudar sem custo de resubmissão):**

```
Olá {{1}}! A cobrança do {{2}} ({{3}}) já está disponível pra pagamento via Pix. Copia e cola: {{4}}
```

| # | Conteúdo | Exemplo |
|---|----------|---------|
| 1 | Primeiro nome de quem paga | Marina |
| 2 | Nome do pet | Thor |
| 3 | Valor | R$ 123,75 |
| 4 | Código Pix copia-e-cola | (string longa devolvida pelo gateway) |

Sem botão — o valor do parâmetro 4 já é o dado acionável (o tutor copia
direto da mensagem). Implementado em `processar-cobrancas/index.ts`
(gera o lembrete logo depois de criar a cobrança Pix no Asaas) e
`_shared/templates.ts` (`montarMensagem`, case `cobranca_pix`). Ainda sem
teste ponta a ponta contra o Asaas/Meta de verdade — ver aviso em
`_shared/asaas.ts`.

---

## 6. `aviso_cobranca`

- **Categoria:** UTILITY · **Idioma:** `pt_BR`
- **Gerado por:** checkpoint D-1 de cobrança (ainda não implementado —
  seção 6 do plano; mesmo horário/mecanismo dos checkpoints da Fase 5)
- **Vai para:** contato de `papel='cobranca'` do tutor

**Corpo:**

```
Olá {{1}}! Só um aviso: amanhã sai a mensalidade de {{2}} do plano do {{3}}, no cartão cadastrado.
```

| # | Conteúdo | Exemplo |
|---|----------|---------|
| 1 | Nome de quem paga | Marina |
| 2 | Valor | R$ 123,75 |
| 3 | Nome do pet | Thor |

Sem botão.

---

## 7. `cadastro_cartao`

- **Categoria:** UTILITY · **Idioma:** `pt_BR`
- **Gerado por:** fluxo de assinatura nova / troca de cartão (seção 5 do
  plano)
- **Vai para:** contato de `papel='cobranca'` do tutor

**Corpo:**

```
Olá {{1}}! Pra ativar a cobrança automática do plano do {{2}} na {{3}}, cadastre seu cartão nesse link seguro.
```

| # | Conteúdo | Exemplo |
|---|----------|---------|
| 1 | Nome de quem paga | Marina |
| 2 | Nome do pet | Thor |
| 3 | Nome do petshop | Petshop Pedra Branca |

**Botão (Call to action > Visitar site, URL dinâmica):**
`https://SEU-DOMINIO/cartao/{{1}}` — parâmetro enviado: token do link
(ver seção 5 do plano — rota ainda não implementada). Texto do botão:
`Cadastrar cartão`.

---

## 8. `pet_entregue`

- **Categoria:** UTILITY · **Idioma:** `pt_BR`
- **Gerado por:** trigger `trg_pet_pronto_lembrete()` (equipe marca
  "entregue" — pelo quadro de visitas do dia na Visão Geral, ou pela
  Agenda) — migration `0013_pet_entregue_lembrete.sql`
- **Vai para:** contato de `papel='busca_entrega'`

**Corpo:**

```
Olá {{1}}! O {{2}} já foi entregue — muito obrigado por confiar na {{3}}. Até a próxima!
```

| # | Conteúdo | Exemplo |
|---|----------|---------|
| 1 | Primeiro nome de quem buscou | Rafael |
| 2 | Nome do pet | Thor |
| 3 | Nome do petshop | Petshop Pedra Branca |

Sem botão. Diferente de `pet_pronto`, não precisa de parâmetro de
concordância de gênero — "entregue" não muda entre macho/fêmea.

---

## Checklist ao submeter

1. Criar os 8 templates no WhatsApp Manager com **exatamente** os nomes
   acima (minúsculo, com underscore — a Meta não aceita maiúscula/espaço).
   `cobranca_pix` já tem código de geração e envio completo (17/ago/2026),
   e `pet_entregue` também (18/ago/2026) — dá pra submeter os dois assim
   que o produto WhatsApp estiver configurado. `aviso_cobranca` e
   `cadastro_cartao` ainda não têm gerador (checkpoint D-1 de cobrança e
   fluxo de tokenização de cartão, respectivamente) — deixar pra depois que
   esses pedaços da Fase 6 existirem de verdade. Quando forem implementados,
   usar `primeiroNome()` no parâmetro de nome (mesmo padrão dos templates 1,
   2, 5 e 8).
2. Categoria `UTILITY` em todos. Se a Meta reclassificar pra `MARKETING`,
   revise o texto: provavelmente ficou promocional demais.
3. Nas URLs dinâmicas, usar o domínio real de produção — a base fica
   congelada no template aprovado, mudar de domínio depois exige
   **resubmeter**. Em teste, cadastre a URL de preview e crie versões
   separadas se precisar.
4. Aprovação costuma sair em minutos, mas pode levar até 24h. Antes disso,
   qualquer envio falha com `template name does not exist` — e o lembrete
   fica `status='falhou'` com esse texto em `erro_envio`.
5. Depois de aprovado, mandar um de cada pro seu próprio número e conferir
   se os parâmetros caíram nas posições certas (troca de `{{3}}`/`{{4}}` não
   dá erro nenhum — só manda a data no lugar da hora).
