/**
 * Exportador do módulo Stock Age Index pra Reunião.
 *
 * Espelha a página on-screen `StockAgeIndexPage`: reusa os helpers de
 * gestão de idade EXATAMENTE como a página (carregarLogsContagem +
 * carregarProdutosMap + carregarPZVMap + carregarVendaMediaMap + avaliarPalete),
 * filtra pelo período e calcula as MESMAS agregações:
 *   calcularStockAge (KPIs) + porCurva + porMes + porEmbalagem.
 *
 * Stock Age Index = % de hectolitros "saudáveis" (acima de 60% de shelf life).
 * Meta = 90%.
 */
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras, adicionarSlideGraficoLinha,
  adicionarSlideImagem, formatarPeriodoBR,
} from '../templates';
import { intFmt } from './_helpers';
import { capturarParaPNG } from '../captura';
import { elementoStockAgeSlide } from '../slides/StockAgeSlide';
import {
  avaliarPalete, calcularStockAge, tsToDate, resolverPZV,
  carregarLogsContagem, carregarProdutosMap, carregarPZVMap, carregarVendaMediaMap,
  THRESHOLD_SEGREGAR_PCT,
} from '../../gestao-idade/gestaoIdadeHelpers';

const MESES_NOME = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const META = 90; // meta % do stock age index

// ISO 'YYYY-MM-DD' → Date local (00:00 pro início, 23:59 pro fim)
function isoParaDate(iso, fimDoDia) {
  if (!iso) return undefined;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return fimDoDia
    ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
    : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
}

async function buscarDados(opts, onProgress) {
  const { col, docRef, rid, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  const dtInicio = isoParaDate(dataInicio, false);
  const dtFim    = isoParaDate(dataFim, true);

  log('Stock Age — carregando contagens…');
  const [logs, produtosMap, pzvMap, vendaMap] = await Promise.all([
    carregarLogsContagem({ col, dataInicio: dtInicio, dataFim: dtFim }),
    carregarProdutosMap({ col }),
    carregarPZVMap({ col }),
    carregarVendaMediaMap({ col, docRef, rid, diasJanela: 30 }),
  ]);

  log('Stock Age — avaliando paletes…');
  const linhas = logs.map(l => {
    const cod = String(l.productCode || '').trim();
    const produto = produtosMap[cod];
    const pzv = resolverPZV(cod, pzvMap, produto);
    const v = vendaMap[cod] || 0;
    const a = avaliarPalete({
      log: l, dataReferencia: tsToDate(l.timestamp) || new Date(),
      produto, pzvDias: pzv, vendaMediaCxDia: v, curvaProduto: l.productCurva,
    });
    a._ts = tsToDate(l.timestamp);
    return a;
  });

  log('Stock Age — agregando…');
  const agreg = calcularStockAge(linhas);

  // Por curva ABC — % saudável por curva (espelha porCurva da página)
  const mapCurva = { A: { hecto: 0, hectoSL60: 0 }, B: { hecto: 0, hectoSL60: 0 }, C: { hecto: 0, hectoSL60: 0 } };
  linhas.forEach(l => {
    if (!l.curva || !mapCurva[l.curva]) return;
    mapCurva[l.curva].hecto += l.hectoTotal;
    if (l.pctShelfLife != null && l.pctShelfLife < THRESHOLD_SEGREGAR_PCT) {
      mapCurva[l.curva].hectoSL60 += l.hectoTotal;
    }
  });
  const porCurva = ['A', 'B', 'C'].map(c => ({
    name: c,
    value: mapCurva[c].hecto > 0 ? ((mapCurva[c].hecto - mapCurva[c].hectoSL60) / mapCurva[c].hecto) * 100 : 0,
    hecto: mapCurva[c].hecto,
    hectoSL60: mapCurva[c].hectoSL60,
  }));

  // Por mês — % saudável mês a mês dentro do período (espelha porMes da página)
  const mapMes = {}; // 'YYYY-MM' → { hecto, hectoSL60 }
  linhas.forEach(l => {
    if (!l._ts) return;
    const chave = `${l._ts.getFullYear()}-${String(l._ts.getMonth() + 1).padStart(2, '0')}`;
    if (!mapMes[chave]) mapMes[chave] = { hecto: 0, hectoSL60: 0 };
    mapMes[chave].hecto += l.hectoTotal;
    if (l.pctShelfLife != null && l.pctShelfLife < THRESHOLD_SEGREGAR_PCT) {
      mapMes[chave].hectoSL60 += l.hectoTotal;
    }
  });
  const porMes = Object.entries(mapMes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, v]) => {
      const mm = parseInt(chave.split('-')[1], 10);
      return {
        name: MESES_NOME[mm - 1],
        value: v.hecto > 0 ? Math.round(((v.hecto - v.hectoSL60) / v.hecto) * 100) : 0,
      };
    });

  // Por embalagem — % crítico (< 60% SL) por embalagem (espelha porEmbalagem da página)
  const mapEmb = {};
  linhas.forEach(l => {
    const e = l.embalagem || '—';
    if (!mapEmb[e]) mapEmb[e] = { hecto: 0, hectoSL60: 0 };
    mapEmb[e].hecto += l.hectoTotal;
    if (l.pctShelfLife != null && l.pctShelfLife < THRESHOLD_SEGREGAR_PCT) {
      mapEmb[e].hectoSL60 += l.hectoTotal;
    }
  });
  const porEmbalagem = Object.entries(mapEmb)
    .map(([e, v]) => ({
      name: e,
      value: v.hecto > 0 ? (v.hectoSL60 / v.hecto) * 100 : 0,
      hecto: v.hecto,
      hectoSL60: v.hectoSL60,
    }))
    .sort((a, b) => b.hecto - a.hecto);

  const statusLabel = agreg.stockAgeIndex >= META ? 'OK' : agreg.stockAgeIndex >= 70 ? 'Atenção' : 'Crítico';

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    meta: META,
    stockAgeIndex: agreg.stockAgeIndex,
    hectoTotal: agreg.hectoTotal,
    hectoSegregar: agreg.hectoSegregar,
    pctSegregar: agreg.pctSegregar,
    hl30: agreg.hl30,
    hecto45: agreg.hecto45,
    statusLabel,
    paletes: linhas.length,
    porCurva, porMes, porEmbalagem,
  };
}

