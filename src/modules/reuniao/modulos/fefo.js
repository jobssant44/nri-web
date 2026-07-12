/**
 * Exportador do módulo Gestão de FEFO pra Reunião.
 *
 * Desde 2026-07-12 o cálculo REUSA o mesmo pipeline da tela GestaoFEFOPage
 * (gestaoIdadeHelpers): carregarLogsContagem + avaliarPalete + perda FEFO
 * consolidada + preços + curva ABC atual. O slide "tela" é o print do
 * planificador (tabela) — idêntico ao que o supervisor vê no app.
 *
 * A "foto" é a contagem MAIS RECENTE dentro do período selecionado
 * (mesmo default da tela: Data da Contagem = mais recente).
 * Status (avaliarPalete): Vencido (<0) · Segregar (≤30) · Atenção (31–45) · OK (>45).
 */
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras,
  adicionarSlideImagem,
  formatarPeriodoBR,
} from '../templates';
import { intFmt } from './_helpers';
import { capturarParaPNG } from '../captura';
import { elementoFefoSlide } from '../slides/FefoSlide';
import {
  avaliarPalete, tsToDate, resolverPZV,
  carregarLogsContagem, carregarProdutosMap, carregarPZVMap, carregarVendaMediaMap,
  calcularPerdaFEFOConsolidada,
} from '../../gestao-idade/gestaoIdadeHelpers';
import { carregarMapaCurvaComFallback } from '../../gerenciamento-estoque/shared/curvaLookup';
import { carregarPrecosMap, getPrecoProduto } from '../../../utils/precos';

async function buscarDados(opts, onProgress) {
  const { col, colRevenda, docRef, rid, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('FEFO — buscando coletas…');
  const hoje = new Date();

  // MESMAS fontes E janelas da GestaoFEFOPage — pros números baterem com a tela:
  //  - logs SEM bounds (fallback 6 meses): a perda FEFO consolidada encadeia
  //    lotes de contagens diferentes do mesmo produto, então o pool precisa
  //    ser o mesmo da página. O período da reunião só escolhe a "foto" abaixo.
  //  - venda média no default da tela (últimos 30 dias terminando hoje).
  const [logs, produtosMap, pzvMap, vendaMap, precosMap, curvaInfo] = await Promise.all([
    carregarLogsContagem({ col }),
    carregarProdutosMap({ col }),
    carregarPZVMap({ col }),
    carregarVendaMediaMap({ col, docRef, rid, diasJanela: 30 }),
    carregarPrecosMap({ col }),
    carregarMapaCurvaComFallback({
      docRefFn: docRef, colFn: col, colRevendaFn: colRevenda, rid,
      ano: hoje.getFullYear(), mes: hoje.getMonth() + 1,
    }),
  ]);
  const curvaAtualMap = curvaInfo?.mapa || {};

  log('FEFO — avaliando paletes…');
  // Perda FEFO consolidada (lotes do mesmo produto compartilham a venda média).
  const perdaFEFOMap = calcularPerdaFEFOConsolidada(logs, produtosMap, vendaMap, hoje);

  const avaliadas = logs.map(l => {
    const cod     = String(l.productCode || '').trim();
    const produto = produtosMap[cod];
    const a = avaliarPalete({
      log: l,
      dataReferencia: tsToDate(l.timestamp) || new Date(),
      produto,
      pzvDias: resolverPZV(cod, pzvMap, produto),
      vendaMediaCxDia: vendaMap[cod] || 0,
      curvaProduto: curvaAtualMap[cod] || l.productCurva,
      quantPerdaPreCalculada: perdaFEFOMap.get(l),
    });
    a._ts = tsToDate(l.timestamp);
    const precoUnit = getPrecoProduto(cod, precosMap, 'caixa');
    a.rsPerda = (precoUnit != null && a.quantPerda > 0)
      ? a.quantPerda * precoUnit
      : (a.quantPerda > 0 ? null : 0);
    return a;
  });

  // "Foto" = contagem mais recente DENTRO do período da reunião (mesmo default
  // da tela, que abre na contagem mais recente). dataInicio/dataFim são ISO
  // 'YYYY-MM-DD' — comparação de string funciona.
  const datas = [...new Set(avaliadas
    .filter(a => a._ts)
    .map(a => `${a._ts.getFullYear()}-${String(a._ts.getMonth() + 1).padStart(2, '0')}-${String(a._ts.getDate()).padStart(2, '0')}`)
  )]
    .filter(k => (!dataInicio || k >= dataInicio) && (!dataFim || k <= dataFim))
    .sort().reverse();
  const dataSel = datas[0] || null;

  const linhas = avaliadas
    .filter(a => {
      // Sem contagem no período → slide vazio ("Sem contagens no período").
      if (!dataSel || !a._ts) return false;
      const k = `${a._ts.getFullYear()}-${String(a._ts.getMonth() + 1).padStart(2, '0')}-${String(a._ts.getDate()).padStart(2, '0')}`;
      return k === dataSel;
    })
    // Ordena por prazo asc (críticos primeiro) — default da tela; nulls por último.
    .sort((a, b) => {
      if (a.prazo == null && b.prazo == null) return 0;
      if (a.prazo == null) return 1;
      if (b.prazo == null) return -1;
      return a.prazo - b.prazo;
    });

  const dataContagem = dataSel
    ? `${dataSel.slice(8, 10)}/${dataSel.slice(5, 7)}/${dataSel.slice(0, 4)}`
    : '—';

  // Agregados pros blocos nativos (mesmos thresholds do avaliarPalete).
  const total       = linhas.length;
  const qtdVencido  = linhas.filter(l => l.status === 'vencido').length;
  const qtdSegregar = linhas.filter(l => l.status === 'segregar').length;
  const qtdAtencao  = linhas.filter(l => l.status === 'atencao').length;
  const qtdOK       = linhas.filter(l => l.status === 'ok').length;

  const distribuicao = [
    { name: 'Vencido',          value: qtdVencido },
    { name: 'Segregar (≤30d)',  value: qtdSegregar },
    { name: 'Atenção (31–45d)', value: qtdAtencao },
    { name: 'OK (>45d)',        value: qtdOK },
  ].filter(d => d.value > 0);

  const mapCrit = {};
  linhas
    .filter(l => l.status === 'vencido' || l.status === 'segregar' || l.status === 'atencao')
    .forEach(l => {
      const k = `${l.productCode || '—'} - ${(l.descricao || '').slice(0, 28)}`;
      mapCrit[k] = (mapCrit[k] || 0) + 1;
    });
  const topCriticos = Object.entries(mapCrit)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const topVencendo = linhas
    .filter(l => l.prazo != null && l.prazo >= 0)
    .slice(0, 10)
    .map(l => ({
      name: `${l.productCode || '—'} - ${(l.descricao || '').slice(0, 24)}  (${l.prazo}d)`,
      value: l.prazo,
    }));

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    refLabel: dataContagem,
    dataContagem,
    linhas,
    total, qtdVencido, qtdSegregar, qtdAtencao, qtdOK,
    distribuicao, topCriticos, topVencendo,
  };
}

