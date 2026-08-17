import type { ButtonHTMLAttributes } from "react";
import { botao, type TamanhoBotao, type VarianteBotao } from "@/lib/ui/styles";

/**
 * Botão do app. Fino por design: só amarra `botao()` de lib/ui/styles.ts a um
 * <button>, sem inventar comportamento. Para <a>/<Link>, chame `botao()`
 * direto no className — o visual é idêntico.
 *
 *   <Button>Salvar</Button>
 *   <Button variante="cta" tamanho="lg">Novo agendamento</Button>
 *   <Button variante="perigo" tamanho="sm">Excluir</Button>
 *   <Button carregando={pending}>Entrar</Button>
 */
export function Button({
  variante = "primaria",
  tamanho = "md",
  largura = "auto",
  carregando = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  largura?: "auto" | "cheia";
  /** Desabilita e troca o rótulo — evita duplo clique em server action. */
  carregando?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={botao({ variante, tamanho, largura, className })}
    >
      {children}
    </button>
  );
}
