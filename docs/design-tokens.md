# Identidade visual do painel

Referência rápida pra manter consistência conforme novas telas forem
entrando. Os valores reais vivem em `tailwind.config.ts` — isso aqui é só o
racional de cada escolha.

## Conceito

O produto é um clube de assinatura — a métrica que o dono do petshop mais
acompanha é literalmente "quantos carimbos o cliente já tem no mês". Por
isso o elemento de assinatura visual é o **carimbo**: um círculo com borda
tracejada, usado no selo do login/sidebar e reservado pra virar o badge de
status (confirmado/pendente) nas telas de agenda. Não é decoração — é o
mesmo vocabulário que o dono do petshop já usa mentalmente pro produto.

Evitei de propósito os três "defaults" mais comuns em UI gerada por IA:
fundo creme + terracota, fundo quase-preto + neon, e layout estilo jornal
com hairlines. Nenhum dos três tem relação com o domínio (banho, água,
petshop de bairro).

## Cores

| Token | Valor | Uso |
|---|---|---|
| `ink-900` | `#16302D` | Texto principal, títulos |
| `ink-700` | `#2E4A46` | Texto secundário |
| `ink-500` | `#5B7873` | Texto auxiliar, placeholders |
| `surface` | `#F3F6F4` | Fundo da página — neutro puxado pra um verde-água bem pálido, não creme |
| `surface-card` | `#FFFFFF` | Cards, inputs |
| `surface-border` | `#DDE3DF` | Bordas e divisores |
| `club` | `#C99A3E` | Ação primária — mel/mostarda, evoca shampoo e toalha |
| `club-dark` | `#A87E30` | Hover de ação primária |
| `club-light` | `#F1DFB4` | Fundo de destaque suave (item ativo no menu, etc.) |
| `confirmado` | `#4F7A5C` | Estados positivos (visita confirmada, pago) |
| `pendente` | `#B85C42` | Estados que precisam de atenção (não confirmado, falha) |

## Tipografia

- **Fraunces** (`font-display`) — títulos. Serifa com personalidade, mas
  usada com moderação (só em `h1`/títulos de seção), nunca no corpo do
  texto.
- **Inter** (`font-sans`) — UI e corpo. Neutra e legível em telas pequenas
  de balcão/tablet.
- **IBM Plex Mono** (`font-mono`) — dados: horários, valores, IDs. Reservei
  pra quando as telas reais mostrarem números tabulares (cobranças, agenda).

## Regras de uso

- O selo tracejado (carimbo) é o único elemento decorativo recorrente —
  não introduzir outros ícones/formas de assinatura visual sem necessidade.
- Estado vazio sempre explica o que vai aparecer ali, nunca só "em breve".
- Foco de teclado sempre visível (`ring-club`) — ver `app/globals.css`.
