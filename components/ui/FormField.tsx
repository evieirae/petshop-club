// Mesma classe usada no input do login (app/(auth)/login/page.tsx) — mantem
// os dois formularios do app com a mesma cara.
export const inputClass =
  "w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-ink-900 disabled:cursor-not-allowed disabled:opacity-60";

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  full,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-ink-700"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-pendente">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>
      )}
    </div>
  );
}
