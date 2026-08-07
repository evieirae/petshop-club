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
    <div className="rounded-xl border border-dashed border-surface-border bg-surface-card px-8 py-12 text-center">
      <h2 className="font-display text-xl text-ink-900">{titulo}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{descricao}</p>
      {itens && itens.length > 0 && (
        <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm text-ink-700">
          {itens.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-club" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
