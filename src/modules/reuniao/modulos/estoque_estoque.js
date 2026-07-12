/**
 * Exportador do módulo Estoque x Estoque (Gestão de Idade) pra Reunião.
 *
 * Espelha a página on-screen EstoqueEstoquePage: classifica cada palete
 * contado em "Liberado" (prazo até vencer ≥ 45 dias) ou "Gestão de Idade"
 * (prazo < THRESHOLD_BAIXO_DIAS = 45 dias). Reusa os MESMOS helpers de
 * gestaoIdadeHelpers que a página usa (carregarLogsContagem +
 * carregarProdutosMap + carregarPZVMap + avaliarPalete).
 *
 * KPIs:   Total de paletes · Liberados · Em Gestão de Idade
 * Gráficos: pizza Status (Liberado/Gestão de Idade) · barras Paletes em
 *           Gestão de Idade por Rua.
 */
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras,
  adicionarSlideImagem, formatarPeriodoBR,
} from '../templates';
import { intFmt } from './_helpers';
import { capturarParaPNG } from '../captura';
import { elementoEstoqueEstoqueSlide } from '../slides/EstoqueEstoqueSlide';
import {
  carregarLogsContagem, carregarProdutosMap, carregarPZVMap,
  avaliarPalete, tsToDate, resolverPZV, THRESHOLD_BAIXO_DIAS,
} from '../../gestao-idade/gestaoIdadeHelpers';

async function buscarDados(opts, onProgress) {
  const { col, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  // Converte o filtro ISO ('YYYY-MM-DD') em Date pra passar aos loaders,
  // exatamente como a página faz on-screen (mas com corte de período).
  const inicioDate = dataInicio ? new Date(`${dataInicio}T00:00:00`) : undefined;
  const fimDate    = dataFim    ? new Date(`${dataFim}T23:59:59`)    : undefined;

  log('Estoque x Estoque — buscando contagens…');
  const [logs, produtosMap, pzvMap] = await Promise.all([
    carregarLogsContagem({ col, dataInicio: inicioDate, dataFim: fimDate }),
    carregarProdutosMap({ col }),
    carregarPZVMap({ col }),
  ]);

  log('Estoque x Estoque — classificando paletes…');
  const avals = logs.map(l => {
    const cod = String(l.productCode || '').trim();
    const produto = produtosMap[cod];
    const pzv = resolverPZV(cod, pzvMap, produto);
    const a = avaliarPalete({
      log: l, dataReferencia: tsToDate(l.timestamp) || new Date(),
      produto, pzvDias: pzv, vendaMediaCxDia: 0, curvaProduto: l.productCurva,
    });
    a._ts = tsToDate(l.timestamp);
    // Regra: prazo até vencer < 45 dias → Gestão de Idade; senão Liberado.
    if (a.prazo != null && a.prazo < THRESHOLD_BAIXO_DIAS) a._check = 'Gestão de Idade';
    else a._check = 'Liberado';
    return a;
  });

  // statusCount (mesma agregação da página)
  let liberado = 0, gestao = 0;
  avals.forEach(l => {
    if (l._check === 'Gestão de Idade') gestao++;
    else liberado++;
  });
  const total = liberado + gestao;

  // Distribuição por rua — só paletes em Gestão de Idade (mesma agregação)
  const mapRua = {};
  avals.filter(l => l._check === 'Gestão de Idade').forEach(l => {
    const r = l.rua || '—';
    mapRua[r] = (mapRua[r] || 0) + 1;
  });
  const porRua = Object.entries(mapRua)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Pizza de status (formato {name,value} pros blocos nativos)
  const statusPie = [
    { name: 'Liberado',        value: liberado },
    { name: 'Gestão de Idade', value: gestao },
  ].filter(d => d.value > 0);

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    total, liberado, gestao,
    statusPie, porRua,
  };
}

// "Tela completa": renderiza a cara do dashboard, captura como PNG e embute como
// imagem. Se falhar, NÃO derruba o deck: cai pros slides nativos.
async function blocoTela(pptx, d) {
  try {
    const { dataUrl, largura, altura } = await capturarParaPNG(elementoEstoqueEstoqueSlide(d), { largura: 1280 });
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
      adicionarSlideImagem(pptx, { dataUrl, imgW: largura, imgH: altura });
      return;
    }
    throw new Error('captura retornou vazia');
  } catch (e) {
    console.warn('Estoque x Estoque: captura da tela falhou — usando slides nativos como fallback.', e);
    blocoKPIs(pptx, d);
    blocoStatus(pptx, d);
    blocoPorRua(pptx, d);
  }
}

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'Estoque x Estoque',
  subtitulo: 'Resumo Executivo',
  periodo: d.periodo,
  kpis: [
    { label: 'TOTAL DE PALETES',  valor: intFmt(d.total),    cor: CORES.blue },
    { label: 'LIBERADOS',         valor: intFmt(d.liberado),  cor: CORES.green, sub: '≥ 45 dias até vencer' },
    { label: 'EM GESTÃO DE IDADE', valor: intFmt(d.gestao),   cor: CORES.amber, sub: '< 45 dias — atenção' },
  ],
});
const blocoStatus = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Estoque x Estoque', subtitulo: 'Status por palete (qtd)', periodo: d.periodo,
  dados: d.statusPie, corBarra: CORES.amber, tipoBarra: 'barH',
});
const blocoPorRua = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Estoque x Estoque', subtitulo: 'Paletes em Gestão de Idade por Rua', periodo: d.periodo,
  dados: d.porRua, corBarra: CORES.amber, tipoBarra: 'barH',
});

export const estoqueEstoqueModulo = {
  key: 'estoque_estoque', label: 'Estoque x Estoque', cor: 'amber',
  buscarDados,
  blocos: {
    tela:   { label: 'Tela completa (print do app)',                   padrao: true,  exportar: blocoTela },
    kpis:   { label: 'Resumo Executivo (KPIs) · nativo',               padrao: false, exportar: blocoKPIs },
    status: { label: 'Status por palete · nativo',                     padrao: false, exportar: blocoStatus },
    porRua: { label: 'Paletes em Gestão de Idade por Rua · nativo',    padrao: false, exportar: blocoPorRua },
  },
};
