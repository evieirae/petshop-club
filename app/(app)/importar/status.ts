import type { SituacaoLinhaImportacao, StatusImportacao } from "@/types/database";
import type { TomBadge } from "@/lib/ui/styles";

export const STATUS_IMPORTACAO: Record<StatusImportacao, { rotulo: string; tom: TomBadge }> = {
  analisando: { rotulo: "Conferindo", tom: "progresso" },
  pronta: { rotulo: "Aguardando aplicar", tom: "atencao" },
  aplicando: { rotulo: "Aplicando", tom: "progresso" },
  aplicada: { rotulo: "Aplicada", tom: "sucesso" },
  falhou: { rotulo: "Falhou", tom: "erro" },
  desfeita: { rotulo: "Desfeita", tom: "neutro" },
};

export const SITUACAO_LINHA: Record<SituacaoLinhaImportacao, { rotulo: string; tom: TomBadge }> = {
  nova: { rotulo: "Vai ser criada", tom: "info" },
  duplicada: { rotulo: "Já existe", tom: "neutro" },
  erro: { rotulo: "Erro", tom: "erro" },
  aplicada: { rotulo: "Criada", tom: "sucesso" },
  ignorada: { rotulo: "Ignorada", tom: "neutro" },
};

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
