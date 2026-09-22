import ExcelJS from "exceljs";
import type { CampoImportacao } from "./campos";

// ============================================================================
// Modelo .xlsx para download: aba de dados com os cabeçalhos certos e linhas
// de exemplo, e uma aba de instruções. Os cabeçalhos são exatamente os
// rótulos dos campos, então o palpite de mapeamento acerta 100% quando o
// petshop usa o modelo.
// ============================================================================

export async function gerarModeloXlsx(opcoes: {
  nomeAba: string;
  campos: CampoImportacao[];
  instrucoes: string[];
  listas?: Record<string, string[]>; // chave do campo → valores do menu suspenso
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PetClub";
  wb.created = new Date();

  const aba = wb.addWorksheet(opcoes.nomeAba, { views: [{ state: "frozen", ySplit: 1 }] });
  aba.columns = opcoes.campos.map((c) => ({
    header: c.rotulo,
    key: c.chave,
    width: Math.max(14, c.rotulo.length + 4, ...c.exemplos.map((e) => e.length + 2)),
  }));

  const cabecalho = aba.getRow(1);
  cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecalho.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  opcoes.campos.forEach((c, i) => {
    if (c.dica) cabecalho.getCell(i + 1).note = c.dica;
    if (c.obrigatorio) cabecalho.getCell(i + 1).fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: "FFC0504D" },
    };
  });

  const qtdExemplos = Math.max(...opcoes.campos.map((c) => c.exemplos.length));
  for (let i = 0; i < qtdExemplos; i++) {
    const linha = aba.addRow(Object.fromEntries(opcoes.campos.map((c) => [c.chave, c.exemplos[i] ?? ""])));
    linha.font = { italic: true, color: { argb: "FF7F7F7F" } };
  }

  // Menus suspensos (Porte, Espécie, Sexo) nas primeiras 5.000 linhas —
  // o petshop ainda pode digitar à mão; a conferência entende variações.
  for (const [chave, valores] of Object.entries(opcoes.listas ?? {})) {
    const col = aba.getColumn(chave);
    for (let r = 2; r <= 5001; r++) {
      aba.getCell(r, col.number).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${valores.join(",")}"`],
        showErrorMessage: false,
      };
    }
  }

  const instr = wb.addWorksheet("Instruções");
  instr.getColumn(1).width = 110;
  instr.addRow(["Como preencher"]).font = { bold: true, size: 14 };
  instr.addRow([]);
  for (const linha of opcoes.instrucoes) instr.addRow([linha]).alignment = { wrapText: true };
  instr.addRow([]);
  instr.addRow(["Colunas"]).font = { bold: true, size: 12 };
  for (const c of opcoes.campos) {
    instr.addRow([`${c.rotulo}${c.obrigatorio ? " (obrigatório)" : ""}${c.dica ? " — " + c.dica : ""}`]);
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
