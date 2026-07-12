/**
 * Exportador do módulo "Estoque x Picking" (Gestão de Idade) pra Reunião.
 *
 * Espelha a página on-screen EstoquePickingPage: detecta quebra de FEFO —
 * quando o produto no Picking tem vencimento MAIOR que no Estoque (o mais
 * antigo deveria sair primeiro). Reusa os MESMOS helpers da página:
 *   carregarLogsContagem + carregarProdutosMap + avaliarPalete + detectarQuebraFEFO.
 *
 * KPIs:    Quebras de FEFO · % Quebra · Tolerância permitida
 * Gráficos: quebra por Mês (bar+line) · por Dia (bar+line) · por Embalagem (barH)
 */
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras,
  adicionarSlideImagem, formatarPeriodoBR,
} from '../templates';
import { intFmt } from './_helpers';
import { capturarParaPNG } from '../captura';
import { elementoEstoquePickingSlide } from '../slides/EstoquePickingSlide';
import {
  avaliarPalete, detectarQuebraFEFO, tsToDate,
  carregarLogsContagem, carregarProdutosMap, TOLERANCIA_QUEBRA_FEFO,
} from '../../gestao-idade/gestaoIdadeHelpers';

const MESES_NOME = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Converte ISO 'YYYY-MM-DD' → Date local (na hora informada). undefined → null.
function isoParaDate(iso, hora) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm, ss, ms] = hora;
  return new Date(y, m - 1, d, hh, mm, ss, ms);
}

async function buscarDados(opts, onProgress) {
  const { col, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('Estoque x Picking — buscando contagens…');

  const dtInicio = isoParaDate(dataInicio, [0, 0, 0, 0]);
  const dtFim    = isoParaDate(dataFim,    [23, 59, 59, 999]);

  const [logs, produtosMap] = await Promise.all([
    carregarLogsContagem({ col, dataInicio: dtInicio, dataFim: dtFim }),
    carregarProdutosMap({ col }),
  ]);

  log('Estoque x Picking — avaliando paletes…');

  // Avalia cada log EXATAMENTE como a página (pzv/venda irrelevantes p/ FEFO).
  const linhas = logs.map(l => {
    const cod = String(l.productCode || '').trim();
    const produto = produtosMap[cod];
    const a = avaliarPalete({
      log: l, dataReferencia: tsToDate(l.timestamp) || new Date(),
      produto, pzvDias: null, vendaMediaCxDia: 0, curvaProduto: l.productCurva,
    });
    a._ts = tsToDate(l.timestamp);
    return a;
  });

  log('Estoque x Picking — detectando quebras…');

  // KPIs (mesma lógica da página, aplicados ao período inteiro)
  const quebras = detectarQuebraFEFO(linhas);
  const totalComparacoes = quebras.length;
  const totalQuebras = quebras.filter(q => q.quebra).length;
  const pctQuebra = totalComparacoes ? (totalQuebras / totalComparacoes) * 100 : 0;

  // Por mês — { name, quebras, pct }
  const mapMes = {};
  linhas.forEach(l => {
    if (!l._ts) return;
    const k = `${l._ts.getFullYear()}-${String(l._ts.getMonth() + 1).padStart(2, '0')}`;
    (mapMes[k] = mapMes[k] || []).push(l);
  });
  const porMes = Object.entries(mapMes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      const qs = detectarQuebraFEFO(v);
      const total = qs.length;
      const q = qs.filter(x => x.quebra).length;
      return {
        name: MESES_NOME[parseInt(k.split('-')[1], 10) - 1] + '/' + k.split('-')[0].slice(2),
        quebras: q,
        pct: total ? Math.round((q / total) * 100) : 0,
      };
    });

  // Por dia — { name, quebras, pct }
  const mapDia = new Map();
  linhas.forEach(l => {
    if (!l._ts) return;
    const k = `${l._ts.getFullYear()}-${String(l._ts.getMonth() + 1).padStart(2, '0')}-${String(l._ts.getDate()).padStart(2, '0')}`;
    if (!mapDia.has(k)) mapDia.set(k, []);
    mapDia.get(k).push(l);
  });
  const porDia = Array.from(mapDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      const qs = detectarQuebraFEFO(v);
      const tot = qs.length;
      const q = qs.filter(x => x.quebra).length;
      const [, m, d] = k.split('-');
      return {
        name: `${d}/${m}`,
        quebras: q,
        pct: tot ? Math.round((q / tot) * 100) : 0,
      };
    });

  // Por embalagem — { name, value } (só quebras efetivas)
  const mapEmb = {};
  quebras.filter(q => q.quebra).forEach(q => {
    const l = linhas.find(x => x.productCode === q.productCode);
    const e = l?.embalagem || '—';
    mapEmb[e] = (mapEmb[e] || 0) + 1;
  });
  const porEmbalagem = Object.entries(mapEmb)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Detalhamento — produtos presentes em AMBOS os locais (p/ o slide/print)
  const detalhe = quebras.map(q => {
    const l = linhas.find(x => x.productCode === q.productCode);
    return {
      productCode: q.productCode,
      descricao: l?.descricao || q.descricao || '',
      curva: q.curva || null,
      vencimentoEstoque: q.vencimentoEstoque || null,
      vencimentoPicking: q.vencimentoPicking || null,
      diferenca: q.diferenca,
      toleranciaPermitida: q.toleranciaPermitida,
      quebra: q.quebra,
    };
  });

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    totalQuebras,
    totalComparacoes,
    pctQuebra,
    tolerancia: TOLERANCIA_QUEBRA_FEFO,
    porMes,
    porDia,
    porEmbalagem,
    detalhe,
  };
}

