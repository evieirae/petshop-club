import { Badge } from "@/components/ui/Badge";
import { LABEL_STATUS, TOM_STATUS } from "@/lib/agenda/resolver";
import type { StatusAgendamento } from "@/types/database";

/**
 * Badge de status de agendamento — usada na Agenda e no quadro de visitas
 * do dia da Visão Geral. Extraída de AgendaSection.tsx quando a segunda
 * tela passou a precisar do mesmo badge (ver lib/agenda/resolver.ts).
 */
export function StatusBadge({ status }: { status: StatusAgendamento }) {
  return <Badge tom={TOM_STATUS[status]}>{LABEL_STATUS[status]}</Badge>;
}
