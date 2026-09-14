# Plano — Agenda em Mês/Semana/Dia, visual estilo Google Agenda

> **Revisão de escopo (13/set/2026).** Este documento substitui por completo
> a versão anterior deste arquivo (12/set/2026, "trocar o quadro da Agenda
> pelo Event Calendar do ReUI"). O Eduardo corrigiu o pedido: **não** é pra
> adotar o motor/dependências do ReUI, nem mudar nenhuma interação existente
> — é só deixar o **visual** do quadro parecido com um Google Agenda
> adaptável (Mês/Semana/Dia + responsivo), reaproveitando o ReUI só como
> referência de formato. Zero dependência nova, zero mudança de
> comportamento. A seção 0 detalha exatamente o que muda e o que não muda.
>
> Mockup aprovado (13/set/2026):
> [Agenda estilo Google Agenda](https://claude.ai/code/artifact/54a2f9aa-f10a-4bac-b9dc-75363ff8c957)
> — 2 artboards (desktop com abas Mês/Semana/Dia + mobile com faixa de dias),
> usando os tokens reais do tema Ardósia, incluindo o tratamento de
> agendamentos simultâneos (seção 4 abaixo).

---

## 0. O que muda e o que não muda

**Não muda (usabilidade — igual a hoje, sem exceção):**
- Clicar num agendamento continua alternando `selecionadoId` e abrindo o
  mesmo `AgendamentoCard` com as mesmas ações (confirmar, presente, pronto,
  entregue, faltou, reagendar, cancelar, definir funcionário, encerrar
  série, voltar status).
- "+ novo" numa célula/horário continua abrindo o mesmo `NovaVisitaForm`
  pré-preenchido com aquele dia/horário.
- "+ Agendar visita" continua abrindo o mesmo formulário avulso genérico.
- A lista "Visitas de [dia]", "Confirmações pendentes" e "Sem agendamento
  ainda" continuam existindo, com o mesmo conteúdo e comportamento.
- Nenhuma server action muda de assinatura; nenhuma query perde ou troca
  comportamento — só ganha um modo novo (buscar um intervalo maior, ver
  seção 2).
- Nenhum drag-and-drop, nenhuma criação de evento arrastando, nenhuma
  mudança na forma como recorrência é calculada (continua vindo do trigger
  do banco, não do calendário).

**Muda (só o formato visual do quadro de cima):**
- Em vez de uma tabela HTML com uma linha por horário e uma coluna por dia
  da semana, o quadro passa a ter três formatos alternáveis — Mês, Semana,
  Dia — no estilo Google Agenda, com uma grade contínua por horário (em vez
  de linhas fixas) nas visões Semana/Dia.
- Fica genuinamente responsivo: abaixo de um breakpoint mobile, Semana/Mês
  colapsam numa faixa de dias horizontal + lista do dia selecionado (visão
  Dia já funciona bem em qualquer largura, é só uma coluna).
- Quando há mais de um agendamento no mesmo horário (petshop com mais de
  um tosador/baia), os agendamentos dividem a largura da coluna em vez de
  empilhar sem limite — ver seção 4.

---

## 1. Onde isso entra no código de hoje

Lido direto de `app/(app)/agenda/page.tsx` e `AgendaSection.tsx` (1.200
linhas) em 13/set:

- `page.tsx` já busca `agendamentosSemana` filtrando por
  `data_hora >= inicioSemana AND < inicioSemana+7dias`, a partir de
  `?data=` na URL (sem parâmetro, cai na semana de hoje). Navegar de
  semana é só um `<Link href="/agenda?data=...">` — o Server Component
  refaz a query, sem mecanismo de fetch novo.
- `AgendaSection.tsx` (`"use client"`) recebe os dados já resolvidos e
  monta: (a) o quadro semanal — uma `<table>` com uma `<tr>` por horário
  (`gerarHorariosDisponiveis(expediente)` + horários "extras" fora da
  grade) e uma `<td>` por dia, cada célula com um `flex flex-col` de
  botões (**hoje já suporta múltiplos agendamentos no mesmo horário/dia —
  eles só empilham verticalmente na célula**, sem limite de largura, o que
  é exatamente o que deixa de ser trivial numa grade contínua por horário,
  ver seção 4); (b) a lista "Visitas de {diaSelecionado}"; (c) o
  `AgendamentoCard` com as ações, quando algo está selecionado; (d)
  "Confirmações pendentes" e "Sem agendamento ainda".
- `diaSelecionado` é literalmente o mesmo `?data=` da navegação de semana
  — não existe hoje um clique "vá pro dia X" separado da navegação de
  semana inteira. Isso importa pra decidir como a visão Mês vai se
  comportar (seção 3).

## 2. Decisão de arquitetura: como os três formatos convivem com dados vindos do servidor

O quadro é alimentado por uma query de **uma semana** hoje. Mês precisa de
~5-6 semanas de dados; Dia precisa só de um dia. Duas opções:

- **(Recomendada) Visão também vira parâmetro de URL** (`?data=...&visao=
  mes|semana|dia`, default `semana`), do mesmo jeito que `data` já é hoje.
  `page.tsx` decide o intervalo da query pelo `visao` (dia único / semana /
  o mês do `data`) e passa pro `AgendaSection` só os dados daquele
  intervalo. As abas Mês/Semana/Dia viram `<Link>`, exatamente como
  "Semana anterior"/"Hoje"/"Semana seguinte" já são hoje — mesmo mecanismo
  de navegação, zero paradigma novo de estado.
- (Descartada) Manter a visão como estado só de cliente e buscar sempre o
  mês inteiro de uma vez, fatiando no cliente pra Semana/Dia. Mais simples
  de implementar, mas passa a trafegar ~4x mais linhas em toda visita à
  página, mesmo quando ninguém abre o Mês — desperdício sem necessidade
  numa tela que já é a mais visitada do app.

Simplificação deliberada pra Mês: buscar só os agendamentos **dentro do
mês corrente** (não os dias de fim/início de mês de meses vizinhos que
aparecem esmaecidos na grade) — essas células ficam sempre vazias mesmo
que existam visitas lá. É uma diferença sutil do Google Agenda de verdade;
documentar e decidir se compensa buscar o range completo da grade (mais
uma query pequena, sem grande custo) numa fase posterior se incomodar.

## 3. Cliques nas novas superfícies (o que hoje não existe)

A visão Mês introduz uma superfície de clique que não existe hoje: uma
célula de dia. Pra não inventar uma interação nova, ela reaproveita a
mesma navegação por URL que "Semana anterior" já usa: clicar no número do
dia leva pra `?data=<aquele dia>&visao=dia` (abre a visão Dia focada
naquele dia — é o comportamento do Google Agenda de verdade). Clicar num
evento *dentro* da célula do mês, em vez do dia, segue a regra de sempre:
seleciona (`selecionadoId`) e abre o `AgendamentoCard` abaixo, sem trocar
de visão.

A lista "Visitas de [dia]" e o `AgendamentoCard` continuam abaixo do
quadro em **qualquer** visão escolhida — só o quadro de cima muda de
formato. É o que evita duplicar a lógica de seleção/ação em três lugares.

## 4. Agendamentos simultâneos (petshops com mais de um tosador/baia)

A tabela de hoje empilha sem limite dentro da célula porque cada célula já
é "um horário fixo" — não há problema de largura. Numa grade contínua por
horário (Semana/Dia), dois agendamentos que se sobrepõem em horário
brigariam pelo mesmo espaço se não forem tratados.

Solução validada no mockup (mesma lógica do Google Agenda): agrupar os
agendamentos que se tocam em "clusters" e, dentro de cada cluster,
alocar colunas pela primeira vaga livre (tipo agenda de salas) — a largura
da coluna é `100% / colunas-no-cluster`. Vira uma função pura, sem estado,
testável isoladamente (`lib/agenda/layoutColunas.ts` ou similar) —
candidata natural a ganhar o primeiro teste automatizado do projeto, já
que hoje não existe suíte (não é bloqueante, mas vale registrar).

Onde isso **não** precisa de tratamento nenhum:
- **Mês** — já resume em "+N mais" além dos 2-3 primeiros, então
  sobreposição de horário é invisível nesse nível de zoom.
- **Mobile** (faixa de dias + lista empilhada) — é uma lista, não uma
  grade posicionada por horário; agendamentos concorrentes só aparecem em
  sequência.

## 5. Fases sugeridas

Mesmo espírito das fases anteriores: cada uma vira uma branch
`agenda/<fase>`, só integra depois de QA manual (sem suíte automatizada no
projeto).

### Fase 1 — Visão como parâmetro de URL + busca por intervalo flexível
`page.tsx` passa a ler `?visao=` (default `semana`, mantém 100% do
comportamento atual quando ausente) e monta o intervalo de busca certo
(dia/semana/mês) em vez de sempre semana. Nenhuma tela nova ainda — só a
base de dados chegando certa pros três formatos. **Risco:** baixo, é
aditivo; a query de semana existente não muda quando `visao=semana`.

### Fase 2 — Extrair o quadro atual pra um componente próprio, sem mudar nada
`SemanaQuadro` (nome sugestivo) recebe exatamente os mesmos dados/props
que a tabela inline recebe hoje e renderiza **pixel a pixel igual**. Puro
refactor preparatório — garante que a Fase 3 troca só o miolo visual, sem
misturar risco de regressão com risco de reorganização de código.

### Fase 3 — Novo visual da Semana (grade contínua por horário)
Troca a tabela linha-por-horário por uma grade posicionada por horário
(igual ao mockup), reaproveitando literalmente as mesmas props/handlers:
clicar num chip continua chamando `setSelecionadoId`, "+ novo" continua
abrindo o mesmo formulário no mesmo dia/horário. Usa `tomCores`/
`botao()`/tokens do tema — não os `var(--...)` soltos do mockup (esses
existem só porque o canvas de design não tem acesso ao Tailwind config).

### Fase 4 — Empacotamento de eventos sobrepostos
A função pura da seção 4, aplicada à grade da Fase 3. Testar com o mesmo
cenário do mockup (3 agendamentos entre 11h–12h15) e com um caso real do
banco, se algum petshop piloto já tiver isso.

### Fase 5 — Visão Mês
Grade de 5-6 semanas, células com até 2-3 eventos + "+N mais", clique no
número do dia navega pra `?data=<dia>&visao=dia` (seção 3). Depende da
Fase 1 (dados do mês) e reaproveita `corTom`/badges já usados em Semana.

### Fase 6 — Visão Dia
A mais parecida com o que já existe informalmente (a lista "Visitas de
X"), só que como grade por horário em vez de lista. Decidir na prática se
a lista "Visitas de X" abaixo fica redundante quando `visao=dia` — proposta
inicial: manter sempre visível (é onde as ações ficam), redundância visual
pequena é aceitável frente a não duplicar a lógica de seleção em dois
lugares.

### Fase 7 — Responsivo/adaptável
Abaixo de um breakpoint (ex.: `md:` do Tailwind, ~768px), Semana e Mês
colapsam pro formato faixa-de-dias + lista do dia (mockup mobile) — via
classes responsivas, sem detecção de user-agent. Dia já funciona em
qualquer largura por ser uma coluna só.

### Fase 8 — QA manual
Os fluxos de clique completos (selecionar, confirmar/presente/pronto/
entregue/faltou/reagendar/cancelar/definir funcionário/encerrar série,
"+ novo", "+ Agendar visita", tutor sem agendamento) nas 3 visões, nos 4
temas, em pelo menos 2 tamanhos de tela — mesma régua da Fase H de
identidade visual e da Fase 6 do plano anterior.

## 6. Riscos, em ordem

1. **Fase 4 (empacotamento de sobreposição)** — bug de layout aqui pode
   esconder um agendamento atrás de outro visualmente (não é perda de
   dado, é perda de visibilidade — ainda assim, é o tipo de bug que gera
   "sumiu meu agendamento" no suporte).
2. **Fase 1 (query por intervalo flexível)** — se o range da Mês vier
   errado (off-by-one no fim do mês, fuso), a grade pode mostrar visitas
   no dia errado. Reaproveitar `dataLocalDeString`/`paraDataLocal`
   existentes (mesma disciplina de fuso já documentada em
   `combinarDataHorario`), não inventar cálculo de data novo.
3. **Fase 5/3 (volume de eventos por célula)** — um dia com muitos
   agendamentos na visão Mês precisa do "+N mais" funcionar bem; na Semana/
   Dia, o empacotamento da Fase 4 precisa degradar de forma legível com 4+
   sobrepostos (texto trunca, não quebra o layout — já coberto no mockup
   com `text-overflow: ellipsis`).
4. **Regressão de comportamento** — por ser um refactor visual grande numa
   tela de uso diário, o maior risco geral é uma Fase 3/5/6 mudar sem
   querer algo que a Fase 2 devia ter isolado. A Fase 2 existir como passo
   separado é exatamente a proteção contra isso.

## 7. Fora de escopo agora (registrado, não descartado)

- **Resource view por funcionário/baia** (uma coluna por tosador em vez de
  por sobreposição) — função nova, não só visual; caberia quando/se algum
  piloto tiver equipe grande o suficiente pra sentir falta.
- **Drag-and-drop** (mover/redimensionar arrastando) — muda a forma de
  interação, contra o pedido explícito de não mexer em usabilidade.
- **Motor de recorrência de terceiro** — recorrência continua vindo do
  trigger do banco (`assinaturas.dia_semana_preferencial`), não de uma lib
  de calendário.

## 8. Próximo passo sugerido

Fase 1 isolada — é a única sem nenhum componente visual novo, só decide
como os dados chegam certos pros três formatos. Validar com `visao=mes`
manualmente (query certa, sem quebrar `visao` ausente = comportamento de
hoje) antes de abrir a Fase 2.
