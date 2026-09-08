import { Badge } from "@/components/ui/Badge";

/**
 * Selo de histórico de falta do tutor (migration 0023).
 *
 * Não é previsão nem score — é contagem: "faltou 2 das últimas 6". A equipe do
 * balcão confere na hora e confia; um número de 0 a 100 seria mais bonito na
 * demo e menos útil no dia a dia, além de prometer uma precisão que 6 pontos
 * de dado não sustentam.
 *
 * A view `historico_falta_tutor` já resolve a regra: quem tem menos de 3
 * visitas resolvidas vem como 'sem_historico', e aqui isso não vira selo
 * nenhum — cliente novo não pode nascer marcado.
 */

export type NivelFalta = "sem_historico" | "ok" | "atencao" | "alto";

export type HistoricoFalta = {
  tutor_id: string;
  nivel: NivelFalta;
  faltas_janela: number;
  janela_considerada: number;
};

/** Mapa tutor_id → histórico, montado uma vez por carregamento da Agenda. */
export type MapaHistoricoFalta = Record<string, HistoricoFalta>;

/**
 * `ok` também não vira selo. Tela de agenda cheia de "0 faltas" é ruído: o
 * normal não precisa de rótulo, só a exceção precisa.
 */
export function SeloRiscoFalta({
  historico,
  detalhado = false,
}: {
  historico: HistoricoFalta | undefined;
  /** true = frase inteira (painel de ações); false = selo curto (lista). */
  detalhado?: boolean;
}) {
  if (!historico) return null;
  if (historico.nivel === "sem_historico" || historico.nivel === "ok") return null;

  const { nivel, faltas_janela, janela_considerada } = historico;
  const tom = nivel === "alto" ? "erro" : "atencao";
  const texto = `${faltas_janela} ${faltas_janela === 1 ? "falta" : "faltas"} nas últimas ${janela_considerada}`;

  if (detalhado) {
    return (
      <p className="mt-1 flex items-center gap-2 text-xs text-ink-500">
        <Badge tom={tom} ponto>
          {texto}
        </Badge>
        <span>
          {nivel === "alto"
            ? "Vale confirmar por telefone antes de reservar o horário."
            : "Reforce a confirmação na véspera."}
        </span>
      </p>
    );
  }

  return (
    <Badge tom={tom} ponto className="shrink-0">
      {texto}
    </Badge>
  );
}
