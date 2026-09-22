import ExcelJS from "exceljs";
import Papa from "papaparse";

// ============================================================================
// Leitura do arquivo enviado — só no servidor (Server Action). O arquivo com
// os dados de centenas de clientes nunca é lido no navegador nem guardado em
// lugar nenhum: é lido em memória, vira linhas, e só as linhas vão para o
// banco (importacao_linhas).
// ============================================================================

export const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB — casa com bodySizeLimit do next.config
export const LIMITE_LINHAS = 5000;

export type TipoArquivo = "xlsx" | "csv";

export type LinhaLida = {
  /** Número da linha como o petshop vê na planilha (cabeçalho costuma ser 1). */
  numero: number;
  /** cabeçalho → valor da célula, sempre texto. */
  valores: Record<string, string>;
};

export type PlanilhaLida = {
  tipo: TipoArquivo;
  cabecalhos: string[];
  linhas: LinhaLida[];
};

/** Erro com mensagem pronta para mostrar ao petshop. */
export class ErroLeitura extends Error {}

export function tipoDoArquivo(nome: string): TipoArquivo | null {
  const n = nome.toLowerCase();
  if (n.endsWith(".xlsx")) return "xlsx";
  if (n.endsWith(".csv") || n.endsWith(".txt")) return "csv";
  return null;
}

export async function lerPlanilha(arquivo: File): Promise<PlanilhaLida> {
  const tipo = tipoDoArquivo(arquivo.name);
  if (!tipo) {
    throw new ErroLeitura(
      arquivo.name.toLowerCase().endsWith(".xls")
        ? "Arquivos .xls (Excel antigo) não são aceitos. Abra no Excel e use \"Salvar como\" → .xlsx."
        : "Envie um arquivo .xlsx (Excel) ou .csv."
    );
  }
  if (arquivo.size === 0) throw new ErroLeitura("O arquivo está vazio.");
  if (arquivo.size > LIMITE_BYTES) {
    throw new ErroLeitura("O arquivo passa de 5 MB. Divida em partes menores e importe uma de cada vez.");
  }

  const buffer = await arquivo.arrayBuffer();
  const lida = tipo === "xlsx" ? await lerXlsx(buffer) : lerCsv(buffer);

  if (lida.cabecalhos.length === 0) {
    throw new ErroLeitura("Não encontramos o cabeçalho (a linha com os nomes das colunas).");
  }
  if (lida.linhas.length === 0) {
    throw new ErroLeitura("A planilha tem cabeçalho, mas nenhuma linha preenchida abaixo dele.");
  }
  if (lida.linhas.length > LIMITE_LINHAS) {
    throw new ErroLeitura(
      `A planilha tem ${lida.linhas.length} linhas; o limite por importação é ${LIMITE_LINHAS}. Divida em partes.`
    );
  }
  return { tipo, ...lida };
}

// ----------------------------------------------------------------------------

/** Cabeçalhos vazios viram "Coluna N"; repetidos ganham " (2)", " (3)"... */
function cabecalhosUnicos(brutos: string[]): string[] {
  const vistos = new Map<string, number>();
  return brutos.map((b, i) => {
    const base = b.replace(/\s+/g, " ").trim() || `Coluna ${i + 1}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function montarLinhas(
  cabecalhos: string[],
  linhas: { numero: number; celulas: string[] }[]
): LinhaLida[] {
  const resultado: LinhaLida[] = [];
  for (const { numero, celulas } of linhas) {
    if (celulas.every((c) => !c.trim())) continue; // linha em branco: ignora sem contar
    const valores: Record<string, string> = {};
    cabecalhos.forEach((cab, i) => {
      valores[cab] = (celulas[i] ?? "").trim();
    });
    resultado.push({ numero, valores });
  }
  return resultado;
}

// ----------------------------------------------------------------------------
// XLSX
// ----------------------------------------------------------------------------

function textoCelula(celula: ExcelJS.Cell): string {
  try {
    return (celula.text ?? "").toString();
  } catch {
    const v = celula.value;
    return v == null ? "" : String(v);
  }
}

async function lerXlsx(buffer: ArrayBuffer): Promise<Omit<PlanilhaLida, "tipo">> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ErroLeitura("Não conseguimos abrir o arquivo. Confira se é um .xlsx válido (não protegido por senha).");
  }

  // Primeira aba visível com conteúdo, pulando a aba de instruções do modelo.
  const aba = workbook.worksheets.find(
    (ws) =>
      ws.state !== "hidden" &&
      ws.state !== "veryHidden" &&
      ws.actualRowCount > 0 &&
      !/instru/i.test(ws.name)
  );
  if (!aba) throw new ErroLeitura("A planilha não tem nenhuma aba com dados.");

  const linhasBrutas: { numero: number; celulas: string[] }[] = [];
  const largura = aba.columnCount;
  aba.eachRow({ includeEmpty: false }, (row) => {
    const celulas: string[] = [];
    for (let c = 1; c <= largura; c++) celulas.push(textoCelula(row.getCell(c)));
    linhasBrutas.push({ numero: row.number, celulas });
  });

  const idxCabecalho = linhasBrutas.findIndex((l) => l.celulas.some((c) => c.trim()));
  if (idxCabecalho < 0) return { cabecalhos: [], linhas: [] };

  // Corta colunas vazias à direita do cabeçalho.
  const brutos = linhasBrutas[idxCabecalho].celulas;
  let ultima = brutos.length;
  while (ultima > 0 && !brutos[ultima - 1].trim()) ultima--;
  const cabecalhos = cabecalhosUnicos(brutos.slice(0, ultima));

  return { cabecalhos, linhas: montarLinhas(cabecalhos, linhasBrutas.slice(idxCabecalho + 1)) };
}

// ----------------------------------------------------------------------------
// CSV — o Excel brasileiro salva CSV em Windows-1252 e com ";" como
// separador; ferramentas web costumam usar UTF-8 e ",". Os dois funcionam.
// ----------------------------------------------------------------------------

function decodificar(buffer: ArrayBuffer): string {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    texto = new TextDecoder("windows-1252").decode(buffer);
  }
  return texto.replace(/^﻿/, "");
}

function lerCsv(buffer: ArrayBuffer): Omit<PlanilhaLida, "tipo"> {
  const texto = decodificar(buffer);
  const resultado = Papa.parse<string[]>(texto, { skipEmptyLines: false });
  const linhas = resultado.data.map((celulas, i) => ({
    numero: i + 1,
    celulas: (celulas ?? []).map((c) => (c ?? "").toString()),
  }));

  const idxCabecalho = linhas.findIndex((l) => l.celulas.some((c) => c.trim()));
  if (idxCabecalho < 0) return { cabecalhos: [], linhas: [] };

  const brutos = linhas[idxCabecalho].celulas;
  let ultima = brutos.length;
  while (ultima > 0 && !brutos[ultima - 1].trim()) ultima--;
  const cabecalhos = cabecalhosUnicos(brutos.slice(0, ultima));

  return { cabecalhos, linhas: montarLinhas(cabecalhos, linhas.slice(idxCabecalho + 1)) };
}
