/**
 * ============================================================================
 *  PETCLUB — FONTE ÚNICA DE VERDADE DAS CORES
 * ============================================================================
 *
 * Este é o ÚNICO arquivo onde valores de cor existem no projeto.
 *
 *   - `tailwind.config.ts` importa daqui e gera as classes (bg-brand-500, ...)
 *     e as CSS variables por tema (--color-brand-500, ...) em
 *     `:root[data-tema="..."]`.
 *   - `lib/ui/styles.ts` monta as receitas de botão/lista/badge com essas classes.
 *   - `lib/design/tema.ts` decide QUAL tema está ativo (cookie) e injeta o
 *     atributo `data-tema` em `<html>` no layout raiz.
 *
 * Para mudar a identidade visual do app inteiro, mude AQUI. Nenhum componente,
 * página ou CSS carrega hex solto — se você precisar escrever um `#` fora deste
 * arquivo, é sinal de que falta um token.
 *
 * (Exceção: os SVGs de public/ e app/icon.svg, e lib/email/templates.ts, que
 * são servidos/enviados fora do build do Tailwind e portanto não conseguem ler
 * CSS variable nenhuma — carregam o tema padrão (ver TEMA_PADRAO) hardcoded.
 * Se o brand.500 do tema padrão mudar, atualize-os junto.)
 *
 * ---------------------------------------------------------------------------
 *  4 TEMAS (16/set/2026 — pedido do Eduardo: quero a troca de tema também)
 * ---------------------------------------------------------------------------
 * O app tinha uma única paleta fixa (Azul Confiança) até esta mudança. Agora
 * existem 4 temas completos, trocáveis em runtime (ver ThemeSwitcher):
 *
 *   ardosia  (padrão) — verde-petróleo + dourado, sobre fundo claro.
 *             Mesmo espírito de contraste alto / superfície clara do sistema
 *             anterior — pensado pro uso no balcão, tablet, luz de loja.
 *   vinho    — vinho + dourado, sobre fundo claro. Mesma base de superfície e
 *              mesmos tons de status que ardosia (só o brand muda).
 *   escuro   — a mesma dupla verde-petróleo/dourado, só que invertida pra
 *              fundo escuro. Pensado pra quem fecha o caixa tarde.
 *   marinho  — azul-marinho + dourado, sobre fundo escuro. Mesma base de
 *              superfície e status que escuro (só o brand muda).
 *
 * Cada tema tem a MESMA forma de objeto (`Palette`) — os componentes nunca
 * sabem qual tema está ativo, só usam `bg-brand-500`, `text-ink-700` etc.,
 * que resolvem pra CSS variables diferentes conforme `[data-tema]` em <html>.
 *
 * IMPORTANTE — `ctaInk` e `brandContrast` NÃO são iguais a `ink.900`/branco
 * fixos: em ardosia/vinho (temas claros) o texto sobre um preenchimento
 * sólido de marca é branco e sobre o CTA é escuro — igual ao sistema antigo.
 * Em escuro/marinho (temas escuros) o `ink.900` do tema é CLARO (pra ler
 * sobre fundo escuro), então um botão de preenchimento sólido de marca ou
 * CTA (que continuam sendo blocos "claros" mesmo dentro de um tema escuro)
 * precisa de um texto ESCURO próprio — por isso os dois tokens existem
 * separados do resto da escala `ink`. Nunca escreva `text-ink-900` num botão
 * de preenchimento sólido — use `text-brand-contrast` ou `text-cta-ink`.
 *
 * ---------------------------------------------------------------------------
 *  COMO AS RAMPAS FORAM GERADAS
 * ---------------------------------------------------------------------------
 * Cada tema define, à mão (a partir do canvas de design), só as âncoras:
 * brand.500, cta.500 (+ o texto fixo de cada um), bg/card/border/ink e o par
 * bg+texto de cada tom de status (sucesso/progresso/info/erro). O resto da
 * rampa (50–900, e os degraus 100/600 de cada status) foi GERADO por script
 * (scripts locais, fora do repo) medindo, na paleta antiga (Azul Confiança),
 * o quanto de branco/preto cada degrau tinha misturado no seu 500 — e
 * aplicando a mesma mistura na âncora nova. Nos temas escuros a direção da
 * mistura é invertida (tint vira mistura-com-preto, shade vira
 * mistura-com-branco), senão um "brand-50" saía quase-branco flutuando sobre
 * um app de fundo escuro. Todo resultado foi conferido contra WCAG 2.1 (ver
 * tabela em docs/design-tokens.md) e ajustado onde ficou abaixo do mínimo.
 */

