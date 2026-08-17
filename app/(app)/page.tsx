import { CalendarCheck, Users, Repeat, Settings } from "lucide-react";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { NavCard } from "@/components/ui/NavCard";
import { texto } from "@/lib/ui/styles";

export default async function VisaoGeralPage() {
  const contexto = await getUsuarioContext();
  const primeiroNome = contexto?.usuario?.nome?.split(" ")[0] ?? "";

  return (
    <div>
      <h1 className={texto.tituloPagina}>
        {primeiroNome ? `Olá, ${primeiroNome}` : "Visão geral"}
      </h1>
      <p className={texto.subtitulo}>
        A fundação do painel está pronta — cada área abaixo ainda vai
        receber sua tela de verdade.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NavCard
          href="/agenda"
          icon={CalendarCheck}
          titulo="Agenda"
          descricao="Visitas do dia, confirmações e status."
        />
        <NavCard
          href="/tutores"
          icon={Users}
          titulo="Tutores & Pets"
          descricao="Cadastro e histórico de cada cliente."
        />
        <NavCard
          href="/planos"
          icon={Repeat}
          titulo="Planos & Serviços"
          descricao="Catálogo, preços e frequência."
        />
        <NavCard
          href="/configuracoes"
          icon={Settings}
          titulo="Configurações"
          descricao="Expediente, mensagens, cobrança."
        />
      </div>
    </div>
  );
}
