"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { alerta, cx, superficie, tabela, texto } from "@/lib/ui/styles";
import type { Importacao, SituacaoLinhaImportacao } from "@/types/database";
import { aplicarImportacao, descartarImportacao } from "../actions";
import { SITUACAO_LINHA, STATUS_IMPORTACAO } from "../status";

export type LinhaVista = {
  id: string;
  numero: number;
  situacao: SituacaoLinhaImportacao;
  erro: string | null;
  avisos: string[];
  tutorNome: string;
  telefone: string;
  petNome: string | null;
  petDescricao: string;
};

type Filtro = "todas" | "criar" | "existem" | "erros" | "avisos";

const LIMITE_RENDER = 500;

export function ConferenciaLote({ importacao, linhas }: { importacao: Importacao; linhas: LinhaVista[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>(importacao.linhas_erro > 0 && importacao.status === "pronta" ? "erros" : "todas");
  const [confirmando, setConfirmando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);
  const [aplicando, startAplicar] = useTransition();
  const [descartando, startDescartar] = useTransition();

  const contagem = useMemo(() => {
    const c = { criar: 0, existem: 0, erros: 0, avisos: 0 };
    for (const l of linhas) {
      if (l.situacao === "nova" || l.situacao === "aplicada") c.criar++;
      else if (l.situacao === "duplicada") c.existem++;
      else if (l.situacao === "erro") c.erros++;
      if (l.avisos.length > 0) c.avisos++;
    }
    return c;
  }, [linhas]);

  const filtradas = useMemo(
    () =>
      linhas.filter((l) => {
        switch (filtro) {
          case "criar": return l.situacao === "nova" || l.situacao === "aplicada";
          case "existem": return l.situacao === "duplicada";
          case "erros": return l.situacao === "erro";
          case "avisos": return l.avisos.length > 0;
          default: return true;
        }
      }),
    [linhas, filtro]
  );

  const pronta = importacao.status === "pronta";
  const aplicada = importacao.status === "aplicada";
  const st = STATUS_IMPORTACAO[importacao.status];

  function aplicar() {
    setMensagem(null);
    startAplicar(async () => {
      const r = await aplicarImportacao(importacao.id);
      setConfirmando(false);
      if (!r.ok) {
        setMensagem({ tom: "erro", texto: r.erro });
        return;
      }
      const partes = [
        `${r.tutoresCriados} ${r.tutoresCriados === 1 ? "tutor" : "tutores"}`,
        `${r.petsCriados} ${r.petsCriados === 1 ? "pet" : "pets"}`,
      ];
      setMensagem({
        tom: "sucesso",
        texto:
          `Pronto: ${partes.join(" e ")} cadastrados.` +
          (r.duplicadas > 0
            ? ` ${r.duplicadas} ${r.duplicadas === 1 ? "linha foi cadastrada" : "linhas foram cadastradas"} por outra pessoa enquanto você conferia e ficou de fora.`
            : ""),
      });
      router.refresh();
    });
  }

  function descartar() {
    setMensagem(null);
    startDescartar(async () => {
      const r = await descartarImportacao(importacao.id);
      if (!r.ok) {
        setMensagem({ tom: "erro", texto: r.erro });
        return;
      }
      router.push("/importar");
    });
  }

  const abas: { chave: Filtro; rotulo: string; qtd: number }[] = [
    { chave: "todas", rotulo: "Todas", qtd: linhas.length },
    { chave: "criar", rotulo: aplicada ? "Criadas" : "Vão ser criadas", qtd: contagem.criar },
    { chave: "existem", rotulo: "Já existem", qtd: contagem.existem },
    { chave: "erros", rotulo: "Com erro", qtd: contagem.erros },
    { chave: "avisos", rotulo: "Com aviso", qtd: contagem.avisos },
  ];

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi rotulo="Linhas lidas" valor={linhas.length} />
        <Kpi rotulo={aplicada ? "Criadas" : "Vão ser criadas"} valor={contagem.criar} destaque />
        <Kpi rotulo="Já existiam" valor={contagem.existem} />
        <Kpi rotulo="Com erro" valor={contagem.erros} alerta={contagem.erros > 0} />
      </div>

      {/* Estado + ações */}
      <div className={cx(superficie.cardPadded, "flex flex-wrap items-center justify-between gap-4")}>
        <div className="flex items-center gap-3">
          <Badge tom={st.tom} ponto={pronta}>
            {st.rotulo}
          </Badge>
          <p className="text-sm text-ink-500">
            {pronta &&
              (contagem.criar > 0
                ? "Nada foi gravado ainda. Linhas com erro ou que já existem ficam de fora."
                : "Nenhuma linha para criar — corrija a planilha e envie de novo.")}
            {aplicada && "Tutores e pets já estão em Tutores e em Pets."}
            {importacao.status === "falhou" && (importacao.mensagem_erro ?? "A conferência não terminou.")}
          </p>
        </div>

        {pronta && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variante="texto" onClick={descartar} carregando={descartando} disabled={aplicando}>
              Descartar
            </Button>
            {confirmando ? (
              <>
                <span className="text-sm text-ink-700">
                  Criar {contagem.criar} {contagem.criar === 1 ? "linha" : "linhas"}?
                </span>
                <Button variante="neutra" onClick={() => setConfirmando(false)} disabled={aplicando}>
                  Voltar
                </Button>
                <Button variante="cta" onClick={aplicar} carregando={aplicando}>
                  {aplicando ? "Aplicando…" : "Confirmar"}
                </Button>
              </>
            ) : (
              <Button variante="cta" onClick={() => setConfirmando(true)} disabled={contagem.criar === 0}>
                Aplicar importação
              </Button>
            )}
          </div>
        )}
        {importacao.status === "falhou" && (
          <Button variante="texto" onClick={descartar} carregando={descartando}>
            Descartar
          </Button>
        )}
      </div>

      {pronta && importacao.mensagem_erro && (
        <p className={alerta("atencao")}>A última tentativa de aplicar falhou e nada foi gravado. Pode tentar de novo.</p>
      )}
      {mensagem && (
        <p className={alerta(mensagem.tom)} role={mensagem.tom === "erro" ? "alert" : "status"}>
          {mensagem.texto}
        </p>
      )}

      {/* Linhas */}
      <div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar linhas">
          {abas.map((a) => (
            <button
              key={a.chave}
              type="button"
              role="tab"
              aria-selected={filtro === a.chave}
              onClick={() => setFiltro(a.chave)}
              className={cx(
                "rounded-pill border px-3 py-1 text-sm transition-colors",
                filtro === a.chave
                  ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                  : "border-surface-border text-ink-500 hover:bg-surface-muted"
              )}
            >
              {a.rotulo} <span className="font-mono">{a.qtd}</span>
            </button>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <p className={cx(superficie.vazio, "mt-4 text-sm text-ink-500")}>Nenhuma linha neste filtro.</p>
        ) : (
          <div className={cx(tabela.wrapper, "mt-4")}>
            <table className={tabela.raiz}>
              <thead className={tabela.cabecalho}>
                <tr>
                  <th className={cx(tabela.th, "text-right")}>Linha</th>
                  <th className={tabela.th}>Tutor</th>
                  <th className={tabela.th}>Pet</th>
                  <th className={tabela.th}>Situação</th>
                  <th className={tabela.th}>Observação</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, LIMITE_RENDER).map((l) => {
                  const s = SITUACAO_LINHA[l.situacao];
                  return (
                    <tr key={l.id} className={cx(tabela.linha, "align-top")}>
                      <td className={cx(tabela.tdNumero, "text-ink-500")}>{l.numero}</td>
                      <td className={tabela.td}>
                        <div className="font-medium text-ink-900">{l.tutorNome || "—"}</div>
                        <div className="font-mono text-xs text-ink-500">{l.telefone || "sem telefone"}</div>
                      </td>
                      <td className={tabela.td}>
                        {l.petNome ? (
                          <>
                            <div className="text-ink-900">{l.petNome}</div>
                            {l.petDescricao && <div className="text-xs text-ink-500">{l.petDescricao}</div>}
                          </>
                        ) : (
                          <span className="text-ink-400">só tutor</span>
                        )}
                      </td>
                      <td className={tabela.td}>
                        <Badge tom={s.tom}>{s.rotulo}</Badge>
                      </td>
                      <td className={cx(tabela.td, "max-w-md text-sm")}>
                        {l.erro && <p className="text-danger-600">{l.erro}</p>}
                        {l.avisos.map((a, i) => (
                          <p key={i} className="text-ink-500">
                            {a}
                          </p>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtradas.length > LIMITE_RENDER && (
          <p className="mt-2 text-sm text-ink-500">
            Mostrando as primeiras {LIMITE_RENDER} de {filtradas.length} linhas deste filtro.
          </p>
        )}
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, destaque, alerta: temAlerta }: { rotulo: string; valor: number; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className={superficie.kpi}>
      <p className={texto.rotulo}>{rotulo}</p>
      <p
        className={cx(
          "mt-1 font-mono text-2xl",
          temAlerta ? "text-danger-600" : destaque ? "text-brand-700" : "text-ink-900"
        )}
      >
        {valor}
      </p>
    </div>
  );
}
