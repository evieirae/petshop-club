# Identidade visual do PetClub

Este documento é o **racional**. Os valores de verdade vivem em três arquivos,
e só neles:

| Arquivo | O que define |
|---|---|
| `lib/design/tokens.ts` | **Todas as cores, dos 4 temas.** Único lugar com `#` no código. |
| `lib/ui/styles.ts` | **Como as cores se combinam** — botão, card, lista, badge, input, alerta. |
| `lib/design/tema.ts` | **Qual tema está ativo** (cookie) e a Server Action pra trocar. |

`tailwind.config.ts` só traduz o primeiro em classes utilitárias (que resolvem
pra `var(--color-*)`, não pra hex literal) e em um bloco de CSS variables por
tema, escopado em `:root[data-tema="..."]`. Nada de cor é escrito lá, nem em
`app/globals.css`, nem em nenhum componente.

**Como mudar a identidade de um tema inteiro:** edite `lib/design/tokens.ts`.
Todas as telas acompanham.

**Como mudar o formato de todos os botões (ou listas, ou badges) de uma vez:**
edite a receita correspondente em `lib/ui/styles.ts` — vale pros 4 temas ao
mesmo tempo, porque as receitas só citam nomes de token (`bg-brand-500`), nunca
hex.

Única exceção: os SVGs estáticos de `public/` e `app/icon.svg`, e
`lib/email/templates.ts`, que carregam o hex do tema **padrão** (Ardósia)
literal, porque são consumidos fora do build do Tailwind (e-mail, favicon,
WhatsApp) e não conseguem reagir a `data-tema` em runtime. Se o `brand.500` do
tema padrão mudar, esses arquivos precisam ser atualizados junto — a versão
usada dentro do app (`components/brand/Logo.tsx`) acompanha sozinha.

---

## 4 temas (16/set/2026)

Até 16/set/2026 o app tinha uma única paleta fixa (Azul Confiança). A pedido
do Eduardo, isso virou infraestrutura: **4 temas completos, trocáveis em
runtime**, sem recarregar a página nem recompilar nada — é só o navegador
trocando qual bloco `[data-tema]` está em vigor.

| Tema | Marca | Fundo | Pensado pra |
|---|---|---|---|
| **Ardósia** (padrão) | verde-petróleo | claro | mesmo espírito de contraste alto do sistema anterior — balcão, tablet, luz de loja |
| **Vinho** | vinho | claro | mesma base de superfície/status de Ardósia, só a marca muda |
| **Escuro** | verde-petróleo (invertido) | escuro | quem fecha o caixa tarde |
| **Marinho** | azul-marinho | escuro | mesma base de superfície/status de Escuro, só a marca muda |

O usuário troca pelo ícone de paleta na barra superior
(`components/tema/ThemeSwitcher.tsx`). A escolha persiste num cookie de
sessão simples (`lib/design/tema.ts`) — não é por usuário nem por petshop,
é preferência de quem está com a mão no aparelho naquele momento.

### Como as rampas foram geradas

Cada tema define, à mão (a partir do canvas de design), só as **âncoras**:
`brand.500`, `cta.500` (+ o texto fixo de cada um), `bg`/`card`/`border`/`ink`
e o par `bg`+texto de cada tom de status. O resto da rampa (as escalas
50–900, e os degraus intermediários de cada status) foi **gerado por script**
(fora do repo): medindo, na paleta antiga (Azul Confiança), o quanto de
branco/preto cada degrau tinha misturado no seu 500, e aplicando a mesma
mistura na âncora nova. Nos temas escuros a direção da mistura é invertida —
senão um `brand-50` saía quase-branco flutuando sobre um app de fundo escuro.
Pros tons de status (sucesso/progresso/info/erro), que já têm os dois
extremos (`bg` e `dot`) desenhados no canvas, os degraus do meio são
interpolação linear direta entre eles.

### `ctaInk` e `brandContrast` — por que existem separados de `ink`

Em Ardósia/Vinho (temas claros), o texto sobre um preenchimento sólido de
marca é branco, e sobre o CTA é escuro — igual ao sistema antigo, onde isso
era só `text-white` / `text-ink-900` hardcoded.

