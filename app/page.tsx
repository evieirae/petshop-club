import Link from "next/link";
import {
  CalendarCheck,
  ClipboardList,
  Clock,
  Heart,
  MessageCircle,
  PawPrint,
  Smartphone,
  Store,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Cachorro, Gato, Patinha, TrilhaDePatinhas } from "@/components/brand/Ilustracoes";
import { badge, botao, cx, superficie } from "@/lib/ui/styles";
import { LeadForm } from "./LeadForm";

// Home institucional pública.
//
// ---------------------------------------------------------------------------
// TRÊS PREMISSAS, NESTA ORDEM DE IMPORTÂNCIA
// ---------------------------------------------------------------------------
//
// 1. NÃO FALA DE PAGAMENTO. Nenhuma palavra sobre cobrança, mensalidade
//    automática, cartão, Pix ou split. A funcionalidade de pagamento está
//    desligada (31/ago/2026) e prometer na vitrine o que o produto ainda não
//    entrega é a forma mais rápida de queimar o primeiro petshop parceiro.
//    Se voltar a ligar, os pontos de reentrada são: o subtítulo do topo, a
//    lista "Para petshops" e a grade "O que vem junto".
//
// 2. FALA COM DUAS PONTAS. Tutor e petshop têm portas próprias logo na
//    primeira dobra — o produto tem duas audiências, e a praticidade de
//    marcar banho sozinho é o que prende quem não é dono de petshop.
//
// 3. É AFETIVA, NÃO CORPORATIVA. Referência que o Eduardo passou:
//    bichodeluxo.com.br — tom carinhoso ("cuidando de quem nos faz mais
//    feliz"), formas arredondadas, bicho na tela. O produto é sobre cachorro;
//    uma landing de SaaS só com card branco não parece ser sobre isso.
//
// Cadastro de petshop novo continua NUNCA acontecendo por aqui: o LeadForm
// só grava um pedido de contato em leads_saas (0018_leads_saas.sql); virar
// petshop de verdade é sempre manual, feito pelo admin em /admin/leads.
//
// ---------------------------------------------------------------------------
// SOBRE AS IMAGENS
// ---------------------------------------------------------------------------
// Duas camadas, e é de propósito que a página funcione com só a primeira:
//
//   1. ILUSTRAÇÕES (components/brand/Ilustracoes.tsx) — cachorro, gato e
//      patinhas em SVG, com os tokens da marca. Estão sempre lá.
//   2. FOTOS (public/fotos/) — quando os arquivos existirem, cobrem as
//      ilustrações. Nenhuma linha de código muda; ver public/fotos/LEIA-ME.md.
//
// Fotos são background-image de <div>, nunca <img>: são decorativas, e um
// background que não existe simplesmente não aparece — sem ícone quebrado,
// sem alt vazio, sem layout shift. O contraste do texto branco é garantido
// pelo gradiente da marca ATRÁS da foto, não pela foto.
function foto(arquivo: string) {
  return { backgroundImage: `url('/fotos/${arquivo}')` };
}

const PASSOS_TUTOR = [
  {
    icon: Clock,
    titulo: "Veja os horários livres",
    descricao:
      "A agenda mostra o que está disponível — sem ligar, sem esperar resposta, sem descobrir depois que o horário já era.",
  },
  {
    icon: CalendarCheck,
    titulo: "Marque o banho do seu peludo",
    descricao:
      "Escolhe o pet, o serviço e o horário. Pronto. Dá pra fazer na fila do mercado, em trinta segundos.",
  },
  {
    icon: MessageCircle,
    titulo: "Receba o \"pode buscar\"",
    descricao:
      "A confirmação da véspera e o aviso de pet pronto chegam no seu WhatsApp, sem alguém do balcão precisar parar pra ligar.",
  },
];

const PARA_PETSHOP = [
  "A agenda da semana inteira numa tela, do jeito que o balcão precisa ver.",
  "Menos telefone: confirmação da véspera e aviso de pet pronto saem sozinhos.",
  "Menos falta: quem confirma aparece, e quem não confirma cai na lista da equipe antes do horário.",
  "O tutor marca sozinho pelo celular — e o pedido chega pra você aceitar.",
];

