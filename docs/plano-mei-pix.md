# Piloto com MEI e Pix — plano revisado

Terceira versão do plano de entrada em produção, agora com três decisões
tomadas por você:

1. **Manter o WhatsApp**, com as otimizações de custo aplicadas.
2. **Pagamento só por Pix, e só quando for remoto.** Presencial continua
   sendo cobrado pelo petshop, como já é hoje.
3. **Abrir MEI** (serviço técnico de informática) agora, migrando para ME
   quando escalar.

Substitui `docs/piloto-caixa-zero.md`, que propunha cortar o WhatsApp e o
pagamento inteiros. Complementa `docs/custos-producao.md`, que continua
valendo para o cenário de escala.

---

## 1. O que muda com as três decisões

| | Plano "caixa zero" | **Este plano** |
|---|---|---|
| WhatsApp | manual, R$ 0 | **automático otimizado, R$ 34/petshop** |
| Pagamento | fora do fluxo, R$ 0 | **Pix remoto via Asaas com split** |
| Cartão | fora | **fora** (mantido) |
| Estrutura | sem CNPJ | **MEI — R$ 86,05/mês** |
| Fixo mensal | R$ 3,33 | **R$ 104,38** (MEI + domínio + chip) |
| Destrava | — | Business Portfolio, templates, Fase 5 e Fase 6-Pix |

O custo fixo sobe de R$ 3 para R$ 104. Em troca, o produto que você mostra
ao parceiro é o produto de verdade, não uma versão manual — e as Fases 5 e 6
saem do papel.

---

## 2. Sobre o MEI: o teto não é o seu problema, o CNAE é

O seu raciocínio sobre o teto está certo — e os números confirmam. O que
precisa entrar na decisão é outra coisa.

### 2a. O teto aguenta bem

Limite MEI 2026: **R$ 81.000/ano = R$ 6.750/mês** de receita própria.
DAS de serviços: **R$ 86,05/mês** (INSS R$ 81,05 sobre o mínimo de
R$ 1.621 + ISS R$ 5,00).

Sua receita por petshop é o fee de R$ 99 mais 3% sobre o que passa pelo
gateway:

| % dos pagamentos que é remoto | Receita/petshop/mês | Estoura o MEI em |
|---|---|---|
| 20% | R$ 219 | 31 petshops |
| 30% | R$ 279 | 24 petshops |
| **60%** (provável — ver abaixo) | **R$ 459** | **15 petshops** |
| 80% | R$ 579 | 12 petshops |

> **"Pagamento remoto" é praticamente sinônimo de "assinatura".** Quando a
> mensalidade do clube vence, o tutor não está na loja — ele paga de casa.
> Avulsa é que costuma ser presencial. Como o produto é um *clube de
> assinatura*, a fatia remota tende a ser alta, não baixa. Isso é bom para
> receita e antecipa o teto do MEI: planeje a migração para ME por volta de
> **12–15 petshops**, não de 30.

### 2b. O CNAE é o ponto que precisa de decisão consciente

Os CNAEs de informática permitidos no MEI são de **atividade operacional e
física**:

- `9511-8/00` — reparação e manutenção de computadores e periféricos
- `6190-6/99` — instalador de redes
- `8599-6/03` — instrutor de informática

**Licenciamento de software e SaaS não está entre eles** — assim como
desenvolvimento, consultoria em TI e criação de aplicativos. A justificativa
legal é que são atividades intelectuais de caráter científico.

O que você vai vender é uma assinatura mensal de software. Isso não é
manutenção de computador.

**Como o problema aparece na prática** — e não é a Receita que descobre
primeiro:

1. Seus clientes são PJ. Eles vão querer a nota fiscal para lançar a
   despesa.
2. A nota vai sair com descrição de "reparação e manutenção de
   computadores" para uma mensalidade de sistema.
3. **O contador do petshop olha essa nota.** É aí que a conversa começa —
   muito antes de qualquer fiscalização.

**Se houver desenquadramento retroativo**, a consequência documentada é
recolher os tributos como ME sobre todo o período, com juros SELIC e multa
que pode chegar a 225%.

