import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

export function NavCard({
  href,
  icon: Icon,
  titulo,
  descricao,
}: {
  href: string;
  icon: LucideIcon;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-surface-border bg-surface-card p-5 transition hover:border-club"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-club-light text-club-dark">
          <Icon size={18} aria-hidden="true" />
        </div>
        <ArrowUpRight
          size={16}
          className="text-ink-500 opacity-0 transition group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>
      <div>
        <p className="font-medium text-ink-900">{titulo}</p>
        <p className="mt-0.5 text-sm text-ink-500">{descricao}</p>
      </div>
    </Link>
  );
}
