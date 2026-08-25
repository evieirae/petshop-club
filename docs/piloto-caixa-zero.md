# Piloto sem caixa — como entrar em produção gastando R$ 40

Complemento de `docs/custos-producao.md`, escrito a partir de uma restrição
que muda o desenho todo: **não há caixa para bancar 2–3 meses de piloto
deficitário, nem as despesas de CNPJ.**

A resposta curta: o piloto não precisa custar R$ 2.257. Ele pode custar
**R$ 40** — o domínio, pago uma vez. O que muda não é a negociação de preço
com fornecedor, é o **escopo do piloto**.

---

## 1. O que eu assumi errado no documento anterior

Aquele documento respondeu "quanto custa botar isso em produção do jeito
certo". Ele assumiu, sem dizer, que o piloto precisa da plataforma inteira
funcionando — WhatsApp automático, split de pagamento e CNPJ desde o dia 1.

Nenhuma das três é verdade. E há uma coincidência que resolve o problema:

> **As três coisas que custam dinheiro no piloto são exatamente as três que
> estão bloqueadas, não testadas, e cujo valor você ainda não precisa
> provar.**

| Item | Custa | Está pronto? | O piloto precisa? |
|---|---|---|---|
| WhatsApp automático (Fase 5) | R$ 62/petshop/mês | ❌ Business Portfolio pendente, templates não submetidos | ❌ dá pra validar manualmente |
| Split de pagamento (Fase 6) | R$ 12,90/subconta + taxas | ❌ nunca testado contra gateway real, sandbox travado | ❌ o petshop já cobra os clientes dele hoje |
| CNPJ | R$ 320/mês | ❌ não aberto | ❌ só é obrigatório quando você fatura |
| **Agenda, tutores, pets, planos, assinaturas (Fases 0–4)** | **R$ 0** | ✅ **concluídas e testadas** | ✅ **é o que o piloto tem que provar** |

O piloto é das Fases 0–4. Elas estão prontas, testadas, e não custam nada
para rodar.

### A correção mais importante: MEI não serve para você

O documento anterior estimou "MEI ~R$ 76/mês". **Está errado.**
Desenvolvimento de software é atividade intelectual e os CNAEs 6201, 6202,
6203, 6204 e 6209 são todos **proibidos no MEI** (não constam do Anexo XI da
Resolução CGSN 140/2018). Existe um projeto de lei (PLP 25/2026) para mudar
isso, mas não foi aprovado.

A estrutura válida é **ME/SLU no Simples Nacional**, e o custo real de
manter, mesmo faturando zero, é:

| Item | R$/mês |
|---|---|
| Pró-labore mínimo + INSS | 178,31 |
| Contabilidade online | 139,90 |
| **Mínimo com faturamento zero** | **~318** |

Empresa sem receita não paga DAS, mas as declarações continuam obrigatórias
e a multa por atraso começa em R$ 200. **Ou seja: o CNPJ sozinho custa mais
que toda a infraestrutura do plano anterior.** Era a sua preocupação, e ela
estava certa.

> Não sou contador — confirme a estrutura e os números com um antes de abrir
> qualquer coisa. O ponto aqui é só que o custo é dessa ordem de grandeza, e
> não da ordem de R$ 76.

---

## 2. A dependência que ninguém tinha desenhado

Vale explicitar, porque ela é o motivo de o CNPJ parecer inevitável:

```
CNPJ  →  Meta Business Portfolio  →  templates aprovados  →  Fase 5 → WhatsApp automático
```

O `ROADMAP.md` já registra o travamento: *"parado no passo seguinte —
conectar um Business Portfolio, que exige nome legal do negócio, endereço e
telefone"*. Isso é CNPJ.

Então o custo de entrada do WhatsApp automático **não é R$ 62/petshop/mês.
É R$ 318/mês de CNPJ antes da primeira mensagem sair.** Com 1 petshop de
piloto que não paga nada, isso é dinheiro puro saindo.

Cortar o WhatsApp automático do piloto não corta só R$ 62 — corta a
obrigação de abrir empresa antes de ter receita.

---

## 3. As três tesouras

### Tesoura 1 — WhatsApp manual no piloto

O app monta o texto da mensagem e o petshop envia pelo **WhatsApp Business
comum**, do celular do balcão. Um botão "copiar mensagem" e um link `wa.me`,
igual ao que a Fase 3 já faz com o link de cadastro do tutor
(*"por enquanto a tela só copia o link"*).

- **Custo:** R$ 0 · **Dev:** 4–6 h
- **Não precisa de:** CNPJ, Business Portfolio, templates aprovados, número
  dedicado, chip
