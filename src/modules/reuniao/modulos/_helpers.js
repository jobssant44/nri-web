/**
 * Helpers compartilhados entre os exportadores de módulos da Reunião.
 * Replicados aqui (em vez de importados de cada page) pra independência —
 * se a tela mudar no futuro, o exportador continua funcionando.
 */

// Parser BR de números: "1.234,56" → 1234.56, "1234.56" → 1234.56, etc.
export function parseNum(val) {
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

export function parseDataBR(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}
export function toISO(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function toMesAno(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
export function mesAnoParaISO(mesAno) {
  if (!mesAno) return '';
  const [mm, yyyy] = mesAno.split('/');
  return `${yyyy}-${mm}`;
}

export function brl(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
}
export function numFmt(n) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n || 0);
}
export function intFmt(n) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n || 0);
}

// Helper: dado um ISO 'YYYY-MM-DD', retorna o ISO de N dias atrás
export function isoMenosN(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Aplica filtro de data num conjunto de objetos { data: 'DD/MM/AAAA' | string }
export function filtrarPorData(arr, dataInicio, dataFim, getDataStr = x => x.data) {
  return arr.filter(x => {
    if (!dataInicio && !dataFim) return true;
    const iso = toISO(getDataStr(x));
    if (!iso) return false;
    if (dataInicio && iso < dataInicio) return false;
    if (dataFim    && iso > dataFim)   return false;
    return true;
  });
}

// Soma R$ por dia + meta = hecto(D-1) × metaPorHL (fallback D-2)
export function montarSerieDiariaComMeta(linhasComValor, hectoFiltrado, metaPorHL, getDataStr = l => l.data) {
  const hectoMap = {};
  hectoFiltrado.forEach(h => {
    const iso = toISO(h.data);
    if (iso) hectoMap[iso] = (hectoMap[iso] || 0) + parseNum(h.totalHecto);
  });
  const mapDia = {};
  linhasComValor.forEach(l => {
    const iso = toISO(getDataStr(l));
    if (iso) mapDia[iso] = (mapDia[iso] || 0) + parseNum(l.valor);
  });
  return Object.entries(mapDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, valor]) => {
      const [, mm, dd] = iso.split('-');
      const hectoAnt = hectoMap[isoMenosN(iso, 1)] || hectoMap[isoMenosN(iso, 2)] || 0;
      const metaDia  = hectoAnt > 0 ? Math.round(hectoAnt * metaPorHL * 100) / 100 : null;
      return { x: `${dd}/${mm}`, y: Math.round(valor * 100) / 100, meta: metaDia };
    });
}

// Soma R$ por mês
export function montarSerieMensal(linhasComValor, getDataStr = l => l.data) {
  const map = {};
  linhasComValor.forEach(l => {
    const m = toMesAno(getDataStr(l));
    if (m) map[m] = (map[m] || 0) + parseNum(l.valor);
  });
  return Object.entries(map)
    .sort(([a], [b]) => mesAnoParaISO(a).localeCompare(mesAnoParaISO(b)))
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
}

// Agrega por chave (getter) e devolve top N ordenado desc
export function topNPor(linhas, getter, topN = 10, getValor = l => l.valor) {
  const map = {};
  linhas.forEach(l => {
    const k = getter(l);
    if (!k) return;
    map[k] = (map[k] || 0) + parseNum(getValor(l));
  });
  return Object.entries(map)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

// Normaliza código (remove zeros à esquerda)
export function normCod(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.replace(/^0+(?=\d)/, '');
}

// Lê /vendedores e monta mapa código (sem zeros à esquerda) → "código - Nome"
export function montarLabelRNFn(snapVendedores) {
  const map = {};
  snapVendedores.docs.forEach(d => {
    const v = d.data();
    const cod = normCod(v.codigo || d.id);
    if (cod) map[cod] = { nome: v.nome || '', codigoGV: v.codigoGV || '', nomeGV: v.nomeGV || '' };
  });
  return (codigo) => {
    if (!codigo) return '(sem RN)';
    const v = map[codigo];
    return v && v.nome ? `${codigo} - ${v.nome}` : codigo;
  };
}