Em Escuro/Marinho, o `ink.900` do tema é **claro** (pra ler sobre fundo
escuro). Só que um botão de preenchimento sólido de marca ou de CTA continua
sendo um bloco "claro" mesmo dentro de um tema escuro — então precisa de um
texto **escuro** próprio, que não é o `ink.900` do tema (que é claro). Por
isso cada paleta carrega `ctaInk` e `brandContrast` como tokens à parte,
fixos por tema, e `lib/ui/styles.ts` usa `text-cta-ink` /
`text-brand-contrast` em vez de `text-white` / `text-ink-900` hardcoded nesses
dois lugares. **Nunca volte a escrever `text-white` ou `text-ink-900` num
botão de preenchimento sólido** — quebra nos temas escuros.

### O tom `info` deixou de ser um alias de `brand`

No sistema antigo, "azul = clicável" cobria dois papéis ao mesmo tempo: era a
cor de ação (botão primário, menu ativo) *e* a cor do tom de status `info`
(badge "pronto p/ busca", "processando"). Como `brand` virou verde-petróleo/
vinho/azul-marinho conforme o tema, ele deixou de servir pro segundo papel —
um botão "Nova visita" e um badge "processando" não podem ser a mesma cor só
porque a paleta mudou. `info` agora é um tom de cor próprio (ver tabela de
status abaixo), com sua própria escala 50–700.

---

## Conceito

O produto é um clube de assinatura de banho e tosa. Quem usa o painel é o dono
do petshop, muitas vezes num tablet no balcão, com o cliente esperando na
frente. Isso empurra duas decisões, que valem pros 4 temas:

- **Contraste alto e superfície de fundo única por tema.** O app precisa ser
  legível de pé, de lado, com reflexo — inclusive no Escuro/Marinho, que não
  são "modo baixa energia", são uma segunda identidade completa.
- **Uma cor = um significado.** O dono não lê a tela, ele varre a tela.
  Verde é "resolvido", amarelo é "precisa de mim", vermelho é "deu errado",
  a cor de marca do tema é "clicável". Nenhuma cor é usada por decoração.

---

## Paleta — valores completos

A fonte de verdade é `lib/design/tokens.ts` (`export const paletas`). Cada
tema tem exatamente a mesma forma de objeto:

```
brand (50–900) · success (50,100,500,600,700) · cta (50,100,500,600,700)
ctaInk · danger (50,100,500,600,700) · progress (50,100,500,600,700)
info (50,100,500,600,700) · ink (400,500,700,900) · surface (DEFAULT,card,muted,border,strong)
brandContrast
```

Os degraus `★` (500 de cada família cromática) são as âncoras escolhidas à
mão no canvas; o resto foi gerado (ver acima).

### Ardósia (padrão)

| brand | success | cta | danger | progress | info |
|---|---|---|---|---|---|
| 50 `#ECF0EF` | 50 `#E7F1E6` | 50 `#FCF8F0` | 50 `#FBEAE7` | 50 `#F0E9F3` | 50 `#EBF2F7` |
| 100 `#D8E0DF` | 100 `#BED0C0` | 100 `#F7E9D0` | 100 `#DFC1BB` | 100 `#CBC1D3` | 100 `#BFD0DC` |
| 200 `#AABCBA` | — | — | — | — | — |
| 300 `#7C9794` | — | — | — | — | — |
| 400 `#496F6B` | — | — | — | — | — |
| 500 `#14453F` ★ | 500 `#72937A` | 500 `#D6900F` ★ | 500 `#AC756A` | 500 `#897999` | 500 `#6A8EA8` |
| 600 `#113A35` | 600 `#51785B` | 600 `#B87C0D` | 600 `#955446` | 600 `#6B587F` | 600 `#4D7896` |
| 700 `#0D2E2A` | 700 `#2B5A38` ★ | 700 `#634207` | 700 `#7C2E1E` ★ | 700 `#4A3462` ★ | 700 `#25597E` ★ |
| 800 `#0A2320` | — | — | — | — | — |
| 900 `#071715` | — | — | — | — | — |

`ctaInk` `#241F1A` · `brandContrast` `#FFFFFF` · `ink` 400 `#B4AE9F` / 500 `#777064` / 700 `#59534A` / 900 `#211E19`
`surface` bg `#FAFAF7` / card `#FFFFFF` / muted `#F4F5F0` / border `#E4E7DF` / strong `#D1D6C9`

