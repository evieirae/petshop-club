# Custos de arquitetura e operação — PetClub em produção

Levantamento feito em 24/ago/2026 sobre o estado real do repositório
(`petshop-club`, Fases 0–8 no `ROADMAP.md`), para responder duas perguntas:
**quanto custa botar o app no ar e rodar com petshops parceiros**, e
**onde dá pra cortar custo aceitando mais trabalho de desenvolvimento**.

Câmbio usado: **US$ 1 = R$ 5,14** · **€ 1 = R$ 6,00** (cotação de 24/ago/2026).
Todo valor em dólar/euro varia com o câmbio — é o maior risco silencioso da
conta, porque 100% da infraestrutura é cobrada em moeda estrangeira e 100% da
receita é em real.

---

## 1. Resumo executivo

| | |
|---|---|
| Custo fixo de plataforma (independe de quantos petshops) | **R$ 235/mês** |
| Custo variável por petshop parceiro | **R$ 62/mês** (hoje) → **R$ 37/mês** (otimizado) |
| Custo único de onboarding por petshop | **R$ 12,90** (subconta Asaas) |
| Receita de fee fixo por petshop | R$ 99/mês (padrão de lançamento) |
| Break-even só com o fee fixo | **6,3 petshops** → **3,8** com as otimizações de mensagem |

**A conclusão que muda decisão:** o custo fixo da plataforma é irrelevante
(R$ 235/mês = 2,4 petshops). O que realmente pesa é o **WhatsApp**, que hoje
consome **62% do fee fixo de cada petshop** e cresce linearmente com o número
de parceiros. Otimizar infra (trocar Vercel, self-hostar Supabase) economiza
um valor fixo que fica cada vez menos relevante; otimizar mensagens economiza
um valor que multiplica por cada petshop novo.

Ordem de prioridade que sai disso:

1. **Cortar mensagens WhatsApp** — economia de ~R$ 25/petshop/mês, esforço
   baixo, e o código pra isso (`janelas_whatsapp`, `janela_whatsapp_aberta()`)
   **já existe** no repo.
2. **Fechar os gaps de produção que hoje custam R$ 0 porque não existem** —
   backup externo, monitoramento, e-mail transacional, staging. Nenhum deles
   é caro; o risco de não ter é que sim.
3. **Só depois** reavaliar hosting (Vercel → Cloudflare Workers ou VPS).
4. **Não** trocar o Supabase agora — ver seção 6.2.

---

## 2. Inventário da arquitetura atual

Levantado direto do repositório, não da memória:

| Camada | O que o app usa | Onde está no repo |
|---|---|---|
| Frontend + SSR | **Next.js 14** (App Router, Server Components, Server Actions) | `app/`, `components/` |
| Estilo | Tailwind 3 + design system próprio | `tailwind.config.ts`, `lib/design/tokens.ts` |
| Banco | **Postgres (Supabase)** — 29 tabelas, RLS multi-tenant, 20 migrations | `supabase/migrations/` |
| Autenticação | **Supabase Auth** (`@supabase/ssr`, cookies, middleware) | `lib/supabase/`, `middleware.ts` |
| Regra de negócio | Triggers + funções SQL (ciclo de assinatura, split, lembretes) | `0001_init.sql` … `0020` |
| Agendamento de jobs | **pg_cron** + **pg_net** — 2 jobs (checkpoints 5min, envio 2min) | `0005_fase5…sql` |
| Workers | **Supabase Edge Functions** (Deno) × 5 | `supabase/functions/` |
| Mensageria | **WhatsApp Cloud API (Meta)** — 8 templates UTILITY | `_shared/meta-whatsapp.ts` |
| Pagamento | **Asaas** — split por subconta, Pix, cartão tokenizado | `_shared/asaas.ts` |
| Hospedagem | **Vercel** (previsto na Fase 7, ainda não ligado) | — |
| E-mail transacional | **não existe** (ROADMAP: "sem SMTP configurado") | — |
| Monitoramento / erro | **não existe** | — |
| Backup fora do provedor | **não existe** | — |
| Ambiente de staging | **não existe** (só sandbox do Asaas) | — |