const FUNCIONALIDADES = [
  {
    icon: CalendarCheck,
    titulo: "Agenda que se organiza sozinha",
    descricao:
      "A assinatura gera a próxima visita automaticamente — sem planilha, sem esquecer de remarcar.",
  },
  {
    icon: MessageCircle,
    titulo: "Confirmação e aviso no WhatsApp",
    descricao:
      "O tutor confirma a visita e recebe o \"pode buscar\" direto no celular, sem a equipe precisar ligar.",
  },
  {
    icon: Smartphone,
    titulo: "Portal do tutor",
    descricao:
      "Cada cliente vê os próprios pets, as próprias visitas e marca o banho sozinho — só livre ou ocupado, nunca a agenda dos outros.",
  },
  {
    icon: PawPrint,
    titulo: "Cadastro simples de tutores e pets",
    descricao:
      "O petshop cadastra só o telefone e manda um link — o próprio tutor completa o resto pelo celular.",
  },
  {
    icon: ClipboardList,
    titulo: "A ficha de cada peludo",
    descricao:
      "Porte, raça, temperamento, alergia, aquela mania de não gostar do secador. Quem atende hoje sabe o que quem atendeu semana passada sabia.",
  },
  {
    icon: Store,
    titulo: "Catálogo e estoque",
    descricao:
      "Serviços, planos e produtos no mesmo lugar da agenda — nada de caderno paralelo atrás do balcão.",
  },
];