### Vinho

| brand | success | cta | danger | progress | info |
|---|---|---|---|---|---|
| 50 `#F4EDEF` | 50 `#E7F1E6` | 50 `#FCF8F0` | 50 `#FBEAE7` | 50 `#F0E9F3` | 50 `#EBF2F7` |
| 100 `#E9DBDF` | 100 `#BED0C0` | 100 `#F7E9D0` | 100 `#DFC1BB` | 100 `#CBC1D3` | 100 `#BFD0DC` |
| 200 `#CFB1BA` | — | — | — | — | — |
| 300 `#B58795` | — | — | — | — | — |
| 400 `#98586B` | — | — | — | — | — |
| 500 `#7A2740` ★ | 500 `#72937A` | 500 `#D6900F` ★ | 500 `#AC756A` | 500 `#897999` | 500 `#6A8EA8` |
| 600 `#662136` | 600 `#51785B` | 600 `#B87C0D` | 600 `#955446` | 600 `#6B587F` | 600 `#4D7896` |
| 700 `#521A2B` | 700 `#2B5A38` ★ | 700 `#634207` | 700 `#7C2E1E` ★ | 700 `#4A3462` ★ | 700 `#25597E` ★ |
| 800 `#3E1420` | — | — | — | — | — |
| 900 `#290D16` | — | — | — | — | — |

`ctaInk` `#241F1A` · `brandContrast` `#FFFFFF` · `ink` 400 `#BBA9A6` / 500 `#7F6F6C` / 700 `#5C4E4C` / 900 `#241C1B`
`surface` bg `#FAF8F7` / card `#FFFFFF` / muted `#F5EFEE` / border `#E9DEDC` / strong `#DAC7C4`

Sucesso/progresso/info/erro são **idênticos** a Ardósia — só a marca (e a
superfície/ink, que seguem a mesma "temperatura" quente do vinho) mudam.

### Escuro

| brand | success | cta | danger | progress | info |
|---|---|---|---|---|---|
| 50 `#080F0D` | 50 `#1E3323` | 50 `#0E0A04` | 50 `#332019` | 50 `#2C2333` | 50 `#1B3537` |
| 100 `#101E1A` | 100 `#37573D` | 100 `#2D210B` | 100 `#5A3931` | 100 `#4E4258` | 100 `#2C5659` |
| 200 `#224138` | — | — | — | — | — |
| 300 `#356457` | — | — | — | — | — |
| 400 `#498A79` | — | — | — | — | — |
| 500 `#5FB39C` ★ | 500 `#64996D` | 500 `#E8A93A` ★ | 500 `#A0665B` | 500 `#8C799B` | 500 `#4B9298` |
| 600 `#79BFAC` | 600 `#78B683` | 600 `#EDBD68` | 600 `#C07A6F` | 600 `#A892B9` | 600 `#59ADB4` |
| 700 `#93CCBC` | 700 `#8FD79B` ★ | 700 `#F4D7A4` | 700 `#E39184` ★ | 700 `#C7AEDA` ★ | 700 `#69CBD3` ★ |
| 800 `#AED9CD` | — | — | — | — | — |
| 900 `#C9E5DD` | — | — | — | — | — |

`ctaInk` `#1E1810` · `brandContrast` `#0E1613` · `ink` 400 `#6C6858` / 500 `#9B9686` / 700 `#CBC7BB` / 900 `#F3F1EA`
`surface` bg `#171915` / card `#1F2320` / muted `#262B26` / border `#333A33` / strong `#454F45`

Repare que a rampa **inverte de sentido** em relação aos temas claros: `50` é
o degrau mais escuro (fundo de badge sobre um app já escuro) e `900` o mais
claro. É proposital — ver "Como as rampas foram geradas".

### Marinho

