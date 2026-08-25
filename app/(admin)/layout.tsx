import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { AdminSidebar } from "@/components/nav/AdminSidebar";
import { LogoutButton } from "@/components/nav/LogoutButton";

// Casca da área /admin — irmã de app/(app), não uma sub-tela dela. Guard
// próprio, sem depender de petshop nenhum (ver
// supabase/migrations/0017_admin_plataforma_independente.sql e
// lib/auth/getAdminContext.ts).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sem sessao: manda pro login, igual ao resto do app.
  if (!user) {
    redirect("/login");
  }

  const admin = await getAdminContext();

  // Logado, mas sem linha em admins_plataforma — não é admin da
  // plataforma. Volta pro app normal (que decide, pelo próprio contexto,
  // se essa pessoa tem petshop vinculado ou cai em "Acesso pendente").
  if (!admin) {
    redirect("/painel");
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-border bg-surface-card/95 px-6 py-3 backdrop-blur">
          <div>
            <p className="text-sm font-medium text-ink-900">{admin.nome}</p>
            <p className="text-xs text-ink-500">Administração da plataforma</p>
          </div>
          <LogoutButton />
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
