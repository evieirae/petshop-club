/**
 * ============================================================================
 *  PETCLUB — RECEITAS DE ESTILO COMPARTILHADAS
 * ============================================================================
 *
 * Todo botão, lista, card, badge e input do app monta sua classe a partir
 * daqui. As cores vêm de lib/design/tokens.ts (via classes do Tailwind); este
 * arquivo define COMO elas se combinam.
 *
 * Por que existe: antes da refatoração a mesma string
 * "rounded-lg bg-club px-4 py-2 text-sm font-medium text-white ..." aparecia
 * copiada em 8 lugares. Mudar o botão primário significava caçar 8 arquivos.
 * Agora é `botao()` — muda aqui, muda no app inteiro.
 *
 * São só strings, sem "use client": funciona em Server e Client Component.
 *
 * ---------------------------------------------------------------------------
 *  HIERARQUIA DE AÇÃO (a regra que este arquivo codifica)
 * ---------------------------------------------------------------------------
 *  primaria  azul     ação padrão: salvar, entrar, confirmar, criar
 *  cta       amarelo  UMA por tela, a ação que o dono do petshop mais faz
 *  contorno  azul     ação secundária ao lado de uma primária
 *  neutra    cinza    cancelar, fechar, voltar
 *  perigo    vermelho excluir, cancelar assinatura (destrutivo, confirmado)
 *  texto     link     ação terciária dentro de uma linha de lista
 */

/** Junta classes ignorando `false`/`undefined` — evita `clsx` como dependência. */
export function cx(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(" ");
}

/* ==========================================================================
 *  BOTÕES
 * ======================================================================== */

export type VarianteBotao =
  | "primaria"
  | "cta"
  | "contorno"
  | "neutra"
  | "perigo"
  | "texto"
  | "textoPerigo";

export type TamanhoBotao = "sm" | "md" | "lg";

const BOTAO_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const BOTAO_VARIANTE: Record<VarianteBotao, string> = {
  /** Azul Confiança. Branco sobre brand.500 = 5.4:1 (AA). */
  primaria: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700",

  /**
   * Amarelo Ocre. SEMPRE com texto ink.900 (10.0:1) — texto branco aqui daria
   * 1.8:1 e reprovaria em qualquer nível de acessibilidade.
   */
  cta: "bg-cta-500 text-ink-900 hover:bg-cta-600 active:bg-cta-600",

  contorno:
    "border border-brand-200 bg-surface-card text-brand-700 hover:border-brand-500 hover:bg-brand-50",

  neutra:
    "border border-surface-border bg-surface-card text-ink-700 hover:bg-surface-muted hover:text-ink-900",

  perigo:
    "border border-danger-100 bg-surface-card text-danger-600 hover:border-danger-500 hover:bg-danger-50",

  texto: "text-brand-700 hover:text-brand-500 hover:underline",

  /** Ação destrutiva terciária, dentro de uma linha de lista ("Remover pet"). */
  textoPerigo: "text-danger-600 hover:text-danger-700 hover:underline",
};

const BOTAO_TAMANHO: Record<TamanhoBotao, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

/**
 * Classe de botão. Use em <button>, <a> e <Link> — o visual é o mesmo.
 *
 *   <button className={botao()}>Salvar</button>
 *   <button className={botao({ variante: "cta", tamanho: "lg" })}>Novo agendamento</button>
 *   <button className={botao({ variante: "perigo", tamanho: "sm" })}>Excluir</button>
 *   <button className={botao({ largura: "cheia" })}>Entrar</button>
 */
export function botao(opcoes?: {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  /** "cheia" ocupa 100% da largura — usado em formulário de coluna única. */
  largura?: "auto" | "cheia";
  className?: string;
}): string {
  const {
    variante = "primaria",
    tamanho = "md",
    largura = "auto",
    className,
  } = opcoes ?? {};

  // As variantes de texto são links disfarçados: sem padding de caixa nem fundo.
  const ehTexto = variante === "texto" || variante === "textoPerigo";
  const dimensao = ehTexto
    ? tamanho === "sm"
      ? "text-xs"
      : "text-sm"
    : BOTAO_TAMANHO[tamanho];

  return cx(
    BOTAO_BASE,
    BOTAO_VARIANTE[variante],
    dimensao,
    largura === "cheia" && "w-full",
    className,
  );
}

/* ==========================================================================
 *  SUPERFÍCIES
 * ======================================================================== */

export const superficie = {
  /** Card padrão: seção de formulário, bloco de conteúdo. */
  card: "rounded-xl border border-surface-border bg-surface-card shadow-card",
  /** Card com padding já aplicado — o caso mais comum. */
  cardPadded: "rounded-xl border border-surface-border bg-surface-card p-6 shadow-card",
  /** Card clicável (NavCard, item de grade). */
  cardInterativo:
    "rounded-xl border border-surface-border bg-surface-card shadow-card transition-colors " +
    "hover:border-brand-300 hover:bg-brand-50/40",
  /**
   * Bloco de edição embutido — o "formulário aberto dentro da lista".
   * Antes era tracejado dourado; agora é azul suave, que separa sem gritar.
   */
  blocoEdicao: "rounded-xl border border-brand-200 bg-brand-50/60 p-5",
  /** Painel de destaque neutro (resumos, totais). */
  painel: "rounded-xl border border-surface-border bg-surface-muted p-5",
  /** Estado vazio. */
  vazio:
    "rounded-xl border border-dashed border-surface-strong bg-surface-card px-8 py-12 text-center",
} as const;