// "Tela completa": renderiza a cara do dashboard e captura como PNG. Se falhar,
// NÃO derruba o deck: cai pros slides nativos.
async function blocoTela(pptx, d) {
  try {
    const { dataUrl, largura, altura } = await capturarParaPNG(elementoStockAgeSlide(d), { largura: 1280 });
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
      adicionarSlideImagem(pptx, { dataUrl, imgW: largura, imgH: altura });
      return;
    }
    throw new Error('captura retornou vazia');
  } catch (e) {
    console.warn('Stock Age: captura da tela falhou — usando slides nativos como fallback.', e);
    blocoKPIs(pptx, d);
    blocoCurva(pptx, d);
    blocoMes(pptx, d);
  }
}

const fmtHL  = v => intFmt(Math.round(v || 0));
const fmtPct = v => `${(v || 0).toFixed(2)}%`;

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'Stock Age Index',
  subtitulo: 'Resumo Executivo',
  periodo: d.periodo,
  kpis: [
    { label: '% STOCK AGE',   valor: fmtPct(d.stockAgeIndex), cor: d.stockAgeIndex >= META ? CORES.green : d.stockAgeIndex >= 70 ? CORES.amber : CORES.red, sub: `Meta: ${META}%` },
    { label: 'HECTO TOTAL',   valor: fmtHL(d.hectoTotal),     cor: CORES.blue,  sub: `${intFmt(d.paletes)} palete(s)` },
    { label: 'HL < 60% SL',   valor: fmtHL(d.hectoSegregar),  cor: CORES.red,   sub: `${fmtPct(d.pctSegregar)} do total` },
    { label: 'HL < 30 DIAS',  valor: fmtHL(d.hl30),           cor: CORES.red,   sub: 'Crítico' },
    { label: 'HECTO < 45D',   valor: fmtHL(d.hecto45),        cor: CORES.amber, sub: 'Atenção' },
    { label: 'STATUS',        valor: d.statusLabel,           cor: d.stockAgeIndex >= META ? CORES.green : d.stockAgeIndex >= 70 ? CORES.amber : CORES.red, sub: `vs meta ${META}%` },
  ],
});
const blocoCurva = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Stock Age Index', subtitulo: '% Stock Age por Curva ABC', periodo: d.periodo,
  dados: d.porCurva, corBarra: CORES.green, tipoBarra: 'bar',
});
const blocoMes = (pptx, d) => adicionarSlideGraficoLinha(pptx, {
  modulo: 'Stock Age Index', subtitulo: '% Stock Age por Mês', periodo: d.periodo,
  series: [{ name: '% Stock Age', dados: d.porMes.map(m => ({ x: m.name, y: m.value })) }],
  cores: [CORES.green],
});

export const stockAgeModulo = {
  key: 'stockage', label: 'Stock Age Index', cor: 'green',
  buscarDados,
  blocos: {
    tela:  { label: 'Tela completa (print do app)',          padrao: true,  exportar: blocoTela },
    kpis:  { label: 'Resumo Executivo (KPIs) · nativo',      padrao: false, exportar: blocoKPIs },
    curva: { label: '% Stock Age por Curva ABC · nativo',    padrao: false, exportar: blocoCurva },
    mes:   { label: '% Stock Age por Mês · nativo',          padrao: false, exportar: blocoMes },
  },
};