**A conta da decisão, em uma linha:** MEI R$ 86 contra ME/SLU R$ 318 são
**R$ 232/mês de diferença — 2,3 petshops**. A pergunta não é "MEI é mais
barato?" (é), é *"esses 2,3 petshops de economia valem carregar esse risco
enquanto a base cresce?"*.

Duas coisas que reduzem o risco sem abandonar o plano:

- **Migrar para ME por gatilho de visibilidade, não de teto.** O momento
  natural não é R$ 81 mil de faturamento — é quando você passar a emitir
  nota com regularidade para vários PJs. Na prática, algo entre 5 e 10
  petshops pagantes.
- **Levar a pergunta a um contador antes de abrir**, não depois. Pode haver
  enquadramento municipal ou leitura que eu não conheço, e o custo de
  perguntar é uma conversa.

> Não sou contador e isto não é orientação contábil. O que está aqui são os
> fatos publicados sobre o Anexo XI da Resolução CGSN 140/2018 e sobre as
> consequências de desenquadramento — a decisão e a validação são suas, com
> um profissional.

---

## 3. O split não é conveniência — é o que mantém o MEI de pé

Este é o ponto técnico mais importante do documento.

Com o split do Asaas configurado por subconta, o dinheiro do petshop
**nunca entra na sua conta**: a liquidação já cai dividida, e só a sua
fatia (fee + 3%) é receita sua.

Sem split — se a cobrança cair inteira na sua conta e você repassar depois —
o valor bruto que transita é R$ 20.000/mês **por petshop**. Isso é
R$ 240.000/ano com um único parceiro. Você teria que provar, item a item,
que 97% daquilo é repasse e não receita.

| | Receita computada | Estoura o MEI em |
|---|---|---|
| **Com split por subconta** | fee + 3% | **15 petshops** |
| Sem split (repasse manual) | GMV inteiro | **menos de 1 petshop** |

Conclusão prática: **a subconta de R$ 12,90 por petshop deixa de ser um
custo de onboarding e vira requisito estrutural.** Ela é o que separa
"MEI viável" de "MEI impossível". Não abra exceção para nenhum parceiro.

---

## 4. WhatsApp otimizado — a política, template a template

Você mantém a automação; ela só passa a ser deliberada sobre o que paga e o
que não paga.

| Template | Envios/mês | Decisão | Custo |
|---|---|---|---|
| `confirmacao_agendamento` (D-1) | 400 | **Manter como template pago.** É o que abre a janela de 24 h — não é custo a cortar, é o ingresso que torna os outros gratuitos | R$ 18,00 |
| `pet_pronto` | 400 → 160 pagos | **Texto livre quando a janela está aberta.** Se ~60% dos tutores confirmam, 60% desses envios saem de graça | R$ 7,20 |
| `pet_entregue` | 400 → 0 | **Desligado por padrão**, com flag por petshop. Menor valor percebido: o tutor acabou de sair da loja com o pet | R$ 0,00 |
| `confirmacao_pendente_petshop` | 60 → 0 | **Sai do WhatsApp.** Vira badge na Agenda — quem lê já está logado no painel | R$ 0,00 |
| `cadastro_tutor` | 10 | **Manter.** Volume baixo e é o primeiro contato do cliente com o produto | R$ 0,45 |
| `cobranca_pix` | 30 | **Manter, só para pagamento remoto.** Com o novo escopo, quem paga presencialmente não recebe cobrança | R$ 1,35 |
| `aviso_cobranca` | — | **Não implementar.** Redundante com `cobranca_pix` | R$ 0,00 |
| `cadastro_cartao` | — | **Fora do escopo.** Sem cartão na v1 | R$ 0,00 |
| `retencao_cliente` (MARKETING) | 20 | **Teto rígido:** 1 por tutor a cada 90 dias, máximo 20/mês por petshop, configurável | R$ 7,00 |
| **Total** | | | **R$ 34,00** |

**R$ 61,65 → R$ 34,00 por petshop, uma queda de 45% — e isso já ligando a
mensagem de retenção, que nem estava na conta anterior.**

