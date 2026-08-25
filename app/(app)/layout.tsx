import { Logo } from "@/components/brand/Logo";
import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { Sidebar } from "@/components/nav/Sidebar";
import { Topbar } from "@/components/nav/Topbar";
import { LogoutButton } from "@/components/nav/LogoutButton";
import { superficie } from "@/lib/ui/styles";

const MENSAGEM_STATUS: Record<"congelado" | "encerrado", { titulo: string; descricao: string }> = {
  congelado: {
    titulo: "Conta congelada",
    descricao:
      "O acesso deste petshop foi temporariamente suspenso pela administração da plataforma. Fale com o suporte pra reativar.",
  },
  encerrado: {
    titulo: "Conta encerrada",
    descricao:
      "O acesso deste petshop foi encerrado pela administração da plataforma. Fale com o suporte se isso não deveria ter acontecido.",
  },
};

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
  // (usuarios_petshop sem linha correspondente). Antes de assumir "acesso
  // pendente", checa se é um admin da plataforma (migration 0017) — esse
  // login nunca teve petshop de propósito, e cai direto em /admin em vez
  // de ficar preso aqui.
  if (!contexto.usuario || !contexto.petshop) {
    const admin = await getAdminContext();
    if (admin) {
      redirect("/admin");
    }

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

  // Petshop congelado/encerrado (migration 0017) — bloqueia a equipe dele
  // aqui, antes de montar o shell normal. Não afeta quem também é admin da
  // plataforma nesse mesmo login: esse caminho só é alcançado quando
  // contexto.petshop existe, ou seja, é sempre sobre a conta DESTE petshop
  // especificamente, nunca sobre o acesso a /admin.
  if (contexto.petshop.status !== "ativo") {
    const mensagem = MENSAGEM_STATUS[contexto.petshop.status];
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className={`max-w-sm text-center ${superficie.cardPadded}`}>
          <div className="mb-5 flex justify-center">
            <Logo tamanho="md" />
          </div>
          <h1 className="font-display text-xl text-ink-900">{mensagem.titulo}</h1>
          <p className="mt-2 text-sm text-ink-500">{mensagem.descricao}</p>
          <div className="mt-6 flex justify-center">
            <LogoutButton />
          </div>
        </div>
      </main>
    );
  }

  // Uma mesma pessoa pode ter as duas identidades (equipe deste petshop E
  // admin da plataforma) — ver comentário de ITEM_ADMIN em
  // components/nav/Sidebar.tsx.
  const admin = await getAdminContext();

  return (
    <div className="flex min-h-screen">
      <Sidebar ehAdminPlataforma={admin !== null} />
      <div className="flex flex-1 flex-col">
        <Topbar usuario={contexto.usuario} petshop={contexto.petshop} ehAdminPlataforma={admin !== null} />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