// "Tela completa": renderiza a cara do dashboard (design system + Recharts) fora
// da tela, captura como PNG e embute como imagem — 1 slide coerente com o app.
// Se a captura falhar, NÃO derruba o deck: cai pros slides nativos.
async function blocoTela(pptx, d) {
  try {
    const { dataUrl, largura, altura } = await capturarParaPNG(elementoEstoquePickingSlide(d), { largura: 1280 });
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
      adicionarSlideImagem(pptx, { dataUrl, imgW: largura, imgH: altura });
      return;
    }
    throw new Error('captura retornou vazia');
  } catch (e) {
    console.warn('Estoque x Picking: captura da tela falhou — usando slides nativos como fallback.', e);
    blocoKPIs(pptx, d);
    blocoPorMes(pptx, d);
    blocoPorDia(pptx, d);
    blocoPorEmbalagem(pptx, d);
  }
}

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'Estoque x Picking',
  subtitulo: 'Resumo Executivo · Quebra de FEFO',
  periodo: d.periodo,
  kpis: [
    { label: 'QUEBRAS DE FEFO', valor: intFmt(d.totalQuebras), cor: d.totalQuebras > 0 ? CORES.red : CORES.green, sub: `em ${intFmt(d.totalComparacoes)} comparação(ões)` },
    { label: '% QUEBRA',        valor: `${d.pctQuebra.toFixed(1)}%`, cor: d.pctQuebra > 5 ? CORES.red : d.pctQuebra > 0 ? CORES.amber : CORES.green, sub: 'meta: 0%' },
    { label: 'TOLERÂNCIA',      valor: `${d.tolerancia} dia(s)`, cor: CORES.blue, sub: 'diferença máxima aceita' },
  ],
});
const blocoPorMes = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Estoque x Picking', subtitulo: 'Quebra de FEFO por mês (qtd)', periodo: d.periodo,
  dados: d.porMes.map(m => ({ name: m.name, value: m.quebras })), corBarra: CORES.blue, tipoBarra: 'bar',
});
const blocoPorDia = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Estoque x Picking', subtitulo: 'Quebra de FEFO por dia (qtd)', periodo: d.periodo,
  dados: d.porDia.map(m => ({ name: m.name, value: m.quebras })), corBarra: CORES.blue, tipoBarra: 'bar',
});
const blocoPorEmbalagem = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Estoque x Picking', subtitulo: 'Quebra de FEFO por embalagem (qtd)', periodo: d.periodo,
  dados: d.porEmbalagem, corBarra: CORES.red, tipoBarra: 'barH',
});

export const estoquePickingModulo = {
  key: 'estoque_picking', label: 'Estoque x Picking', cor: 'red',
  buscarDados,
  blocos: {
    tela:       { label: 'Tela completa (print do app)',            padrao: true,  exportar: blocoTela },
    kpis:       { label: 'Resumo Executivo (KPIs) · nativo',        padrao: false, exportar: blocoKPIs },
    porMes:     { label: 'Quebra de FEFO por mês · nativo',         padrao: false, exportar: blocoPorMes },
    porDia:     { label: 'Quebra de FEFO por dia · nativo',         padrao: false, exportar: blocoPorDia },
    porEmbalagem: { label: 'Quebra de FEFO por embalagem · nativo', padrao: false, exportar: blocoPorEmbalagem },
  },
};