- **O que você continua aprendendo:** se o lembrete reduz falta. Que é a
  única coisa que importa saber. Se ele reduz quando enviado à mão, reduz
  automático — e aí a automação vira otimização de trabalho, com número real
  para justificar o custo.

### Tesoura 2 — Ficar fora do fluxo de dinheiro

O petshop cobra os clientes dele como já cobra hoje: Pix próprio,
maquininha própria. O app **registra** que o pagamento aconteceu, não o
processa.

- **Custo:** R$ 0 · **Dev:** ~2 h (a coluna `pagamento_local` da migration
  0011 já existe)
- **Elimina:** subconta Asaas (R$ 12,90), aprovação de tokenização (que está
  travada), risco de PCI, e — principalmente — a necessidade de emitir nota
  fiscal, que é o que obriga o CNPJ
- **Bônus de risco:** tira do piloto o código mais frágil do repositório. A
  Fase 6 inteira nunca rodou contra um gateway de verdade; os payloads
  seguem a documentação, não uma chamada real. Estrear isso no mesmo mês em
  que você estreia o produto com um parceiro real é somar dois riscos sem
  necessidade.

### Tesoura 3 — Adiar o CNPJ até existir receita

Sem faturar, não há obrigação de CNPJ. E o piloto não fatura: `isento_fee_ate`
já existe exatamente para isso, e com a Tesoura 2 não há split para repassar.

O CNPJ entra quando o primeiro petshop disser "eu pago" — e aí ele é
decisão de negócio financiada por receita, não aposta de caixa.

---

## 4. Custo do piloto, refeito

| Item | Plano anterior | Plano sem caixa |
|---|---|---|
| Hosting | Vercel Pro R$ 103 | **Netlify Free R$ 0** |
| Banco / Auth | Supabase Pro R$ 129 | **Supabase Free R$ 0** |
| Backup | incluso no Pro | `pg_dump` → GitHub Actions + Cloudflare R2 — **R$ 0** |
| Erro / uptime | Sentry + UptimeRobot free | igual — **R$ 0** |
| WhatsApp (1 petshop) | R$ 62 | **R$ 0** (manual) |
| Gateway | R$ 12,90 setup + taxas | **R$ 0** (fora do fluxo) |
| CNPJ | R$ 318 | **R$ 0** (adiado) |
| Domínio `.com.br` | R$ 3,33 | R$ 3,33 |
| **Total por mês** | **R$ 740** | **R$ 3,33** |
| **3 meses de piloto** | **R$ 2.257** | **R$ 40** |

Custo em desenvolvimento para chegar lá: **~16 horas.**

---

## 5. Por que Netlify Free e Supabase Free são defensáveis aqui

Não é gambiarra — é o plano certo para o tamanho certo. Mas cada escolha
tem um porquê e um limite.

### Netlify Free — e por que não Vercel Hobby nem Cloudflare Free

| Opção | R$/mês | Uso comercial | Esforço | Veredito |
|---|---|---|---|---|
| **Netlify Free** | **0** | **Permitido, explicitamente** — a Netlify diz que no plano Free "you can deploy commercial projects" | 2–4 h | ✅ **é a escolha** |
| Vercel Hobby | 0 | ❌ Não-comercial nos termos | 0 h | Zona cinza, e você teria que migrar justamente quando começar a cobrar — o pior momento possível |
| Cloudflare Workers Free | 0 | Permitido | 8–16 h | ❌ **10 ms de CPU por request.** SSR de Next.js não cabe nisso. O plano de US$ 5 cabe; o grátis não |
| Vercel Pro | 103 | Sim | 0 h | Certo depois, caro agora |

Limites do Netlify Free: **100 GB de banda, 125 mil invocações de função,
300 minutos de build, 1 milhão de edge functions/mês**. Um petshop de
piloto consome cerca de **8 mil invocações/mês** — a franquia comporta
aproximadamente **15 petshops** antes de precisar pagar.

Suporte a Next.js: a Netlify usa o adaptador OpenNext oficial e cobre
**App Router, Server Components, Server Actions, middleware, ISR e
streaming** — tudo que o repo usa. Migração é conectar o repositório e
cadastrar as variáveis de ambiente.

### Supabase Free — os dois riscos reais e como fechar cada um

