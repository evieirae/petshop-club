import { Badge } from "@/components/ui/Badge";
import { LogoutButton } from "./LogoutButton";
import type { Petshop, UsuarioPetshop } from "@/types/database";

export function Topbar({
  usuario,
  petshop,
  ehAdminPlataforma,
}: {
  usuario: UsuarioPetshop;
  petshop: Petshop;
  // Migration 0017 — vem de admins_plataforma (lib/auth/getAdminContext.ts),
  // não mais de uma coluna em usuarios_petshop. Resolvido em
  // app/(app)/layout.tsx, que já checa isso pro Sidebar.
  ehAdminPlataforma: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-border bg-surface-card/95 px-6 py-3 backdrop-blur">
      <div>
        <p className="text-sm font-medium text-ink-900">{petshop.nome}</p>
        <p className="flex items-center gap-2 text-xs text-ink-500">
          <span>
            {usuario.nome} · {usuario.papel === "dono" ? "Dono(a)" : "Atendente"}
          </span>
          {ehAdminPlataforma && (
            <Badge tom="info" className="uppercase tracking-wide">
              Admin
            </Badge>
          )}
        </p>
      </div>
      <LogoutButton />
    </header>
  );
}
