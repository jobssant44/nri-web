/**
 * Exportador do módulo Troca pra Reunião.
 * Mesma lógica do TrocaPage: operação=5, status=A, origem=digitado.
 */
import { getDocs } from 'firebase/firestore';
import { carregarMeta } from '../../gestao-prejuizo/metasHelpers';
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras, adicionarSlideGraficoLinha,
  formatarPeriodoBR,
} from '../templates';
import {
  parseNum, toISO, brl, numFmt, normCod,
  montarSerieDiariaComMeta, montarSerieMensal, topNPor, montarLabelRNFn,
} from './_helpers';

async function buscarDados(opts, onProgress) {
  const { col, colRevenda, docRef, rid, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('Troca — buscando dados…');
  const [snapTroca, snapHecto, snapVend, meta] = await Promise.all([
    getDocs(colRevenda('relatorio_030237')),
    getDocs(colRevenda('relatorio_030147hecto')),
    getDocs(col('vendedores')),
    carregarMeta('troca', docRef, rid),
  ]);

  log('Troca — agregando…');
  const labelRN = montarLabelRNFn(snapVend);

  // Pre-filtros: operação=5, status=A, origem=digitado
  const linhas = [];
  snapTroca.docs.forEach(d => {
    (d.data().linhas || []).forEach(l => {
      const op  = parseFloat(String(l.operacao || '').trim().replace(',', '.'));
      const st  = String(l.status || '').trim().toUpperCase();
      const ori = String(l.origemPedido || '').trim().toLowerCase();
      if (op !== 5 || st !== 'A' || ori !== 'digitado') return;
      const data = l.dataOperacao || l.data || '';
      const iso = toISO(data);
      if (dataInicio && (!iso || iso < dataInicio)) return;
      if (dataFim    && (!iso || iso > dataFim))   return;
      linhas.push({
        ...l,
        data,
        nomeCliente: l.nome || l.nomeCliente || '',
        codProduto:  l.produto || l.codProduto || '',
        rnCod:       normCod(l.vendedor || l.rn),
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
  const trocaRsHL  = totalHecto > 0 ? totalValor / totalHecto : 0;

  const porMes = montarSerieMensal(linhas);
  const porDia = montarSerieDiariaComMeta(linhas, hectoFiltrado, meta);

  // Por RN (com label código - nome)
  const porRN = topNPor(linhas, l => labelRN(l.rnCod), 10);
  // Por Produtos (rótulo "código - descrição")
  const porProdutos = topNPor(linhas, l => {
    const c = l.codProduto || l.produto, d = l.descricao;
    return c ? (d ? `${c} - ${d}` : String(c)) : (d || '—');
  }, 10);
  // Por Clientes (rótulo "código - nome")
  const porClientes = topNPor(linhas, l => {
    const c = l.cliente, n = l.nomeCliente;
    return c ? (n ? `${c} - ${n}` : String(c)) : (n || '—');
  }, 10);

  // Por GV — agregação especial via lookup no snapVend
  const vmapPorGV = {};
  snapVend.docs.forEach(d => {
    const v = d.data();
    const rn = normCod(v.codigo || d.id);
    if (rn) vmapPorGV[rn] = { codigoGV: normCod(v.codigoGV), nomeGV: v.nomeGV || '' };
  });
  const porGV = topNPor(
    linhas,
    l => {
      const info = vmapPorGV[l.rnCod];
      if (!info || !info.codigoGV) return '(sem GV)';
      return info.nomeGV ? `${info.codigoGV} - ${info.nomeGV}` : info.codigoGV;
    },
    10,
  );

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    meta, totalValor, totalHecto, metaRS, saldo, dentroMeta, trocaRsHL,
    porMes, porDia, porRN, porGV, porProdutos, porClientes,
  };
}

function blocoKPIs(pptx, d) {
  adicionarKPIs(pptx, {
    modulo: 'Troca', subtitulo: 'Resumo Executivo', periodo: d.periodo,
    kpis: [
      { label: 'R$ TROCA TOTAL', valor: brl(d.totalValor),                              cor: CORES.red },
      { label: d.dentroMeta ? 'ECONOMIA' : 'ESTOURO', valor: brl(Math.abs(d.saldo)),    cor: d.dentroMeta ? CORES.green : CORES.red, sub: 'Meta − R$ Troca' },
      { label: 'HECTO ENTREGUE', valor: numFmt(d.totalHecto),                            cor: CORES.blue },
      { label: 'META R$',         valor: brl(d.metaRS),                                   cor: CORES.amber, sub: `R$ ${d.meta.toFixed(2).replace('.', ',')} × Hecto` },
      { label: 'TROCA R$/HL',     valor: d.totalHecto > 0 ? brl(d.trocaRsHL) : '—',      cor: CORES.green, sub: 'R$ Troca ÷ Hecto' },
    ],
  });
}
const blocoMes      = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Troca', subtitulo: 'R$ Troca — Mês a Mês',     periodo: d.periodo, dados: d.porMes,      corBarra: CORES.amber, tipoBarra: 'bar' });
const blocoDia      = (pptx, d) => adicionarSlideGraficoLinha (pptx, { modulo: 'Troca', subtitulo: `R$ Troca — Dia a Dia  ·  Meta = R$ ${d.meta.toFixed(2).replace('.', ',')}/HL`, periodo: d.periodo,
  series: [
    { name: 'R$ Troca', dados: d.porDia.map(p => ({ x: p.x, y: p.y })) },
    { name: 'Meta',     dados: d.porDia.map(p => ({ x: p.x, y: p.meta })) },
  ], cores: [CORES.green, CORES.red],
});
const blocoRN       = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Troca', subtitulo: 'R$ Troca por RN',           periodo: d.periodo, dados: d.porRN,        corBarra: CORES.blue,  tipoBarra: 'barH' });
const blocoGV       = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Troca', subtitulo: 'R$ Troca por GV',           periodo: d.periodo, dados: d.porGV,        corBarra: CORES.amber, tipoBarra: 'barH' });
const blocoProdutos = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Troca', subtitulo: 'Top 10 Produtos',           periodo: d.periodo, dados: d.porProdutos,  corBarra: CORES.red,   tipoBarra: 'barH' });
const blocoClientes = (pptx, d) => adicionarSlideGraficoBarras(pptx, { modulo: 'Troca', subtitulo: 'Top 10 Clientes',           periodo: d.periodo, dados: d.porClientes,  corBarra: '64748b',    tipoBarra: 'barH' });

export const trocaModulo = {
  key: 'troca', label: 'Troca', cor: 'amber',
  buscarDados,
  blocos: {
    kpis:     { label: 'Resumo Executivo (KPIs)',  padrao: true, exportar: blocoKPIs },
    mes:      { label: 'R$ Troca — Mês a Mês',     padrao: true, exportar: blocoMes },
    dia:      { label: 'R$ Troca — Dia a Dia',     padrao: true, exportar: blocoDia },
    rn:       { label: 'R$ Troca por RN',          padrao: true, exportar: blocoRN },
    gv:       { label: 'R$ Troca por GV',          padrao: true, exportar: blocoGV },
    produtos: { label: 'Top 10 Produtos',          padrao: true, exportar: blocoProdutos },
    clientes: { label: 'Top 10 Clientes',          padrao: true, exportar: blocoClientes },
  },
};
