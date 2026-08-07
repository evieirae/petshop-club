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

## 3. Cobrança e repasse (split de pagamento)

| Variável | Coluna (`petshops`) | Tipo | Padrão | O que controla |
|---|---|---|---|---|
| Fee fixo mensal | `fee_fixo_mensal` | numeric | R$ 99,00 | Mensalidade da plataforma cobrada do petshop (`mensalidades_petshop`), independente do nº de visitas. |
| Percentual da plataforma | `percentual_plataforma` | numeric | 0,03 (3%) | Corte sobre cada cobrança de tosa que passa pela plataforma. |
| Isento até | `isento_fee_ate` | date | *nulo* | Data até a qual o fee fixo sai zerado — usado pro período de teste do piloto. |
| Falta consome visita paga | `falta_consome_visita_paga` | boolean | **true** | Ver seção 5 — política de negócio, não só um valor. |

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

## 7. Checklist de onboarding de um petshop novo

Na prática, colocar um petshop parceiro novo no ar é preencher esta lista:

1. Cadastrar a linha em `petshops` (nome, CNPJ, telefone, endereço).
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
