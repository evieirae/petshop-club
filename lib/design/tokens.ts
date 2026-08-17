/**
 * ============================================================================
 *  PETCLUB — FONTE ÚNICA DE VERDADE DAS CORES
 * ============================================================================
 *
 * Este é o ÚNICO arquivo onde valores de cor existem no projeto.
 *
 *   - `tailwind.config.ts` importa daqui e gera as classes (bg-brand-500, ...)
 *   - o mesmo import gera as CSS variables em :root (--color-brand-500, ...)
 *   - `lib/ui/styles.ts` monta as receitas de botão/lista/badge com essas classes
 *
 * Para mudar a identidade visual do app inteiro, mude AQUI. Nenhum componente,
 * página ou CSS carrega hex solto — se você precisar escrever um `#` fora deste
 * arquivo, é sinal de que falta um token.
 *
 * (Exceção: os SVGs de public/ e app/icon.svg, que são servidos como arquivo e
 * portanto não passam pelo build. Se o brand.500 mudar, atualize-os junto.)
 *
 * ---------------------------------------------------------------------------
 *  PALETA BASE (as 4 cores da marca)
 * ---------------------------------------------------------------------------
 *  Azul Confiança   #2B6CB0  → brand.500   segurança, tecnologia, higiene
 *  Verde Menta      #48BB78  → success.500 bem-estar, saúde, vitalidade
 *  Cinza Claro      #F7FAFC  → surface.page limpeza, contraste, usabilidade
 *  Amarelo Ocre     #ECC94B  → cta.500     destaque, chamada pra ação
 *
 * Cada uma virou uma escala porque a cor "pura" quase nunca serve pros três
 * papéis que uma UI precisa: fundo suave, preenchimento sólido e texto legível.
 * Os tons de texto (`.700`) foram escolhidos para passar WCAG AA (4.5:1) sobre
 * o fundo `.50` correspondente — ver docs/design-tokens.md para a tabela de
 * contraste medida.
 */

export const palette = {
  /**
   * AZUL CONFIANÇA — ação primária.
   * Botão principal, item ativo do menu, foco de teclado, links, ícones.
   */
  brand: {
    50: "#EBF2FA", // fundo suave: item ativo do menu, chip, ícone em card
    100: "#D6E4F5", // hover de fundo suave, borda de destaque
    200: "#A9C6E8", // bordas, divisores com cor
    300: "#7BA8DB", // estados desabilitados de elementos coloridos
    400: "#4D8AC9", // hover sobre fundo escuro
    500: "#2B6CB0", // ★ Azul Confiança — botão primário, foco (branco: 5.4:1)
    600: "#245A94", // hover do botão primário
    700: "#1D4877", // pressed + texto azul sobre brand.50 (8.2:1)
    800: "#163659",
    900: "#0F243B",
  },

  /**
   * VERDE MENTA — estados positivos.
   * Confirmado, pago, ativo, salvo com sucesso.
   */
  success: {
    50: "#F0FFF4", // fundo do badge "confirmado"
    100: "#C6F6D5", // borda do badge
    500: "#48BB78", // ★ Verde Menta — preenchimentos, ícones, barras
    600: "#38A169", // hover
    700: "#276749", // texto verde: 6.7:1 no branco, 6.5:1 sobre success.50
  },

  /**
   * AMARELO OCRE — CTA e atenção.
   * REGRA: sempre com texto escuro (ink.900). Texto branco sobre ocre dá
   * 1.8:1 e reprova em qualquer nível de acessibilidade.
   */
  cta: {
    50: "#FFFBEB", // fundo de aviso
    100: "#FEF3C7", // borda de aviso
    500: "#ECC94B", // ★ Amarelo Ocre — botão de CTA (com ink.900: 10.0:1)
    600: "#D69E2E", // hover do CTA
    700: "#975A16", // texto âmbar sobre cta.50 (5.3:1)
  },

  /**
   * VERMELHO — erro e estados negativos.
   * Não estava no briefing, mas o app já usava um token de "pendente" pra
   * erro de formulário, falha de cobrança e "faltou". Vermelho é o único
   * sinal que o usuário lê como problema sem precisar ler o texto.
   */
  danger: {
    50: "#FFF5F5",
    100: "#FED7D7",
    500: "#E53E3E",
    600: "#C53030", // texto de erro (5.5:1 no branco)
    700: "#9B2C2C",
  },

  /**
   * TEXTO — cinza-azulado, para casar com o azul da marca.
   * ink.500 é o tom mais usado do app (texto auxiliar). Ficou em #4A5568
   * (7.2:1) e não no cinza médio óbvio #718096, que dá 3.9:1 e reprova AA.
   */
  ink: {
    900: "#1A202C", // títulos (15.4:1)
    700: "#2D3748", // texto de label, corpo forte (11.6:1)
    500: "#4A5568", // texto auxiliar, descrições (7.2:1)
    400: "#718096", // placeholder e ícone decorativo — nunca texto de conteúdo
  },

  /**
   * SUPERFÍCIES — o branco/cinza claro do briefing.
   */
  surface: {
    DEFAULT: "#F7FAFC", // ★ fundo da página
    card: "#FFFFFF", // cards, inputs, sidebar, topbar
    muted: "#EDF2F7", // linha zebrada de tabela, hover de lista, chip neutro
    border: "#E2E8F0", // bordas e divisores
    strong: "#CBD5E0", // borda em hover / divisor com mais peso
  },
} as const;

/**
 * Raios, sombras e outros tokens não-cromáticos que as receitas usam.
 * Ficam aqui pelo mesmo motivo: um lugar só pra mexer.
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

export type Palette = typeof palette;
