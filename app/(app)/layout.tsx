import { Logo } from "@/components/brand/Logo";
import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { Sidebar } from "@/components/nav/Sidebar";
import { Topbar } from "@/components/nav/Topbar";
import { LogoutButton } from "@/components/nav/LogoutButton";
import { superficie } from "@/lib/ui/styles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const contexto = await getUsuarioContext();

  // Sem sessao: manda pro login.
  if (!contexto) {
    redirect("/login");
  }

  // Sessao valida, mas ninguem vinculou esse login a um petshop ainda
  // (usuarios_petshop sem linha correspondente) — acesso pendente, nao
  // um erro de autenticacao.
  if (!contexto.usuario || !contexto.petshop) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className={`max-w-sm text-center ${superficie.cardPadded}`}>
          <div className="mb-5 flex justify-center">
            <Logo tamanho="md" />
          </div>
          <h1 className="font-display text-xl text-ink-900">
            Acesso pendente
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Seu login existe, mas ainda não está vinculado a nenhum petshop.
            Peça pro dono do petshop te cadastrar em{" "}
            <code className="font-mono text-xs">usuarios_petshop</code>.
          </p>
          <div className="mt-6 flex justify-center">
            <LogoutButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar ehAdminPlataforma={contexto.usuario.eh_admin_plataforma} />
      <div className="flex flex-1 flex-col">
        <Topbar usuario={contexto.usuario} petshop={contexto.petshop} />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
