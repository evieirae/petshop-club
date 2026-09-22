# Plano — Loja pública, pagamentos com split e importação por planilha (19/set/2026)

Pedido do Eduardo: **pausar a migração Supabase→Postgres** e atacar três
frentes que, juntas, são o que falta para um petshop entrar no PetClub
sozinho e vender pelo app:

1. **Loja aberta a qualquer pessoa** — o petshop compartilha um link, o
   cliente navega sem login, e só precisa se cadastrar se quiser comprar ou
   agendar.
2. **Pagamento com split** — Mercado Pago ou outro, desde que o cartão de
   crédito não demore absurdos para cair na conta do petshop.
3. **Importação por planilha** — clientes, pets, serviços, produtos e agenda,
   para o petshop não passar semanas migrando de ferramenta.

Mesmo método das Fases 5 e 6: entender as regras antes de escrever código, e
separar o que é decisão de negócio do que é implementação.

---

## 0. Decisões já tomadas nesta conversa

| Pergunta | Resposta do Eduardo |
|---|---|
| Qual gateway? | **Comparar os três (Asaas, Mercado Pago, Pagar.me) numa fatia 0 real antes de decidir** |
| Receita da plataforma com gateway ligado | **Fee fixo de R$ 99 + percentual apenas nas cobranças processadas pela plataforma** (pagamento local continua sem comissão) |
| Quem paga a **taxa de transação** (ex.: R$ 1,99 do Pix, % do cartão) | **O tutor** — somada ao valor cobrado, como valor adicional |
| Quem paga a **antecipação** | **Quem quer receber antes**: se a plataforma antecipa a parte dela, ela paga; se o petshop quer a parte dele antes, ele paga |
| Escopo da importação de agenda | **Agendamentos futuros + assinaturas** (histórico fica fora) |
| O que a loja é | **O site do próprio petshop**, não uma vitrine dentro do PetClub (20/set) |
| Endereço | **Subdomínio por petshop** — `pagani.petshopclube.com.br` |
| Pré-marcação de quem chegou pela rua | **Não segura o horário**, e tem prazo de resposta. Cliente já aprovado continua segurando |
| Conteúdo do site | Página por produto e por serviço, páginas institucionais, avaliações de clientes |

As duas últimas linhas separam duas coisas que o plano anterior tratava como
uma só, e é essa separação que muda a arquitetura:

- **Taxa de transação** — mantém a decisão de 16/ago/2026
  (`docs/fase6_pagamentos.md`, seção 1c): somada ao tutor, petshop recebe o
  valor cheio do serviço via `fixedValue`. O código da `0006` continua válido.
- **Antecipação** — é opcional e individual: um custo de quem escolheu não
  esperar. Isso **não pode ser cobrado da cobrança inteira**, senão o custo
  escorre para o outro lado do split. Ver seção 3.4, que virou a pergunta
  decisiva da fatia 0.

---

## 1. Ponto de partida — o que já existe

Vale registrar antes de estimar qualquer coisa, porque **as três frentes
partem de lugares muito diferentes**.

| Peça | Situação |
|---|---|
| Catálogo de produtos, estoque, PDV de balcão (`0012`, `0015`, `0016`) | ✅ pronto |
| Lojinha do tutor com carrinho e reserva com prazo (`0026`) | ✅ pronto — **mas só para tutor logado e liberado** |
| Portal do tutor: sessão, senha provisória, agendar (`0024`, `0025`) | ✅ pronto — **acesso liberado manualmente, um a um** |
| Páginas públicas sem sessão (`/cadastro/[tutorId]`, `/agendar/[tutorId]`, `/confirmar`) | ✅ existem, via `service_role`, com id cru na URL |
| Site institucional do PetClub + captação de leads (`0018`) | ✅ pronto — é o site da *plataforma*, não o do petshop |
| Caixa de pedidos do tutor na Agenda (`PedidosSection.tsx`, `0025`) | ✅ pronto — aceitar/recusar já funcionam, falta o aviso chegar |
| Status `solicitado` / `recusado` e log de transições (`0025`, `0014`) | ✅ prontos — a pré-marcação não começa do zero |
| Split, cobrança recorrente, webhook, dunning (`0006`, `0007`) | ⚠️ **escrito contra o Asaas e nunca executado** — dorme desde 30/ago |
| `petshops.slug`, loja pública, catálogo visível para anônimo | ❌ não existe |
| Autocadastro do tutor (criar a própria conta) | ❌ não existe — e hoje o schema diz o contrário de propósito |
| Importação de qualquer coisa por arquivo | ❌ não existe, nenhuma linha |

Dois achados que mudam o desenho e precisam estar na mesa antes das fatias:

