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
    <header className="flex items-center justify-between border-b border-surface-border bg-surface-card px-6 py-3">
      <div>
        <p className="text-sm font-medium text-ink-900">{petshop.nome}</p>
        <p className="text-xs text-ink-500">
          {usuario.nome} · {usuario.papel === "dono" ? "Dono(a)" : "Atendente"}
        </p>
      </div>
      <LogoutButton />
    </header>
  );
}