export const temas = ["ardosia", "vinho", "escuro", "marinho"] as const;
export type Tema = (typeof temas)[number];
export const TEMA_PADRAO: Tema = "ardosia";

export const TEMA_COOKIE = "petclub-tema";

export const NOME_TEMA: Record<Tema, string> = {
  ardosia: "Ardósia",
  vinho: "Vinho",
  escuro: "Escuro",
  marinho: "Marinho",
};

export const paletas = {
  ardosia: {
    brand: {
      "50": "#ECF0EF",
      "100": "#D8E0DF",
      "200": "#AABCBA",
      "300": "#7C9794",
      "400": "#496F6B",
      "500": "#14453F",
      "600": "#113A35",
      "700": "#0D2E2A",
      "800": "#0A2320",
      "900": "#071715",
    },
    success: {
      "50": "#E7F1E6",
      "100": "#BED0C0",
      "500": "#72937A",
      "600": "#51785B",
      "700": "#2B5A38",
    },
    cta: {
      "50": "#FCF8F0",
      "100": "#F7E9D0",
      "500": "#D6900F",
      "600": "#B87C0D",
      "700": "#634207",
    },
    ctaInk: "#241F1A",
    danger: {
      "50": "#FBEAE7",
      "100": "#DFC1BB",
      "500": "#AC756A",
      "600": "#955446",
      "700": "#7C2E1E",
    },
    progress: {
      "50": "#F0E9F3",
      "100": "#CBC1D3",
      "500": "#897999",
      "600": "#6B587F",
      "700": "#4A3462",
    },
    info: {
      "50": "#EBF2F7",
      "100": "#BFD0DC",
      "500": "#6A8EA8",
      "600": "#4D7896",
      "700": "#25597E",
    },
    ink: {
      "400": "#B4AE9F",
      "500": "#777064",
      "700": "#59534A",
      "900": "#211E19",
    },
    surface: {
      DEFAULT: "#FAFAF7",
      card: "#FFFFFF",
      muted: "#F4F5F0",
      border: "#E4E7DF",
      strong: "#D1D6C9",
    },
    brandContrast: "#FFFFFF",
  },
  vinho: {
    brand: {
      "50": "#F4EDEF",
      "100": "#E9DBDF",
      "200": "#CFB1BA",
      "300": "#B58795",
      "400": "#98586B",
      "500": "#7A2740",
      "600": "#662136",
      "700": "#521A2B",
      "800": "#3E1420",
      "900": "#290D16",
    },
    success: {
      "50": "#E7F1E6",
      "100": "#BED0C0",
      "500": "#72937A",
      "600": "#51785B",
      "700": "#2B5A38",
    },
    cta: {
      "50": "#FCF8F0",
      "100": "#F7E9D0",
      "500": "#D6900F",
      "600": "#B87C0D",
      "700": "#634207",
    },
    ctaInk: "#241F1A",
    danger: {
      "50": "#FBEAE7",
      "100": "#DFC1BB",
      "500": "#AC756A",
      "600": "#955446",
      "700": "#7C2E1E",
    },
    progress: {
      "50": "#F0E9F3",
      "100": "#CBC1D3",
      "500": "#897999",
      "600": "#6B587F",
      "700": "#4A3462",
    },
    info: {
      "50": "#EBF2F7",
      "100": "#BFD0DC",
      "500": "#6A8EA8",
      "600": "#4D7896",
      "700": "#25597E",
    },
    ink: {
      "400": "#BBA9A6",
      "500": "#7F6F6C",
      "700": "#5C4E4C",
      "900": "#241C1B",
    },
    surface: {
      DEFAULT: "#FAF8F7",
      card: "#FFFFFF",
      muted: "#F5EFEE",
      border: "#E9DEDC",
      strong: "#DAC7C4",
    },
    brandContrast: "#FFFFFF",
  },
  escuro: {
    brand: {
      "50": "#080F0D",
      "100": "#101E1A",
      "200": "#224138",
      "300": "#356457",
      "400": "#498A79",
      "500": "#5FB39C",
      "600": "#79BFAC",
      "700": "#93CCBC",
      "800": "#AED9CD",
      "900": "#C9E5DD",
    },
    success: {
      "50": "#1E3323",
      "100": "#37573D",
      "500": "#64996D",
      "600": "#78B683",
      "700": "#8FD79B",
    },
    cta: {
      "50": "#0E0A04",
      "100": "#2D210B",
      "500": "#E8A93A",
      "600": "#EDBD68",
      "700": "#F4D7A4",
    },
    ctaInk: "#1E1810",
    danger: {
      "50": "#332019",
      "100": "#5A3931",
      "500": "#A0665B",
      "600": "#C07A6F",
      "700": "#E39184",
    },
    progress: {
      "50": "#2C2333",
      "100": "#4E4258",
      "500": "#8C799B",
      "600": "#A892B9",
      "700": "#C7AEDA",
    },
    info: {
      "50": "#1B3537",
      "100": "#2C5659",
      "500": "#4B9298",
      "600": "#59ADB4",
      "700": "#69CBD3",
    },
    ink: {
      "400": "#6C6858",
      "500": "#9B9686",
      "700": "#CBC7BB",
      "900": "#F3F1EA",
    },
    surface: {
      DEFAULT: "#171915",
      card: "#1F2320",
      muted: "#262B26",
      border: "#333A33",
      strong: "#454F45",
    },
    brandContrast: "#0E1613",
  },
  marinho: {
    brand: {
      "50": "#070D12",
      "100": "#0F1A24",
      "200": "#21384E",
      "300": "#335678",
      "400": "#4678A7",
      "500": "#5B9BD8",
      "600": "#76ABDE",
      "700": "#91BCE5",
      "800": "#ACCCEB",
      "900": "#C7DDF2",
    },
    success: {
      "50": "#1E3323",
      "100": "#37573D",
      "500": "#64996D",
      "600": "#78B683",
      "700": "#8FD79B",
    },
    cta: {
      "50": "#0E0A04",
      "100": "#2D210B",
      "500": "#E8A93A",
      "600": "#EDBD68",
      "700": "#F4D7A4",
    },
    ctaInk: "#1E1810",
    danger: {
      "50": "#332019",
      "100": "#5A3931",
      "500": "#A0665B",
      "600": "#C07A6F",
      "700": "#E39184",
    },
    progress: {
      "50": "#2C2333",
      "100": "#4E4258",
      "500": "#8C799B",
      "600": "#A892B9",
      "700": "#C7AEDA",
    },
    info: {
      "50": "#1B3537",
      "100": "#2C5659",
      "500": "#4B9298",
      "600": "#59ADB4",
      "700": "#69CBD3",
    },
    ink: {
      "400": "#546882",
      "500": "#8497AE",
      "700": "#B9C6D9",
      "900": "#EDF2F8",
    },
    surface: {
      DEFAULT: "#0F1C2E",
      card: "#16263D",
      muted: "#1C2E48",
      border: "#2A3F5C",
      strong: "#365177",
    },
    brandContrast: "#0B1622",
  },
} as const;

/**
 * Paleta do tema padrão — único uso legítimo de "palette" fora de um
 * contexto com `data-tema` resolvido: SVGs estáticos, e-mail, e o
 * `themeColor` do viewport (que o navegador não consegue trocar em runtime).
 */
export const palette = paletas[TEMA_PADRAO];

/**
 * Raios, sombras e outros tokens não-cromáticos que as receitas usam.
 * Não variam por tema.
 */
export const shape = {
  radius: {
    control: "0.5rem", // botões, inputs, chips  → rounded-lg
    card: "0.75rem", // cards e blocos           → rounded-xl
    pill: "9999px", // badges de status          → rounded-pill
  },
  shadow: {
    card: "0 1px 2px 0 rgb(26 32 44 / 0.04)",
    raised: "0 4px 12px -2px rgb(26 32 44 / 0.10)",
  },
} as const;

export type Palette = (typeof paletas)[Tema];