| Risco | Realidade | Mitigação |
|---|---|---|
| **500 MB de banco** | 1 petshop gera ~4 mil linhas/mês ≈ **3,3 MB/mês**. Piloto de 3 meses com 2 petshops = **20 MB, 4% da franquia** | Nenhuma necessária. Alarme em 350 MB |
| **Pausa após 7 dias sem atividade** | A regra é "algumas requisições por dia ao longo da semana". Um petshop usando de verdade gera isso sozinho | Keep-alive de 5 min via GitHub Actions (grátis) como seguro. E se pausar: **os dados ficam intactos e restauráveis por 1 ano** — é indisponibilidade, não perda |
| **Sem backup gerenciado** | Este é o risco de verdade | `pg_dump` diário por GitHub Actions → Cloudflare R2 (10 GB grátis, sem custo de egress). 3–5 h de trabalho, R$ 0/mês |
| Log de 1 dia | Incomoda para depurar | Sentry free cobre o erro de aplicação, que é o que importa |

O único desses que exige disciplina é o backup. **Não suba um petshop real
sem o `pg_dump` diário rodando.** É a linha entre "plano enxuto" e
"irresponsável".

---

## 6. A escada de custo — degraus por evento de negócio, não por data

Cada degrau é destravado por algo que aconteceu, não por um mês do
calendário. Assim você nunca paga por capacidade antes de ter a receita que
a justifica.

### Degrau 0 — Piloto · **R$ 3/mês**
Netlify Free + Supabase Free + domínio. WhatsApp manual, sem split, sem CNPJ.
**Objetivo:** um petshop usando todo dia por 4 semanas seguidas.
**Sobe quando:** o dono disser que pagaria por isso.

### Degrau 1 — Primeiro pagante · **R$ 132/mês**
Sobe o Supabase para Pro (backup gerenciado, sem pausa, PITR opcional).
Netlify continua Free. Recebimento por Pix como PF, com carnê-leão.
**Coberto por:** 1,3 petshop pagante.
**Sobe quando:** o segundo ou terceiro petshop pagante entrar — ou quando o
parceiro pedir nota fiscal.

### Degrau 2 — CNPJ e WhatsApp automático · **R$ 450/mês**
Aqui, e só aqui, abre o ME/SLU. Isso destrava o Business Portfolio, os
templates da Meta e a Fase 5. Liga o split do Asaas.
**Coberto por:** 4,5 petshops pagantes.
**Não suba antes disso** — R$ 318/mês de CNPJ com 2 petshops é o mesmo
prejuízo que você está tentando evitar, com outro nome.

### Degrau 3 — Escala · a partir de 15 petshops
Netlify Pro ou Vercel Pro quando estourar as 125 mil invocações. Daqui em
diante vale o documento anterior, incluindo as otimizações de mensagem —
que passam a valer muito, porque aí o WhatsApp está ligado.

---

## 7. As ~16 horas de desenvolvimento

| # | Tarefa | Horas | Destrava |
|---|---|---|---|
| 1 | Migrar deploy para Netlify (conectar repo, env vars, testar cookie SSR do Supabase no middleware) | 2–4 | Hosting R$ 0 legalmente limpo |
| 2 | `pg_dump` diário via GitHub Actions → Cloudflare R2 | 3–5 | Poder usar o Supabase Free sem irresponsabilidade |
| 3 | Modo manual de mensagem: botão "copiar" + `wa.me` nas telas que geram `lembretes` | 4–6 | Piloto sem CNPJ e sem custo de mensagem |
| 4 | Flag por petshop para desligar a cobrança pelo gateway (usar `pagamento_local`) | 2 | Ficar fora do fluxo de dinheiro |
| 5 | Sentry + UptimeRobot + keep-alive do Supabase | 2 | Saber quando quebra |
| | **Total** | **13–19 h** | |

Compare com o que compra: **R$ 2.217 de exposição de caixa em 3 meses.**
São mais de R$ 100 por hora de trabalho, sem contar o risco removido.

---

## 8. O que medir no piloto

Se o piloto não custa quase nada, ele pode durar mais e responder mais.
Quatro números valem mais que qualquer economia deste documento:

1. **GMV mensal do petshop.** Define se os 3% de taxa de serviço são
   R$ 600/mês ou R$ 60/mês por parceiro. É o número que decide se o modelo
   fecha.
2. **Taxa de resposta ao lembrete.** Quantos tutores respondem "sim"? Define
   quanto da janela gratuita de 24 h você vai conseguir explorar quando
   automatizar — a maior alavanca de custo do documento anterior.
3. **Redução de falta.** É o valor que você vende. Sem esse número você não
   tem argumento de preço, tem só uma tela bonita.
4. **Quantos minutos por dia a equipe gasta enviando mensagem à mão.** É
   exatamente o que a automação vai vender no Degrau 2 — e o preço que ela
   pode cobrar.

---

## 9. Em uma frase

Você não precisa de dinheiro para começar. Precisa de **~16 horas de
desenvolvimento e de um piloto mais estreito** — que valida o que já está
pronto e testado, e adia o que está caro, bloqueado e não testado até
existir receita que o pague.
