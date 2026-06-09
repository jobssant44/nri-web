/**
 * Helpers compartilhados pelas 4 sub-páginas de Gestão de Idade.
 *
 * Glossário:
 *  - PZV (Prazo de Validade Total): vida útil em dias do produto (cadastrável)
 *  - Shelf Life % = (dias até vencer) / PZV * 100
 *  - Segregar: % SL < threshold (padrão 60%)
 *  - Cobertura (P.E. — Período de Estoque): quantidade ÷ venda média
 *  - Quant. Perda: caixas que provavelmente não vão ser vendidas a tempo
 *  - Hecto Perda: quant. Perda × hecto/cx
 */

import { getDocs, getDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { isLogExcluido } from '../gerenciamento-estoque/shared/inventoryLogsFilter';

export const THRESHOLD_SEGREGAR_PCT  = 60;      // % shelf life — usado no Stock Age Index
export const THRESHOLD_SEGREGAR_DIAS = 30;      // ≤ 30 dias até vencer → Segregar
export const THRESHOLD_ATENCAO_DIAS  = 45;      // 31-45 dias → Atenção; > 45 → OK
export const THRESHOLD_CRITICO_DIAS  = 30;      // dias até vencer p/ HL < 30d (Stock Age)
export const THRESHOLD_BAIXO_DIAS    = 45;      // hecto < 45d (Stock Age + Estoque x Estoque)
export const TOLERANCIA_QUEBRA_FEFO  = 0;       // dias de diferença permitida picking→estoque
export const PZV_PADRAO_DIAS         = 240;     // Default quando produto não tem PZV cadastrado

/**
 * Resolve o PZV (Prazo de Validade Total em dias) para um produto.
 * Ordem de precedência:
 *   1. pzv_produtos/{codigo}   (importação dedicada)
 *   2. produtos/{codigo}.pzvDias (campo legado se existir)
 *   3. PZV_PADRAO_DIAS (240) como fallback global
 */
export function resolverPZV(codigo, pzvMap, produto) {
  const cod = String(codigo || '').trim();
  if (pzvMap && pzvMap[cod] > 0) return pzvMap[cod];
  if (produto?.pzvDias > 0) return produto.pzvDias;
  return PZV_PADRAO_DIAS;
}

export const COR = {
  vencido:     '#94a3b8',
  segregar:    '#ef4444',
  atencao:     '#f59e0b',
  ok:          '#22c55e',
  alto:        '#ef4444',
  critico:     '#f59e0b',
  medio:       '#fbbf24',
  baixo:       '#22c55e',
  gestaoIdade: '#fbbf24',
  liberado:    '#22c55e',
  curva: { A: '#22c55e', B: '#f59e0b', C: '#ef4444' },
};

// ─────────────────────────────────────────────────────────────────────
// Datas
// ─────────────────────────────────────────────────────────────────────
export function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') {
    const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  }
  return null;
}

export function diasEntre(a, b) {
  if (!a || !b) return null;
  const MS_DIA = 86400000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / MS_DIA);
}

