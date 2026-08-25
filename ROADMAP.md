# Roadmap — PetClub

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

## Fase 5 — Lembretes automáticos via WhatsApp (Meta Cloud API)

- [x] Checkpoints diários em SQL + `pg_cron` rodando nos horários
      configurados por petshop (`horario_envio_lembrete`, cortes de
      confirmação manhã/tarde) —
      `supabase/migrations/0005_fase5_lembretes_whatsapp.sql`.
- [x] Envio pela **WhatsApp Cloud API da Meta** —
      `supabase/functions/enviar-lembretes` + `_shared/meta-whatsapp.ts`.
- [x] Webhook de status e de mensagens recebidas —
      `supabase/functions/whatsapp-webhook`.
- [ ] Templates aprovados no WhatsApp Manager (`docs/whatsapp_templates_meta.md`)
      e teste ponta a ponta com número real.

A tabela `lembretes` e os triggers já geravam os registros pendentes (D-1,
pet pronto, escalonamento, cadastro) — esta fase implementou os 3
checkpoints que só existiam como comentário-espec em `0001_init.sql` e o
envio de fato.

**Escolha do provedor**: a primeira versão desta fase foi escrita contra um
provedor-intermediário (Twilio), no modo sandbox — simples de começar, mas
com duas limitações que só apareceriam na Fase 7: cada mensagem paga a
margem do intermediário além da tarifa da Meta, e o sandbox aceita texto
livre, escondendo a regra de template que existe em produção. Refatorado
pra Meta direto. O que a troca mudou de verdade:

1. **Template obrigatório.** Toda mensagem nossa é business-initiated, então
   só sai como template aprovado. Texto livre virou caminho de exceção, e a
   fila `lembretes` ganhou `template_nome` pra registrar qual template
   gerou cada envio.
2. **Janela de 24h virou estado no banco.** Texto livre só vale nas 24h
   seguintes a uma mensagem do cliente — informação que só chega por
   webhook. Daí a tabela `janelas_whatsapp` e
   `janela_whatsapp_aberta()`.
3. **Webhook deixou de ser opcional.** O POST de envio responder 2xx só quer
   dizer "a Meta aceitou"; entrega/leitura/falha chegam depois, assíncronas.
   Por isso os status novos `entregue`/`lido` e as colunas
   `entregue_em`/`lido_em`.
4. **Confirmação por resposta.** Com o webhook lendo mensagens recebidas,
   responder "sim" na conversa passou a confirmar a visita — a regra vive em
   `confirmar_agendamento_por_whatsapp()`, em SQL, pra não virar uma
   terceira cópia do que já existe na rota pública `/confirmar` e na tela de
   Agenda.

### Checklist operacional

Nada disso é schema, então nada disso está em migration:

