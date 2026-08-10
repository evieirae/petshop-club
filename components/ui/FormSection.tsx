export function FormSection({
  numero,
  titulo,
  descricao,
  children,
}: {
  numero: string;
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-surface-border bg-surface-card p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-stamp border border-dashed border-club font-mono text-xs text-club-dark">
          {numero}
        </span>
        <div>
          <h2 className="font-display text-lg text-ink-900">{titulo}</h2>
          {descricao && (
            <p className="mt-0.5 text-sm text-ink-500">{descricao}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
