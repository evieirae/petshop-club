import { cx } from "@/lib/ui/styles";

/**
 * Ilustrações de pets, em SVG inline.
 *
 * POR QUE ISSO EXISTE: a home precisa de fofura pra convidar o tutor a
 * marcar (referência que o Eduardo passou: bichodeluxo.com.br), mas o
 * projeto não tem banco de fotos e usar foto de terceiro sem licença não é
 * opção. Estas ilustrações são o piso: a página já nasce simpática sem
 * nenhum arquivo em public/fotos/, e quando as fotos reais dos petshops
 * parceiros entrarem, elas cobrem as ilustrações sem mudar código.
 *
 * Nenhuma cor literal aqui — tudo sai das classes de token (fill-brand-100,
 * fill-cta-100, …), então trocar a identidade em lib/design/tokens.ts muda
 * os bichinhos junto.
 *
 * São decorativas: `aria-hidden` em todas, sempre. Quem precisa do
 * significado lê o texto ao lado.
 */

export function Cachorro({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      {/* orelhas caídas — o que faz um círculo virar cachorro */}
      <ellipse className="fill-brand-500" cx="26" cy="66" rx="13" ry="24" transform="rotate(-14 26 66)" />
      <ellipse className="fill-brand-500" cx="94" cy="66" rx="13" ry="24" transform="rotate(14 94 66)" />
      <circle className="fill-cta-100" cx="60" cy="60" r="38" />
      {/* topete */}
      <ellipse className="fill-cta-500" cx="60" cy="26" rx="14" ry="9" />
      <circle className="fill-ink-900" cx="47" cy="55" r="4.5" />
      <circle className="fill-ink-900" cx="73" cy="55" r="4.5" />
      {/* bochechas rosadas */}
      <circle className="fill-danger-100" cx="36" cy="68" r="6" />
      <circle className="fill-danger-100" cx="84" cy="68" r="6" />
      <ellipse className="fill-surface-card" cx="60" cy="74" rx="18" ry="13" />
      <ellipse className="fill-ink-900" cx="60" cy="68" rx="6" ry="4.5" />
      <path
        className="stroke-ink-900"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        d="M60 72v5m0 0c0 3.5-4 5-6.5 3.2M60 77c0 3.5 4 5 6.5 3.2"
      />
      {/* línguinha */}
      <path className="fill-danger-100" d="M55 82h10v6a5 5 0 0 1-10 0z" />
    </svg>
  );
}

export function Gato({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      {/* orelhas em triângulo — o oposto exato das do cachorro, pra dar pra
          distinguir os dois de relance mesmo em 40px */}
      <path className="fill-progress-500" d="M26 44 30 14l26 16z" />
      <path className="fill-progress-500" d="M94 44 90 14 64 30z" />
      <path className="fill-danger-100" d="M33 40l2.5-17 15 9z" />
      <path className="fill-danger-100" d="M87 40l-2.5-17-15 9z" />
      <circle className="fill-brand-100" cx="60" cy="62" r="38" />
      <ellipse className="fill-ink-900" cx="46" cy="58" rx="3.5" ry="5.5" />
      <ellipse className="fill-ink-900" cx="74" cy="58" rx="3.5" ry="5.5" />
      <circle className="fill-danger-100" cx="34" cy="70" r="6" />
      <circle className="fill-danger-100" cx="86" cy="70" r="6" />
      <path className="fill-danger-500" d="M55 71h10l-5 6z" />
      <path
        className="stroke-ink-900"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        d="M60 78c-2.5 3-7 2.5-8.5 0M60 78c2.5 3 7 2.5 8.5 0"
      />
      {/* bigodes */}
      <path
        className="stroke-ink-400"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        d="M40 68H22M42 74l-18 6M80 68h18M78 74l18 6"
      />
    </svg>
  );
}

/** Patinha sozinha — usada como marcador de lista e no padrão de fundo. */
export function Patinha({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="24.5" cy="41" rx="7.6" ry="10" transform="rotate(-24 24.5 41)" />
      <ellipse cx="40.3" cy="29.5" rx="7.6" ry="11" transform="rotate(-8 40.3 29.5)" />
      <ellipse cx="59.7" cy="29.5" rx="7.6" ry="11" transform="rotate(8 59.7 29.5)" />
      <ellipse cx="75.5" cy="41" rx="7.6" ry="10" transform="rotate(24 75.5 41)" />
      <path d="M50 82.5c-3.2-1.6-19.5-11.6-19.5-22.2 0-6.5 4.9-11.1 10.6-11.1 4.4 0 7.8 2.7 8.9 6.5 1.1-3.8 4.5-6.5 8.9-6.5 5.7 0 10.6 4.6 10.6 11.1 0 10.6-16.3 20.6-19.5 22.2Z" />
    </svg>
  );
}

/**
 * Trilha de patinhas de fundo. Fica atrás do conteúdo, bem apagada — é
 * textura, não desenho: se alguém reparar nela, está forte demais.
 */
export function TrilhaDePatinhas({ className }: { className?: string }) {
  const patas = [
    { x: 4, y: 18, r: -18 },
    { x: 17, y: 62, r: 12 },
    { x: 31, y: 26, r: -8 },
    { x: 45, y: 70, r: 20 },
    { x: 58, y: 22, r: -14 },
    { x: 72, y: 66, r: 6 },
    { x: 86, y: 30, r: -22 },
  ];

  return (
    <div className={cx("pointer-events-none select-none", className)} aria-hidden="true">
      {patas.map(({ x, y, r }) => (
        // Posição em % pra trilha acompanhar a largura da seção em vez de
        // amontoar num canto quando a tela é estreita.
        <Patinha
          key={`${x}-${y}`}
          className="absolute h-10 w-10"
          style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${r}deg)` }}
        />
      ))}
    </div>
  );
}