Dependências npm: 6 em produção (`next`, `react`, `react-dom`,
`@supabase/*`, `lucide-react`). Nenhuma biblioteca paga. ~20 mil linhas entre
TS/TSX/SQL. Isso é bom para custo: não há licença de software na conta.

---

## 3. Custos fixos de plataforma

Vale para 1 ou para 100 petshops.

| Item | Plano necessário | US$/mês | R$/mês | Por que esse plano e não o grátis |
|---|---|---|---|---|
| **Vercel** | Pro | 20,00 | **102,80** | O plano Hobby é explicitamente **não-comercial** nos termos da Vercel. Assim que houver petshop pagante, Hobby vira violação de ToS. Pro também libera região `gru1` (São Paulo) e mais de 1 seat. |
| **Supabase** | Pro | 25,00 | **128,50** | O Free **pausa o projeto após 1 semana de inatividade**, tem 500 MB, **nenhum backup** e retenção de log de 1 dia. Nada disso é aceitável com dado de cliente real. O Pro inclui US$10 de crédito de compute (cobre a instância Micro), backup diário com 7 dias e log de 7 dias. |
| **Domínio `.com.br`** | Registro.br | — | **3,33** | R$ 40/ano. |
| **Certificado SSL** | incluso (Vercel) | — | 0,00 | — |
| **WhatsApp Cloud API** | — | 0,00 | 0,00 | A Meta não cobra mensalidade nem pela API; só por mensagem (seção 4). Verificação de negócio é gratuita. |
| **Asaas** | — | 0,00 | 0,00 | Sem mensalidade; API gratuita. Cobra por transação/subconta (seção 4). |
| | | | **R$ 234,63** | |

### 3.1 O que ainda não está na conta porque ainda não existe

Estes são os gaps que aparecem na primeira semana de operação real. Nenhum é
caro — o custo é de **implementação**, não de assinatura:

| Gap | Solução barata | Custo | Esforço |
|---|---|---|---|
| **Backup fora do Supabase** | `pg_dump` diário via Edge Function/GitHub Action → Cloudflare R2 | R$ 0 (R2: 10 GB grátis, egress zero) | 3–5 h |
| **Monitoramento de erro** | Sentry free (5 mil eventos/mês) ou GlitchTip self-hosted | R$ 0 | 2 h |
| **Uptime / alerta de queda** | UptimeRobot ou Better Stack, plano grátis | R$ 0 | 1 h |
| **E-mail transacional** (convite de dono, reset de senha) | Resend free (3 mil/mês) ou Amazon SES (US$0,10/mil) | R$ 0 | 4–6 h |
| **Ambiente de staging** | 2º projeto Supabase (Free) + preview deploy da Vercel | R$ 0 | 2 h |
| **Alerta de fila travada** (`lembretes.status='falhou'`) | query no cron + push pro admin | R$ 0 | 3 h |
| **Chip/linha do número WhatsApp** | número dedicado (pode ser um chip pré-pago) | ~R$ 15/mês | — |
| **Contabilidade / MEI ou ME** | obrigatório pra emitir nota e ter CNPJ no Asaas | R$ 100–250/mês | — |

> A contabilidade não é custo de arquitetura, mas é o maior item recorrente da
> operação real e costuma ficar fora dessas planilhas. MEI (R$ ~76/mês de DAS)
> só serve enquanto o faturamento couber no limite e a atividade for aceita;
> a partir de ~15 petshops isso já deixa de fechar.

### 3.2 Add-ons do Supabase que **não** valem a pena agora

| Add-on | Preço | Veredito |
|---|---|---|
| Point-in-Time Recovery (7 dias) | US$ 100/mês = **R$ 514** | **Não.** É 4× toda a infra fixa. O backup diário do Pro + `pg_dump` pra R2 cobre o cenário realista (erro de migration, delete acidental) com RPO de horas em vez de segundos. Reconsiderar quando a perda de 1 dia de agendamento custar mais que R$ 514. |
| Custom domain (Supabase) | US$ 10/mês | Não. Só embeleza a URL de auth; o domínio do app está na Vercel. |
| Compute Small (US$15) | +US$ 5 líquido | Ainda não. A Micro (incluída no crédito) aguenta o volume dos primeiros cenários — ver seção 5. |
| Advanced MFA | US$ 75/mês | Não. |

