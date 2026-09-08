import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { getTutorContext } from "@/lib/auth/getTutorContext";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { LogoutButton } from "@/components/nav/LogoutButton";
import { botao, superficie } from "@/lib/ui/styles";

// Casca do portal do tutor — irmã de app/(app) (equipe) e app/(admin)
// (plataforma), não sub-tela de nenhuma das duas. Ver
// supabase/migrations/0024_portal_tutor_acesso.sql.
//
// Diferença deliberada de layout: aqui NÃO tem sidebar de oito itens. O
// petshop usa um tablet no balcão; o tutor usa o celular na fila do
// mercado. Enquanto o portal tiver uma tela só, a navegação é o próprio
// cabeçalho.
export default async function TutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const contexto = await getTutorContext();

  if (!contexto) {
    // Pode ser gente logada que não é tutor (dono de petshop clicando num
    // link de tutor, admin testando). Manda cada um pra sua casa em vez de
    // devolver um 403 seco.
    const admin = await getAdminContext();
    if (admin) redirect("/admin");

    const equipe = await getUsuarioContext();
    if (equipe?.usuario && equipe.petshop) redirect("/painel");

    redirect("/login");
  }

  // Senha de primeiro acesso vencida: o login até funcionou, mas o acesso
  // não vale mais. Tela explicativa em vez de portal vazio.
  if (contexto.senhaProvisoriaVencida) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className={`max-w-sm text-center ${superficie.cardPadded}`}>
          <div className="mb-5 flex justify-center">
            <Logo tamanho="md" />
          </div>
          <h1 className="font-display text-xl text-ink-900">
            Acesso de primeiro login vencido
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            A senha que o {contexto.petshop.nome} te passou tinha prazo e já
            passou. Peça pra eles liberarem um acesso novo — leva um minuto.
          </p>
          {contexto.petshop.telefone && (
            <p className="mt-3 font-mono text-sm text-ink-700">
              {contexto.petshop.telefone}
            </p>
          )}
          <div className="mt-6 flex justify-center">
            <LogoutButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-surface-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/minha-conta" aria-label="Minha conta">
            <Logo tamanho="sm" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-ink-900">
                {contexto.tutor.nome}
              </p>
              <p className="text-xs text-ink-500">{contexto.petshop.nome}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-surface-border px-4 py-6 text-center text-xs text-ink-500">
        <Link href="/minha-conta/nova-senha" className={botao({ variante: "texto" })}>
          Trocar minha senha
        </Link>
      </footer>
    </div>
  );
}