**(a) A regra "ter cadastro não dá acesso" é incompatível com loja aberta.**
A `0024` diz, com todas as letras: *"Ter cadastro NÃO dá acesso. Quem libera
é a administração, tutor por tutor (`acesso_liberado`)"*. Uma loja em que
qualquer pessoa compra exige exatamente o oposto — o cliente cria a conta
dele e sai comprando. Isso não é um detalhe de UI: é o modelo de identidade
do produto mudando. A seção 1.3 resolve isso sem jogar a regra fora.

**(b) O petshop não tem identificador público.** Toda URL pública hoje usa
`tutores.id` cru. Um site próprio precisa de `petshops.slug` — que agora é
também o subdomínio (`pagani.petshopclube.com.br`), o que o torna uma decisão
mais séria: é o endereço que vai no anúncio e no cartão, escolhido pelo
petshop, validado contra reservados (`www`, `admin`, `api`, `app`…) e
**imutável depois de publicado**.

---

## 2. Frente A — O site do petshop

> **Mudança de escopo, 20/set:** isto deixou de ser "uma vitrine compartilhável"
> e passou a ser **o site do petshop** — endereço próprio, páginas de verdade,
> destino de anúncio pago. O que estava escrito como uma vitrine de 36–50 h
> vira o dobro de trabalho, e muda de natureza: vitrine é uma tela; site é um
> produto com conteúdo, endereço e reputação.

O que o petshop precisa poder dizer: *"meu site é pagani.petshopclube.com.br"*.
O que o cliente precisa poder fazer sem falar com ninguém: achar o petshop,
ver preço, criar conta, comprar e **pedir** um banho. O que o petshop continua
decidindo: se aceita aquele cachorro.

### A.0 As três regras que organizam tudo

1. **O site é do petshop, a plataforma é invisível.** Logo, cores, textos e
   fotos são dele. "PetClub" aparece no rodapé, discreto, e em lugar nenhum
   mais. Um site que parece SaaS de terceiro não serve de destino de anúncio.
2. **Ver não exige nada. Comprar e pedir exigem conta.** Cadastro dá acesso às
   duas coisas de imediato.
3. **Cadastro não é aprovação.** O pet entra no sistema **não confirmado**, e
   o banho é um **pedido**. Quem decide se aquele cachorro é atendido ali é o
   petshop, olhando porte, raça e observações — não o formulário.

### A.1 Endereço: subdomínio por petshop

`pagani.petshopclube.com.br`, com `*.petshopclube.com.br` apontando para o
mesmo projeto na Vercel e o `middleware.ts` (que já existe, hoje só renovando
sessão) resolvendo o subdomínio para o petshop e reescrevendo internamente
para a rota do site.

**Achado que muda o cronograma:** a Vercel exige que domínio wildcard use
**os nameservers dela** — *"wildcard domains must be configured with the
nameservers method"*, porque ela precisa criar registros DNS para emitir o
certificado. Hoje o `petshopclube.com.br` tem DNS no Registro.br, com o MX do
Zoho Mail (`contato@petshopclube.com.br`) e o TXT de verificação de domínio da
Meta.

Então "subdomínio sai de graça" tem uma letra miúda: **migrar os nameservers
para a Vercel e recriar MX, SPF, DKIM e os TXT lá**. É meia hora de trabalho e
um risco real de e-mail parar por algumas horas se um registro for esquecido.
Fazer isso **antes** do site existir, num momento em que ninguém depende do
e-mail, é muito mais barato do que no dia do lançamento.

- [ ] Inventariar os registros DNS atuais no Registro.br (print de tudo)
- [ ] Migrar nameservers e recriar os registros na Vercel
- [ ] Conferir envio **e recebimento** do Zoho antes de seguir
- [ ] Adicionar `*.petshopclube.com.br` ao projeto
- [ ] Resolver subdomínio no middleware (com cache do slug→petshop)

**Estimativa: 6–10 h**, das quais metade é DNS e paciência.

### A.2 Migration `0031` — o petshop vira conteúdo

```sql
alter table petshops
    add column slug             text unique,
    add column site_ativo       boolean not null default false,
    add column site_titulo      text,
    add column site_descricao   text,      -- meta description e subtítulo da home
    add column site_sobre       text,      -- texto livre da página "sobre"
    add column logo_url         text,
    add column capa_url         text,
    add column whatsapp         text,
    add column instagram        text,
    add column mapa_lat         numeric(9,6),
    add column mapa_lng         numeric(9,6),
    add column prazo_resposta_pedido_horas smallint not null default 24;

alter table produtos
    add column slug text, add column descricao text, add column foto_url text,
    add column visivel_na_loja boolean not null default true;

alter table servicos
    add column slug text, add column descricao text, add column foto_url text,
    add column visivel_na_loja boolean not null default true;
```