---

## 4. Custos variáveis (por petshop, por transação)

### 4.1 WhatsApp — o item que domina a conta

Preço Meta no Brasil, modelo **por mensagem** (vigente desde 1º/jul/2025):

| Categoria | Preço por mensagem entregue | Onde o app usa |
|---|---|---|
| **UTILITY** | ~**R$ 0,04 – 0,05** | Os 8 templates atuais |
| MARKETING | ~R$ 0,31 – 0,38 | `retencao_cliente` (migration 0020, ainda sem template) — **7× mais caro** |
| AUTHENTICATION | ~R$ 0,15 – 0,19 | não usado |
| **Serviço / texto livre dentro da janela de 24 h** | **grátis, sem teto** | `janela_whatsapp_aberta()` já implementado |

Volume estimado de um petshop médio — **100 tutores ativos, 120 pets,
400 visitas/mês**:

| Template | Envios/mês | Custo (R$ 0,045) |
|---|---|---|
| `confirmacao_agendamento` (D-1) | 400 | R$ 18,00 |
| `pet_pronto` | 400 | R$ 18,00 |
| `pet_entregue` | 400 | R$ 18,00 |
| `confirmacao_pendente_petshop` (interno, escalonamento) | 60 | R$ 2,70 |
| `cadastro_tutor` | 10 | R$ 0,45 |
| `cobranca_pix` | 100 | R$ 4,50 |
| **Total** | **1.370** | **R$ 61,65** |

**R$ 61,65 é 62% do fee fixo de R$ 99.** É o número mais importante deste
documento.

Cenário otimizado (seção 7.1) — explorar a janela de 24 h, mover a mensagem
interna pro painel: **830 mensagens → R$ 37,35**.

> ⚠️ **`retencao_cliente` é uma bomba de custo esperando pra ser armada.** É
> MARKETING (~R$ 0,35). Se virar uma campanha mensal para 100 tutores inativos
> por petshop, são R$ 35/mês/petshop **de uma feature só** — mais que o custo
> otimizado de todos os 8 templates transacionais juntos. Precisa de teto de
> disparo por petshop antes de sair do papel.

### 4.2 Asaas

Taxas reais lidas da conta do Eduardo em 16/ago/2026
(`docs/fase6_pagamentos.md`, seção 1b):

| Evento | Custo | Observação |
|---|---|---|
| Pix (QR dinâmico) | **R$ 0** promocional até 16/11/2026 | ⚠️ Tarifa de tabela depois: **R$ 0,49/cobrança**. Com 100 cobranças Pix/mês/petshop, isso vira **R$ 49/mês/petshop** a partir de novembro. Renegociar antes do vencimento é item de calendário, não de backlog. |
| Cartão de crédito | 2,99% + R$ 0,49 (promo 1,99% até 16/11) | Liquida em **D+32**. |
| Subconta nova (petshop) | **R$ 12,90** único | Custo de aquisição, some no CAC. |
| Transferência pra fora do Asaas | R$ 5,00 | Só se o petshop sacar. |
| API | R$ 0 | — |
| Notificação WhatsApp do próprio Asaas | R$ 0,55/msg | **Manter desligado.** É 12× o preço da Meta pela mesma notificação, e o repo já sinaliza o risco de deixar o toggle ligado sem querer. |

### 4.3 Supabase e Vercel na margem

Os dois planos têm folga larga para este produto:

| Recurso | Incluído | Consumo estimado com 50 petshops | Folga |
|---|---|---|---|
| Banco (Supabase Pro) | 8 GB | ~1,5 GB | 5× |
| Egress (Supabase) | 250 GB | ~40 GB | 6× |
| Edge Function invocations | 2 M/mês | ~22 k (cron de 2 min) + webhooks | 90× |
| MAU (Auth) | 100 mil | ~200 (só a equipe dos petshops) | — |
| Fast data transfer (Vercel) | 1 TB | ~30 GB | 30× |

