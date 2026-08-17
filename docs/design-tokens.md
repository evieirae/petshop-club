# Identidade visual do PetClub

Este documento é o **racional**. Os valores de verdade vivem em dois arquivos,
e só neles:

| Arquivo | O que define |
|---|---|
| `lib/design/tokens.ts` | **Todas as cores.** Único lugar com `#` no código. |
| `lib/ui/styles.ts` | **Como as cores se combinam** — botão, card, lista, badge, input, alerta. |

`tailwind.config.ts` só traduz o primeiro em classes utilitárias e em CSS
variables (`--color-brand-500`, …) injetadas em `:root`. Nada de cor é escrito
lá, nem em `app/globals.css`, nem em nenhum componente.

**Como mudar a identidade do app inteiro:** edite `lib/design/tokens.ts`.
Todas as telas acompanham.

**Como mudar o formato de todos os botões (ou listas, ou badges) de uma vez:**
edite a receita correspondente em `lib/ui/styles.ts`.

Única exceção: os SVGs estáticos de `public/` e `app/icon.svg` carregam o azul
literal, porque são consumidos fora do build (e-mail, favicon, WhatsApp). Se o
`brand-500` mudar, esses quatro arquivos precisam ser atualizados junto — a
versão usada dentro do app (`components/brand/Logo.tsx`) acompanha sozinha.

---

## Conceito

O produto é um clube de assinatura de banho e tosa. Quem usa o painel é o dono
do petshop, muitas vezes num tablet no balcão, com o cliente esperando na
frente. Isso empurra duas decisões:

- **Contraste alto e superfície clara.** O app precisa ser legível de pé, de
  lado, com reflexo. Fundo `#F7FAFC`, cards brancos, texto quase preto.
- **Uma cor = um significado.** O dono não lê a tela, ele varre a tela.
  Verde é "resolvido", amarelo é "precisa de mim", vermelho é "deu errado",
  azul é "clicável". Nenhuma cor é usada por decoração.

---

## Paleta

As quatro cores da marca viraram escalas porque a cor pura raramente serve pros
três papéis que uma UI precisa ao mesmo tempo: **fundo suave**, **preenchimento
sólido** e **texto legível**. O Verde Menta e o Amarelo Ocre puros, por exemplo,
são ótimos como preenchimento e ilegíveis como texto.

### Azul Confiança — ação

| Token | Valor | Uso |
|---|---|---|
| `brand-50` | `#EBF2FA` | Item ativo do menu, fundo de ícone, bloco de edição |
| `brand-100` | `#D6E4F5` | Hover de fundo suave, borda de alerta informativo |
| `brand-200` | `#A9C6E8` | Borda de botão de contorno |
| `brand-500` | `#2B6CB0` | **★ Botão primário, anel de foco, barra do menu ativo** |
| `brand-600` | `#245A94` | Hover do botão primário |
| `brand-700` | `#1D4877` | Pressed, e texto azul sobre `brand-50` |

### Verde Menta — positivo

| Token | Valor | Uso |
|---|---|---|
| `success-50` | `#F0FFF4` | Fundo do badge "confirmado", "pago", "ativa" |
| `success-100` | `#C6F6D5` | Borda do alerta de sucesso |
| `success-500` | `#48BB78` | **★ Preenchimento, ícone, barra de progresso** |
| `success-600` | `#38A169` | Hover |
| `success-700` | `#276749` | Texto verde |

> O `#48BB78` puro **não pode ser usado como texto**: dá 2,4:1 no branco.
> Todo texto verde do app é `success-700`.

### Amarelo Ocre — CTA e atenção

| Token | Valor | Uso |
|---|---|---|
| `cta-50` | `#FFFBEB` | Fundo de aviso e do badge "aguardando"/"pendente" |
| `cta-100` | `#FEF3C7` | Borda do alerta de atenção |
| `cta-500` | `#ECC94B` | **★ Botão de CTA — sempre com texto `ink-900`** |
| `cta-600` | `#D69E2E` | Hover do CTA |
| `cta-700` | `#975A16` | Texto âmbar, ponto de status |