/** Um dos peludos do mosaico: foto quando existir, ilustração quando não. */
function CardPeludo({
  arquivo,
  nome,
  legenda,
  ilustracao,
  fundo,
}: {
  arquivo: string;
  nome: string;
  legenda: string;
  ilustracao: "cachorro" | "gato";
  fundo: string;
}) {
  return (
    <div className={cx("overflow-hidden", superficie.card)}>
      <div className={cx("relative flex h-40 items-end justify-center", fundo)}>
        {ilustracao === "cachorro" ? (
          <Cachorro className="h-32 w-32" />
        ) : (
          <Gato className="h-32 w-32" />
        )}
        {/* A foto entra por cima da ilustração quando o arquivo existir. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={foto(arquivo)}
        />
      </div>
      <div className="px-4 py-3">
        <p className="font-display text-base text-ink-900">{nome}</p>
        <p className="text-xs text-ink-500">{legenda}</p>
      </div>
    </div>
  );
}

/** Uma linha da agenda ilustrada do mockup. */
function LinhaAgenda({
  hora,
  pet,
  raca,
  rotulo,
  tom,
}: {
  hora: string;
  pet: string;
  raca: string;
  rotulo: string;
  tom: "sucesso" | "progresso" | "info" | "atencao";
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-ink-900">{hora}</span>
        <span className="text-sm text-ink-700">
          {pet} <span className="text-ink-500">· {raca}</span>
        </span>
      </div>
      <span className={badge(tom)}>{rotulo}</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-surface">
      {/* ===================== TOPO ===================== */}
      <section className="relative isolate overflow-hidden bg-brand-900">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={foto("hero.jpg")}
        />
        {/* Escurecimento uniforme: deixa 55% da foto passar e tira o brilho
            que mataria o texto. */}
        <div aria-hidden="true" className="absolute inset-0 bg-brand-900/45" />
        {/* Cortina lateral onde o texto realmente fica. É isto que garante AA
            independentemente da foto: na faixa da esquerda o azul é opaco
            (branco = 16:1) e ela se dissolve até transparente na direita, onde
            não tem texto e a foto aparece limpa. Medido no pior caso possível
            (foto 100% branca atrás): título branco 16:1, parágrafo brand-100
            5,4:1 — os dois passam AA. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-brand-900 via-brand-900/85 to-transparent"
        />

        <div className="relative mx-auto max-w-5xl px-4">
          <header className="flex items-center justify-between py-6">
            <Logo tamanho="md" tom="branco" />
            <Link
              href="/login"
              className={botao({ variante: "contornoClaro", tamanho: "sm" })}
            >
              Entrar
            </Link>
          </header>

          <div className="max-w-2xl py-16 sm:py-24">
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-brand-100">
              <Patinha className="h-4 w-4 fill-cta-500" />
              Clube de banho e tosa
            </p>
            <h1 className="mt-3 font-display text-3xl leading-tight text-white sm:text-5xl">
              O banho do seu melhor amigo, marcado em trinta segundos.
            </h1>
            <p className="mt-5 max-w-xl text-base text-brand-100 sm:text-lg">
              Sem ligar, sem esperar resposta, sem descobrir que o horário já
              era. O PetClub cuida da agenda e dos avisos do seu petshop — pra
              sobrar tempo pra melhor parte, que é o pet.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#tutor" className={botao({ variante: "cta", tamanho: "lg" })}>
                <Heart size={18} aria-hidden="true" />
                Sou tutor · quero marcar banho
              </a>
              <a
                href="#petshop"
                className={botao({ variante: "contornoClaro", tamanho: "lg" })}
              >
                Tenho um petshop
              </a>
            </div>

            <p className="mt-8 text-sm text-brand-100">
              Agenda automática · Avisos no WhatsApp · Portal do tutor
            </p>
          </div>
        </div>
      </section>

      {/* ===================== OS PELUDOS ===================== */}
      {/* Prova de que o produto é sobre bicho, não sobre software. Sem
          depoimento nenhum aqui de propósito: não existe cliente pra citar
          ainda, e elogio inventado é o tipo de coisa que queima a marca no
          primeiro petshop que perguntar "quem é essa pessoa?". */}
      <section className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl text-ink-900 sm:text-3xl">
            Os peludos são o ponto. O resto é detalhe.
          </h2>
          <p className="mt-3 text-sm text-ink-500">
            Banho de sexta, tosa antes da viagem, aquele que só entra na
            banheira no colo. O PetClub existe pra essa parte funcionar sem
            ninguém precisar lembrar de nada.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <CardPeludo
            arquivo="pet-1.jpg"
            nome="Thor"
            legenda="Banho toda terça, sem falhar"
            ilustracao="cachorro"
            fundo="bg-brand-50"
          />
          <CardPeludo
            arquivo="pet-2.jpg"
            nome="Nina"
            legenda="Tosa higiênica de quinze em quinze"
            ilustracao="gato"
            fundo="bg-cta-50"
          />
          <CardPeludo
            arquivo="pet-3.jpg"
            nome="Amora"
            legenda="Odeia secador, ama toalha"
            ilustracao="cachorro"
            fundo="bg-success-50"
          />
          <CardPeludo
            arquivo="pet-4.jpg"
            nome="Bidu"
            legenda="Sai de lá cheiroso e insuportável"
            ilustracao="gato"
            fundo="bg-progress-50"
          />
        </div>
      </section>

      {/* ===================== AS DUAS PORTAS ===================== */}
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:pb-20">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ---- tutor ---- */}
          <div
            id="tutor"
            className={cx("scroll-mt-8 overflow-hidden", superficie.card)}
          >
            <div className="relative flex h-44 items-end justify-center bg-brand-700">
              <Cachorro className="h-36 w-36 opacity-90" />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center"
                style={foto("tutor.jpg")}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-brand-900/85 to-brand-900/10"
              />
              <h2 className="absolute bottom-0 left-0 p-5 font-display text-2xl text-white">
                Para tutores
              </h2>
            </div>

            <div className="p-6">
              <p className="text-sm text-ink-500">
                Seu petshop libera o acesso e a agenda dele passa a caber no seu
                bolso. Você vê só o que é seu: seus pets, seus horários, suas
                visitas.
              </p>

              <ul className="mt-6 space-y-5">
                {PASSOS_TUTOR.map(({ icon: Icon, titulo, descricao }) => (
                  <li key={titulo} className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-brand-50 text-brand-700">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-sm font-medium text-ink-900">{titulo}</h3>
                      <p className="mt-0.5 text-sm text-ink-500">{descricao}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/login" className={botao({ tamanho: "lg" })}>
                  Entrar na minha conta
                </Link>
                <p className="text-xs text-ink-500">
                  Ainda não tem acesso? Peça pro seu petshop liberar.
                </p>
              </div>
            </div>
          </div>

          {/* ---- petshop ---- */}
          <div
            id="petshop"
            className={cx("scroll-mt-8 overflow-hidden", superficie.card)}
          >
            <div className="relative flex h-44 items-end justify-center bg-brand-700">
              <Gato className="h-36 w-36 opacity-90" />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center"
                style={foto("petshop.jpg")}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-brand-900/85 to-brand-900/10"
              />
              <h2 className="absolute bottom-0 left-0 p-5 font-display text-2xl text-white">
                Para petshops
              </h2>
            </div>

            <div className="p-6">
              <p className="text-sm text-ink-500">
                Seu cliente fiel vira cliente marcado. O plano organiza a
                semana, e a agenda da próxima visita nasce sozinha.
              </p>

              <ul className="mt-6 space-y-3 text-sm text-ink-700">
                {PARA_PETSHOP.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Patinha className="mt-0.5 h-4 w-4 shrink-0 fill-success-500" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                <a href="#contato" className={botao({ tamanho: "lg" })}>
                  Quero conhecer
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== POR DENTRO DO SISTEMA ===================== */}
      {/* Mockup montado com os próprios tokens do design system em vez de
          screenshot: não envelhece quando a UI muda, não pesa em KB e continua
          nítido em qualquer tela. */}
      <section className="border-y border-surface-border bg-surface-muted/60 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl text-ink-900 sm:text-3xl">
              O dia inteiro numa tela
            </h2>
            <p className="mt-3 text-sm text-ink-500">
              Quem chegou, quem está no banho, quem já pode ser buscado e quem
              ainda não confirmou. É o que a equipe olha entre um pet e outro.
            </p>
          </div>

          <div
            className={cx("mx-auto mt-10 max-w-4xl overflow-hidden", superficie.card)}
          >
            <div className="flex items-center gap-2 border-b border-surface-border bg-surface-muted px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-pill bg-surface-strong" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-pill bg-surface-strong" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-pill bg-surface-strong" aria-hidden="true" />
              <span className="ml-3 rounded-pill bg-surface-card px-3 py-0.5 font-mono text-xs text-ink-500">
                petclub.app/agenda
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <h3 className="font-display text-base text-ink-900">Visitas de hoje</h3>
                <div className="mt-3 divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border">
                  <LinhaAgenda hora="09:00" pet="Thor" raca="Golden" rotulo="Entregue" tom="sucesso" />
                  <LinhaAgenda hora="10:00" pet="Nina" raca="Shih-tzu" rotulo="Presente" tom="progresso" />
                  <LinhaAgenda hora="11:30" pet="Amora" raca="SRD" rotulo="Pronto p/ busca" tom="info" />
                  <LinhaAgenda hora="14:00" pet="Bidu" raca="Beagle" rotulo="Aguardando confirmação" tom="atencao" />
                </div>
              </div>

              <div className="lg:col-span-2">
                <h3 className="font-display text-base text-ink-900">Resumo do mês</h3>
                <div className={cx("mt-3 space-y-3", superficie.painel)}>
                  {[
                    ["Assinaturas ativas", "38"],
                    ["Visitas concluídas", "126"],
                    ["Confirmadas p/ amanhã", "11"],
                    ["Faltas", "3"],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo} className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink-500">{rotulo}</span>
                      <span className="font-mono text-sm text-ink-900">{valor}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-ink-500">
            Ilustração das telas do PetClub. Os dados acima são exemplo.
          </p>
        </div>
      </section>

      {/* ===================== O QUE VEM JUNTO ===================== */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <h2 className="text-center font-display text-2xl text-ink-900 sm:text-3xl">
          O que vem junto
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FUNCIONALIDADES.map(({ icon: Icon, titulo, descricao }) => (
            <div key={titulo} className={superficie.cardPadded}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-pill bg-brand-50 text-brand-700">
                <Icon size={19} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-base text-ink-900">{titulo}</h3>
              <p className="mt-1.5 text-sm text-ink-500">{descricao}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== FAIXA ===================== */}
      <section className="relative isolate overflow-hidden bg-brand-900">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={foto("faixa.jpg")}
        />
        {/* Texto centralizado aqui, então não dá pra usar cortina lateral como
            no topo: o escurecimento precisa ser uniforme. 85% segura o branco
            em 4,9:1 mesmo com foto clara atrás. */}
        <div aria-hidden="true" className="absolute inset-0 bg-brand-900/85" />
        <TrilhaDePatinhas className="absolute inset-0 fill-white/10" />

        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <Heart size={28} className="mx-auto text-cta-500" aria-hidden="true" />
          <h2 className="mt-4 font-display text-2xl text-white sm:text-3xl">
            Cuidar bem também é não deixar passar a data do banho.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white">
            Fale com a gente e monte o clube do seu petshop: planos por porte,
            agenda recorrente e os avisos automáticos já configurados.
          </p>
          <div className="mt-8">
            <a
              href="#contato"
              className={botao({ variante: "contornoClaro", tamanho: "lg" })}
            >
              Quero conhecer o PetClub
            </a>
          </div>
        </div>
      </section>

      {/* ===================== CONTATO ===================== */}
      <section id="contato" className="mx-auto max-w-2xl scroll-mt-8 px-4 py-16 sm:py-20">
        <LeadForm />
      </section>

      {/* O rodapé carrega a identificação legal da empresa por dois motivos:
          é exigência de quem contrata um SaaS PJ, e é o que a Meta procura
          no site ao avaliar o Business Portfolio. Os dados batem letra por
          letra com o CCMEI e com o cadastro do portfolio — se um mudar, os
          dois mudam juntos. */}
      <footer className="border-t border-surface-border px-4 py-10 text-center text-xs text-ink-500">
        <Logo tamanho="sm" className="mx-auto mb-3 justify-center" />
        <p>PetClub — clube de banho e tosa pra petshops.</p>

        <address className="mx-auto mt-5 max-w-md not-italic leading-relaxed">
          <span className="text-ink-700">68.866.630 EDUARDO VIEIRA</span>
          <br />
          CNPJ <span className="font-mono">68.866.630/0001-87</span>
          <br />
          Rua Trieste, 284 — Pagani — Palhoça/SC — CEP{" "}
          <span className="font-mono">88132-227</span>
          <br />
          <a
            href="tel:+5548991859148"
            className="font-mono text-brand-700 hover:text-brand-500"
          >
            (48) 99185-9148
          </a>
        </address>

        <p className="mt-5">
          © {new Date().getFullYear()} PetClub. Todos os direitos reservados.
        </p>
      </footer>
    </main>
  );
}
