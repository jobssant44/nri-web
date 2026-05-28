/**
 * Exportador do módulo MPD pra Reunião.
 * Lê `relatorio031120` (multi-tenant: colRevenda). Campos: mapa, fase (EFC/EFD/TI),
 * revenda, placa, frotaCadastrada, dataEmissao, dataOperacao, horaOperacao, motorista.
 */
import { getDocs } from 'firebase/firestore';
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras,
  formatarPeriodoBR,
} from '../templates';
import { toISO, intFmt, montarSerieMensal } from './_helpers';

async function buscarDados(opts, onProgress) {
  const { colRevenda, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('MPD — buscando dados…');
  const snap = await getDocs(colRevenda('relatorio031120'));

  log('MPD — agregando…');
  const linhas = snap.docs.map(d => d.data()).filter(l => {
    const iso = toISO(l.dataEmissao);
    if (!iso) return false;
    if (dataInicio && iso < dataInicio) return false;
    if (dataFim    && iso > dataFim)   return false;
    return true;
  });

  const totalRegistros = linhas.length;
  const totalMapas     = new Set(linhas.map(l => l.mapa).filter(Boolean)).size;
  const totalMotoristas = new Set(linhas.map(l => String(l.motorista ?? '').trim()).filter(Boolean)).size;
  const totalPlacas    = new Set(linhas.map(l => String(l.placa ?? '').trim()).filter(Boolean)).size;
  const totalRevendas  = new Set(linhas.map(l => String(l.revenda ?? '').trim()).filter(Boolean)).size;

  // Top motoristas (qtd mapas únicos)
  const mapMot = {};
  linhas.forEach(l => {
    const m = String(l.motorista ?? '').trim();
    if (!m || !l.mapa) return;
    if (!mapMot[m]) mapMot[m] = new Set();
    mapMot[m].add(l.mapa);
  });
  const topMotoristas = Object.entries(mapMot)
    .map(([name, set]) => ({ name, value: set.size }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Distribuição por fase
  const mapFase = {};
  linhas.forEach(l => {
    const f = String(l.fase ?? '').trim() || '(sem fase)';
    if (!l.mapa) return;
    if (!mapFase[f]) mapFase[f] = new Set();
    mapFase[f].add(l.mapa);
  });
  const porFase = Object.entries(mapFase)
    .map(([name, set]) => ({ name, value: set.size }))
    .sort((a, b) => b.value - a.value);

  // Mês a mês (qtd de mapas únicos por mês)
  const mapMes = {};
  linhas.forEach(l => {
    if (!l.mapa) return;
    const d = String(l.dataEmissao || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!d) return;
    const k = `${d[2]}/${d[3]}`;
    if (!mapMes[k]) mapMes[k] = new Set();
    mapMes[k].add(l.mapa);
  });
  const porMes = Object.entries(mapMes)
    .sort(([a], [b]) => {
      const [ma, ya] = a.split('/'); const [mb, yb] = b.split('/');
      return (ya + ma).localeCompare(yb + mb);
    })
    .map(([name, set]) => ({ name, value: set.size }));

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    totalRegistros, totalMapas, totalMotoristas, totalPlacas, totalRevendas,
    topMotoristas, porFase, porMes,
  };
}

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'MPD', subtitulo: 'Resumo Executivo', periodo: d.periodo,
  kpis: [
    { label: 'TOTAL DE MAPAS', valor: intFmt(d.totalMapas),       cor: CORES.red },
    { label: 'REGISTROS',       valor: intFmt(d.totalRegistros),   cor: CORES.blue },
    { label: 'MOTORISTAS',      valor: intFmt(d.totalMotoristas),  cor: CORES.amber },
    { label: 'PLACAS',          valor: intFmt(d.totalPlacas),      cor: CORES.green },
    { label: 'REVENDAS',        valor: intFmt(d.totalRevendas),    cor: CORES.blue },
  ],
});
const blocoMotoristas = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'MPD', subtitulo: 'Top 10 Motoristas (qtd de mapas)', periodo: d.periodo,
  dados: d.topMotoristas, corBarra: CORES.blue, tipoBarra: 'barH',
});
const blocoFases = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'MPD', subtitulo: 'Distribuição por Fase (qtd de mapas)', periodo: d.periodo,
  dados: d.porFase, corBarra: CORES.amber, tipoBarra: 'barH',
});
const blocoMes = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'MPD', subtitulo: 'Mapas — Mês a Mês', periodo: d.periodo,
  dados: d.porMes, corBarra: CORES.green, tipoBarra: 'bar',
});

export const mpdModulo = {
  key: 'mpd', label: 'MPD', cor: 'green',
  buscarDados,
  blocos: {
    kpis:       { label: 'Resumo Executivo (KPIs)',          padrao: true, exportar: blocoKPIs },
    motoristas: { label: 'Top 10 Motoristas (qtd de mapas)', padrao: true, exportar: blocoMotoristas },
    fases:      { label: 'Distribuição por Fase',             padrao: true, exportar: blocoFases },
    mes:        { label: 'Mapas — Mês a Mês',                 padrao: true, exportar: blocoMes },
  },
};