> **Regra dura:** texto branco sobre `cta-500` dá **1,6:1** e reprova em
> qualquer nível de acessibilidade. O CTA sempre carrega texto `ink-900`
> (10,1:1). A variante `cta` de `botao()` já faz isso — não escreva à mão.

### Vermelho — erro

| Token | Valor | Uso |
|---|---|---|
| `danger-50` | `#FFF5F5` | Fundo de erro de formulário, badge "falhou"/"faltou" |
| `danger-100` | `#FED7D7` | Borda |
| `danger-500` | `#E53E3E` | Borda de input inválido, ponto de status |
| `danger-600` | `#C53030` | Texto de erro |

Não estava no briefing, mas o app já precisava dele: erro de formulário,
cobrança que falhou, tutor que não apareceu. É o único sinal que o usuário lê
como problema sem precisar ler o texto.

### Texto e superfícies

| Token | Valor | Uso | Contraste no fundo da página |
|---|---|---|---|
| `ink-900` | `#1A202C` | Títulos, valores | 15,6:1 |
| `ink-700` | `#2D3748` | Labels, corpo forte | 12,0:1 |
| `ink-500` | `#4A5568` | Texto auxiliar, descrições | 7,2:1 |
| `ink-400` | `#718096` | Placeholder, ícone decorativo — **nunca conteúdo** | 4,0:1 |
| `surface` | `#F7FAFC` | **★ Fundo da página** | — |
| `surface-card` | `#FFFFFF` | Cards, inputs, sidebar, topbar | — |
| `surface-muted` | `#EDF2F7` | Cabeçalho de tabela, hover de linha, chip neutro | — |
| `surface-border` | `#E2E8F0` | Bordas e divisores | — |
| `surface-strong` | `#CBD5E0` | Borda de estado vazio, divisor com mais peso | — |

`ink-500` é o token mais usado do app (texto auxiliar em quase toda tela).
Ficou em `#4A5568` e não no cinza médio óbvio `#718096`, que daria 3,9:1 e
reprovaria AA justo no tom mais repetido da interface.

---

## Hierarquia de ação

Uma tela tem **no máximo um** botão amarelo. Se tiver dois, um deles não é o
principal.

| Variante | Cor | Quando |
|---|---|---|
| `primaria` | Azul sólido | Ação padrão: salvar, entrar, confirmar, criar |
| `cta` | Amarelo sólido | A ação principal da tela ("+ Novo tutor", "+ Agendar visita") |
| `contorno` | Azul de contorno | Ação secundária ao lado de uma primária |
| `neutra` | Cinza de contorno | Cancelar, fechar, voltar |
| `perigo` | Vermelho de contorno | Excluir, cancelar assinatura |
| `texto` / `textoPerigo` | Link | Ação terciária dentro de uma linha de lista |

O botão de CTA vira `neutra` quando o formulário que ele abre está aberto —
naquele momento ele só cancela, e não faz sentido continuar sendo a ação mais
chamativa da tela.

## Tons de status

Todos os mapas de status do app (agenda, cobrança, assinatura, serviço) apontam
para os mesmos cinco tons, então "pago", "confirmado" e "ativa" têm exatamente
o mesmo verde em qualquer tela.

| Tom | Cor | Significado | Exemplos |
|---|---|---|---|
| `neutro` | Cinza | Estado sem ação pendente | agendado, cancelado, isento, inativo |
| `info` | Azul | Em andamento, sob controle | pronto p/ busca, processando |
| `sucesso` | Verde | Resolvido | confirmado, entregue, pago, ativa |
| `atencao` | Amarelo | **Precisa de alguém** | aguardando pagamento, cadastro pendente, pausada, reagendado |
| `erro` | Vermelho | Deu errado | falhou, estornado, faltou |

Duas mudanças de semântica que vieram junto com a paleta:

- **"Pendente" saiu do vermelho e foi pro amarelo.** Cadastro incompleto e
  assinatura pausada são tarefas em aberto, não falhas.
