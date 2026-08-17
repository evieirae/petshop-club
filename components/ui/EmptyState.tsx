import { pontoStatus, superficie } from "@/lib/ui/styles";

export function EmptyState({
  titulo,
  descricao,
  itens,
}: {
  titulo: string;
  descricao: string;
  itens?: string[];
}) {
  return (
    <div className={superficie.vazio}>
      <h2 className="font-display text-xl text-ink-900">{titulo}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{descricao}</p>
      {itens && itens.length > 0 && (
        <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm text-ink-700">
          {itens.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className={`mt-1.5 ${pontoStatus("info")}`} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
