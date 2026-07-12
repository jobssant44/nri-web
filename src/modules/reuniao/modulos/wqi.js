/**
 * Exportador do módulo WQI pra Reunião (.pptx).
 *
 * Estrutura por blocos (granularidade B — bloco = 1 gráfico = 1 slide):
 *   kpis        → Resumo Executivo (5 cards)
 *   mes         → R$ Perda — Mês a Mês
 *   dia         → R$ Perda — Dia a Dia (com meta tracejada)
 *   motivos     → Top 10 Motivos
 *   embalagens  → Top 10 Embalagens
 *
 * O orquestrador chama `wqiModulo.buscarDados()` UMA vez (1 round-trip
 * Firestore) e depois chama cada `wqiModulo.blocos[key](pptx, dados)`
 * conforme a lista de blocos selecionados pelo user.
 */
import { getDocs } from 'firebase/firestore';
import { carregarMeta } from '../../gestao-prejuizo/metasHelpers';
import {
  CORES,
  adicionarKPIs,
  adicionarSlideGraficoBarras,
  adicionarSlideGraficoLinha,
  formatarPeriodoBR,
} from '../templates';

// ─── Helpers (replica os helpers do WQIPage pra independência) ───────────────
const MOTIVOS_WQI = {
  '901': 'Quebra por Movimentação', '902': 'Blitz de Puxada',
  '903': 'Perda / Diferença',       '904': 'Prejuízo Inventário',
  '905': 'Micro Furo',              '906': 'Quebra de FEFO',
  '907': 'Erro de Programação',     '908': 'Furto / Sinistro',
};
const resolverMotivo = val => {
  const k = String(val ?? '').trim();
  return MOTIVOS_WQI[k] || k || '(Em branco)';
};

function parseNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val ?? '').trim().replace(/\s/g, '');
  if (!str || str === '-') return 0;
  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  let s = str;
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = str.replace(',', '.');
  } else if (lastDot !== -1) {
    const after = str.substring(lastDot + 1);
    if (after.length === 3 && /^\d+$/.test(after) && /^\d/.test(str))
      s = str.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDataBR(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}
function toISO(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toMesAno(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function mesAnoParaISO(mesAno) {
  if (!mesAno) return '';
  const [mm, yyyy] = mesAno.split('/');
  return `${yyyy}-${mm}`;
}

function brl(n)    { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0); }
function numFmt(n) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n || 0); }

// ─── Busca + agregação (chamada 1 vez por reunião) ───────────────────────────
async function buscarDados(opts, onProgress) {
  const { col, colRevenda, docRef, rid, dataInicio, dataFim } = opts; // eslint-disable-line no-unused-vars
  const log = msg => onProgress && onProgress(msg);

  log('WQI — buscando dados…');
  const [snap030237, snapHecto, meta] = await Promise.all([
    getDocs(colRevenda('relatorio_030237')),
    getDocs(colRevenda('relatorio_030147hecto')),
    carregarMeta('wqi', docRef, rid),
  ]);

  log('WQI — agregando…');
  const linhas = [];
  snap030237.docs.forEach(d => {
    (d.data().linhas || []).forEach(l => {
      const op = parseInt(l.operacao, 10);
      if (op < 101 || op > 108) return;
      if (String(l.status ?? '').trim().toUpperCase() === 'C') return;
      const iso = toISO(l.emissao);
      if (dataInicio && (!iso || iso < dataInicio)) return;
      if (dataFim    && (!iso || iso > dataFim))   return;
      linhas.push(l);
    });
  });

  const hectoFiltrado = snapHecto.docs.map(d => d.data()).filter(h => {
    const iso = toISO(h.data);
    if (!iso) return false;
    if (dataInicio && iso < dataInicio) return false;
    if (dataFim    && iso > dataFim)   return false;
    return true;
  });

  const totalValor = linhas.reduce((s, l) => s + parseNum(l.valor), 0);
  const totalHecto = hectoFiltrado.reduce((s, h) => s + parseNum(h.totalHecto), 0);
  const metaRS     = totalHecto * meta;
  const saldo      = metaRS - totalValor;
  const dentroMeta = saldo >= 0;
  const perdaRsHL  = totalHecto > 0 ? totalValor / totalHecto : 0;

  // Top motivos
  const mapMotivo = {};
  linhas.forEach(l => {
    const m = resolverMotivo(l.vendedor);
    mapMotivo[m] = (mapMotivo[m] || 0) + parseNum(l.valor);
  });
  const porMotivo = Object.entries(mapMotivo)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Top embalagens
  const mapEmb = {};
  linhas.forEach(l => {
    const c = String(l.produto || '').trim();
    const d = String(l.descricao || '').trim();
    const e = (c || d) ? (c ? (d ? `${c} - ${d}` : c) : d) : '(sem descrição)';
    mapEmb[e] = (mapEmb[e] || 0) + parseNum(l.valor);
  });
  const porEmbalagem = Object.entries(mapEmb)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Mês a Mês
  const mapMes = {};
  linhas.forEach(l => {
    const m = toMesAno(l.emissao);
    if (m) mapMes[m] = (mapMes[m] || 0) + parseNum(l.valor);
  });
  const porMes = Object.entries(mapMes)
    .sort(([a], [b]) => mesAnoParaISO(a).localeCompare(mesAnoParaISO(b)))
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  // Dia a Dia com meta
  const hectoMap = {};
  hectoFiltrado.forEach(h => {
    const iso = toISO(h.data);
    if (iso) hectoMap[iso] = (hectoMap[iso] || 0) + parseNum(h.totalHecto);
  });
  const isoMenosN = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  const mapDia = {};
  linhas.forEach(l => {
    const iso = toISO(l.emissao);
    if (iso) mapDia[iso] = (mapDia[iso] || 0) + parseNum(l.valor);
  });
  const porDia = Object.entries(mapDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, valor]) => {
      const [, mm, dd] = iso.split('-');
      const hectoAnt = hectoMap[isoMenosN(iso, 1)] || hectoMap[isoMenosN(iso, 2)] || 0;
      const metaDia  = hectoAnt > 0 ? Math.round(hectoAnt * meta * 100) / 100 : null;
      return { x: `${dd}/${mm}`, y: Math.round(valor * 100) / 100, meta: metaDia };
    });

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    meta, totalValor, totalHecto, metaRS, saldo, dentroMeta, perdaRsHL,
    porMotivo, porEmbalagem, porMes, porDia,
    qtdLinhas: linhas.length,
  };
}

