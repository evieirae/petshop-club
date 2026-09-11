import { cx } from "@/lib/ui/styles";

/**
 * Par de botões mutuamente exclusivos (sim/não, mensal/anual).
 * O lado selecionado usa o azul primário — mesma cor de "ação escolhida"
 * do resto do app.
 */
export function Toggle({
  checked,
  onChange,
  labelOn,
  labelOff,
}: {
  checked: boolean;
  onChange: (valor: boolean) => void;
  labelOn: string;
  labelOff: string;
}) {
  const base = "flex-1 px-3 py-2 text-sm font-medium transition-colors";
  const selecionado = "bg-brand-500 text-white";
  const naoSelecionado = "bg-surface-card text-ink-700 hover:bg-surface-muted-muted hover:text-ink-900";

  return (
    <div className="flex overflow-hidden rounded-lg border border-surface-border">
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(true)}
        className={cx(base, checked ? selecionado : naoSelecionado)}
      >
        {labelOn}
      </button>
      <button
        type="button"
        aria-pressed={!checked}
        onClick={() => onChange(false)}
        className={cx(base, "border-l border-surface-border", !checked ? selecionado : naoSelecionado)}
      >
        {labelOff}
      </button>
    </div>
  );
}
