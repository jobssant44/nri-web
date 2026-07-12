/**
 * Exportador do módulo Reposição pra Reunião.
 *
 * Lógica idêntica à ReposicaoPage:
 *   - 030237 filtrado por ops 5/39/43 + origem 'palmtop'
 *   - JOIN com 031805 (1 doc por NF) pela nota fiscal normalizada
 *   - Enriquece linhas com motorista/placa/ajudante/motivo/aprovador/etc.
 */
import { getDocs } from 'firebase/firestore';
import { carregarMeta } from '../../gestao-prejuizo/metasHelpers';
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras, adicionarSlideGraficoLinha,
  adicionarSlideImagem, formatarPeriodoBR,
} from '../templates';
import { capturarParaPNG } from '../captura';
import { elementoReposicaoSlide } from '../slides/ReposicaoSlide';
import {
  parseNum, toISO, brl, numFmt, normCod,
  montarSerieDiariaComMeta, montarSerieMensal, topNPor, montarLabelRNFn,
} from './_helpers';

function normNF(nota) {
  const raw = String(nota ?? '').trim();
  if (!raw) return '';
  return raw.split('-')[0].trim().replace(/^0+(?=\d)/, '');
}

async function buscarDados(opts, onProgress) {
  const { col, colRevenda, docRef, rid, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('Reposição — buscando dados…');
  const OPS_REPOSICAO = new Set(['5', '39', '43']);
  const [snapTroca, snapRep, snapVend, snapHecto, meta] = await Promise.all([
    getDocs(colRevenda('relatorio_030237')),
    getDocs(colRevenda('relatorio_031805')),
    getDocs(col('vendedores')),
    getDocs(colRevenda('relatorio_030147hecto')),
    carregarMeta('reposicao', docRef, rid),
  ]);

  log('Reposição — agregando…');

  // Mapa NF → solicitação 031805
  const mapRep = {};
  snapRep.docs.forEach(d => {
    (d.data().linhas || []).forEach(l => {
      const nf = normNF(l.notaFiscal);
      if (!nf || mapRep[nf]) return;
      mapRep[nf] = l;
    });
  });

  // Linhas enriquecidas
  const labelRN = montarLabelRNFn(snapVend);
  const linhas = [];
  snapTroca.docs.forEach(d => {
    (d.data().linhas || []).forEach(l => {
      const op  = String(l.operacao ?? '').trim();
      const ori = String(l.origemPedido ?? '').trim().toLowerCase();
      if (!OPS_REPOSICAO.has(op)) return;
      if (ori !== 'palmtop')     return;
      const data = l.dataOperacao || l.data || '';
      const iso = toISO(data);
      if (dataInicio && (!iso || iso < dataInicio)) return;
      if (dataFim    && (!iso || iso > dataFim))   return;
      const rep = mapRep[normNF(l.nota)];
      linhas.push({
        ...l,
        data,
        nomeCliente: l.nome || l.nomeCliente || '',
        rnCod: normCod(l.vendedor || l.rn),
        _motivo:    rep?.motivo            || '',
        _placa:     rep?.placa             || '',
        _motorista: rep?.nomeMotorista     || rep?.codMotorista || '',
        _ajudante:  rep?.nomeAjudante      || rep?.codAjudante  || '',
        _match:     !!rep,
      });
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
  const reposRsHL  = totalHecto > 0 ? totalValor / totalHecto : 0;

  const porMes = montarSerieMensal(linhas);
  const porDia = montarSerieDiariaComMeta(linhas, hectoFiltrado, meta);

  // Top só usando linhas com match no 031805 (caso contrário "(sem motivo)" domina)
  const linhasComMatch = linhas.filter(l => l._match);
  const porMotivos    = topNPor(linhasComMatch, l => l._motivo    || '(sem motivo)',    10);
  const porMotoristas = topNPor(linhasComMatch, l => l._motorista || '(sem motorista)', 10);
  const porAjudantes  = topNPor(linhasComMatch, l => l._ajudante  || '(sem ajudante)',  10);
  const porPlacas     = topNPor(linhasComMatch, l => l._placa     || '(sem placa)',     10);

  // Top sem requerer match (RN/Produto/Cliente)
  const porRN        = topNPor(linhas, l => labelRN(l.rnCod),                       10);
  const porProdutos  = topNPor(linhas, l => {
    const c = l.produto, d = l.descricao;  // reposicao: código real é l.produto (não codProduto)
    return c ? (d ? `${c} - ${d}` : String(c)) : (d || '—');
  }, 10);
  const porClientes  = topNPor(linhas, l => {
    const c = l.cliente, n = l.nomeCliente;
    return c ? (n ? `${c} - ${n}` : String(c)) : (n || '—');
  }, 10);

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    meta, totalValor, totalHecto, metaRS, saldo, dentroMeta, reposRsHL,
    porMes, porDia, porMotivos, porMotoristas, porAjudantes, porPlacas,
    porRN, porProdutos, porClientes,
  };
}

// "Tela completa": renderiza a cara do app (design system + Recharts) fora da
// tela, captura como PNG e embute como imagem — 1 slide idêntico ao dashboard.
// Se a captura falhar, NÃO derruba o deck: cai pros slides nativos da Reposição.
async function blocoTela(pptx, d) {
  try {
    const { dataUrl, largura, altura } = await capturarParaPNG(elementoReposicaoSlide(d), { largura: 1280 });
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
      adicionarSlideImagem(pptx, { dataUrl, imgW: largura, imgH: altura });
      return;
    }
    throw new Error('captura retornou vazia');
  } catch (e) {
    console.warn('Reposição: captura da tela falhou — usando slides nativos como fallback.', e);
    blocoKPIs(pptx, d);
    bMes(pptx, d);
    bDia(pptx, d);
    bMotivos(pptx, d);
    bProdutos(pptx, d);
    bMotoristas(pptx, d);
    bAjudantes(pptx, d);
    bPlacas(pptx, d);
    bRN(pptx, d);
    bClientes(pptx, d);
  }
}

function blocoKPIs(pptx, d) {
  adicionarKPIs(pptx, {
    modulo: 'Reposição', subtitulo: 'Resumo Executivo', periodo: d.periodo,
    kpis: [
      { label: 'R$ REPOSIÇÃO TOTAL', valor: brl(d.totalValor),                              cor: CORES.red },
      { label: d.dentroMeta ? 'ECONOMIA' : 'ESTOURO', valor: brl(Math.abs(d.saldo)),        cor: d.dentroMeta ? CORES.green : CORES.red, sub: 'Meta − R$ Reposição' },
      { label: 'HECTO ENTREGUE',     valor: numFmt(d.totalHecto),                            cor: CORES.blue },
      { label: 'META R$',             valor: brl(d.metaRS),                                   cor: CORES.amber, sub: `R$ ${d.meta.toFixed(2).replace('.', ',')} × Hecto` },
      { label: 'REPOSIÇÃO R$/HL',     valor: d.totalHecto > 0 ? brl(d.reposRsHL) : '—',      cor: CORES.green, sub: 'R$ Reposição ÷ Hecto' },
    ],
  });
}
const bMes      = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Reposição', subtitulo: 'R$ Reposição — Mês a Mês', periodo: d.periodo, dados: d.porMes, corBarra: CORES.amber, tipoBarra: 'bar' });
const bDia      = (pptx, d) => adicionarSlideGraficoLinha (pptx, { modulo: 'Reposição', subtitulo: `R$ Reposição — Dia a Dia  ·  Meta = R$ ${d.meta.toFixed(2).replace('.', ',')}/HL`, periodo: d.periodo,
  series: [
    { name: 'R$ Reposição', dados: d.porDia.map(p => ({ x: p.x, y: p.y })) },
    { name: 'Meta',         dados: d.porDia.map(p => ({ x: p.x, y: p.meta })) },
  ], cores: [CORES.green, CORES.red],
});
const bMotivos    = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Reposição', subtitulo: 'R$ Reposição por Motivo',     periodo: d.periodo, dados: d.porMotivos,    corBarra: CORES.red,   tipoBarra: 'barH' });
const bProdutos   = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Reposição', subtitulo: 'Top 10 Produtos',             periodo: d.periodo, dados: d.porProdutos,   corBarra: CORES.red,   tipoBarra: 'barH' });
const bMotoristas = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Reposição', subtitulo: 'Top 10 Motoristas',           periodo: d.periodo, dados: d.porMotoristas, corBarra: CORES.amber, tipoBarra: 'barH' });
const bAjudantes  = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Reposição', subtitulo: 'Top 10 Ajudantes',            periodo: d.periodo, dados: d.porAjudantes,  corBarra: CORES.green, tipoBarra: 'barH' });
const bPlacas     = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Reposição', subtitulo: 'Top 10 Placas',               periodo: d.periodo, dados: d.porPlacas,     corBarra: CORES.blue,  tipoBarra: 'barH' });
const bRN         = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Reposição', subtitulo: 'R$ Reposição por RN',         periodo: d.periodo, dados: d.porRN,         corBarra: CORES.blue,  tipoBarra: 'barH' });
const bClientes   = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Reposição', subtitulo: 'Top 10 Clientes',             periodo: d.periodo, dados: d.porClientes,   corBarra: '64748b',    tipoBarra: 'barH' });

export const reposicaoModulo = {
  key: 'reposicao', label: 'Reposição', cor: 'blue',
  buscarDados,
  blocos: {
    tela:       { label: 'Tela completa (print do app)',      padrao: true,  exportar: blocoTela },
    kpis:       { label: 'Resumo Executivo (KPIs) · nativo',  padrao: false, exportar: blocoKPIs },
    mes:        { label: 'R$ Reposição — Mês a Mês · nativo', padrao: false, exportar: bMes },
    dia:        { label: 'R$ Reposição — Dia a Dia · nativo', padrao: false, exportar: bDia },
    motivos:    { label: 'R$ Reposição por Motivo · nativo',  padrao: false, exportar: bMotivos },
    produtos:   { label: 'Top 10 Produtos · nativo',          padrao: false, exportar: bProdutos },
    motoristas: { label: 'Top 10 Motoristas · nativo',        padrao: false, exportar: bMotoristas },
    ajudantes:  { label: 'Top 10 Ajudantes · nativo',         padrao: false, exportar: bAjudantes },
    placas:     { label: 'Top 10 Placas · nativo',            padrao: false, exportar: bPlacas },
    rn:         { label: 'R$ Reposição por RN · nativo',      padrao: false, exportar: bRN },
    clientes:   { label: 'Top 10 Clientes · nativo',          padrao: false, exportar: bClientes },
  },
};