1. **Conta na Meta**: app no [Meta for Developers](https://developers.facebook.com)
   com o produto WhatsApp adicionado, número cadastrado e verificado no
   WhatsApp Manager. Anote o **Phone Number ID** (não é o telefone).
   **Status (16/ago/2026):** app "PetClub" criado — **App ID
   `4526442457640626`** (um duplicado com outro App ID chegou a existir e
   já foi removido; esse é o único válido daqui pra frente). Caso de uso
   "Connect with customers through WhatsApp" selecionado. Parado no passo
   seguinte — conectar um Business Portfolio, que exige nome legal do
   negócio, endereço e telefone (dados só o Eduardo pode fornecer). Retomar
   em developers.facebook.com/apps/4526442457640626.
2. **Token permanente**: criar System User no Business Manager com a
   permissão `whatsapp_business_messaging` e gerar token sem expiração. O
   token que aparece no painel de teste expira em 24h — serve pro primeiro
   `curl`, não pro cron.
3. **Templates**: submeter os 4 de `docs/whatsapp_templates_meta.md` e
   esperar aprovar. Antes disso todo envio falha.
4. **Secrets das functions**:
   ```
   supabase secrets set \
     META_PHONE_NUMBER_ID=... META_ACCESS_TOKEN=... META_APP_SECRET=... \
     META_WEBHOOK_VERIFY_TOKEN=... META_GRAPH_VERSION=v21.0 \
     APP_BASE_URL=https://seu-dominio CRON_SECRET=<valor-aleatorio>
   ```
5. **Deploy**: `supabase functions deploy enviar-lembretes` e
   `supabase functions deploy whatsapp-webhook`.
6. **Webhook na Meta**: no app > WhatsApp > Configuração, cadastrar
   `https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook` com o
   mesmo `META_WEBHOOK_VERIFY_TOKEN`, e assinar os campos `messages` e
   `message_status`.
7. **Segredo do cron no Postgres** (uma vez, fora de migration):
   `alter database postgres set app.cron_secret = '<mesmo-valor>';`
8. **URL do job**: trocar `<PROJECT_REF>` no `cron.schedule` de
   `lembretes-enviar` pela referência real do projeto (`cron.schedule` faz
   upsert pelo nome do job — dá pra re-rodar só esse trecho).
9. **Teste ponta a ponta**: marcar uma visita pra amanhã, adiantar
   `horario_envio_lembrete`, esperar o job e conferir
   `select status, template_nome, erro_envio, entregue_em from lembretes`.

### Limites conhecidos

- **Rate limit**: nenhum. O lote de 50 por rodada é suficiente pro volume de
  teste, mas a Meta tem throughput por número e limite diário atrelado à
  qualidade da conta — recalibrar na Fase 7.
- **Retry**: um lembrete que falha fica `status='falhou'` e ninguém tenta de
  novo. Consciente: retry automático sem backoff contra um número inválido
  só queima reputação do número na Meta. Falha hoje é sinal pra alguém olhar.
- **Fuso**: fixo em `America/Sao_Paulo`, sem coluna de timezone em
  `petshops`.
- **Multi-petshop**: um único número/Phone Number ID pra plataforma inteira.
  Petshop com número próprio precisaria de credencial por petshop — cabe na
  Fase 7 se algum parceiro exigir.

## Fase 6 — Cobrança com gateway de pagamento real

**Plano detalhado em `docs/fase6_pagamentos.md`** (escrito antes de
qualquer código, no espírito da Fase 5). Decisões já tomadas: meios da v1
são cartão recorrente tokenizado + Pix por cobrança (Pix Automático e
boleto ficam pra depois); portal do tutor entra com escopo "agendar +
pagar"; gateway recomendado é o Asaas — decisão final depende da fatia 0
(abrir conta, pedir habilitação de tokenização, confirmar taxas).

- [ ] Fatia 0 — conta no gateway (**feito**, aprovada 16/ago), taxas reais
      confirmadas (`docs/fase6_pagamentos.md`, seção 1b). Falta: verificar
      e-mail da conta Sandbox (travado — só o Eduardo recebe o link),
      gerar chave de API do sandbox, e pedir habilitação de tokenização em
      produção. Abrir a conta em si não dava pra automatizar (CPF/CNPJ e
      senha) — foi o Eduardo quem fez.
- [x] (rascunho, não testado) Migration `0006` — status novos, retry,
      `eventos_gateway`, trava de slot. Falta subconta do petshop (split)
      via `/admin` — essa tela não foi tocada ainda.
- [x] (rascunho, não testado) Decisão de 16/ago/2026: taxa de serviço
      somada ao tutor, não descontada do petshop (`docs/fase6_pagamentos.md`,
      seção 1c). Petshop recebe sempre `fixedValue` = valor cheio do
      serviço; tutor paga serviço + taxa (corte da plataforma + taxa do
      gateway). Implementado em: migration `0006` (colunas
      `valor_taxa_gateway`/`valor_cobrado_tutor`, trigger
      `trg_agendamento_processar_cobranca`), `_shared/asaas.ts` (split por
      `fixedValue`), `processar-cobrancas/index.ts`
      (`calcularComposicaoPreco`), portal do tutor (`agendar/[tutorId]/`,
      mesma fórmula duplicada no client) e tela `/financeiro`.
- [ ] Tokenização de cartão (página pública, PCI SAQ-A) →
      `metodos_pagamento` real. Não iniciado.
- [x] (rascunho, não testado) Cobrança recorrente automática: cron
      `processar-cobrancas` + `gateway-webhook` + `eventos_gateway`.
- [x] (rascunho, não testado) Pix por cobrança + mensagem automática.
      `cobranca_pix` tem gerador completo desde 17/ago/2026 —
      `processar-cobrancas` grava o lembrete (migration 0007,
      `lembretes.dados_extra`) e `_shared/templates.ts` monta a mensagem.
      Falta só o template ser submetido/aprovado na Meta (bloqueado no
      número/Business Portfolio, ver checklist da Fase 5). `aviso_cobranca`
      e `cadastro_cartao` continuam sem gerador (checkpoint D-1 de cobrança
      e tokenização de cartão, respectivamente).
- [x] (rascunho, não testado) Portal do tutor: agendar avulsa
      (`app/(public)/agendar/[tutorId]/`). Pagamento ainda NÃO é síncrono
      nessa tela — ver gap #3 em `docs/fase6_pagamentos.md`.
- [x] (rascunho, não testado) Dunning: retries D+1/D+4 e pausa automática
      (`registrar_falha_pagamento`). Lembretes `cobranca_falhou`/
      `cartao_vencendo` continuam sem gerador de verdade.
- [x] (rascunho, não testado) Fee da plataforma via Pix — gap: petshop não
      tem como salvar cartão próprio ainda (ver gap #2 no plano).
- [x] (rascunho, não testado) Tela `/financeiro` (petshop). Visão de
      receita no `/admin` não iniciada.

Três gaps descobertos escrevendo o código, documentados em
`docs/fase6_pagamentos.md` (seção "Status da implementação"): tutor precisa
de CPF pra existir no gateway, petshop não tem coluna pra cartão próprio, e
o pagamento do portal do tutor ainda não é síncrono na mesma tela.

O trigger já calcula o valor proporcional e o split
(`valor_petshop` vs `valor_percentual`) — falta ligar o gateway de verdade.
É o passo mais delicado tecnicamente; tudo testado no sandbox com dados
fake antes de encostar num petshop real.

## Fase 7 — Deploy + piloto com 1 petshop real → beta

- [ ] Vercel ligado ao repo (env vars cadastradas lá também).
- [ ] Projeto Supabase de produção.
- [ ] Uso real com um petshop parceiro (Pedra Branca ou Pagani) por 2–4
      semanas, cobrindo um ciclo mensal inteiro de cobrança.

Esse ciclo completo rodando sem intervenção manual é a definição prática de
**beta** aqui.

## Fase 8 — Administração da plataforma, site institucional e soft-delete

Pedido do Eduardo (20/ago/2026), fora da sequência original de fases — a
plataforma precisava de um dono que não fosse equipe de nenhum petshop
específico antes de conseguir crescer pra mais de um parceiro.

- [x] **Admin da plataforma independente de petshop** — tabela nova
      `admins_plataforma`, sem `petshop_id` nenhum (substitui
      `usuarios_petshop.eh_admin_plataforma` da Fase 1). Login puramente
      admin cai em `/admin` em vez de "Acesso pendente"; quem também é
      equipe de um petshop mantém as duas identidades ao mesmo tempo. Ver
      `supabase/migrations/0017_admin_plataforma_independente.sql`.
- [x] **Área `/admin`** (grupo de rota `app/(admin)`, separado de
      `app/(app)`): KPIs agregados de todos os petshops (`/admin`), taxas +
      status da conta + cadastro de petshop/dono novo (`/admin/petshops`),
      leads do site institucional (`/admin/leads`).
- [x] **Congelamento/encerramento de conta** — `petshops.status`
      (ativo/congelado/encerrado), mesma proteção RLS + trigger das taxas.
      Petshop não-ativo bloqueia o login da equipe dele em
      `app/(app)/layout.tsx`.
- [x] **Site institucional** — `app/page.tsx` vira a Home pública
      (apresentação do produto + formulário de cotação); o painel logado se
      mudou pra `/painel`. Formulário grava em `leads_saas`
      (`supabase/migrations/0018_leads_saas.sql`) sem nunca criar petshop
      sozinho — virar petshop de verdade é sempre manual, em
      `/admin/leads` ("Converter em petshop").
- [x] **Soft-delete de tutores e pets** — `tutores.ativo`/`pets.ativo`
      (`supabase/migrations/0019_tutores_pets_ativo.sql`), substituindo a
      exclusão definitiva de pet (tutor nunca teve exclusão). Mesmo padrão
      de `funcionarios.ativo`/`produtos.ativo`: histórico intacto,
      reativável, escondido dos pickers de agendamento/venda por padrão.

Sem tela de convite por e-mail (não há SMTP configurado no projeto ainda):
o cadastro de dono novo gera uma senha temporária mostrada uma única vez
na tela, pro admin repassar manualmente — mesmo espírito do link de
cadastro de tutor (Fase 3).
