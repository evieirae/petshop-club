import { badge, pontoStatus, type TomBadge } from "@/lib/ui/styles";

/**
 * Badge de status.
 *
 * Os mapas de status de cada tela (agenda, cobrança, assinatura, serviço)
 * apontam para os mesmos 5 tons, então "pago", "confirmado" e "ativa" têm
 * exatamente o mesmo verde em qualquer lugar do app.
 *
 *   <Badge tom="sucesso">Pago</Badge>
 *   <Badge tom="erro" ponto>Falhou</Badge>
 */
export function Badge({
  tom = "neutro",
  ponto = false,
  className,
  children,
}: {
  tom?: TomBadge;
  /** Ponto colorido antes do texto — para status que exigem ação. */
  ponto?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={badge(tom, className)}>
      {ponto && <span className={pontoStatus(tom)} aria-hidden="true" />}
      {children}
    </span>
  );
}
