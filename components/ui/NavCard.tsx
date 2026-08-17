import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cx, superficie } from "@/lib/ui/styles";

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
    <Link href={href} className={cx("group flex flex-col gap-3 p-5", superficie.cardInterativo)}>
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-500 group-hover:text-white">
          <Icon size={18} aria-hidden="true" />
        </div>
        <ArrowUpRight
          size={16}
          className="text-brand-500 opacity-0 transition-opacity group-hover:opacity-100"
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