- **"Inativo" saiu do vermelho e foi pro cinza.** Desligar um serviço é uma
  escolha do petshop. O vermelho ficou reservado pra coisa que quebrou.

---

## Contraste medido (WCAG 2.1)

Todas as combinações em uso, verificadas:

| Combinação | Ratio | Mínimo |
|---|---|---|
| Botão primário (branco / `brand-500`) | 5,42:1 | 4,5 ✅ |
| Botão primário hover (branco / `brand-600`) | 7,08:1 | 4,5 ✅ |
| Botão CTA (`ink-900` / `cta-500`) | 10,12:1 | 4,5 ✅ |
| Botão CTA hover (`ink-900` / `cta-600`) | 6,83:1 | 4,5 ✅ |
| Botão contorno (`brand-700` / branco) | 9,35:1 | 4,5 ✅ |
| Botão perigo (`danger-600` / branco) | 5,47:1 | 4,5 ✅ |
| Título (`ink-900` / `surface`) | 15,57:1 | 4,5 ✅ |
| Texto auxiliar (`ink-500` / `surface`) | 7,18:1 | 4,5 ✅ |
| Item ativo do menu (`brand-700` / `brand-50`) | 8,29:1 | 4,5 ✅ |
| Badge sucesso (`success-700` / `success-50`) | 6,51:1 | 4,5 ✅ |
| Badge atenção (`cta-700` / `cta-50`) | 5,34:1 | 4,5 ✅ |
| Badge erro (`danger-600` / `danger-50`) | 5,11:1 | 4,5 ✅ |
| Anel de foco (`brand-500` / `surface`) | 5,17:1 | 3,0 ✅ |

Para comparar, a paleta anterior tinha **branco sobre `#C99A3E` = 2,57:1** no
botão primário (reprovava AA) e **texto auxiliar em 4,41:1** (também reprovava,
por pouco, no token mais repetido do app).

---

## Logo

| Arquivo | Quando usar |
|---|---|
| `components/brand/Logo.tsx` | Dentro do app. SVG inline: sem request extra, nítido em qualquer tamanho, recolorível. |
| `public/petclub-logo.svg` | Fora do React — e-mail, WhatsApp, apresentação, assinatura. |
| `public/petclub-logo-branco.svg` | Mesma coisa, sobre fundo azul/escuro. |
| `public/petclub-symbol.svg` | Só o símbolo, quando o nome já aparece ao lado. |
| `app/icon.svg` | Favicon (convenção do App Router). |

```tsx
<Logo />                       // marca completa
<Logo tamanho="lg" />          // login e telas públicas
<Logo variante="simbolo" />    // só o símbolo
<Logo tom="branco" />          // sobre fundo azul
```

O círculo é `brand-500` — a mesma cor do botão primário, de propósito: a marca
e a ação principal do produto usam o mesmo azul, então a interface inteira lê
como uma coisa só. O símbolo herda `currentColor`, então dá pra recolorir pelo
texto do container sem editar o SVG.

## Tipografia

- **Fraunces** (`font-display`) — títulos de página e de seção. Só em `h1`/`h2`,
  nunca no corpo.
- **Inter** (`font-sans`) — UI, corpo e o logotipo textual.
- **IBM Plex Mono** (`font-mono`) — dados: horários, valores, IDs. Já vem com
  `tabular-nums` (`app/globals.css`), então colunas de preço alinham.

## Regras de uso

- **Nunca escreva um `#` fora de `lib/design/tokens.ts`.** Se precisar de uma
  cor que não existe, adicione o token — não improvise no componente.
- **Nunca monte a classe de um botão à mão.** Use `botao()`. O mesmo vale para
  badge (`badge()`), alerta (`alerta()`), input (`formulario.input`), card
  (`superficie.*`) e tabela (`tabela.*`).
- **Amarelo nunca com texto branco.**
- Um CTA amarelo por tela.
- Foco de teclado sempre visível — o anel global está em `app/globals.css` e
  vale para todo elemento interativo.
- Estado vazio sempre explica o que vai aparecer ali, nunca só "em breve".
