/**
 * Exportador do módulo Reabastecimento pra Reunião.
 * Lê `abastecimentos` (multi-tenant: col). Campos:
 *   codProduto, nomeProduto, tipo ('reabastecimento'|'ressuprimento'),
 *   qtdPaletes, dataOperacional (DD/MM/AAAA), hora, conferente, criadoEm.
 */
import { getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras,
  formatarPeriodoBR,
} from '../templates';
import { toISO, intFmt, parseNum } from './_helpers';

async function buscarDados(opts, onProgress) {
  const { col, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('Reabastecimento — buscando dados…');
  // Lê SÓ a janela do período da reunião por criadoEm (com folga de 7 dias pra a
  // defasagem entre criadoEm e dataOperacional), com teto de segurança. Antes: 12
  // meses fixos numa coleção que cresce a cada operação, e o catch caía num
  // getDocs(col) SEM filtro (varria tudo). Removido — query single-field (criadoEm),
  // usa índice automático. O recorte fino por dataOperacional segue no cliente.
  const iniMs = Date.parse(dataInicio), fimMs = Date.parse(dataFim), DIA = 86400000;
  const loISO = new Date((Number.isNaN(iniMs) ? Date.now() - 365 * DIA : iniMs) - 7 * DIA).toISOString();
  const hiISO = new Date((Number.isNaN(fimMs) ? Date.now() : fimMs) + 8 * DIA).toISOString();
  const snap = await getDocs(query(
    col('abastecimentos'),
    where('criadoEm', '>=', loISO),
    where('criadoEm', '<=', hiISO),
    orderBy('criadoEm', 'desc'),
    limit(10000),
  ));
  const docs = snap.docs.map(d => d.data());

  log('Reabastecimento — agregando…');

  // Filtro por dataOperacional dentro do período escolhido
  const linhas = docs.filter(a => {
    const iso = toISO(a.dataOperacional);
    if (!iso) return false;
    if (dataInicio && iso < dataInicio) return false;
    if (dataFim    && iso > dataFim)   return false;
    return true;
  });

  const total       = linhas.length;
  const qtdReab     = linhas.filter(a => String(a.tipo).toLowerCase() === 'reabastecimento').length;
  const qtdRessup   = linhas.filter(a => String(a.tipo).toLowerCase() === 'ressuprimento').length;
  const qtdProdutos = new Set(linhas.map(a => a.codProduto).filter(Boolean)).size;
  const totalPaletes = linhas.reduce((s, a) => s + parseNum(a.qtdPaletes), 0);

  // Top 10 produtos (qtd de operações)
  const mapProd = {};
  linhas.forEach(a => {
    if (!a.codProduto) return;
    const k = `${a.codProduto} - ${(a.nomeProduto || '').slice(0, 28)}`;
    mapProd[k] = (mapProd[k] || 0) + 1;
  });
  const topProdutos = Object.entries(mapProd)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Top 10 conferentes (qtd)
  const mapConf = {};
  linhas.forEach(a => {
    const c = String(a.conferente || '').trim();
    if (!c) return;
    mapConf[c] = (mapConf[c] || 0) + 1;
  });
  const topConferentes = Object.entries(mapConf)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Mês a mês
  const mapMes = {};
  linhas.forEach(a => {
    const d = String(a.dataOperacional || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!d) return;
    const k = `${d[2].padStart(2, '0')}/${d[3]}`;
    mapMes[k] = (mapMes[k] || 0) + 1;
  });
  const porMes = Object.entries(mapMes)
    .sort(([a], [b]) => {
      const [ma, ya] = a.split('/'); const [mb, yb] = b.split('/');
      return (ya + ma).localeCompare(yb + mb);
    })
    .map(([name, value]) => ({ name, value }));

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    total, qtdReab, qtdRessup, qtdProdutos, totalPaletes,
    topProdutos, topConferentes, porMes,
  };
}

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'Reabastecimento', subtitulo: 'Resumo Executivo', periodo: d.periodo,
  kpis: [
    { label: 'OPERAÇÕES TOTAL',  valor: intFmt(d.total),         cor: CORES.red },
    { label: 'REABASTECIMENTOS', valor: intFmt(d.qtdReab),        cor: CORES.blue,  sub: 'Operação normal' },
    { label: 'RESSUPRIMENTOS',   valor: intFmt(d.qtdRessup),      cor: CORES.amber, sub: 'Emergencial' },
    { label: 'PRODUTOS ÚNICOS',  valor: intFmt(d.qtdProdutos),    cor: CORES.green },
    { label: 'TOTAL PALETES',    valor: intFmt(d.totalPaletes),  cor: CORES.blue },
  ],
});
const blocoProdutos = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Reabastecimento', subtitulo: 'Top 10 Produtos (qtd de operações)', periodo: d.periodo,
  dados: d.topProdutos, corBarra: CORES.blue, tipoBarra: 'barH',
});
const blocoConferentes = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Reabastecimento', subtitulo: 'Top 10 Conferentes (qtd de operações)', periodo: d.periodo,
  dados: d.topConferentes, corBarra: CORES.amber, tipoBarra: 'barH',
});
const blocoMes = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Reabastecimento', subtitulo: 'Operações — Mês a Mês', periodo: d.periodo,
  dados: d.porMes, corBarra: CORES.green, tipoBarra: 'bar',
});

export const reabModulo = {
  key: 'reab', label: 'Reabastecimento', cor: 'blue',
  buscarDados,
  blocos: {
    kpis:        { label: 'Resumo Executivo (KPIs)',                padrao: true, exportar: blocoKPIs },
    produtos:    { label: 'Top 10 Produtos (qtd de operações)',     padrao: true, exportar: blocoProdutos },
    conferentes: { label: 'Top 10 Conferentes',                      padrao: true, exportar: blocoConferentes },
    mes:         { label: 'Operações — Mês a Mês',                   padrao: true, exportar: blocoMes },
  },
};
