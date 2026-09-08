import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirTutor } from "@/lib/auth/exigirTutor";
import { botao, texto } from "@/lib/ui/styles";
import { LojaSection, type ProdutoVitrine } from "./LojaSection";

// Lojinha do portal do tutor (migration 0026): catálogo do petshop, carrinho
// e reserva com prazo.
//
// O `select` lista as colunas na mão em vez de `select *` de propósito: a
// policy "vitrine_tutor" devolve a linha inteira de `produtos`, e a linha
// inteira carrega `custo` — quanto o petshop paga no fornecedor não é assunto
// do cliente dele.
export default async function LojaPage() {
  const { petshop } = await exigirTutor();
  const supabase = createClient();

  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, categoria, preco_venda, estoque_atual, estoque_reservado")
    .order("categoria")
    .order("nome");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/minha-conta" className={botao({ variante: "texto" })}>
          ← Voltar
        </Link>
        <h1 className={`mt-2 ${texto.tituloPagina}`}>Lojinha</h1>
        <p className={texto.subtitulo}>
          Reserve e retire no {petshop.nome}. O pagamento é lá, na hora de
          buscar.
        </p>
      </div>

      <LojaSection
        produtos={(produtos as ProdutoVitrine[]) ?? []}
        nomePetshop={petshop.nome}
      />
    </div>
  );
}