O cron de 2 minutos (`lembretes-enviar`) gera 21.600 invocações/mês — 1% da
franquia. Não é problema de custo, mas **é 21.600 chamadas mesmo quando a fila
está vazia**; ver seção 7.4.

---

## 5. Cenários de escala e unit economics

Premissas: petshop médio = 400 visitas/mês, 100 assinaturas ativas; fee fixo
R$ 99; taxa de serviço de 3% cobrada do tutor por cima (não descontada do
petshop, decisão de 16/ago/2026).

| Cenário | Petshops | Fixo | WhatsApp | **Custo total** | **Custo/petshop** | Receita só de fee | Margem |
|---|---|---|---|---|---|---|---|
| **A — Piloto** | 3 | R$ 235 | R$ 185 | R$ 420 | R$ 140 | R$ 297 | **−R$ 123** |
| A otimizado | 3 | R$ 235 | R$ 112 | R$ 347 | R$ 116 | R$ 297 | −R$ 50 |
| **B — Tração** | 15 | R$ 235 | R$ 925 | R$ 1.159 | R$ 77 | R$ 1.485 | +R$ 326 |
| B otimizado | 15 | R$ 235 | R$ 560 | R$ 795 | R$ 53 | R$ 1.485 | **+R$ 690** |
| **C — Escala** | 50 | R$ 260 | R$ 3.083 | R$ 3.343 | R$ 67 | R$ 4.950 | +R$ 1.607 |
| C otimizado | 50 | R$ 260 | R$ 1.868 | R$ 2.128 | R$ 43 | R$ 4.950 | **+R$ 2.822** |
| **D — 150 petshops** | 150 | R$ 312 | R$ 9.248 | R$ 9.559 | R$ 64 | R$ 14.850 | +R$ 5.291 |
| D otimizado | 150 | R$ 312 | R$ 5.603 | R$ 5.914 | R$ 39 | R$ 14.850 | **+R$ 8.936** |

Leituras:

- **O piloto dá prejuízo, e tudo bem.** R$ 123/mês negativos com 3 petshops é
  o preço de validar — especialmente com `isento_fee_ate` zerando o fee no
  período de teste, o que na prática torna o prejuízo o custo total (R$ 420).
- **O custo por petshop cai pouco com escala** (R$ 140 → R$ 64), porque 97%
  dele é variável. Isso é um SaaS com custo marginal alto, não com custo
  marginal zero — o que reforça que a alavanca é a mensagem, não o servidor.
- **A taxa de 3% não entra na tabela acima de propósito.** Com um GMV médio de
  R$ 20 mil/mês por petshop (400 visitas × R$ 50), 3% = R$ 600/petshop/mês —
  quase 10× o custo. Se essa premissa de GMV se confirmar no piloto, a unit
  economics é confortável e o fee fixo passa a ser quase simbólico. **Medir o
  GMV real do primeiro parceiro é a informação mais valiosa do piloto.**
- **Break-even só com fee fixo:** 6,3 petshops hoje, **3,8** com as
  otimizações de mensagem, **2,6** se o hosting migrar pra Cloudflare Workers.

---

## 6. Análise ferramenta a ferramenta e concorrentes

### 6.1 Hospedagem do Next.js — hoje: Vercel Pro (R$ 103/mês)

