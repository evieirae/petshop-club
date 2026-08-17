import { superficie, texto } from "@/lib/ui/styles";

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
    <section className={superficie.cardPadded}>
      <div className="mb-5 flex items-start gap-3">
        {/* O número da etapa é o "passo" do formulário — azul suave, não decoração. */}
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-brand-50 font-mono text-xs font-medium text-brand-700">
          {numero}
        </span>
        <div>
          <h2 className={texto.tituloSecao}>{titulo}</h2>
          {descricao && <p className="mt-0.5 text-sm text-ink-500">{descricao}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