Mais as três peças novas de comportamento:

```sql
-- o pet entra, mas não está aprovado
alter table pets
    add column confirmado_pelo_petshop boolean not null default true,
    add column confirmado_em timestamptz,
    add column recusa_motivo text;
-- default true porque toda a carteira existente JÁ foi aceita na prática;
-- só o que nasce pelo site entra como false.

-- o pedido de quem ainda não é cliente NÃO segura a vaga
alter table agendamentos
    add column reserva_slot boolean not null default true;

drop index if exists agendamentos_slot_unico;
create unique index agendamentos_slot_unico
    on agendamentos (petshop_id, data_hora)
    where status in ('solicitado','agendado','confirmado') and reserva_slot;
```

A coluna `reserva_slot` existe porque índice parcial não consegue consultar
outra tabela: quem decide se aquele pedido segura a vaga é a função que o
cria, olhando se o pet já foi confirmado. Cliente da casa continua exatamente
como a `0025` desenhou — *"pedido pendente ocupa a vaga"* —; desconhecido
vindo de anúncio entra com `reserva_slot = false` e não trava o sábado de
ninguém.

Pedido sem resposta dentro de `prazo_resposta_pedido_horas` vira `recusado`
com motivo automático, por `pg_cron`, no mesmo molde de `expirar_reservas()`
(`0026`). Silêncio que dura para sempre é pior para o cliente do que um não.

**Estimativa: 8–10 h.**

### A.3 As páginas

```
/                     home: capa, serviços, destaques, avaliações, mapa
/produtos             catálogo, com filtro por categoria
/produtos/[slug]      ← destino de anúncio: foto, descrição, preço, comprar
/servicos/[slug]      ← destino de anúncio: preço por porte, pedir horário
/sobre                texto, galeria, horário, localização
/contato              telefone, WhatsApp, e-mail, mapa
/avaliacoes           o que os clientes disseram
/agendar              escolher serviço, pet e horário
/carrinho · /checkout
```

Grupo de rota novo `app/(site)`, resolvido por subdomínio, com casca própria —
sem sidebar, sem vocabulário de painel, pensada para celular.

Cada página de produto e de serviço tem `generate_metadata` com Open Graph e
JSON-LD (`Product`, `LocalBusiness`, `AggregateRating`) — é o que faz o link
colado no WhatsApp mostrar foto e preço, e o que o Google usa para exibir
estrelas no resultado. `sitemap.ts` por petshop.

**Estimativa: 16–22 h.** É a maior fatia da frente, e é a que decide se o site
parece de verdade.

### A.4 Carrinho anônimo e o portão de login

Sem mudança em relação ao plano de 19/set: carrinho em `localStorage` sem
preço (preço se recalcula sempre no servidor), e o login só no checkout, com
três caminhos — entrar, **reivindicar** o cadastro que o petshop já tem (por
código no WhatsApp, casando por telefone dentro do `petshop_id`), ou criar
conta.

O caminho do meio continua sendo o que evita a carteira duplicada.

**Estimativa: 6–8 h.**

### A.5 Cadastro público, e o pet que ainda não foi aceito

O cadastro dá acesso a **comprar** e a **pedir** — as duas coisas, na hora.
O que ele não dá é aprovação do pet.

```
tutor se cadastra ──► compra produto            ► liberado na hora
                 ├──► pede banho                ► vira 'solicitado', sem segurar vaga
                 └──► cadastra o pet            ► confirmado_pelo_petshop = false
                                                   ("aguardando confirmação do petshop")
```

Na tela do petshop, o pedido chega com o pet marcado como novo e os dados que
importam para a decisão — porte, raça, idade, observações do tutor — porque é
exatamente isso que ele está avaliando. Aceitar o pedido confirma o pet junto;
recusar pede um motivo, que o tutor recebe.

`tutores.origem` (`equipe` | `autocadastro` | `importacao`) e
`email_verificado_em` entram aqui, e a regra da `0024` sobrevive intacta: o
interruptor `acesso_liberado` continua existindo, só que o site o liga sozinho
para quem se cadastrou e verificou o e-mail.

**Estimativa: 12–16 h.**

### A.6 A caixa de pedidos — o que já existe e o que falta

Boa notícia: `app/(app)/agenda/PedidosSection.tsx` **já é** a caixa de entrada
de pedidos do tutor, com aceitar e recusar, e o próprio arquivo registra que
*"não existe lembrete de WhatsApp avisando o petshop de pedido novo ainda"*.

Com pedido vindo de estranho, essa lacuna deixa de ser aceitável: ninguém vai
ficar com a Agenda aberta esperando. Falta então:

- tipo novo em `lembretes` + template aprovado na Meta para avisar o petshop;
- o pedido mostrar o pet não confirmado e o motivo de recusa;
- o contador de prazo visível ("responde até 18h de amanhã");
- e-mail para o tutor quando o pedido for aceito ou recusado (a `0027` já
  tem a infraestrutura).

**Estimativa: 10–14 h.**

### A.7 Avaliações

Só avalia quem teve `agendamento` em `entregue` ou `venda` em `pago` — nota de
1 a 5 e comentário, ligados ao registro que os autoriza. Tabela nova
`avaliacoes`, RLS por `petshop_id`, leitura pública das publicadas.

A decisão que precisa estar escrita antes de a primeira nota 2 aparecer: **o
petshop não apaga avaliação**. Ele responde publicamente, e denuncia à
plataforma o que for abuso — a remoção é do admin, com motivo registrado. Um
mural onde o dono apaga o que não gostou não convence ninguém, e a média vira
enfeite. Vale confirmar essa regra com você antes de eu construir.

**Estimativa: 10–14 h.**

### O que ficou de fora, de propósito

**Pixel do Meta e tag do Google não entraram** na sua seleção. Registro aqui
para não sumir: sem eles o petshop anuncia sem saber o que converteu, e o
Meta não consegue otimizar a entrega do anúncio — a campanha fica mais cara
pelo mesmo resultado. São umas 6–8 h (campo de ID por petshop nas
configurações, mais os eventos de visualização, carrinho e pedido). Dá para
entrar depois sem refazer nada, mas o ideal é estar no ar **antes** do
primeiro real gasto em anúncio.

**Frente A: 68–94 h.**

## 3. Frente B — Pagamento com split e cartão sem espera

### B.1 O que a pesquisa de hoje mudou

O quadro do plano do Mercado Pago (30/ago) estava incompleto num ponto que
agora é o requisito principal: **prazo do cartão**.

| | Asaas | Mercado Pago | Pagar.me (Stone) |
|---|---|---|---|
| **Onboarding do petshop** | Subconta criada **via API** | Conta MP própria + OAuth | **Recebedor criado via API** — o lojista não precisa de conta Pagar.me, só conta bancária no nome dele |
| **Cartão à vista — prazo padrão** | **D+32 corridos** | Na hora / 14 / 30 dias, conforme a taxa escolhida | ~D+30, mas com **antecipação automática por recebedor** (modelo "D+X" ou por volume) |
| **Custo para receber rápido** | Antecipação sob demanda, a partir de 1,25%/mês | Embutido na taxa (quanto mais rápido, maior) | Taxa de antecipação (negociada) |
| **Split + antecipação juntos** | ⚠️ a doc diz que cobrança usada como garantia em operação de crédito **não executa split** | ok | é o caso de uso anunciado (marketplace) |
| **Cartão à vista — taxa** | 2,99% + R$ 0,49 (1,99% nos 3 primeiros meses) | 3,98% a 4,98% conforme o prazo | negociada |
| **Pix** | **R$ 1,99 fixo** (0,99 promocional) | 0,99% via API / 0,49% via QR Code | negociada |
| **Pendência conhecida** | antecipação vs. split | `application_fee` funciona com Pix? (**não respondido em lugar nenhum**) | exige negociação comercial (já anotado no histórico do projeto) |

Três leituras que valem mais que a tabela:

1. **O problema do cartão não se resolve escolhendo gateway — se resolve
   pagando antecipação.** Ninguém entrega cartão de crédito rápido de graça:
   ou a taxa já embute (Mercado Pago "na hora", 4,98%), ou você paga
   antecipação (Asaas 1,25%/mês, Pagar.me negociada). A pergunta certa não é
   "qual não demora", é **"qual custa menos para não demorar, com split
   funcionando junto"**.
2. **A ressalva do Asaas é a mais séria.** "Cobrança usada como garantia em
   operação de crédito não executa split" é, lida ao pé da letra,
   antecipação e split se excluindo — e isso derruba o Asaas para este caso de
   uso, não por preço, mas por incompatibilidade. **Precisa ser confirmado
   por escrito com eles**, é a pergunta nº 1 da fatia 0.
3. **O parcelado é onde dói de verdade.** No Asaas cada parcela liquida D+32
   *da anterior* — uma venda em 6x termina de cair mais de seis meses depois.
   Se a loja vai vender ração e banho parcelado, isso é inviável sem
   antecipação automática.

### B.2 Fatia 0 — o teste comparativo (antes de qualquer código)

Escopo: os três, em paralelo, com valor mínimo real. Custa poucos reais e
alguns dias de espera de terceiros.