| brand | success | cta | danger | progress | info |
|---|---|---|---|---|---|
| 50 `#070D12` | 50 `#1E3323` | 50 `#0E0A04` | 50 `#332019` | 50 `#2C2333` | 50 `#1B3537` |
| 100 `#0F1A24` | 100 `#37573D` | 100 `#2D210B` | 100 `#5A3931` | 100 `#4E4258` | 100 `#2C5659` |
| 200 `#21384E` | — | — | — | — | — |
| 300 `#335678` | — | — | — | — | — |
| 400 `#4678A7` | — | — | — | — | — |
| 500 `#5B9BD8` ★ | 500 `#64996D` | 500 `#E8A93A` ★ | 500 `#A0665B` | 500 `#8C799B` | 500 `#4B9298` |
| 600 `#76ABDE` | 600 `#78B683` | 600 `#EDBD68` | 600 `#C07A6F` | 600 `#A892B9` | 600 `#59ADB4` |
| 700 `#91BCE5` | 700 `#8FD79B` ★ | 700 `#F4D7A4` | 700 `#E39184` ★ | 700 `#C7AEDA` ★ | 700 `#69CBD3` ★ |
| 800 `#ACCCEB` | — | — | — | — | — |
| 900 `#C7DDF2` | — | — | — | — | — |

`ctaInk` `#1E1810` · `brandContrast` `#0B1622` · `ink` 400 `#546882` / 500 `#8497AE` / 700 `#B9C6D9` / 900 `#EDF2F8`
`surface` bg `#0F1C2E` / card `#16263D` / muted `#1C2E48` / border `#2A3F5C` / strong `#365177`

Sucesso/progresso/info/erro são **idênticos** a Escuro — só a marca (e a
superfície/ink, que seguem a "temperatura" fria do azul-marinho) mudam.

---

## Hierarquia de ação

Vale igual nos 4 temas — só a cor de cada papel muda.

| Variante | Cor | Quando |
|---|---|---|
| `primaria` | Marca do tema, sólida | Ação padrão: salvar, entrar, confirmar, criar |
| `cta` | Dourado, sólido | A ação principal da tela (uma por tela) |
| `contorno` | Marca do tema, contorno | Ação secundária ao lado de uma primária |
| `neutra` | Cinza de contorno | Cancelar, fechar, voltar |
| `perigo` | Vermelho de contorno | Excluir, cancelar assinatura |
| `texto` / `textoPerigo` | Link | Ação terciária dentro de uma linha de lista |

## Tons de status

Todos os mapas de status do app apontam pra estes 6 tons — "pago",
"confirmado" e "ativa" têm exatamente o mesmo verde em qualquer tela, em
qualquer tema.

| Tom | Papel | Significado | Exemplos |
|---|---|---|---|
| `neutro` | cinza (`surface.muted`/`ink.500`) | Estado sem ação pendente | agendado, cancelado, isento, inativo |
| `progresso` | roxo | Em execução agora | presente (pet no banho/tosa) |
| `info` | azul (tom próprio, não mais `brand`) | Resolvido, aguardando sem trabalho ativo | pronto p/ busca, processando |
| `sucesso` | verde | Concluído | confirmado, entregue, pago, ativa |
| `atencao` | dourado (`cta`) | Precisa de alguém | aguardando pagamento, pausada, reagendado |
| `erro` | vermelho (`danger`) | Deu errado | falhou, estornado, faltou |

---

## Contraste medido (WCAG 2.1)

Todas as combinações em uso, por tema. Mínimo AA pra texto normal é 4.5:1;
pra elemento gráfico pequeno (o ponto do badge, WCAG 1.4.11) é 3:1.

