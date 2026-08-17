import { Badge } from "@/components/ui/Badge";
import { LogoutButton } from "./LogoutButton";
import type { Petshop, UsuarioPetshop } from "@/types/database";

export function Topbar({
  usuario,
  petshop,
}: {
  usuario: UsuarioPetshop;
  petshop: Petshop;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-border bg-surface-card/95 px-6 py-3 backdrop-blur">
      <div>
        <p className="text-sm font-medium text-ink-900">{petshop.nome}</p>
        <p className="flex items-center gap-2 text-xs text-ink-500">
          <span>
            {usuario.nome} · {usuario.papel === "dono" ? "Dono(a)" : "Atendente"}
          </span>
          {usuario.eh_admin_plataforma && (
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