| Alternativa | Custo | O que ganha | O que custa em desenvolvimento | Veredito |
|---|---|---|---|---|
| **Vercel Pro** (atual) | R$ 103 | Zero configuração, preview por PR, região gru1, ISR e Server Actions sem adaptação | 0 h | Fica no piloto |
| **Cloudflare Workers + OpenNext** | US$ 5 = R$ 26 | −R$ 77/mês; rede com PoP em SP; sem cobrança por banda | 8–16 h (adaptar `@opennextjs/cloudflare`, testar Server Actions e middleware, refazer CI) | **Melhor troca custo/esforço** — fazer quando o fixo incomodar |
| **VPS (Hetzner CX32 + Coolify)** | € 6,80 = R$ 41 | −R$ 62/mês; controle total; pode hospedar mais coisa no mesmo servidor | 16–24 h + manutenção contínua (SO, TLS, deploy, uptime é seu) | Só junto com a consolidação do item 6.2 |
| **VPS no Brasil** (Magalu/Hostinger BR) | R$ 40–80 | Latência baixa até o Supabase-SP | mesmo esforço do Hetzner | Alternativa se a latência do Hetzner (US/EU) incomodar |
| **Railway / Render** | US$ 5–20 | Meio-termo gerenciado | 4–8 h | Pouca economia pro trabalho |
| **Netlify** | US$ 19 | — | 4 h | Sem vantagem sobre a Vercel |

**Ponto de atenção que não é preço:** a Vercel roda as funções em `iad1`
(Virgínia) por padrão. Com o Supabase em São Paulo, cada Server Component que
consulta o banco atravessa o continente duas vezes. **Configurar a região das
funções para `gru1`** é ganho de latência de graça, e só existe no Pro.

### 6.2 Banco + Auth + Functions — hoje: Supabase Pro (R$ 129/mês)

Aqui o Supabase não é "só um Postgres hospedado". O repo usa, e depende de:
RLS multi-tenant (`auth_petshop_id()`), Supabase Auth com cookies SSR,
Edge Functions em Deno, `pg_cron`, `pg_net`, backup diário e o SQL Editor
como ferramenta de operação.

| Alternativa | Custo | O que ganha | O que custa em desenvolvimento | Veredito |
|---|---|---|---|---|
| **Supabase Pro** (atual) | R$ 129 | Tudo acima gerenciado, região SP, backup | 0 h | **Ficar** |
| **Neon + Auth.js + cron próprio** | US$ 19 = R$ 98 | −R$ 31/mês, branch de banco por PR | 40–60 h (reescrever auth, mover as 5 Edge Functions, recriar cron, RLS na mão) | **Não.** Economia de 0,3 petshop por 50 h de trabalho |
| **Supabase self-hosted em VPS** | R$ 41–80 | −R$ 50 a −R$ 90/mês | 24–40 h + você vira o DBA (backup, upgrade, patch de segurança, PITR) | Só se a consolidação em VPS acontecer por outros motivos |
| **Postgres puro + Prisma/Drizzle** | R$ 41 | Máximo controle | 80–120 h — joga fora quase tudo que já funciona | **Não** |
| **Convex / Firebase** | variável | — | reescrita completa; Firebase nem tem SQL | **Não** |
| **Supabase Free (2º projeto)** | R$ 0 | Staging de graça | 2 h | **Sim, para staging** |

**Por que ficar:** substituir o Supabase custa 40–120 h de desenvolvimento
para economizar R$ 30–90/mês. A R$ 100/h de custo de oportunidade, o payback
é de 4 a 10 anos. E a conta piora: RLS escrita à mão em um sistema
multi-tenant onde a segurança de dados de clientes de terceiros depende dela
é exatamente o lugar errado pra economizar. **Isso muda** se o compute do
Supabase passar de ~US$ 60/mês (cenário de 200+ petshops), quando um VPS
dedicado com o mesmo hardware custa 1/4.

### 6.3 Mensageria — hoje: WhatsApp Cloud API direto na Meta

| Alternativa | Custo por mensagem UTILITY | Veredito |
|---|---|---|
| **Meta Cloud API direto** (atual) | R$ 0,04–0,05 (preço de tabela da Meta) | **É o piso de mercado.** Já foi a decisão certa na Fase 5 |
| Twilio / Infobip / 360dialog (BSP) | tarifa da Meta **+ margem do intermediário** | Não. O repo já saiu do Twilio por isso |
| Z-API / Evolution API (não-oficial, WhatsApp Web) | R$ 50–100/mês fixo, sem custo por msg | **Não.** Viola os termos do WhatsApp; número pode ser banido. Inaceitável quando o número é o canal de atendimento do parceiro |
| SMS (Zenvia, Twilio) | R$ 0,08–0,15 | Mais caro e com taxa de leitura muito pior |
| E-mail (Resend/SES) | ~R$ 0,0005 | **90× mais barato** — vale para o que não é urgente: recibo, resumo mensal, aviso de cobrança D-3 |
| Push (PWA / web push) | R$ 0 | **Grátis.** Vale para tudo que é interno do petshop (ver 7.2) |