// ─── Funções por bloco (cada uma adiciona 1 slide) ───────────────────────────
function blocoKPIs(pptx, d) {
  adicionarKPIs(pptx, {
    modulo: 'WQI',
    subtitulo: 'Resumo Executivo',
    periodo: d.periodo,
    kpis: [
      { label: 'R$ PERDA TOTAL', valor: brl(d.totalValor),                                  cor: CORES.red },
      { label: d.dentroMeta ? 'ECONOMIA' : 'ESTOURO', valor: brl(Math.abs(d.saldo)),        cor: d.dentroMeta ? CORES.green : CORES.red, sub: 'Meta − R$ Perda' },
      { label: 'HECTO ENTREGUE', valor: numFmt(d.totalHecto),                                cor: CORES.blue },
      { label: 'META R$',         valor: brl(d.metaRS),                                       cor: CORES.amber, sub: `R$ ${d.meta.toFixed(2).replace('.', ',')} × Hecto` },
      { label: 'PERDA R$/HL',     valor: d.totalHecto > 0 ? brl(d.perdaRsHL) : '—',          cor: CORES.green, sub: 'R$ Perda ÷ Hecto' },
    ],
  });
}

function blocoMes(pptx, d) {
  adicionarSlideGraficoBarras(pptx, {
    modulo: 'WQI', subtitulo: 'R$ Perda — Mês a Mês', periodo: d.periodo,
    dados: d.porMes, corBarra: CORES.amber, tipoBarra: 'bar',
  });
}

function blocoDia(pptx, d) {
  adicionarSlideGraficoLinha(pptx, {
    modulo: 'WQI',
    subtitulo: `R$ Perda — Dia a Dia  ·  Meta = R$ ${d.meta.toFixed(2).replace('.', ',')}/HL`,
    periodo: d.periodo,
    series: [
      { name: 'R$ Perda', dados: d.porDia.map(p => ({ x: p.x, y: p.y })) },
      { name: 'Meta',     dados: d.porDia.map(p => ({ x: p.x, y: p.meta })) },
    ],
    cores: [CORES.blue, CORES.red],
  });
}

function blocoMotivos(pptx, d) {
  adicionarSlideGraficoBarras(pptx, {
    modulo: 'WQI', subtitulo: 'Top 10 Motivos', periodo: d.periodo,
    dados: d.porMotivo, corBarra: CORES.blue, tipoBarra: 'barH',
  });
}

function blocoEmbalagens(pptx, d) {
  adicionarSlideGraficoBarras(pptx, {
    modulo: 'WQI', subtitulo: 'Top 10 Embalagens', periodo: d.periodo,
    dados: d.porEmbalagem, corBarra: CORES.red, tipoBarra: 'barH',
  });
}

// ─── Export do módulo ────────────────────────────────────────────────────────
export const wqiModulo = {
  key:   'wqi',
  label: 'WQI',
  cor:   'red',
  buscarDados,
  blocos: {
    kpis:       { label: 'Resumo Executivo (KPIs)',       padrao: true, exportar: blocoKPIs },
    mes:        { label: 'R$ Perda — Mês a Mês',          padrao: true, exportar: blocoMes },
    dia:        { label: 'R$ Perda — Dia a Dia',          padrao: true, exportar: blocoDia },
    motivos:    { label: 'Top 10 Motivos',                padrao: true, exportar: blocoMotivos },
    embalagens: { label: 'Top 10 Embalagens',             padrao: true, exportar: blocoEmbalagens },
  },
};