export function fmtData(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function fmtPct(v, casas = 0) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(casas)}%`;
}

export function fmtNum(v, casas = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// ─────────────────────────────────────────────────────────────────────
// Núcleo: classificação de cada palete contado
// ─────────────────────────────────────────────────────────────────────
/**
 * Avalia um inventory_log contra produtos / vendas / curva e devolve
 * todas as métricas necessárias para a tela de FEFO.
 *
 * @param {Object} log                     — doc de inventory_logs
 * @param {Date}   dataReferencia          — data da contagem (ou hoje)
 * @param {Object} produto                 — { codigo, descricao, hecto, paletizacao, ... }
 * @param {Number} pzvDias                 — Prazo de Validade Total em dias (pode ser null)
 * @param {Number} vendaMediaCxDia         — média diária em caixas (pode ser null)
 * @param {String} curvaProduto            — 'A' | 'B' | 'C' | null
 * @param {Number} [quantPerdaPreCalculada]— Quando fornecido, sobrescreve o cálculo
 *                                            linha-a-linha de quantPerda. Usado pelo
 *                                            cálculo FEFO consolidado, que considera
 *                                            que lotes do mesmo produto COMPETEM pela
 *                                            mesma venda média.
 */
export function avaliarPalete({ log, dataReferencia, produto, pzvDias, vendaMediaCxDia, curvaProduto, quantPerdaPreCalculada }) {
  const vencimento = tsToDate(log.expiryDate);
  const prazo = vencimento ? diasEntre(dataReferencia, vencimento) : null;
  const quantidadeCx = paraCaixas(log, produto);
  const hectoUnit = produto?.hecto || 0;
  const hectoTotal = quantidadeCx * hectoUnit;

  let pctShelfLife = null;
  if (vencimento && pzvDias > 0 && prazo != null) {
    pctShelfLife = Math.max(0, Math.min(100, (prazo / pzvDias) * 100));
  }

  // Status segue regra por DIAS ATÉ VENCER:
  //   prazo < 0    → Vencido         (cinza)  — validade anterior à contagem
  //   prazo ≤ 30   → Segregar        (vermelho)
  //   31-45 dias   → Atenção         (amarelo)
  //   > 45 dias    → OK              (verde)
  //   sem vencim.  → sem-vencimento
  let status;
  if (prazo == null) status = 'sem-vencimento';
  else if (prazo < 0) status = 'vencido';
  else if (prazo <= THRESHOLD_SEGREGAR_DIAS) status = 'segregar';
  else if (prazo <= THRESHOLD_ATENCAO_DIAS)  status = 'atencao';
  else status = 'ok';

  // Cobertura em dias: cobertura = quantidade / venda média
  const cobertura = vendaMediaCxDia > 0
    ? Math.ceil(quantidadeCx / vendaMediaCxDia)
    : null;

  // Quant. perda:
  // - Se `quantPerdaPreCalculada` veio (do cálculo FEFO consolidado), usa.
  // - Senão, calcula linha-a-linha (lógica histórica):
  //     prazo ≤ 30: perda = quantidade total
  //     senão: perda = quantidade − (venda média × (prazo − 30))
  let quantPerda = 0;
  if (quantPerdaPreCalculada != null) {
    quantPerda = Number(quantPerdaPreCalculada) || 0;
  } else if (prazo == null) {
    quantPerda = 0;
  } else if (prazo <= 30) {
    quantPerda = quantidadeCx;
  } else if (vendaMediaCxDia > 0) {
    const diasUteis  = prazo - 30;
    const vendavel   = vendaMediaCxDia * diasUteis;
    quantPerda       = Math.max(0, quantidadeCx - vendavel);
  } else {
    quantPerda = quantidadeCx;
  }
  const hectoPerda = quantPerda * hectoUnit;

  // Situação (regra de 02/06/26): baseada na QUANTIDADE de perda (caixas),
  // independente do prazo. Lógica: mesmo um produto com 200 dias até vencer
  // pode ter perda alta se a quantidade em estoque for muito maior que o
  // ritmo de saída (ex: 400 cx com venda média 1 cx/dia).
  //
  //   status 'vencido'      → sempre 'critico' (perda real, não estimada)
  //   quantPerda ≥ 10 cx    → 'critico'
  //   0 < quantPerda < 10   → 'medio'
  //   quantPerda == 0       → 'baixo' (inclui sem-vencimento e prazo longo
  //                                     que vai escoar a tempo)
  let situacao = 'baixo';
  if (status === 'vencido')   situacao = 'critico';
  else if (quantPerda >= 10)  situacao = 'critico';
  else if (quantPerda > 0)    situacao = 'medio';
  else                        situacao = 'baixo';

  return {
    productCode: String(log.productCode || ''),
    descricao: produto?.descricao || log.productName || '',
    embalagem: produto?.embalagem || null,
    tipoMarca: produto?.tipoMarca || null,
    local: deduzirLocal(log.endereco),
    rua: deduzirRua(log.endereco),
    endereco: log.endereco || null,
    curva: curvaProduto || log.productCurva || null,
    vencimento,
    prazo,
    pctShelfLife,
    status,
    quantidadeCx,
    hecto: hectoUnit,
    hectoTotal,
    cobertura,
    vendaMediaCxDia: Number(vendaMediaCxDia) || 0,
    quantPerda,
    hectoPerda,
    valorPerda: 0, // placeholder até termos R$/HL
    situacao,
    pzvDias: pzvDias || null,
    vendaMediaCxDia: vendaMediaCxDia || null,
  };
}

/**
 * Calcula quantPerda em modo FEFO CONSOLIDADO (versão 02/06/26).
 *
 * Diferença vs cálculo linha-a-linha:
 *   Linha-a-linha trata cada lote isoladamente — assume que TODA a venda média
 *   do produto vai escoar AQUELE lote. Se há 8 lotes do mesmo produto, cada um
 *   "consome" a venda média inteira no cálculo. Resultado: subestima a perda.
 *
 *   Consolidado simula FEFO real: lotes do mesmo produto compartilham a venda
 *   média ao longo do tempo. Lote 1 (vence primeiro) vende até esgotar OU
 *   chegar à segregação (30 dias antes do venc). Só DEPOIS o lote 2 começa a
 *   vender. E assim por diante. Mais realista.
 *
 * Algoritmo por produto:
 *   1. Ordena lotes por vencimento ASC
 *   2. diasConsumidos = 0
 *   3. Pra cada lote em ordem:
 *      prazoUtil    = max(0, prazo − 30)         // dias até segregar
 *      prazoEfetivo = max(0, prazoUtil − diasConsumidos)  // janela real desse lote
 *      cxVendaveis  = prazoEfetivo × vendaMédia
 *      quantPerda   = max(0, cx − cxVendaveis)
 *      tempoEscoar  = cx / vendaMédia            // tempo p/ esvaziar o lote
 *      diasConsumidos += min(prazoEfetivo, tempoEscoar)
 *
 * @param {Array<Object>} logs           — logs ATIVOS (já filtrados via filtrarLogsAtivos)
 * @param {Object}        produtosMap    — mapa { codigo → produto } pra paraCaixas
 * @param {Object}        vendaMap       — mapa { codigo → cx/dia média }
 * @param {Date}          dataReferencia — geralmente new Date() ou data da contagem
 *
 * @returns {Map<Object, Number>} Map por REFERÊNCIA do log → quantPerda em caixas.
 *   Uso: `perdaMap.get(log)` retorna o valor (ou undefined se sem cálculo).
 */
export function calcularPerdaFEFOConsolidada(logs, produtosMap, vendaMap, dataReferencia) {
  const perdaMap = new Map();
  if (!Array.isArray(logs) || logs.length === 0) return perdaMap;

  // Agrupa logs por productCode
  const porProduto = {};
  logs.forEach(log => {
    const cod = String(log.productCode || '').trim();
    if (!cod) return;
    (porProduto[cod] = porProduto[cod] || []).push(log);
  });

  Object.entries(porProduto).forEach(([cod, lotes]) => {
    const vendaMedia = Number(vendaMap?.[cod]) || 0;
    const produto    = produtosMap?.[cod];

    // Ordena por vencimento ASC (FEFO). Lotes sem vencimento vão pro final.
    const ordenados = lotes.slice().sort((a, b) => {
      const va = tsToDate(a.expiryDate);
      const vb = tsToDate(b.expiryDate);
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return va - vb;
    });

    let diasConsumidos = 0;
    ordenados.forEach(log => {
      const venc = tsToDate(log.expiryDate);
      const cx   = paraCaixas(log, produto);

      // Sem vencimento: não dá pra avaliar perda — fica 0.
      if (!venc) { perdaMap.set(log, 0); return; }

      const prazo = diasEntre(dataReferencia, venc);
      if (prazo == null) { perdaMap.set(log, 0); return; }

      // Prazo ≤ 30 (segregado ou vencido): perda total. Não consome tempo.
      if (prazo <= 30) { perdaMap.set(log, cx); return; }

      // Sem venda média: assume perda total. Não consome tempo.
      if (vendaMedia <= 0) { perdaMap.set(log, cx); return; }

      // Janela útil desse lote dentro do cronograma FEFO
      const prazoUtilAbs = prazo - 30;
      const prazoEfetivo = Math.max(0, prazoUtilAbs - diasConsumidos);
      const cxVendaveis  = prazoEfetivo * vendaMedia;
      const quantPerda   = Math.max(0, cx - cxVendaveis);

      // Tempo necessário pra esgotar este lote (caixas vendíveis ÷ venda média)
      const tempoEscoar = cx / vendaMedia;
      diasConsumidos += Math.min(prazoEfetivo, tempoEscoar);

      perdaMap.set(log, quantPerda);
    });
  });

  return perdaMap;
}

// Converte qualquer unidade (palete/lastro/caixa/unidade) para caixas, usando
// fatores do produto (paletizacao/lastro). Conservador: se faltar fator, mantém.
export function paraCaixas(log, produto) {
  const qtd = Number(log.quantidade) || 0;
  if (!qtd) return 0;
  const unidade = (log.unidade || 'caixa').toLowerCase();
  if (unidade === 'caixa') return qtd;
  if (unidade === 'palete' && produto?.paletizacao > 0) return qtd * produto.paletizacao;
  if (unidade === 'lastro' && produto?.lastro > 0) return qtd * produto.lastro;
  // 'unidade' sem fator → assume 1:1 com caixas pra não zerar (impreciso)
  return qtd;
}

// Regra da casa (CBB):
//   PNC*  → PNC      (rua chamada PNC — produtos não-conformes/segregados)
//   P*    → Picking  (qualquer prefixo P que NÃO seja PNC)
//   resto → Estoque  (A, B, C, M, ...)
export function deduzirLocal(endereco) {
  if (!endereco) return null;
  const p = String(endereco).trim().toUpperCase();
  if (p.startsWith('PNC')) return 'PNC';
  if (p.startsWith('P'))   return 'Picking';
  return 'Estoque';
}

// "Rua" exibida nas páginas = endereço completo registrado na contagem
// (ex: "A-1-007"), seguindo a convenção da CBB.
export function deduzirRua(endereco) {
  if (!endereco) return null;
  return String(endereco).trim().toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────
// Loaders compartilhados
// ─────────────────────────────────────────────────────────────────────
export async function carregarLogsContagem({ col, dataInicio, dataFim }) {
  // Filtra server-side. Se o caller não passar dataInicio, aplica fallback de
  // 6 meses pra não baixar a coleção inteira (cada doc = 1 read no Firestore).
  const corte = dataInicio instanceof Date
    ? dataInicio
    : (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d; })();
  const snap = await getDocs(query(
    col('inventory_logs'),
    where('timestamp', '>=', corte),
    orderBy('timestamp', 'desc'),
    limit(5000),
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(l => {
      if (isLogExcluido(l)) return false; // soft delete
      // Exclui Contagens de Estoque que foram gravadas em inventory_logs
      // ANTES da separação de coleções (origens manual-web-estoque /
      // manual-mobile-estoque). A partir da separação, as contagens novas
      // vão pra `contagens_estoque` e nunca mais aparecem aqui.
      if (l.origem === 'manual-web-estoque' || l.origem === 'manual-mobile-estoque') return false;
      const ts = tsToDate(l.timestamp);
      if (!ts) return false;
      if (dataFim && ts > dataFim) return false;
      return true;
    });
}

export async function carregarProdutosMap({ col }) {
  const snap = await getDocs(col('produtos'));
  const map = {};
  snap.docs.forEach(d => {
    const x = d.data();
    const cod = String(x.codigo || d.id || '').trim();
    if (cod) {
      map[cod] = {
        codigo:      cod,
        descricao:   x.descricao || x.nome || '',
        tipoMarca:   x.tipoMarca || null,
        embalagem:   x.embalagem || null,
        peso:        Number(x.peso) || 0,
        hecto:       Number(x.hecto) || 0,
        paletizacao: Number(x.paletizacao) || 0,
        lastro:      Number(x.lastro) || 0,
        pzvDias:     Number(x.pzvDias) || null,   // pode vir da importação de PZV
      };
    }
  });
  return map;
}

export async function carregarPZVMap({ col }) {
  // Coleção independente: pzv_produtos/{codigo} = { codigo, pzvDias }
  try {
    const snap = await getDocs(col('pzv_produtos'));
    const map = {};
    snap.docs.forEach(d => {
      const x = d.data();
      const cod = String(x.codigo || d.id || '').trim();
      const pzv = Number(x.pzvDias);
      if (cod && Number.isFinite(pzv) && pzv > 0) map[cod] = pzv;
    });
    return map;
  } catch {
    return {};
  }
}

/**
 * Carrega venda média e devolve mapa codigo → cx/dia.
 *
 * FONTE DE DADOS (regra de 02/06/26):
 *   Lê de `curva_abc_mensal`, que já tem agregado mensal por produto com:
 *     - `cxTotal`        = caixas vendidas no mês (palete aberto + fechado)
 *     - `diasComVendas`  = dias únicos do mês em que houve venda > 0
 *
 *   Razão da mudança: as coleções `vendas_relatorio` e `vendas_prepicking`
 *   só guardam vendas de "palete aberto" (o importador IGNORA linhas com
 *   "Palete Fechado = Sim"). Pra FEFO, faz sentido contar tudo — o produto
 *   sai do armazém igual, sendo palete inteiro ou caixas avulsas. `curva_abc_mensal`
 *   inclui tudo (cxTotal = cxAberto + cxFechado).
 *
 *   Trade-off: granularidade mensal. Se a janela for últimos 30 dias e
 *   tocar 2 meses, soma cxTotal e diasComVendas dos 2 meses inteiros.
 *   Aproximação aceitável pra um KPI de "ritmo de saída".
 *
 * Cálculo:
 *   média_cx_dia = Σ cxTotal_dos_meses_da_janela / Σ diasComVendas_dos_meses_da_janela
 *
 * Janela:
 *  - dataInicio + dataFim (Date) → usa esse intervalo
 *  - Senão → diasJanela (default 30) terminando hoje
 */
export async function carregarVendaMediaMap({ col, docRef, rid, diasJanela = 30, dataInicio, dataFim }) {
  const map = {};
  try {
    // Resolve janela efetiva
    const hoje = new Date(); hoje.setHours(23, 59, 59, 999);
    const fim    = dataFim    instanceof Date ? new Date(dataFim)    : hoje;
    const inicio = dataInicio instanceof Date
      ? new Date(dataInicio)
      : (() => { const d = new Date(fim); d.setDate(d.getDate() - diasJanela); return d; })();
    inicio.setHours(0, 0, 0, 0);
    fim.setHours(23, 59, 59, 999);

    // Identifica meses únicos que tocam a janela. Ex: 03/05 a 02/06 → ["2026-05", "2026-06"].
    const meses = [];
    const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    while (cursor <= fim) {
      meses.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (meses.length === 0) return map;

    // ID do doc em curva_abc_mensal é "{rid}_{YYYY-MM}" (ver ImportarVendasPage
    // linha 302). Sem o prefixo do rid, getDoc não acha e o map fica vazio.
    // Fallback "global" reflete a regra do importador pra quando rid for null.
    const prefixo = rid || 'global';
    const snaps = await Promise.all(
      meses.map(id => getDoc(docRef('curva_abc_mensal', `${prefixo}_${id}`)).catch(() => null))
    );

    // Acumula por produto: { codigo: { cx, dias } }
    const acumulado = {};
    snaps.forEach(snap => {
      if (!snap || !snap.exists()) return;
      const d = snap.data();
      (d.produtos || []).forEach(p => {
        const cod = String(p.codigo || '').trim();
        if (!cod) return;
        const cx   = Number(p.cxTotal)       || 0;
        const dias = Number(p.diasComVendas) || 0;
        if (cx <= 0 || dias <= 0) return;
        if (!acumulado[cod]) acumulado[cod] = { cx: 0, dias: 0 };
        acumulado[cod].cx   += cx;
        acumulado[cod].dias += dias;
      });
    });

    Object.entries(acumulado).forEach(([cod, v]) => {
      map[cod] = v.dias > 0 ? v.cx / v.dias : 0;
    });
  } catch (e) {
    console.warn('[FEFO] erro ao carregar venda média:', e?.message || e);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────
// Agregadores
// ─────────────────────────────────────────────────────────────────────

/**
 * Agrupa logs por (productCode, vencimento) e separa Estoque × Picking
 * para detectar quebra de FEFO.
 */
export function detectarQuebraFEFO(linhas) {
  // Agrupa por productCode → { estoque: { menorVencimento }, picking: { menorVencimento } }
  const grupos = {};
  linhas.forEach(l => {
    if (!l.vencimento || !l.local) return;
    if (!grupos[l.productCode]) grupos[l.productCode] = { estoque: null, picking: null, descricao: l.descricao, curva: l.curva };
    const slot = l.local === 'Picking' ? 'picking' : 'estoque';
    if (!grupos[l.productCode][slot] || l.vencimento < grupos[l.productCode][slot].vencimento) {
      grupos[l.productCode][slot] = { vencimento: l.vencimento, quantidade: l.quantidadeCx };
    }
  });
  // Devolve array só com produtos que têm AMBOS local
  return Object.entries(grupos)
    .filter(([, g]) => g.estoque && g.picking)
    .map(([cod, g]) => {
      const dif = diasEntre(g.picking.vencimento, g.estoque.vencimento); // estoque - picking
      // Se picking vence DEPOIS do estoque → quebra (estoque deveria sair antes)
      const quebra = dif < -TOLERANCIA_QUEBRA_FEFO;
      return {
        productCode: cod,
        descricao: g.descricao,
        curva: g.curva,
        vencimentoEstoque: g.estoque.vencimento,
        vencimentoPicking: g.picking.vencimento,
        diferenca: dif,
        toleranciaPermitida: TOLERANCIA_QUEBRA_FEFO,
        quebra,
      };
    })
    .sort((a, b) => a.diferenca - b.diferenca);
}

/** Stock Age Index — agregado total e por dimensão */
export function calcularStockAge(linhas) {
  let hectoTotal = 0;
  let hectoSegregar = 0;     // Hecto < 60% Shelf Life
  let hl30 = 0;              // HL < 30 dias
  let hecto45 = 0;           // Hecto < 45 dias

  linhas.forEach(l => {
    hectoTotal += l.hectoTotal;
    if (l.pctShelfLife != null && l.pctShelfLife < THRESHOLD_SEGREGAR_PCT) {
      hectoSegregar += l.hectoTotal;
    }
    if (l.prazo != null && l.prazo < THRESHOLD_CRITICO_DIAS) {
      hl30 += l.hectoTotal;
    }
    if (l.prazo != null && l.prazo < THRESHOLD_BAIXO_DIAS) {
      hecto45 += l.hectoTotal;
    }
  });

  const pctSegregar = hectoTotal > 0 ? (hectoSegregar / hectoTotal) * 100 : 0;
  // Stock Age Index = % hecto "saudável" (acima de 60% shelf life)
  const stockAgeIndex = hectoTotal > 0 ? ((hectoTotal - hectoSegregar) / hectoTotal) * 100 : 0;

  return { hectoTotal, hectoSegregar, hl30, hecto45, pctSegregar, stockAgeIndex };
}
