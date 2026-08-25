import Link from "next/link";
import { CalendarCheck, MessageCircle, PawPrint, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { botao, superficie } from "@/lib/ui/styles";
import { LeadForm } from "./LeadForm";

// Home institucional pública — antes desta mudança, "/" era direto o
// painel logado (redirecionava pra /login sem sessão). Pedido do Eduardo
// (20/ago/2026): "/" vira a apresentação do produto SaaS, com captura de
// e-mail pra cotação; o login vira a "segunda página", acessada a partir
// daqui, não a porta de entrada. O painel logado se mudou pra /painel (ver
// supabase/migrations/0017_admin_plataforma_independente.sql).
//
// Cadastro de petshop novo nunca acontece por aqui — o formulário
// (LeadForm) só grava um pedido de cotação em leads_saas
// (0018_leads_saas.sql); virar petshop de verdade é sempre manual, feito
// pelo admin da plataforma em /admin/leads.
const FUNCIONALIDADES = [
  {
    icon: CalendarCheck,
    titulo: "Agenda que se organiza sozinha",
    descricao:
      "Assinatura recorrente gera a próxima visita automaticamente — sem planilha, sem esquecer de remarcar.",
  },
  {
    icon: Wallet,
    titulo: "Cobrança recorrente sem cobrar na mão",
    descricao:
      "Mensalidade proporcional cobrada sozinha todo mês, no cartão ou Pix — o petshop recebe, o tutor só confirma.",
  },
  {
    icon: MessageCircle,
    titulo: "Confirmação e aviso pelo WhatsApp",
    descricao:
      "O tutor confirma a visita e recebe o aviso de \"pet pronto\" direto no WhatsApp, sem a equipe precisar ligar.",
  },
  {
    icon: PawPrint,
    titulo: "Cadastro simples de tutores e pets",
    descricao:
      "O petshop cadastra só o telefone e manda um link — o próprio tutor completa o resto pelo celular.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6">
        <Logo tamanho="md" />
        <Link href="/login" className={botao({ variante: "contorno", tamanho: "sm" })}>
          Já sou cliente · Entrar
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
        <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">
          O clube de assinatura de banho e tosa que roda sozinho
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-ink-500">
          PetClub é a plataforma que cuida da agenda, da cobrança recorrente
          e dos avisos por WhatsApp do seu petshop — pra sua equipe focar no
          pet, não na planilha.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="#cotacao" className={botao({ variante: "cta", tamanho: "lg" })}>
            Quero uma cotação
          </a>
          <Link href="/login" className={botao({ variante: "neutra", tamanho: "lg" })}>
            Já sou cliente
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FUNCIONALIDADES.map(({ icon: Icon, titulo, descricao }) => (
            <div key={titulo} className={superficie.cardPadded}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-pill bg-brand-50 text-brand-700">
                <Icon size={18} aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-display text-base text-ink-900">{titulo}</h2>
              <p className="mt-1.5 text-sm text-ink-500">{descricao}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 pb-24">
        <LeadForm />
      </section>

      <footer className="border-t border-surface-border px-4 py-8 text-center text-xs text-ink-500">
        <Logo tamanho="sm" className="mx-auto mb-3 justify-center" />
        PetClub — assinatura de banho e tosa pra petshops.
      </footer>
    </main>
  );
}
