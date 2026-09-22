import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import { formatarTelefone } from "@/lib/importacao/normalizar";
import type { DadosTutorPet } from "@/lib/importacao/tutoresPets";
import { botao, texto } from "@/lib/ui/styles";
import type { Importacao, ImportacaoLinha, Porte } from "@/types/database";
import { ConferenciaLote, type LinhaVista } from "./ConferenciaLote";
import { formatarDataHora } from "../status";

const TAMANHO_PAGINA = 1000;

const ESPECIE: Record<string, string> = { cachorro: "Cachorro", gato: "Gato", outro: "Outro" };

// Passo 3 da importação: a conferência. Mostra, linha a linha, o que vai ser
// criado, o que já existe e o que tem erro — e é daqui que sai o "aplicar".
export default async function ConferenciaPage({ params }: { params: { id: string } }) {
  const contexto = await getUsuarioContext();
  if (!contexto?.petshop?.id) redirect("/login");

  const supabase = createClient();
  const { data: imp } = await supabase.from("importacoes").select("*").eq("id", params.id).maybeSingle();
  if (!imp) notFound();
  const importacao = imp as Importacao;

  const linhas: ImportacaoLinha[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data } = await supabase
      .from("importacao_linhas")
      .select("*")
      .eq("importacao_id", importacao.id)
      .order("numero_linha")
      .range(de, de + TAMANHO_PAGINA - 1);
    linhas.push(...((data as ImportacaoLinha[]) ?? []));
    if (!data || data.length < TAMANHO_PAGINA) break;
  }

  const { data: portesData } = await supabase.from("portes").select("*");
  const nomePorte = new Map(((portesData as Porte[]) ?? []).map((p) => [p.id, p.nome]));

  // Linha com erro não tem dados_normalizados: mostra o que veio na planilha,
  // pela coluna que o mapeamento apontou.
  const bruto = (l: ImportacaoLinha, chave: string) => {
    const cab = importacao.mapeamento[chave];
    return cab ? (l.dados_brutos[cab] ?? "").trim() : "";
  };

  const vistas: LinhaVista[] = linhas.map((l) => {
    const d = l.dados_normalizados as DadosTutorPet | null;
    const petDescricao = d?.pet
      ? [nomePorte.get(d.pet.porte_id), d.pet.especie ? ESPECIE[d.pet.especie] : null, d.pet.raca]
          .filter(Boolean)
          .join(" · ")
      : [bruto(l, "pet_porte"), bruto(l, "pet_especie"), bruto(l, "pet_raca")].filter(Boolean).join(" · ");
    return {
      id: l.id,
      numero: l.numero_linha,
      situacao: l.situacao,
      erro: l.erro,
      avisos: l.avisos ?? [],
      tutorNome: d?.tutor.nome ?? bruto(l, "tutor_nome"),
      telefone: formatarTelefone(d?.tutor.telefone ?? bruto(l, "tutor_telefone")),
      petNome: d ? d.pet?.nome ?? null : bruto(l, "pet_nome") || null,
      petDescricao,
    };
  });

  return (
    <div>
      <Link href="/importar" className={botao({ variante: "texto" })}>
        ← Importações
      </Link>
      <h1 className={`${texto.tituloPagina} mt-2`}>Conferência da importação</h1>
      <p className={texto.subtitulo}>
        <span className="font-medium text-ink-700">{importacao.arquivo_nome}</span> · enviada em{" "}
        {formatarDataHora(importacao.criado_em)}
        {importacao.aplicada_em && <> · aplicada em {formatarDataHora(importacao.aplicada_em)}</>}
      </p>

      <div className="mt-8">
        <ConferenciaLote importacao={importacao} linhas={vistas} />
      </div>
    </div>
  );
}