O que sustenta esse número é uma regra só: **o D-1 é pago de propósito,
para que o resto do dia seja gratuito.** Se a taxa de confirmação for baixa
no piloto, o `pet_pronto` volta a custar — por isso ela é uma das métricas
da seção 7.

### O que precisa ser construído

| Tarefa | Horas |
|---|---|
| `enviar-lembretes` preferir texto livre quando `janela_whatsapp_aberta()` for verdadeira | 4–6 |
| Coluna `petshops.enviar_pet_entregue`, padrão `false` | 2 |
| `confirmacao_pendente_petshop` vira badge na Agenda | 4 |
| Teto de disparo de `retencao_cliente` (por tutor e por petshop) | 3 |
| **Total** | **13–15 h** |

---

## 5. Pix apenas para pagamento remoto

Escopo bem escolhido: resolve o caso em que o dinheiro precisa mesmo passar
por você, e deixa de fora o caso em que o petshop já resolve sozinho.

### O que sai do escopo — e o alívio que isso traz

- **Tokenização de cartão.** É o item que está travado esperando análise de
  risco do Asaas. Sem cartão na v1, **ele deixa de ser bloqueante.** Esse é
  o maior ganho desta decisão, e não é de custo — é de cronograma.
- **D+32.** Some junto com o cartão. Pix é imediato.
- **PCI SAQ-A**, página pública de cartão, tabela `metodos_pagamento`,
  template `cadastro_cartao`, dunning de cartão vencido — todos fora da v1.
- **Gap #2 do plano da Fase 6** (petshop não tem como salvar cartão
  próprio) vira irrelevante: o fee da plataforma também é Pix.

### O que continua sendo necessário

| Item | Situação | Ação |
|---|---|---|
| Chave de API do Asaas (sandbox) | **Travada** na verificação de e-mail | Só você resolve — é o desbloqueio nº 1 |
| Subconta por petshop | R$ 12,90 | **Obrigatória** — ver seção 3 |
| CPF do tutor (`tutores.cpf`) | Coluna existe, fluxo não pede | O Asaas exige CPF para criar `customer` **mesmo para Pix**. Decidir onde no cadastro isso é pedido |
| Webhook de confirmação Pix | Rascunho não testado | Testar no sandbox antes do parceiro |
| `pagamento_local` (migration 0011) | Existe | É o caminho do presencial — nada a fazer |

### O gap que muda de categoria

O **gap #3** do plano da Fase 6 — *"o pagamento do portal do tutor ainda não
é síncrono"* — estava classificado como pendência aceitável. **Com esta
decisão ele vira bloqueante.**

O motivo: pagamento remoto *é* o portal do tutor. Se o tutor agenda de casa
e o QR Pix só aparece depois que o cron rodar, ele fecha a tela e não paga.
Não dá para entregar "Pix remoto" com pagamento assíncrono — o remoto é
justamente o caso que precisa da resposta na hora.

Isso exige portar o cliente do gateway para o runtime do Next.js, ou expor
uma rota síncrona que a Edge Function atenda. **Estimativa: 8–12 h**, e é o
trabalho mais delicado deste plano.

---

## 6. Custo e escada revisados

### Custo fixo

| Item | R$/mês |
|---|---|
| DAS MEI (serviços) | 86,05 |
| Domínio `.com.br` | 3,33 |
| Chip do número WhatsApp | ~15,00 |
| Netlify Free | 0,00 |
| Supabase Free (até o 1º pagante) | 0,00 |
| **Fixo** | **~104,38** |

### Escada

Premissas: petshop médio com GMV de R$ 20 mil/mês, 30% remoto no início.

| Degrau | Petshops | Fixo | WhatsApp | Custo | Receita | Margem |
|---|---|---|---|---|---|---|
| **D0** — piloto, isento, templates em aprovação | 1 | 104 | 0 | **104** | 0 | −104 |
| **D1** — WhatsApp ligado, 3 pagantes, Supabase Pro | 3 | 233 | 102 | **335** | 837 | **+502** |
| **D2** — 8 pagantes | 8 | 233 | 272 | **505** | 2.232 | **+1.727** |
| **D3** — 15 pagantes · *migrar para ME aqui* | 15 | 233 | 510 | **743** | 4.185 | **+3.442** |

