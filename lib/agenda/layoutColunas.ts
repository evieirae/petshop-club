// Alocação de colunas pra agendamentos que se sobrepõem no tempo — seção 4
// de docs/plano-calendario-agenda-reui.md. Vivia inline em
// GradeHorarios.tsx (Fase 3, quando a grade contínua ainda não existia e
// não tinha o que isolar); virou lib própria na Fase 4, exatamente como o
// plano previa: "candidata natural a ganhar o primeiro teste automatizado
// do projeto" — função pura, sem estado, sem nenhuma dependência de
// agendamento/pet/tutor, só intervalos [inicioMinutos, inicioMinutos +
// duracaoMinutos).
//
// Mesma lógica do Google Agenda: agrupa os eventos que se tocam em
// "clusters" e, dentro de cada cluster, aloca cada evento na primeira
// coluna livre (tipo agenda de salas). A largura de cada evento no grid é
// 100% / totalColunas do cluster que ele pertence.

export type EventoLayout = {
  id: string;
  inicioMinutos: number;
  duracaoMinutos: number;
};

export type ColunaAlocada = {
  id: string;
  coluna: number;
  totalColunas: number;
};

export function layoutColunas(eventos: EventoLayout[]): ColunaAlocada[] {
  const ordenados = [...eventos].sort((a, b) => {
    if (a.inicioMinutos !== b.inicioMinutos) return a.inicioMinutos - b.inicioMinutos;
    return a.duracaoMinutos - b.duracaoMinutos;
  });

  const resultado: ColunaAlocada[] = [];
  let cluster: typeof ordenados = [];
  let fimCluster = -Infinity;

  // Um cluster fecha quando o próximo evento (já ordenado por início) começa
  // depois que TODOS os eventos abertos até agora já terminaram — é isso que
  // faz A e C ficarem no mesmo cluster mesmo sem se tocar diretamente, se B
  // se toca com os dois (A-B-C em cadeia), igual ao Google Agenda.
  const fecharCluster = () => {
    if (cluster.length === 0) return;
    const fimPorColuna: number[] = [];
    const colunaPorId = new Map<string, number>();
    for (const evento of cluster) {
      let coluna = fimPorColuna.findIndex((fim) => fim <= evento.inicioMinutos);
      if (coluna === -1) {
        coluna = fimPorColuna.length;
        fimPorColuna.push(evento.inicioMinutos + evento.duracaoMinutos);
      } else {
        fimPorColuna[coluna] = evento.inicioMinutos + evento.duracaoMinutos;
      }
      colunaPorId.set(evento.id, coluna);
    }
    const totalColunas = fimPorColuna.length;
    for (const evento of cluster) {
      resultado.push({ id: evento.id, coluna: colunaPorId.get(evento.id)!, totalColunas });
    }
    cluster = [];
  };

  for (const evento of ordenados) {
    if (cluster.length > 0 && evento.inicioMinutos >= fimCluster) {
      fecharCluster();
    }
    cluster.push(evento);
    fimCluster = Math.max(fimCluster, evento.inicioMinutos + evento.duracaoMinutos);
  }
  fecharCluster();

  return resultado;
}
