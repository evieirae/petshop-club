"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { alerta, cx, formulario, superficie, tabela, texto } from "@/lib/ui/styles";
import type { CampoImportacao, Mapeamento } from "@/lib/importacao/campos";
import { conferirArquivo, lerCabecalhos, type ResultadoLeitura } from "./actions";

type Leitura = Extract<ResultadoLeitura, { ok: true }>;

// Passos 1 e 2 da importação: escolher o arquivo e dizer qual coluna é qual.
// A conferência (passo 3) mora em /importar/[id]. O arquivo fica só na
// memória do navegador entre os dois passos e é reenviado na conferência —
// o servidor não guarda o arquivo em lugar nenhum.
export function ImportarWizard({ campos }: { campos: CampoImportacao[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [mapeamento, setMapeamento] = useState<Mapeamento>({});
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, startLer] = useTransition();
  const [conferindo, startConferir] = useTransition();

  function recomecar() {
    setArquivo(null);
    setLeitura(null);
    setMapeamento({});
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function ler() {
    if (!arquivo) return;
    setErro(null);
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    startLer(async () => {
      const r = await lerCabecalhos(fd);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setLeitura(r);
      setMapeamento(r.sugestao);
    });
  }

  function conferir() {
    if (!arquivo) return;
    setErro(null);
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    fd.append("mapeamento", JSON.stringify(mapeamento));
    startConferir(async () => {
      const r = await conferirArquivo(fd);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.push(`/importar/${r.id}`);
    });
  }

  const faltandoObrigatorio = campos.some((c) => c.obrigatorio && !mapeamento[c.chave]);

  // --- Passo 1: arquivo ------------------------------------------------------
  if (!leitura) {
    return (
      <div className={superficie.cardPadded}>
        <h2 className={texto.tituloSecao}>Enviar planilha</h2>
        <p className={texto.subtitulo}>
          .xlsx ou .csv, até 5 MB e 5.000 linhas. Pode ser o modelo acima ou o export do seu sistema antigo.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label
            className={cx(
              "flex flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-surface-strong px-4 py-3 text-sm",
              "hover:border-brand-500 hover:bg-brand-50/40"
            )}
          >
            <FileSpreadsheet size={20} className="text-ink-500" aria-hidden="true" />
            <span className={arquivo ? "text-ink-900" : "text-ink-500"}>
              {arquivo ? arquivo.name : "Escolher arquivo…"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                setErro(null);
                setArquivo(e.target.files?.[0] ?? null);
              }}
            />
          </label>
          <Button onClick={ler} disabled={!arquivo} carregando={lendo}>
            {lendo ? "Lendo…" : "Ler planilha"}
          </Button>
        </div>

        {erro && (
          <p className={alerta("erro", "mt-4")} role="alert">
            {erro}
          </p>
        )}
      </div>
    );
  }

  // --- Passo 2: mapeamento ---------------------------------------------------
  const exemplo = leitura.amostra[0] ?? {};
  return (
    <div className={superficie.cardPadded}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={texto.tituloSecao}>Qual coluna é qual?</h2>
          <p className={texto.subtitulo}>
            <span className="font-medium text-ink-700">{leitura.arquivoNome}</span> — {leitura.totalLinhas}{" "}
            {leitura.totalLinhas === 1 ? "linha" : "linhas"}. Já deixamos um palpite; confira e ajuste.
          </p>
        </div>
        <Button variante="texto" onClick={recomecar} disabled={conferindo}>
          Trocar arquivo
        </Button>
      </div>

      <div className={cx(tabela.wrapper, "mt-5")}>
        <table className={tabela.raiz}>
          <thead className={tabela.cabecalho}>
            <tr>
              <th className={tabela.th}>Campo no PetClub</th>
              <th className={tabela.th}>Coluna da sua planilha</th>
              <th className={tabela.th}>Exemplo (1ª linha)</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((campo) => {
              const cab = mapeamento[campo.chave] ?? "";
              return (
                <tr key={campo.chave} className={tabela.linha}>
                  <td className={tabela.td}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-900">{campo.rotulo}</span>
                      {campo.obrigatorio && <Badge tom="atencao">obrigatório</Badge>}
                    </div>
                    {campo.dica && <p className={formulario.dica}>{campo.dica}</p>}
                  </td>
                  <td className={tabela.td}>
                    <select
                      aria-label={`Coluna para ${campo.rotulo}`}
                      className={cx(formulario.input, campo.obrigatorio && !cab && formulario.inputErro)}
                      value={cab}
                      onChange={(e) =>
                        setMapeamento((m) => {
                          const novo = { ...m, [campo.chave]: e.target.value || null };
                          // Uma coluna só pode alimentar um campo: tira dos outros.
                          if (e.target.value) {
                            for (const k of Object.keys(novo)) {
                              if (k !== campo.chave && novo[k] === e.target.value) novo[k] = null;
                            }
                          }
                          return novo;
                        })
                      }
                    >
                      <option value="">— não importar —</option>
                      {leitura.cabecalhos.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cx(tabela.td, "max-w-[16rem] truncate text-ink-500")}>
                    {cab ? exemplo[cab] || <span className="italic">vazio</span> : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {erro && (
        <p className={alerta("erro", "mt-4")} role="alert">
          {erro}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variante="cta" onClick={conferir} disabled={faltandoObrigatorio} carregando={conferindo}>
          {conferindo ? "Conferindo…" : `Conferir ${leitura.totalLinhas} ${leitura.totalLinhas === 1 ? "linha" : "linhas"}`}
        </Button>
        <p className="text-sm text-ink-500">Nada é gravado nesta etapa — você vê o resultado antes de aplicar.</p>
      </div>
    </div>
  );
}
