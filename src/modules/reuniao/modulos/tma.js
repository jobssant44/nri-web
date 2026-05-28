/**
 * Exportador do módulo TMA pra Reunião.
 * Lê `tma_registros` (multi-tenant: colRevenda). Campos: dataInicio (DD/MM/AAAA),
 * motorista, local, placa, tmaMs.
 */
import { getDocs } from 'firebase/firestore';
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras,
  formatarPeriodoBR,
} from '../templates';
import { toISO, parseNum, intFmt, montarSerieMensal } from './_helpers';

// Formata ms como HH:MM:SS
function formatarTMA(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

async function buscarDados(opts, onProgress) {
  const { colRevenda, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('TMA — buscando dados…');
  const snap = await getDocs(colRevenda('tma_registros'));

  log('TMA — agregando…');
  const linhas = snap.docs.map(d => d.data()).filter(l => {
    const iso = toISO(l.dataInicio);
    if (!iso) return false;
    if (dataInicio && iso < dataInicio) return false;
    if (dataFim    && iso > dataFim)   return false;
    return true;
  });

  const qtdRegistros = linhas.length;
  const tmaMedio     = qtdRegistros ? linhas.reduce((s, r) => s + (parseNum(r.tmaMs) || 0), 0) / qtdRegistros : 0;
  const motoristas   = new Set(linhas.map(r => r.motorista).filter(Boolean)).size;
  const locais       = new Set(linhas.map(r => r.local).filter(Boolean)).size;
  const placas       = new Set(linhas.map(r => r.placa).filter(Boolean)).size;

  // Top motoristas (pior TMA = média maior). Min 3 registros pra não sair outlier.
  const mapMot = {};
  linhas.forEach(r => {
    if (!r.motorista) return;
    if (!mapMot[r.motorista]) mapMot[r.motorista] = { soma: 0, n: 0 };
    mapMot[r.motorista].soma += parseNum(r.tmaMs);
    mapMot[r.motorista].n    += 1;
  });
  const piorMotoristas = Object.entries(mapMot)
    .filter(([, v]) => v.n >= 3)
    .map(([name, v]) => ({ name, value: Math.round(v.soma / v.n / 60000) })) // valor em min
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Top locais (pior TMA)
  const mapLoc = {};
  linhas.forEach(r => {
    if (!r.local) return;
    if (!mapLoc[r.local]) mapLoc[r.local] = { soma: 0, n: 0 };
    mapLoc[r.local].soma += parseNum(r.tmaMs);
    mapLoc[r.local].n    += 1;
  });
  const piorLocais = Object.entries(mapLoc)
    .filter(([, v]) => v.n >= 3)
    .map(([name, v]) => ({ name, value: Math.round(v.soma / v.n / 60000) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Mês a mês (TMA médio do mês em minutos)
  const mapMes = {};
  linhas.forEach(r => {
    if (!r.tmaMs) return;
    const d = String(r.dataInicio || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!d) return;
    const k = `${d[2]}/${d[3]}`;
    if (!mapMes[k]) mapMes[k] = { soma: 0, n: 0 };
    mapMes[k].soma += parseNum(r.tmaMs);
    mapMes[k].n    += 1;
  });
  const porMes = Object.entries(mapMes)
    .sort(([a], [b]) => {
      const [ma, ya] = a.split('/'); const [mb, yb] = b.split('/');
      return (ya + ma).localeCompare(yb + mb);
    })
    .map(([name, v]) => ({ name, value: Math.round(v.soma / v.n / 60000) })); // min

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    qtdRegistros, tmaMedio, motoristas, locais, placas,
    piorMotoristas, piorLocais, porMes,
  };
}

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'TMA', subtitulo: 'Resumo Executivo', periodo: d.periodo,
  kpis: [
    { label: 'TMA MÉDIO',  valor: formatarTMA(d.tmaMedio),         cor: CORES.red },
    { label: 'REGISTROS',   valor: intFmt(d.qtdRegistros),          cor: CORES.blue },
    { label: 'MOTORISTAS',  valor: intFmt(d.motoristas),            cor: CORES.amber },
    { label: 'PLACAS',      valor: intFmt(d.placas),                 cor: CORES.green },
    { label: 'LOCAIS',      valor: intFmt(d.locais),                cor: CORES.blue },
  ],
});
const blocoMotoristas = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'TMA', subtitulo: 'Top 10 Motoristas — Pior TMA (min)', periodo: d.periodo,
  dados: d.piorMotoristas, corBarra: CORES.red, tipoBarra: 'barH',
});
const blocoLocais = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'TMA', subtitulo: 'Top 10 Locais — Pior TMA (min)', periodo: d.periodo,
  dados: d.piorLocais, corBarra: CORES.amber, tipoBarra: 'barH',
});
const blocoMes = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'TMA', subtitulo: 'TMA Médio — Mês a Mês (min)', periodo: d.periodo,
  dados: d.porMes, corBarra: CORES.blue, tipoBarra: 'bar',
});

export const tmaModulo = {
  key: 'tma', label: 'TMA', cor: 'amber',
  buscarDados,
  blocos: {
    kpis:       { label: 'Resumo Executivo (KPIs)',          padrao: true, exportar: blocoKPIs },
    motoristas: { label: 'Top 10 Motoristas — pior TMA',      padrao: true, exportar: blocoMotoristas },
    locais:     { label: 'Top 10 Locais — pior TMA',          padrao: true, exportar: blocoLocais },
    mes:        { label: 'TMA Médio — Mês a Mês',             padrao: true, exportar: blocoMes },
  },
};
