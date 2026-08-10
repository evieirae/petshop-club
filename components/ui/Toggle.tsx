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
  return (
    <div className="flex overflow-hidden rounded-lg border border-surface-border">
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(true)}
        className={`flex-1 px-3 py-2 text-sm font-medium transition ${
          checked
            ? "bg-club text-white"
            : "bg-surface-card text-ink-700 hover:bg-surface"
        }`}
      >
        {labelOn}
      </button>
      <button
        type="button"
        aria-pressed={!checked}
        onClick={() => onChange(false)}
        className={`flex-1 border-l border-surface-border px-3 py-2 text-sm font-medium transition ${
          !checked
            ? "bg-club text-white"
            : "bg-surface-card text-ink-700 hover:bg-surface"
        }`}
      >
        {labelOff}
      </button>
    </div>
  );
}