// "Tela completa": renderiza a cara do dashboard (design system + Recharts) fora
// da tela, captura como PNG e embute como imagem — 1 slide coerente com o app.
// Se a captura falhar, NÃO derruba o deck: cai pros slides nativos do FEFO.
async function blocoTela(pptx, d) {
  try {
    const { dataUrl, largura, altura } = await capturarParaPNG(elementoFefoSlide(d), { largura: 1280 });
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
      adicionarSlideImagem(pptx, { dataUrl, imgW: largura, imgH: altura });
      return 1;
    }
    throw new Error('captura retornou vazia');
  } catch (e) {
    console.warn('FEFO: captura da tela falhou — usando slides nativos como fallback.', e);
    blocoKPIs(pptx, d);
    blocoDistribuicao(pptx, d);
    blocoCriticos(pptx, d);
    blocoVencendo(pptx, d);
    return 4; // fallback adiciona 4 slides — o orquestrador soma o retorno
  }
}

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'Gestão de FEFO',
  subtitulo: `Resumo Executivo  ·  Contagem de ${d.refLabel}`,
  periodo: d.periodo,
  kpis: [
    { label: 'TOTAL COLETAS',  valor: intFmt(d.total),       cor: CORES.blue },
    { label: 'VENCIDO',         valor: intFmt(d.qtdVencido),  cor: '64748B',    sub: 'Prazo < 0 dias' },
    { label: 'SEGREGAR',        valor: intFmt(d.qtdSegregar), cor: CORES.red,   sub: '≤ 30 dias' },
    { label: 'ATENÇÃO',         valor: intFmt(d.qtdAtencao),  cor: CORES.amber, sub: '31 a 45 dias' },
    { label: 'OK',              valor: intFmt(d.qtdOK),       cor: CORES.green, sub: '> 45 dias' },
  ],
});
const blocoDistribuicao = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Gestão de FEFO', subtitulo: 'Distribuição por Status (qtd coletas)', periodo: d.periodo,
  dados: d.distribuicao, corBarra: CORES.red, tipoBarra: 'barH',
});
const blocoCriticos = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Gestão de FEFO', subtitulo: 'Top 10 Produtos — Mais Coletas Críticas', periodo: d.periodo,
  dados: d.topCriticos, corBarra: CORES.red, tipoBarra: 'barH',
});
const blocoVencendo = (pptx, d) => adicionarSlideGraficoBarras(pptx, {
  modulo: 'Gestão de FEFO', subtitulo: 'Top 10 Produtos Vencendo (menor prazo)', periodo: d.periodo,
  dados: d.topVencendo, corBarra: CORES.amber, tipoBarra: 'barH',
});

export const fefoModulo = {
  key: 'fefo', label: 'Gestão de FEFO', cor: 'green',
  buscarDados,
  blocos: {
    tela:          { label: 'Tela completa (print do app)',            padrao: true,  exportar: blocoTela },
    kpis:          { label: 'Resumo Executivo (KPIs) · nativo',        padrao: false, exportar: blocoKPIs },
    distribuicao:  { label: 'Distribuição por Status · nativo',        padrao: false, exportar: blocoDistribuicao },
    criticos:      { label: 'Top 10 Produtos com Coletas Críticas · nativo', padrao: false, exportar: blocoCriticos },
    vencendo:      { label: 'Top 10 Produtos Vencendo · nativo',       padrao: false, exportar: blocoVencendo },
  },
};