Não há nada mais barato que a Meta direto para a mensagem que **precisa** ir
por WhatsApp. A economia vem de **mandar menos**, não de mandar por outro
lugar.

### 6.4 Pagamentos — hoje: Asaas

| Gateway | Cartão | Pix | Split | Recebimento | Nota |
|---|---|---|---|---|---|
| **Asaas** (atual) | 2,99% + R$ 0,49 | R$ 0 (promo) / R$ 0,49 | Nativo por subconta, R$ 12,90 | Cartão **D+32**, Pix imediato | Melhor encaixe no modelo; docs em PT |
| Pagar.me (Stone) | 3,19% | variável | Nativo (recebedores), KYC mais burocrático | D+2 a D+30 | Plano B já mapeado na Fase 6 |
| Mercado Pago | 4,99% | 0,99% | Sim | D+14 padrão | Caro e o Pix não é grátis |
| PagBank | 4,99% | grátis | Limitado | D+14 / D+1 | Pix grátis, mas cartão caro e split fraco |
| Iugu | 2,49%+ | variável | Sim | D+2 | Vale cotar se o volume de cartão crescer |
| Stripe | 3,99% + R$ 0,39 | via Connect | Connect | D+2 | Pix é cidadão de segunda classe no Brasil |

**O que muda a conta aqui não é a taxa, é o D+32 do cartão.** Enquanto o
produto empurrar Pix (grátis e imediato), o custo de gateway é praticamente
zero e o petshop recebe na hora. Cada ponto percentual de migração pro cartão
piora custo **e** fluxo de caixa do parceiro. A recomendação é manter o Pix
como padrão visual e o cartão como conveniência — que é o que a decisão de
16/ago já faz ao somar a taxa do gateway por cima só no cartão.

**Item de calendário: 16/nov/2026.** É quando o Pix gratuito vira R$ 0,49.
Antes disso: renegociar com o gerente Asaas ou cotar PagBank (Pix grátis).

### 6.5 Observabilidade, e-mail e backup — hoje: nada

| Função | Grátis | Pago se crescer | Recomendação |
|---|---|---|---|
| Erro de aplicação | Sentry free (5 k eventos) | Sentry Team US$ 26 | Sentry free agora |
| Uptime | UptimeRobot free (50 monitores) | Better Stack US$ 25 | UptimeRobot agora |
| Log/analytics | Vercel Analytics free tier | Vercel Observability Plus US$ 10 | Free agora |
| E-mail transacional | Resend 3 k/mês, ou SES US$ 0,10/mil | Resend US$ 20 | **Resend free** — resolve o convite de dono da Fase 8 |
| Backup off-site | Cloudflare R2 (10 GB, egress zero) ou Backblaze B2 | ~US$ 1/mês | **R2 + `pg_dump` diário** |

Custo total dessa coluna: **R$ 0/mês**. O que falta é o tempo de implementar
(~12 h somando tudo). É o melhor retorno por hora de todo este documento.

---

## 7. Plano de redução de custos, em ordem de retorno

### 7.1 Usar a janela de 24 h que já está implementada — economia ~R$ 15/petshop/mês
Quando o tutor responde "sim" ao `confirmacao_agendamento`, abre uma janela de
24 h em que **texto livre é gratuito**. O `pet_pronto` e o `pet_entregue` do
mesmo dia caem dentro dela. O código já sabe fazer isso
(`janela_whatsapp_aberta()`, e `montarMensagem()` já tem o par
template/texto-livre) — falta garantir que o `enviar-lembretes` **prefira** o
caminho gratuito e medir a taxa de resposta real no piloto.
**Esforço: 4–6 h. Risco: baixo.**

