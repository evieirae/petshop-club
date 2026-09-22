import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import { CAMPOS_TUTORES_PETS } from "@/lib/importacao/tutoresPets";
import { Badge } from "@/components/ui/Badge";
import { botao, cx, superficie, tabela, texto } from "@/lib/ui/styles";
import type { Importacao } from "@/types/database";
import { ImportarWizard } from "./ImportarWizard";
import { STATUS_IMPORTACAO, formatarDataHora } from "./status";

// Frente C — importação por planilha (docs/plano-loja-publica-pagamentos-import.md).
// Por enquanto só tutores + pets (fatia C2); serviços, produtos, assinaturas
// e agendamentos entram nas fatias C3 e C4 usando a mesma infraestrutura.
export default async function ImportarPage() {
  const contexto = await getUsuarioContext();
  if (!contexto?.petshop?.id) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase
    .from("importacoes")
    .select("*")
    .eq("petshop_id", contexto.petshop.id)
    .order("criado_em", { ascending: false })
    .limit(20);
  const importacoes = (data as Importacao[]) ?? [];

  return (
    <div>
      <h1 className={texto.tituloPagina}>Importar planilha</h1>
      <p className={texto.subtitulo}>
        Traga seus tutores e pets de outro sistema ou de uma planilha, sem digitar um por um.
      </p>

      <div className={cx(superficie.painel, "mt-8 flex flex-wrap items-center justify-between gap-4")}>
        <div>
          <p className="font-medium text-ink-900">Não tem a planilha pronta?</p>
          <p className="text-sm text-ink-500">
            Baixe o modelo com as colunas certas, exemplos e instruções. Uma linha por pet.
          </p>
        </div>
        <a href="/importar/modelo" className={botao({ variante: "contorno" })}>
          <Download size={16} aria-hidden="true" className="mr-2 inline" />
          Baixar modelo (.xlsx)
        </a>
      </div>

      <div className="mt-6">
        <ImportarWizard campos={CAMPOS_TUTORES_PETS} />
      </div>

      {importacoes.length > 0 && (
        <section className="mt-10">
          <h2 className={texto.tituloSecao}>Importações anteriores</h2>
          <div className={cx(tabela.wrapper, "mt-4")}>
            <table className={tabela.raiz}>
              <thead className={tabela.cabecalho}>
                <tr>
                  <th className={tabela.th}>Quando</th>
                  <th className={tabela.th}>Arquivo</th>
                  <th className={tabela.th}>Situação</th>
                  <th className={cx(tabela.th, "text-right")}>Novas</th>
                  <th className={cx(tabela.th, "text-right")}>Já existiam</th>
                  <th className={cx(tabela.th, "text-right")}>Com erro</th>
                  <th className={tabela.th} />
                </tr>
              </thead>
              <tbody>
                {importacoes.map((imp) => {
                  const st = STATUS_IMPORTACAO[imp.status];
                  return (
                    <tr key={imp.id} className={tabela.linha}>
                      <td className={tabela.td}>{formatarDataHora(imp.criado_em)}</td>
                      <td className={cx(tabela.td, "max-w-[16rem] truncate")}>{imp.arquivo_nome}</td>
                      <td className={tabela.td}>
                        <Badge tom={st.tom} ponto={imp.status === "pronta"}>
                          {st.rotulo}
                        </Badge>
                      </td>
                      <td className={tabela.tdNumero}>{imp.linhas_novas}</td>
                      <td className={tabela.tdNumero}>{imp.linhas_duplicadas}</td>
                      <td className={tabela.tdNumero}>{imp.linhas_erro}</td>
                      <td className={cx(tabela.td, "text-right")}>
                        <Link href={`/importar/${imp.id}`} className={botao({ variante: "texto" })}>
                          {imp.status === "pronta" ? "Conferir" : "Ver"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