| Combinação | Ardósia | Vinho | Escuro | Marinho | Mínimo |
|---|---|---|---|---|---|
| Botão primário (`brandContrast` / `brand.500`) | 10.75:1 | 9.58:1 | 7.36:1 | 6.18:1 | 4.5 ✅ |
| Botão primário hover (`brandContrast` / `brand.600`) | 12.50:1 | 11.44:1 | 8.63:1 | 7.51:1 | 4.5 ✅ |
| Botão primário pressed (`brandContrast` / `brand.700`) | 14.57:1 | 13.62:1 | 10.15:1 | 9.14:1 | 4.5 ✅ |
| Botão CTA (`ctaInk` / `cta.500`) | 6.11:1 | 6.11:1 | 8.52:1 | 8.52:1 | 4.5 ✅ |
| Botão CTA hover (`ctaInk` / `cta.600`) | 4.61:1 | 4.61:1 | 10.12:1 | 10.12:1 | 4.5 ✅ |
| Título (`ink.900` / `surface`) | 15.88:1 | 15.78:1 | 15.66:1 | 15.22:1 | 4.5 ✅ |
| Texto forte (`ink.700` / `surface`) | 7.27:1 | 7.49:1 | 10.47:1 | 9.91:1 | 4.5 ✅ |
| Texto auxiliar (`ink.500` / `surface`) | 4.69:1 | 4.52:1 | 5.99:1 | 5.73:1 | 4.5 ✅ |
| Item ativo do menu (`brand.700` / `brand.50`) | 12.68:1 | 11.81:1 | 10.70:1 | 9.79:1 | 4.5 ✅ |
| Anel de foco (`brand.500` / `surface`) | 10.28:1 | 9.05:1 | 7.09:1 | 5.81:1 | 3.0 ✅ |
| Badge sucesso (`success.700` / `success.50`) | 6.91:1 | 6.91:1 | 7.96:1 | 7.96:1 | 4.5 ✅ |
| Badge atenção (`cta.700` / `cta.50`) | 8.57:1 | 8.57:1 | 14.20:1 | 14.20:1 | 4.5 ✅ |
| Badge erro (`danger.600` / `danger.50`) | 4.96:1 | 4.96:1 | 4.59:1 | 4.59:1 | 4.5 ✅ |
| Badge info (`info.700` / `info.50`) | 6.61:1 | 6.61:1 | 6.88:1 | 6.88:1 | 4.5 ✅ |
| Badge progresso (`progress.700` / `progress.50`) | 9.01:1 | 9.01:1 | 7.52:1 | 7.52:1 | 4.5 ✅ |
| Ponto erro (`danger.500` / `danger.50`) | 3.27:1 | 3.27:1 | 3.34:1 | 3.34:1 | 3.0 ✅ |
| Ponto info (`info.500` / `info.50`) | 3.07:1 | 3.07:1 | 3.64:1 | 3.64:1 | 3.0 ✅ |

Tabela gerada junto com a paleta (script local, fora do repo) — se algum
token de cor mudar à mão depois, refaça a checagem antes de integrar.

---

## Logo

| Arquivo | Quando usar |
|---|---|
| `components/brand/Logo.tsx` | Dentro do app. SVG inline, recolorível por token — acompanha o tema ativo sozinho. |
| `public/petclub-logo.svg` | Fora do React — e-mail, WhatsApp, apresentação, assinatura. Carrega o `brand.500` do tema **padrão** (Ardósia), fixo. |
| `public/petclub-logo-branco.svg` | Mesma coisa, sobre fundo azul/escuro. |
| `public/petclub-symbol.svg` | Só o símbolo. |
| `app/icon.svg` | Favicon. |

```tsx
<Logo />                       // marca completa — acompanha o tema ativo
<Logo tamanho="lg" />          // login e telas públicas
<Logo variante="simbolo" />    // só o símbolo
<Logo tom="branco" />          // sobre fundo de marca/escuro
```

## Tipografia

- **Newsreader** (`font-display`) — títulos de página e de seção. Só em
  `h1`/`h2`, nunca no corpo. (Trocou de Fraunces em 16/set/2026.)
- **Manrope** (`font-sans`) — UI, corpo e o logotipo textual. (Trocou de
  Inter em 16/set/2026.)
- **IBM Plex Mono** (`font-mono`) — dados: horários, valores, IDs. Não mudou.
  Já vem com `tabular-nums` (`app/globals.css`), então colunas de preço
  alinham.

## Regras de uso

- **Nunca escreva um `#` fora de `lib/design/tokens.ts`.** Se precisar de uma
  cor que não existe, adicione o token — não improvise no componente.
- **Nunca monte a classe de um botão à mão.** Use `botao()`. O mesmo vale para
  badge (`badge()`), alerta (`alerta()`), input (`formulario.input`), card
  (`superficie.*`) e tabela (`tabela.*`).
- **Nunca use `text-white` ou `text-ink-900` num botão/badge de preenchimento
  sólido de marca ou CTA.** Use `text-brand-contrast` / `text-cta-ink` — eles
  existem justamente porque o texto certo muda de tema pra tema.
- **Dourado nunca com texto que não seja `cta-ink`.**
- Um CTA dourado por tela.
- Foco de teclado sempre visível — o anel global está em `app/globals.css` e
  vale para todo elemento interativo, nos 4 temas.
- Estado vazio sempre explica o que vai aparecer ali, nunca só "em breve".