**O D0 é o único mês negativo, e ele custa R$ 104** — não R$ 740, e não três
meses seguidos de prejuízo. Assim que o primeiro parceiro passa a pagar, a
operação vira positiva.

> Há um efeito de calendário que ajuda: os templates da Meta levam dias ou
> semanas para serem aprovados depois de submetidos. Ou seja, as primeiras
> semanas do piloto rodam sem WhatsApp automático **por cronograma, não por
> corte de escopo** — e sem custo de mensagem. Aproveite para medir a taxa
> de confirmação com envio manual, que é o número que define quanto a
> otimização da janela de 24 h vai valer.

---

## 7. Ordem de execução

### Você (não dá para automatizar)

1. **Abrir o MEI** — e levar a pergunta do CNAE ao contador na mesma
   conversa.
2. **Verificar o e-mail da conta Sandbox do Asaas** e gerar a chave de API.
   É o bloqueio nº 1 de tudo na Fase 6.
3. **Conectar o Business Portfolio na Meta** com o CNPJ do MEI
   (`developers.facebook.com/apps/4526442457640626`) e **submeter os
   templates** — quanto antes, porque a aprovação é o caminho crítico.
4. **Comprar o chip** do número do WhatsApp (não pode estar registrado no
   app comum).

### Desenvolvimento — ordem por dependência

| Ordem | Tarefa | Horas | Por que nessa posição |
|---|---|---|---|
| 1 | Deploy na Netlify | 2–4 | Nada roda sem estar no ar |
| 2 | `pg_dump` diário → Cloudflare R2 | 3–5 | Não sobe petshop real sem backup |
| 3 | CPF do tutor no fluxo de cadastro | 2 | Sem ele nenhuma cobrança Asaas funciona |
| 4 | Pix síncrono no portal do tutor | 8–12 | O caso de uso central do escopo escolhido |
| 5 | Teste ponta a ponta no sandbox do Asaas | 4 | Nada da Fase 6 jamais rodou de verdade |
| 6 | Janela de 24 h no `enviar-lembretes` | 4–6 | Só vale depois que o WhatsApp estiver ligado |
| 7 | `enviar_pet_entregue` + badge no painel + teto de retenção | 9 | Otimização, depois de funcionar |
| 8 | Sentry, UptimeRobot, keep-alive | 2 | Antes do parceiro real |
| | **Total** | **34–44 h** | |

---

## 8. O que medir no piloto

1. **Taxa de confirmação do D-1.** Define quanto da janela gratuita de 24 h
   você aproveita — é a variável que faz o WhatsApp custar R$ 34 ou R$ 52
   por petshop.
2. **Fatia dos pagamentos que é remota.** Define a receita de 3% *e* o
   momento de migrar para ME. É o número que aparece nas duas contas.
3. **GMV mensal do petshop.** Ainda é o dado mais valioso: decide se 3% é
   R$ 180 ou R$ 600 por parceiro.
4. **Redução de falta.** É o que você vende.

---

## 9. Resumo

As três decisões são coerentes entre si e o custo fecha: **R$ 104/mês de
fixo, R$ 34/petshop de WhatsApp, positivo a partir do primeiro pagante.**

O escopo "Pix só remoto" é a melhor decisão das três, e não pelo custo —
ela tira do caminho crítico a tokenização de cartão, que é o único item do
projeto cujo prazo não depende de você.

Duas coisas para não deixar passar:

- **O split por subconta é obrigatório**, não opcional. Sem ele o MEI não
  sobrevive ao primeiro petshop.
- **O CNAE do MEI não cobre SaaS.** Vale a economia de R$ 232/mês por um
  tempo? Provavelmente sim. Vale até 15 petshops e uma pilha de notas
  fiscais emitidas para PJ? Aí já é outra conversa — e ela é com um
  contador, antes de abrir.
