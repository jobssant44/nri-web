/**
 * Exportador do módulo Gestão de FEFO pra Reunião.
 *
 * Diferente de outros módulos: FEFO mostra uma FOTO do estoque na data fim
 * (ou hoje se não informada). Coletas de validade antigas no `inventory_logs`
 * são consultadas, e calculamos o prazo até validade a partir da data fim.
 * Status: Vencido (prazo<0) · Segregar (≤30) · Atenção (≤60) · OK (>60).
 */
import { getDocs, query, where, orderBy } from 'firebase/firestore';
import {
  CORES, adicionarKPIs, adicionarSlideGraficoBarras,
  formatarPeriodoBR,
} from '../templates';
import { intFmt, toISO } from './_helpers';

// Parse "DD/MM/AAAA" ou "AAAA-MM-DD" → Date (UTC midnight pra evitar timezone)
function parseAnyDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

function diasEntre(a, b) {
  if (!a || !b) return null;
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

async function buscarDados(opts, onProgress) {
  const { col, dataInicio, dataFim } = opts;
  const log = msg => onProgress && onProgress(msg);

  log('FEFO — buscando coletas…');
  // Filtra inventory_logs do período por criadoEm (mesmo padrão dos outros módulos)
  let logs = [];
  try {
    const corte = new Date();
    corte.setMonth(corte.getMonth() - 12); // últimos 12 meses pra cobrir período generoso
    const snap = await getDocs(query(
      col('inventory_logs'),
      where('criadoEm', '>=', corte.toISOString()),
      orderBy('criadoEm', 'desc'),
    ));
    logs = snap.docs.map(d => d.data());
  } catch {
    // Fallback sem filtro (índice ausente)
    const snap = await getDocs(col('inventory_logs'));
    logs = snap.docs.map(d => d.data());
  }

  log('FEFO — agregando…');

  // Filtra por filtro de data se houver (em criadoEm ou createdAt)
  const dentroPeriodo = logs.filter(l => {
    const iso = toISO(l.dataColeta || l.criadoEm) || (l.criadoEm || '').slice(0, 10);
    if (!iso) return true;
    if (dataInicio && iso < dataInicio) return false;
    if (dataFim    && iso > dataFim)   return false;
    return true;
  });

  // Filtra logs excluídos e contagens (não coletas de validade)
  const coletas = dentroPeriodo.filter(l => {
    if (l.excluido) return false;
    if (l.origem === 'manual-web-estoque' || l.origem === 'manual-mobile-estoque') return false;
    return !!l.validade;
  });

  // Data de referência: dataFim se informada, senão hoje
  const refDate = dataFim ? parseAnyDate(dataFim) : new Date();

  // Calcula prazo até validade
  const comPrazo = coletas.map(l => {
    const dt = parseAnyDate(l.validade);
    const prazo = dt ? diasEntre(dt, refDate) : null;
    let status = 'ok';
    if (prazo == null) status = 'sem_validade';
    else if (prazo < 0)  status = 'vencido';
    else if (prazo <= 30) status = 'segregar';
    else if (prazo <= 60) status = 'atencao';
    return { ...l, prazo, status };
  });

  const total       = comPrazo.length;
  const qtdVencido  = comPrazo.filter(l => l.status === 'vencido').length;
  const qtdSegregar = comPrazo.filter(l => l.status === 'segregar').length;
  const qtdAtencao  = comPrazo.filter(l => l.status === 'atencao').length;
  const qtdOK       = comPrazo.filter(l => l.status === 'ok').length;

  const distribuicao = [
    { name: 'Vencido',    value: qtdVencido },
    { name: 'Segregar (≤30d)', value: qtdSegregar },
    { name: 'Atenção (≤60d)', value: qtdAtencao },
    { name: 'OK (>60d)',  value: qtdOK },
  ].filter(d => d.value > 0);

  // Top 10 produtos com mais coletas críticas (vencido + segregar + atenção)
  const mapCrit = {};
  comPrazo
    .filter(l => l.status !== 'ok' && l.status !== 'sem_validade')
    .forEach(l => {
      const k = `${l.productCode || '—'} - ${(l.productName || l.productCode || '').slice(0, 28)}`;
      mapCrit[k] = (mapCrit[k] || 0) + 1;
    });
  const topCriticos = Object.entries(mapCrit)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Top 10 vencendo (menor prazo positivo)
  const topVencendo = comPrazo
    .filter(l => l.prazo != null && l.prazo >= 0)
    .sort((a, b) => a.prazo - b.prazo)
    .slice(0, 10)
    .map(l => ({
      name: `${l.productCode || '—'} - ${(l.productName || l.productCode || '').slice(0, 24)}  (${l.prazo}d)`,
      value: l.prazo,
    }));

  return {
    periodo: formatarPeriodoBR(dataInicio, dataFim),
    refLabel: refDate ? `${String(refDate.getUTCDate()).padStart(2,'0')}/${String(refDate.getUTCMonth()+1).padStart(2,'0')}/${refDate.getUTCFullYear()}` : '—',
    total, qtdVencido, qtdSegregar, qtdAtencao, qtdOK,
    distribuicao, topCriticos, topVencendo,
  };
}

const blocoKPIs = (pptx, d) => adicionarKPIs(pptx, {
  modulo: 'Gestão de FEFO',
  subtitulo: `Resumo Executivo  ·  Foto em ${d.refLabel}`,
  periodo: d.periodo,
  kpis: [
    { label: 'TOTAL COLETAS',  valor: intFmt(d.total),       cor: CORES.blue },
    { label: 'VENCIDO',         valor: intFmt(d.qtdVencido),  cor: '64748B',    sub: 'Prazo < 0 dias' },
    { label: 'SEGREGAR',        valor: intFmt(d.qtdSegregar), cor: CORES.red,   sub: '≤ 30 dias' },
    { label: 'ATENÇÃO',         valor: intFmt(d.qtdAtencao),  cor: CORES.amber, sub: '31 a 60 dias' },
    { label: 'OK',              valor: intFmt(d.qtdOK),       cor: CORES.green, sub: '> 60 dias' },
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
    kpis:          { label: 'Resumo Executivo (KPIs)',                padrao: true, exportar: blocoKPIs },
    distribuicao:  { label: 'Distribuição por Status',                 padrao: true, exportar: blocoDistribuicao },
    criticos:      { label: 'Top 10 Produtos com Coletas Críticas',    padrao: true, exportar: blocoCriticos },
    vencendo:      { label: 'Top 10 Produtos Vencendo',                padrao: true, exportar: blocoVencendo },
  },
};