| # | Passo | Vale para |
|---|---|---|
| 0 | Conferir na **sua** conta as taxas reais (a tabela pública não é a sua tabela — lição do Asaas em ago/2026) | os 3 |
| 1 | Perguntar **por escrito**: "antecipação automática e split funcionam na mesma cobrança?" | **Asaas (crítico)** |
| 2 | Perguntar: "`application_fee` funciona com Pix no split 1:1?" + as 6 perguntas já escritas em `docs/fatia0-mercadopago.md` §7 | Mercado Pago |
| 3 | Abrir conversa comercial e pedir proposta de taxa + antecipação para marketplace de pequeno GMV | Pagar.me |
| 4 | Criar recebedor/subconta de teste **por API** e medir o atrito real do onboarding | Asaas, Pagar.me |
| 5 | Cobrança de R$ 1,00 com split, paga de verdade, e conferir onde o dinheiro caiu e **quando** | os 3 |
| 6 | Repetir o passo 5 **no cartão**, com antecipação ligada, e cronometrar a liquidação | os 3 |

O passo 6 é o que nenhum dos documentos anteriores chegou a fazer e é o único
que responde a pergunta do Eduardo. `scripts/teste-fatia0-mercadopago.mjs`
já existe e vira o molde dos outros dois.

**Estimativa: 12–16 h suas**, mais tempo de resposta de terceiros — que não é
seu. Começa **agora**, em paralelo com a Frente A e a Frente C.

### B.3 Camada de abstração — a decisão que protege as 60 h seguintes

Com três candidatos vivos, escrever contra um gateway específico de novo
seria repetir o erro da Fase 6. O desenho:

```
supabase/functions/_shared/gateway/
    index.ts        ← interface + factory lendo GATEWAY_PROVIDER
    tipos.ts        ← vocabulário interno (já existe em SQL: eventos_gateway)
    asaas.ts        ← o que já está escrito, adaptado à interface
    mercadopago.ts
    pagarme.ts
```

Interface mínima: `criarRecebedor`, `criarCobrancaPix`, `criarCobrancaCartao`,
`tokenizarCartao`, `consultarCobranca`, `classificarEventoWebhook`,
`validarAssinaturaWebhook`. O schema **já é agnóstico** (`gateway_payment_id`,
`gateway_wallet_id`, `eventos_gateway`) — esse trabalho foi feito e continua
valendo inteiro.

**Estimativa: 8–12 h** (reescreve `_shared/asaas.ts` como primeira
implementação da interface).

### B.4 Composição de preço e antecipação — duas contas separadas

Com a correção de 19/set, o desenho tem **duas camadas de custo que não podem
se misturar**:

**Camada 1 — taxa de transação, paga pelo tutor.** Nada muda em relação ao
que já está escrito. `calcularComposicaoPreco()` continua válida, o split
continua sendo `fixedValue` = valor cheio do serviço, e o petshop continua
recebendo exatamente o que anunciou. Quem paga para o dinheiro se mover é
quem está movendo dinheiro: o pagador.

> Consequência prática na loja: o preço de vitrine é o preço do serviço, e a
> taxa aparece no carrinho como linha própria, no momento em que o tutor
> escolhe o meio de pagamento. Pix com taxa fixa de R$ 1,99 num produto de
> R$ 30 é 6,6% — vale mostrar os dois meios lado a lado e deixar o tutor
> escolher, em vez de embutir e parecer que o produto é mais caro.

**Camada 2 — antecipação, paga por quem antecipa.** Esta é a que impõe um
requisito novo de arquitetura, e ele é mais exigente do que parece.

O modelo natural dos gateways é antecipar **a cobrança**, e o Asaas documenta
que, nesse caso, *o split passa a ser calculado sobre o líquido após a
antecipação*. Ou seja: a plataforma antecipa, e o custo escorre para a fatia
do petshop — exatamente o que a decisão de hoje proíbe. E vale nos dois
sentidos: o petshop antecipando também não pode encarecer a comissão da
plataforma.

A única forma de o custo ficar com quem pediu é antecipar **por conta, depois
do split**, não por cobrança antes dele:

```
cobrança paga
     │
     ├─ split executa no prazo normal ──► saldo da subconta do petshop
     │                                         │
     │                                         └─ antecipação da SUBCONTA
     │                                            (petshop pede, petshop paga)
     └────────────────────────────────────► saldo da plataforma
                                               │
                                               └─ antecipação da PLATAFORMA
                                                  (só afeta a fatia dela)
```

Isso transforma a pergunta 3 do questionário do Asaas — *"uma subconta criada
via API pode ter antecipação automática própria?"* — na **pergunta que decide
o gateway**, no lugar que a pergunta do `application_fee` ocupava no plano do
Mercado Pago. Se a resposta for não, restam três saídas, nesta ordem de
preferência:

1. **Antecipação por conta existe, mas só manual/no painel** — aceitável: o
   petshop antecipa quando quiser, pela conta dele, e o PetClub só explica
   como. Zero código.
2. **Só dá para antecipar a cobrança inteira** — então a antecipação vira
   um acordo explícito ("adiantamento do petshop custa X%, descontado do
   repasse dele"), e o valor precisa ser recalculado e registrado por
   cobrança, para o petshop ver de onde saiu. Trabalho real, e uma linha a
   mais no Financeiro.
3. **Não dá** — cartão fica em D+32 e a loja vende com Pix como meio
   destacado, cartão como conveniência com prazo avisado.

**Estimativa: 6–8 h** para o registro das deduções por cobrança, mais
`4–6 h` da tela do Financeiro mostrando bruto, cada dedução com nome e
líquido. A camada 1 não custa nada — já está escrita.

### B.5 Onboarding do recebedor e o resto

- Tela em `/admin/petshops`: conectar/criar recebedor, estado da conexão,
  dados bancários, configuração de antecipação. Forma exata depende do
  gateway (API no Asaas/Pagar.me, OAuth no MP) — **por isso vem depois da
  fatia 0**. `12–16 h`.
- Checkout da loja: Pix com QR na mesma tela + cartão tokenizado.
  `12–16 h`.
- Webhook, conciliação e o ciclo de vida da reserva quando o pagamento é
  online (hoje reserva expira sozinha; pagamento pago fora do prazo é um
  caso novo). `8–12 h`.
- Teste ponta a ponta em produção com valor mínimo, incluindo estorno.
  `8 h` — inegociável, e a política de estorno precisa estar escrita antes
  (ver `docs/fatia0-mercadopago.md` §5: em split 1:1 o estorno pode sobrar
  para a plataforma).

**Frente B: 58–78 h**, começando por 12–16 h que **não dependem de código**.

---

## 4. Frente C — Importação por planilha

O objetivo declarado é comercial, não técnico: **encurtar o tempo entre "eu
topo testar" e "meu petshop está dentro"**. Um petshop com 400 clientes não
digita 400 cadastros, e é exatamente aí que a venda morre.

### C.1 Desenho

Uma tabela de lote e uma de linha — o mesmo espírito de `eventos_gateway` e
`lembretes`: o que entrou fica registrado e auditável.

```sql
create table importacoes (
    id           uuid primary key default gen_random_uuid(),
    petshop_id   uuid not null references petshops(id) on delete cascade,
    entidade     text not null check (entidade in
                   ('tutores_pets','servicos','produtos','assinaturas','agendamentos')),
    arquivo_nome text not null,
    status       text not null default 'analisando'
                   check (status in ('analisando','pronta','aplicando','aplicada','falhou','desfeita')),
    total_linhas integer not null default 0,
    linhas_ok    integer not null default 0,
    linhas_erro  integer not null default 0,
    criado_por   uuid references usuarios_petshop(id),
    criado_em    timestamptz not null default now(),
    aplicada_em  timestamptz
);

create table importacao_linhas (
    id             uuid primary key default gen_random_uuid(),
    importacao_id  uuid not null references importacoes(id) on delete cascade,
    numero_linha   integer not null,
    dados_brutos   jsonb not null,
    dados_normalizados jsonb,
    situacao       text not null check (situacao in ('nova','duplicada','erro','aplicada','ignorada')),
    erro           text,
    registro_id    uuid            -- o que foi criado, para permitir desfazer
);
```

O `registro_id` é o que torna **"desfazer o lote"** possível — e desfazer é o
que faz o petshop topar apertar o botão. Sem isso, a primeira importação
errada vira suporte manual no banco.

### C.2 Fluxo, em três passos sempre iguais

1. **Baixar o modelo** (.xlsx com as colunas certas, exemplos preenchidos e
   aba de instruções) ou subir o export da ferramenta antiga.
2. **Conferência (dry-run)** — tela mostrando: o que vai ser criado, o que
   parece duplicado, o que está errado e por quê. **Nada é gravado aqui.**
3. **Aplicar** — em transação por lote, com relatório final e botão de
   desfazer enquanto ninguém tiver mexido nos registros criados.

Mapeamento de colunas na tela (a planilha do concorrente chama "Nome do
Tutor", "Cliente", "Responsável"...) com palpite automático por similaridade
— sem isso, o petshop precisa reformatar a planilha antes, e aí a fricção
voltou.

### C.3 Regras por entidade

| Entidade | Chave de deduplicação | Cuidados |
|---|---|---|
| **Tutores + pets** | `telefone` normalizado dentro do petshop | Uma linha por pet, tutor repetido nas linhas (é o formato que as ferramentas exportam). Porte por nome ("Pequeno") mapeado para `portes.id`; raça livre. Tutor sem telefone válido é erro, não cadastro pela metade |
| **Serviços + preços** | `nome_customizado` | Preço por porte em colunas (`preco_pequeno`, `preco_medio`...); categoria mapeada para `categorias_servico` com fallback pedido na tela |
| **Produtos** | `nome` | `preco_venda` obrigatório; `custo` e `estoque_atual` opcionais. Estoque inicial entra como `movimentos_estoque` tipo `entrada`, não como `update` direto — senão o inventário nasce sem rastro |
| **Assinaturas** | tutor + pet + plano | Exige o plano já existir (importar catálogo **antes**). `competencia_paga` e `banhos_restantes_mes` importados com cuidado: errar aqui cobra o cliente duas vezes |
| **Agendamentos futuros** | tutor + pet + data/hora | Só datas ≥ hoje. Colisão de horário vira aviso, não bloqueio (o petshop sabe se atende dois ao mesmo tempo). **Não dispara lembrete retroativo** — o import entra com os gatilhos de mensagem suprimidos, senão o primeiro efeito da migração é uma enxurrada de WhatsApp |

Essa última linha é a armadilha menos óbvia e a mais cara: importar 300
agendamentos com os triggers da `0005` ligados manda 300 mensagens.

### C.4 Biblioteca

O projeto hoje não tem nenhuma dependência de planilha. Duas opções:

- **CSV apenas** (`papaparse`, ~45 kB): mínimo, e toda ferramenta exporta CSV.
- **XLSX** (`exceljs`, mantido no npm): o petshop manda o arquivo do jeito que
  tem, sem "salve como CSV". O SheetJS/`xlsx` do npm está desatualizado — o
  próprio fornecedor recomenda instalar do CDN dele, o que não combina com
  build na Vercel.

**Recomendação:** `exceljs` para ler `.xlsx` e gerar os modelos, `papaparse`
para CSV. O parsing roda em Server Action, nunca no navegador (arquivo com
dado de 400 clientes não deve trafegar para lugar nenhum além do servidor).

### C.5 Fatias

| Fatia | Conteúdo | Estimativa |
|---|---|---|
| C1 | Migration `0032`, upload, parser, dry-run, tela genérica de conferência | 12–16 h |
| C2 | Tutores + pets (a mais complexa e a que desbloqueia a venda) | 10–14 h |
| C3 | Serviços/preços e produtos | 8–10 h |
| C4 | Assinaturas e agendamentos futuros, com supressão de gatilhos | 10–14 h |
| C5 | Relatório de erros, reprocessar só as linhas com erro, desfazer lote | 6–8 h |

**Frente C: 46–62 h.**

---

## 5. Ordem recomendada

```
AGORA, em paralelo e sem código:
  B.2  fatia 0 dos três gateways  ──────────────►  (depende de terceiros:
                                                    comece hoje, responde em
                                                    dias ou semanas)

Trilha de código, nesta ordem:
  A1           nameservers + wildcard            ~8 h   ► faça já: mexer em
                                                            DNS custa menos
                                                            agora que depois
  C1 → C2      importação de tutores e pets      ~26 h   ► destrava a venda
  A2 → A3      site do petshop no ar             ~30 h   ► com reserva e
                                                            pagamento na retirada
  A4 → A5 → A6 conta, pedido e aprovação         ~32 h   ► o fluxo completo
                                                            do cliente novo
  C3 → C4 → C5 resto da importação               ~28 h
  A7           avaliações                        ~12 h
  B.3 → B.5    gateway, já com a resposta da
               fatia 0 na mão                    ~50 h
```

**Por que a importação ainda vem antes do site:** ela é a única das três que
remove um obstáculo *de venda* — sem ela, nenhum petshop novo entra, e um site
bonito de um petshop que não conseguiu migrar não serve para nada. O site sem
pagamento online já é útil no dia seguinte (reserva + pagar na retirada, que é
o que a `0026` faz hoje), e o gateway é a frente que mais depende de respostas
que não estão com você.

**A exceção é a A1.** Migrar nameservers é a única tarefa cujo custo *cresce*
com o tempo: hoje ninguém depende desse e-mail; daqui a três meses, com
parceiros recebendo mensagem por ele, a mesma migração vira janela de
manutenção.

**Total: 172–234 h**, das quais 12–16 h não são código. O salto veio da
Frente A: vitrine virou site.

---

## 6. Riscos e pontas soltas

1. **O Asaas pode estar fora por incompatibilidade, não por preço.** Se
   antecipação e split realmente se excluem, todo o código da `0006` vira
   referência histórica. Pergunta nº 1 da fatia 0.
2. **Pagar.me exige conversa comercial** — já registrado como risco de prazo
   no histórico do projeto. Abrir essa conversa hoje, não quando for a hora.
3. **Autocadastro é a primeira porta pública de escrita do produto.** Vale um
   segundo checklist de segurança nos moldes do de 07/set antes de publicar —
   `anon` lendo catálogo e criando conta é superfície nova.
4. **Preço na loja passa a ser compromisso público.** Hoje preço vive em
   `precos_servico`/`produtos.preco_venda` e muda sem cerimônia; anunciado na
   vitrine, mudar preço com carrinho aberto vira reclamação. Recalcular
   sempre no servidor resolve o técnico, mas há uma decisão de produto aí.
5. **Nota fiscal volta à mesa junto com a loja.** Vender online para o público
   aumenta a expectativa de nota — `claude/plano-financeiro-nf-carrinho.md`
   §B continua de pé e ganha urgência com esta frente.
6. **Avaliação pública é irreversível.** Depois que o primeiro cliente
   escreve, a regra de quem pode apagar precisa já estar valendo — mudar
   depois é sempre em favor de alguém, e parece isso.
7. **Site do petshop é conteúdo, e conteúdo dá manutenção.** Foto errada,
   preço desatualizado e horário de feriado viram problema *do PetClub* no
   momento em que o site leva a sua marca no rodapé. Vale decidir desde já o
   que é responsabilidade de quem.
8. **A migração Postgres fica pausada, não cancelada.** Nada neste plano a
   contradiz: tudo aqui é schema e aplicação, e o desenho de repositório
   tipado daquele plano continua valendo quando for a hora.

---

## Fontes consultadas (19–20/set/2026)

- [Asaas — Preços e taxas](https://www.asaas.com/precos-e-taxas)
- [Asaas — Cobrança por cartão de crédito (prazo D+32, antecipação)](https://www.asaas.com/cobranca-cartao)
- [Asaas — Documentação do split de pagamentos](https://docs.asaas.com/docs/split-de-pagamentos)
- [Pagar.me — Como funciona o split de pagamentos](https://pagarme.helpjuice.com/pt_BR/p1-funcionalidades/marketplace-como-funciona-o-split-de-pagamentos)
- [Pagar.me — Criação e edição de recebedores (antecipação automática D+X)](https://pagarme.helpjuice.com/pt_BR/p2-manual-da-dashboard/dashboard-cria%C3%A7%C3%A3o-e-edi%C3%A7%C3%A3o-de-recebedores)
- [Pagar.me — Guia rápido sobre antecipações](https://docs.pagar.me/page/guia-r%C3%A1pido-sobre-antecipa%C3%A7%C3%B5es)
- Documentos internos: `docs/fatia0-mercadopago.md`, `docs/plano-troca-gateway-mercadopago.md`, `docs/fase6_pagamentos.md`, `claude/plano-financeiro-nf-carrinho.md`

---

## Execução — C1 + C2 (21/set/2026, branch `importacao/c1-c2`)

Decisões confirmadas com o Eduardo antes do código:

1. **Migration `0032_importacao_planilha.sql`**, como no plano — a `0031` fica
   para a A.2 (e o número já é usado em `migracao-postgres/`).
2. **`tutores.telefone_normalizado`** (coluna gerada por `normalizar_telefone()`)
   com **índice único por petshop**. Vale para todo cadastro, não só para a
   importação: o painel, o admin e o formulário público passam a recusar
   telefone repetido com mensagem própria (`lib/supabase/erros.ts`).
3. **Tutor que já existe é reaproveitado, nunca alterado.** O pet novo é ligado
   a ele; os dados de tutor da linha são ignorados. Por isso o desfazer (C5)
   só precisa apagar o que está em `importacao_registros`.
4. **Produção atrasada**: aplicar 0013, 0020 e 0030 antes da 0032.

O que mudou em relação ao rascunho da §C.1: `importacao_linhas.registro_id`
virou a tabela `importacao_registros` (uma linha cria tutor **e** pet), as
linhas ganharam `petshop_id` (policy sem subquery) e `avisos text[]`, e o lote
ganhou `mapeamento jsonb`. O aplicar é a função SQL
`aplicar_importacao_tutores_pets()` — security invoker, uma transação, trava
contra clique duplo, revalida duplicados.

Validado num Postgres 16 limpo com as 31 migrations: isolamento entre
petshops, segundo aplicar recusado, `anon` sem execute, e a conferência em
TypeScript e o aplicar em SQL chegando exatamente ao mesmo resultado num CSV
Windows-1252 com 14 casos (repetidos, sem telefone, porte inválido, pet já
cadastrado…).

Fica para a C5: apagar `dados_brutos` depois de N dias (LGPD — são dados
pessoais guardados só para a conferência).
