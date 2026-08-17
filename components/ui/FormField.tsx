import { cx, formulario } from "@/lib/ui/styles";

/**
 * Classe de input/select/textarea.
 *
 * Mantida como export nomeado porque as telas já importam `inputClass` daqui —
 * mas a definição de verdade mora em lib/ui/styles.ts (`formulario.input`).
 */
export const inputClass = formulario.input;

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
      <label htmlFor={htmlFor} className={formulario.label}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={formulario.erro} role="alert">
          {error}
        </p>
      ) : (
        hint && <p className={formulario.dica}>{hint}</p>
      )}
    </div>
  );
}

/** Input já com a classe padrão — em telas novas evita repetir o className. */
export function Input({
  erro,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { erro?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={erro || undefined}
      className={cx(formulario.input, erro && formulario.inputErro, className)}
    />
  );
}
