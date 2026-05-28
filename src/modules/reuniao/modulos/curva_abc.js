/**
 * Exportador do módulo Curva ABC pra Reunião.
 * Lê `curva_abc_mensal/{rid}_YYYY-MM` (doc por mês). Pega o mês mais recente
 * dentro do período pra calcular KPIs/top produtos.
 */
import { getDocs } from 'firebase/firestore';
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras,
  formatarPeriodoBR,
} from '../templates';
import { intFmt } from './_helpers';

// Pareto: classifica produtos em A (≤80%), B (≤95%), C (>95%) por cxTotal
function calcularABC(produtos) {
  if (!produtos?.length) return [];
  const ord = [...produtos].sort((a, b) => (b.cxTotal || 0) - (a.cxTotal || 0));
  const total = ord.reduce((s, p) => s + (p.cxTotal || 0), 0);
  if (total <= 0) return ord.map(p => ({ ...p, curva: 'C' }));
  let acum = 0;
  return ord.map(p => {
    acum += (p.cxTotal || 0);
    const pct = (acum / total) * 100;
    return { ...p, curva: pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C', pctAcum: pct };
  });
}

async function buscarDados(opts, onProgress) {
  const { col, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('Curva ABC — buscando dados…');
  const snap = await getDocs(col('curva_abc_mensal'));

  log('Curva ABC — agregando…');

  // Cada doc: { ano, mes, produtos: [{ codigo, nome, cxTotal, cxAberto, cxFechado, diasComVendas }], ... }
  // Doc ID = `{rid}_YYYY-MM` mas pegamos do data direto pra não depender disso.
  const meses = snap.docs.map(d => {
    const data = d.data();
    const ano = data.ano, mes = data.mes;
    const isoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    return { isoMes, ano, mes, produtos: data.produtos || [], totalCx: data.totalCx || 0 };
  }).filter(m => m.ano && m.mes);

  // Filtra por período (mês deve estar dentro do intervalo)
  const dentroPeriodo = meses.filter(m => {
    const isoInicioMes = `${m.isoMes}-01`;
    const ultimoDia = new Date(m.ano, m.mes, 0).getDate();
    const isoFimMes = `${m.isoMes}-${String(ultimoDia).padStart(2, '0')}`;
    if (dataInicio && isoFimMes  < dataInicio) return false;
    if (dataFim    && isoInicioMes > dataFim)  return false;
    return true;
  });

  if (dentroPeriodo.length === 0) {
    return {
      periodo: formatarPeriodoBR(dataInicio, dataFim),
      semDados: true,
      mesUsado: null, qtdProdutos: 0, totalCx: 0,
      qtdA: 0, qtdB: 0, qtdC: 0,
      topProdutosCx: [], topProdutosAberto: [], topProdutosFechado: [],
    };
  }

  // Mês mais recente dentro do período
  const ordenados = dentroPeriodo.sort((a, b) => b.isoMes.localeCompare(a.isoMes));
  const mesEscolhido = ordenados[0];
  const classificados = calcularABC(mesEscolhido.produtos);

  const qtdA = classificados.filter(p => p.curva === 'A').length;
  const qtdB = classificados.filter(p => p.curva === 'B').length;
  const qtdC = classificados.filter(p => p.curva === 'C').length;
  const totalCx = classificados.reduce((s, p) => s + (p.cxTotal || 0), 0);

  // Top 20 produtos por cxTotal, com label "código - nome"
  const topProdutosCx = classificados
    .slice(0, 20)
    .map(p => ({
      name: `${p.codigo} - ${(p.nome || '').slice(0, 30)}`,
      value: Math.round(p.cxTotal || 0),
    }));

  // Top 10 por cxAberto e cxFechado
  const topAberto = [...classificados]
    .sort((a, b) => (b.cxAberto || 0) - (a.cxAberto || 0))
    .slice(0, 10)
    .map(p => ({ name: `${p.codigo} - ${(p.nome || '').slice(0, 30)}`, value: Math.round(p.cxAberto || 0) }));
  const topFechado = [...classificados]
    .sort((a, b) => (b.cxFechado || 0) - (a.cxFechado || 0))
    .slice(0, 10)
    .map(p => ({ name: `${p.codigo} - ${(p.nome || '').slice(0, 30)}`, value: Math.round(p.cxFechado || 0) }));

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    mesUsado: `${String(mesEscolhido.mes).padStart(2, '0')}/${mesEscolhido.ano}`,
    qtdProdutos: classificados.length,
    totalCx,
    qtdA, qtdB, qtdC,
    topProdutosCx, topAberto, topFechado,
  };
}

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'Curva ABC',
  subtitulo: d.mesUsado ? `Resumo Executivo  ·  Mês: ${d.mesUsado}` : 'Resumo Executivo',
  periodo: d.periodo,
  kpis: [
    { label: 'TOTAL CAIXAS',     valor: intFmt(d.totalCx),     cor: CORES.red },
    { label: 'PRODUTOS',          valor: intFmt(d.qtdProdutos), cor: CORES.blue },
    { label: 'CURVA A',           valor: intFmt(d.qtdA),        cor: CORES.green, sub: '≤80% das vendas' },
    { label: 'CURVA B',           valor: intFmt(d.qtdB),        cor: CORES.amber, sub: '≤95% das vendas' },
    { label: 'CURVA C',           valor: intFmt(d.qtdC),        cor: '64748B',    sub: '>95% das vendas' },
  ],
});
const blocoTop = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Curva ABC', subtitulo: 'Top 20 Produtos por Caixas Totais', periodo: d.periodo,
  dados: d.topProdutosCx, corBarra: CORES.red, tipoBarra: 'barH',
});
const blocoAberto = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Curva ABC', subtitulo: 'Top 10 Produtos — Palete Aberto (picking)', periodo: d.periodo,
  dados: d.topAberto, corBarra: CORES.blue, tipoBarra: 'barH',
});
const blocoFechado = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Curva ABC', subtitulo: 'Top 10 Produtos — Palete Fechado (estoque)', periodo: d.periodo,
  dados: d.topFechado, corBarra: CORES.amber, tipoBarra: 'barH',
});

export const curvaABCModulo = {
  key: 'curva_abc', label: 'Curva ABC', cor: 'red',
  buscarDados,
  blocos: {
    kpis:    { label: 'Resumo Executivo (KPIs)',                  padrao: true, exportar: blocoKPIs },
    top:     { label: 'Top 20 Produtos por Caixas Totais',         padrao: true, exportar: blocoTop },
    aberto:  { label: 'Top 10 Produtos — Picking (cx aberto)',     padrao: true, exportar: blocoAberto },
    fechado: { label: 'Top 10 Produtos — Estoque (cx fechado)',    padrao: true, exportar: blocoFechado },
  },
};