/* ==========================================================================
 *  LISTAS E TABELAS
 * ======================================================================== */

export const lista = {
  /** Container de lista com divisores — use com `lista.item` nos filhos. */
  container: "divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card",
  /** Linha de lista clicável. */
  item: "flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted",
  /** Linha de lista selecionada. */
  itemAtivo: "bg-brand-50 hover:bg-brand-50",
  /** Cabeçalho de grupo dentro da lista. */
  cabecalhoGrupo:
    "bg-surface-muted px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink-500",
} as const;

export const tabela = {
  wrapper: "overflow-x-auto rounded-xl border border-surface-border bg-surface-card shadow-card",
  raiz: "w-full text-left text-sm",
  cabecalho: "border-b border-surface-border bg-surface-muted",
  th: "px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-500",
  linha: "border-b border-surface-border last:border-0 transition-colors hover:bg-surface-muted",
  td: "px-4 py-3 text-ink-700",
  /** Célula de número/valor/horário — mono + tabular-nums (ver globals.css). */
  tdNumero: "px-4 py-3 text-right font-mono text-ink-900",
} as const;

/* ==========================================================================
 *  BADGES DE STATUS
 * ======================================================================== */

export type TomBadge = "neutro" | "info" | "sucesso" | "atencao" | "erro";

const BADGE_TOM: Record<TomBadge, string> = {
  neutro: "bg-surface-muted text-ink-500",
  info: "bg-brand-50 text-brand-700",
  sucesso: "bg-success-50 text-success-700",
  atencao: "bg-cta-50 text-cta-700",
  erro: "bg-danger-50 text-danger-600",
};

const BADGE_BASE = "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium";

/**
 * Só o par fundo+texto de cada tom, sem forma nem espaçamento.
 * Serve pra pintar algo que não é badge mas precisa da mesma cor de status —
 * o chip de agendamento dentro da grade da semana, por exemplo.
 */
export const tomCores: Record<TomBadge, string> = BADGE_TOM;

/**
 * Badge de status. Todo mapa de status do app (agenda, cobrança, assinatura,
 * serviço) aponta pra estes 5 tons — assim "pago", "confirmado" e "ativa"
 * têm exatamente o mesmo verde em qualquer tela.
 */
export function badge(tom: TomBadge = "neutro", className?: string): string {
  return cx(BADGE_BASE, BADGE_TOM[tom], className);
}

/**
 * Ponto colorido antes do texto do badge, quando o status pede ação.
 *
 * Usa o tom .700/.600 e não o .500: o ponto vive sobre o fundo .50 do próprio
 * badge, e o Verde Menta e o Amarelo Ocre puros dão 3.1:1 e 2.3:1 ali — abaixo
 * do mínimo de 3:1 do WCAG 1.4.11 para elemento gráfico.
 */
export function pontoStatus(tom: TomBadge): string {
  const cores: Record<TomBadge, string> = {
    neutro: "bg-ink-500",
    info: "bg-brand-500",
    sucesso: "bg-success-700",
    atencao: "bg-cta-700",
    erro: "bg-danger-500",
  };
  return cx("h-1.5 w-1.5 shrink-0 rounded-full", cores[tom]);
}

/* ==========================================================================
 *  FORMULÁRIOS
 * ======================================================================== */

export const formulario = {
  /** Input, select e textarea — a mesma classe nos três. */
  input:
    "w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-ink-900 " +
    "transition-colors placeholder:text-ink-400 hover:border-surface-strong " +
    "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
  /** Input com erro — borda vermelha, mas o texto do erro é que informa. */
  inputErro: "border-danger-500 hover:border-danger-500",
  label: "mb-1 block text-sm font-medium text-ink-700",
  dica: "mt-1 text-xs text-ink-500",
  erro: "mt-1 text-xs text-danger-600",
} as const;

/* ==========================================================================
 *  MENSAGENS EM BLOCO (alertas)
 * ======================================================================== */

export type TomAlerta = "info" | "sucesso" | "atencao" | "erro";

const ALERTA_TOM: Record<TomAlerta, string> = {
  info: "border-brand-100 bg-brand-50 text-brand-700",
  sucesso: "border-success-100 bg-success-50 text-success-700",
  atencao: "border-cta-100 bg-cta-50 text-cta-700",
  erro: "border-danger-100 bg-danger-50 text-danger-600",
};

/** Caixa de mensagem: erro de formulário, aviso de configuração pendente. */
export function alerta(tom: TomAlerta = "info", className?: string): string {
  return cx("rounded-lg border px-3 py-2 text-sm", ALERTA_TOM[tom], className);
}

/* ==========================================================================
 *  TIPOGRAFIA DE PÁGINA
 * ======================================================================== */

export const texto = {
  tituloPagina: "font-display text-2xl text-ink-900",
  tituloSecao: "font-display text-lg text-ink-900",
  subtitulo: "mt-1 text-sm text-ink-500",
  rotulo: "text-xs font-medium uppercase tracking-wide text-ink-500",
  /** Valores, horários e IDs. */
  dado: "font-mono text-ink-900",
} as const;