### 7.2 Tirar a mensagem interna do WhatsApp — economia ~R$ 3/petshop/mês
`confirmacao_pendente_petshop` avisa a **equipe do petshop**, que já está
logada no painel. Vira um contador na Agenda ou um web push (grátis).
**Esforço: 4 h. Risco: nenhum.**

### 7.3 Tornar `pet_entregue` opcional por petshop — economia até R$ 18/petshop/mês
É a mensagem de menor valor percebido das três: o tutor acabou de sair da loja
com o pet. Uma coluna `petshops.enviar_pet_entregue` (padrão `false`) devolve
a decisão ao parceiro e corta 400 mensagens/mês por padrão.
**Esforço: 2 h. Risco: nenhum.**

### 7.4 Fazer o cron ser condicional — economia R$ 0, ganho operacional
O job `lembretes-enviar` roda a cada 2 min sempre, mesmo com fila vazia:
21.600 invocações/mês. Não custa dinheiro hoje (franquia de 2 M), mas polui o
log e esconde falha real. Um `select` de guarda antes do `net.http_post` só
chama a função quando há `lembretes` pendentes.
**Esforço: 1 h.**

### 7.5 Teto de disparo para `retencao_cliente` — evita R$ 35/petshop/mês
Antes de o template MARKETING existir, criar limite por petshop e por tutor
(ex.: máximo 1 a cada 90 dias, teto mensal configurável). Custo evitado, não
economizado.
**Esforço: 3 h. Faça antes de submeter o template, não depois.**

### 7.6 Renegociar o Pix antes de 16/nov/2026 — evita até R$ 49/petshop/mês
O maior risco de custo do documento inteiro, e não é técnico.

### 7.7 Migrar o hosting para Cloudflare Workers — economia R$ 77/mês (fixo)
Vale quando o custo fixo incomodar mais que 16 h de trabalho — na prática,
**depois** do piloto. Com 15 petshops isso é 5% do custo total; com 50, é 2%.
**Esforço: 8–16 h. Risco: médio** (Server Actions e middleware do Next 14 no
runtime da Cloudflare exigem teste real).

### 7.8 Consolidar tudo num VPS — economia até R$ 190/mês, **não recomendado agora**
Hetzner CX32 rodando Coolify + Next.js + Postgres + workers derruba o fixo pra
~R$ 45/mês. Mas: você assume backup, patch de segurança, TLS, uptime e
recuperação de desastre de um sistema que guarda **dado de cliente de
terceiros**. 40–60 h de migração e uma responsabilidade permanente, para
economizar menos de 2 petshops de receita. Reconsiderar apenas se o custo
gerenciado passar de ~R$ 600/mês.

---

## 8. Recomendação

**Para o piloto (agora):** manter Vercel Pro + Supabase Pro. **R$ 235/mês de
fixo** é o preço de não ter que pensar em infraestrutura enquanto o produto
ainda está descobrindo o que é. Investir as ~12 h dos gaps da seção 3.1
(backup, Sentry, uptime, e-mail) — esse é o único trabalho de infra que é
urgente, e ele custa R$ 0 de assinatura.

**Nos primeiros 60 dias:** executar 7.1 a 7.5. São ~14 h de desenvolvimento
que derrubam o custo variável de R$ 62 para ~R$ 37 por petshop — e, diferente
de qualquer economia de infra, esse ganho **se multiplica por cada parceiro
novo**.

**No calendário, com data:** 16/nov/2026, renegociação das taxas Asaas.

**Não fazer agora:** trocar Supabase, self-hostar, contratar PITR. Todos têm
payback pior que o trabalho de conseguir o próximo petshop parceiro.

---

*Fontes de preço: páginas oficiais de pricing de Supabase, Vercel e Meta
(WhatsApp Business Platform), taxas reais da conta Asaas registradas em
`docs/fase6_pagamentos.md` §1b, e levantamentos de mercado de 2026 para
gateways brasileiros e VPS. Câmbio de 24/ago/2026.*
