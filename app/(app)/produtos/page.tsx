import { redirect } from "next/navigation";

// "Produtos" virou uma aba dentro de /catalogo em 20/ago/2026, e o ponto de
// venda que morava aqui virou a tela /vendas. Este redirect existe pra não
// quebrar link salvo/favorito de quem já usava a rota antiga.
export default function ProdutosRedirect() {
  redirect("/catalogo");
}
