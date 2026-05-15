import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, orderBy, getDoc, doc, addDoc, writeBatch } from 'firebase/firestore';
import { useDb } from '../utils/db';
import { useSessionFilter } from '../hooks/useSessionFilter';
import { lerCache, salvarCache, invalidarCache } from '../utils/cache';

async function buscarAbastecimentos(col) {
  const cached = lerCache('abastecimentos');
  if (cached) return cached;
  const snap = await getDocs(col('abastecimentos'));
  const dados = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  salvarCache('abastecimentos', dados);
  return dados;
}

async function buscarVendasMap(col) {
  const cached = lerCache('vendasMap');
  if (cached) return cached;
  const snap = await getDocs(query(col('vendas_relatorio'), orderBy('importadoEm', 'asc')));
  const vMap = {};
  snap.docs.forEach(d => {
    (d.data().produtos || []).forEach(p => {
      const cod = String(p.codigo);
      if (!vMap[cod]) vMap[cod] = {};
      Object.entries(p.vendas || {}).forEach(([data, qtd]) => { vMap[cod][data] = qtd; });
    });
  });
  if (Object.keys(vMap).length > 0) salvarCache('vendasMap', vMap);
  return vMap;
}

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function parsearData(str) {
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
}

function formatarData(d) {
  return String(d.getDate()).padStart(2,'0') + '/' +
    String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

function diasDoMes(mesAno) {
  if (!mesAno || !/^\d{2}\/\d{4}$/.test(mesAno)) return [];
  const [mes, ano] = mesAno.split('/').map(Number);
  if (mes < 1 || mes > 12) return [];
  const total = new Date(ano, mes, 0).getDate();
  const result = [];
  for (let d = 1; d <= total; d++) {
    result.push(`${String(d).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`);
  }
  return result;
}

function mesParaChave(mesAno) {
  if (!mesAno || !/^\d{2}\/\d{4}$/.test(mesAno)) return null;
  const [m, a] = mesAno.split('/');
  return `${a}-${m}`;
}

function dataParaChaveMes(dataStr) {
  if (!dataStr) return null;
  const p = dataStr.split('/');
  if (p.length !== 3) return null;
  return `${p[2]}-${p[1]}`;
}

function exportarCSV(linhasOrdenadas, diasMes, modo, mes) {
  const sep = ';';
  const linhas = [];
  if (modo === 'reabastecimento') {
    linhas.push(['Código', 'Produto', ...diasMes.flatMap(d => [`${d}-P`, `${d}-R`, `${d}-G`]), 'Total Reab'].join(sep));
    linhasOrdenadas.forEach(l => {
      const row = [l.codProduto, l.nomeProduto];
      l.daysData.forEach(({ isDom, isFuture, planejado, real, gap }) => {
        if (isDom)    { row.push('DOM', 'DOM', 'DOM'); return; }
        if (isFuture) { row.push('0', '', ''); return; }
        row.push(planejado === null ? '' : planejado);
        row.push(real > 0 ? real : '');
        row.push(gap === null ? '' : gap);
      });
      row.push(l.totalReab || 0);
      linhas.push(row.join(sep));
    });
  } else {
    linhas.push(['Código', 'Produto', ...diasMes, 'Total Ressp'].join(sep));
    linhasOrdenadas.forEach(l => {
      const row = [l.codProduto, l.nomeProduto];
      l.daysData.forEach(({ isDom, ressp }) => row.push(isDom ? 'DOM' : ressp > 0 ? ressp : ''));
      row.push(l.totalRessp || 0);
      linhas.push(row.join(sep));
    });
  }
  const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planificador_iv_${modo}_${mes.replace('/', '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const HOJE = new Date(); HOJE.setHours(0,0,0,0);
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// ── Helpers de horário aleatório para lançamentos retroativos ─────────────────
// Ressuprimento: 40% Luiz (turno 23:35–01:45, atravessando meia-noite) /
//                60% João Carlos (turno 02:00–06:25).
// A hora sorteada determina o conferente automaticamente.
function sorteioRessp() {
  if (Math.random() < 0.4) {
    // Luiz: 23:35 (1415 min) até 25:45 (1545 min, = 01:45 do dia seguinte)
    const t = 1415 + Math.floor(Math.random() * (1545 - 1415 + 1));
    const h = Math.floor(t / 60) % 24;
    const m = t % 60;
    return { hora: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, conferente: 'Luiz' };
  }
  // João Carlos: 02:00 (120 min) até 06:25 (385 min)
  const t = 120 + Math.floor(Math.random() * (385 - 120 + 1));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return { hora: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, conferente: 'João Carlos' };
}

// Reabastecimento: gerador de horas agrupadas por dia.
//
// Janela total da tarde: 14:15 (855 min) até 16:25 (985 min).
// Por DIA, sorteia uma "base" em [14:15, 16:20] (reserva 5 min pra cima); cada
// reab daquele mesmo dia recebe uma hora em [base, base + 5 min]. Simula o
// cenário real onde todos os reabs do dia são registrados quase ao mesmo tempo.
//
// Uso: instancie um sorteador POR LOTE de inserção (uma função independente).
// const sorteioReab = criarSorteadorReabDoMes();
// const hora = sorteioReab(dateStr);  // mesmo dateStr → mesma janela de 5min
function criarSorteadorReabDoMes() {
  const basesPorDia = new Map();
  return function sorteioReabParaDia(dateStr) {
    if (!basesPorDia.has(dateStr)) {
      // 855 a 980 min = 14:15 a 16:20 (5 min de margem pra última hora caber em 16:25)
      const base = 855 + Math.floor(Math.random() * (980 - 855 + 1));
      basesPorDia.set(dateStr, base);
    }
    const base = basesPorDia.get(dateStr);
    const m = base + Math.floor(Math.random() * 6); // 0–5 min depois
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULAÇÃO DIA-A-DIA DO SALDO NO PICKING
// ─────────────────────────────────────────────────────────────────────────────
//
// Modelo: o picking é um "tanque" com capacidade física = espacosPalete × cxPorPlt.
// Antes usávamos um acumulador de dívida que IGNORAVA o estado físico do picking
// (problema: ressuprimento só disparava quando venda > capacidade total, mesmo
// que o saldo herdado do dia anterior + reab planejado não cobrisse as vendas).
//
// Agora simulamos cada dia em ordem cronológica:
//   1. Reab chega (modo 'simular_passado' usa real; 'planejar' calcula via acc de paletes)
//   2. Aplica vendas do dia
//   3. Se saldo < 0 → ressup pra fechar a conta
//
// O modo 'simular_passado' é usado pra reconstruir o saldo final do mês anterior
// (com reab/ressup REAIS do Firebase). O 'planejar' é usado pro mês atual.
//
function simularPicking({
  diasMes,            // [ 'DD/MM/AAAA', ... ]
  vendasPorDia,       // { 'DD/MM/AAAA': qtdCx }      — vendas do produto
  reabRealPorDia,     // { 'DD/MM/AAAA': paletes }    — só usado em 'simular_passado'
  ressupRealPorDia,   // { 'DD/MM/AAAA': paletes }    — só usado em 'simular_passado'
  cxPorPlt,
  espacosPalete,
  saldoInicial,
  modo,               // 'simular_passado' | 'planejar'
  dataLimitePassado,  // Date — qualquer dia ≤ essa data é tratado como passado.
                      // Default = HOJE. Use uma data > HOJE pra simular dias futuros
                      // que já têm vendas registradas (ex: import de forecast).
}) {
  const capacidade = espacosPalete * cxPorPlt;
  let saldo        = saldoInicial;
  let accPaletes   = 0;
  const porDia     = {};
  const limite     = dataLimitePassado || HOJE;

  for (const dateStr of diasMes) {
    const d        = parsearData(dateStr);
    if (!d) continue;
    const isFuture = d > limite;
    const isDom    = d.getDay() === 0;

    if (isFuture) {
      porDia[dateStr] = { isFuture: true, isDom, saldoFimDia: saldo, vendasHoje: null, vendasOntem: null, reabPlanejado: null, ressupNecessario: null, reabReal: null, ressupReal: null, dataRef: null };
      continue;
    }

    if (isDom) {
      // Domingo: sem operação. Saldo passa intacto pra segunda. Se houver
      // ressup REAL registrado (raro), aplica.
      if (modo === 'simular_passado') {
        const ressupReal = ressupRealPorDia?.[dateStr] || 0;
        if (ressupReal > 0) saldo = Math.min(capacidade, saldo + ressupReal * cxPorPlt);
      }
      porDia[dateStr] = { isFuture: false, isDom: true, saldoFimDia: saldo, vendasHoje: null, vendasOntem: null, reabPlanejado: null, ressupNecessario: null, reabReal: null, ressupReal: null, dataRef: null };
      continue;
    }

    // ── Dia útil ────────────────────────────────────────────────────────────

    // Saldo no início do dia (antes de qualquer movimentação) — herdado do dia anterior
    const saldoInicioDia = saldo;

    // Vendas do dia operacional ANTERIOR (D-1, ou D-2 se hoje é segunda) — base do reab do dia atual
    const ref = new Date(d);
    ref.setDate(ref.getDate() - (d.getDay() === 1 ? 2 : 1));
    const dataRef = formatarData(ref);
    let vendasOntem = vendasPorDia?.[dataRef] ?? null;
    if (vendasOntem === null && ref.getDay() === 1) vendasOntem = 0; // segunda sem dado → trata 0

    // 1. Reab que chega no início do dia (entregue na noite anterior)
    let reabAplicado = 0;
    if (modo === 'simular_passado') {
      reabAplicado = reabRealPorDia?.[dateStr] || 0;
    } else {
      // 'planejar': acumulador em paletes a partir das vendas
      if (vendasOntem !== null && cxPorPlt > 0) accPaletes += vendasOntem / cxPorPlt;
      if (accPaletes >= 1 && cxPorPlt > 0) {
        const espacoLivre         = Math.max(0, capacidade - saldo);
        const maxPaletesPorEspaco = Math.floor(espacoLivre / cxPorPlt);
        const maxPorConfig        = espacosPalete > 0 ? espacosPalete : Infinity;
        reabAplicado = Math.min(Math.floor(accPaletes), maxPaletesPorEspaco, maxPorConfig);
        accPaletes -= reabAplicado;
      }
    }
    saldo = Math.min(capacidade, saldo + reabAplicado * cxPorPlt);

    // 2. Vendas do dia
    const vendasHoje = vendasPorDia?.[dateStr] ?? null;
    if (vendasHoje !== null) saldo -= vendasHoje;

    // 3. Ressuprimento se saldo ficou negativo
    let ressupAplicado = 0;
    if (modo === 'simular_passado') {
      ressupAplicado = ressupRealPorDia?.[dateStr] || 0;
      saldo += ressupAplicado * cxPorPlt;
      saldo = Math.max(saldo, 0); // saldo físico não pode ser negativo (gap não recuperado = 0)
    } else if (cxPorPlt > 0 && saldo < 0) {
      ressupAplicado = Math.ceil(-saldo / cxPorPlt);
      saldo += ressupAplicado * cxPorPlt;
      accPaletes = Math.max(0, accPaletes - ressupAplicado); // ressup também paga dívida
    }

    porDia[dateStr] = {
      isFuture: false,
      isDom:    false,
      vendasOntem,
      vendasHoje,
      dataRef,
      reabPlanejado:    modo === 'planejar'         ? reabAplicado   : null,
      ressupNecessario: modo === 'planejar'         ? ressupAplicado : null,
      reabReal:         modo === 'simular_passado'  ? reabAplicado   : null,
      ressupReal:       modo === 'simular_passado'  ? ressupAplicado : null,
      saldoInicioDia,
      saldoFimDia:      saldo,
    };
  }

  return { saldoFinalMes: saldo, porDia };
}

// Obtém o saldo inicial do dia 1 do mês alvo (mes/ano).
// Olha 1 mês para trás: se houver vendas, simula com reabs/ressups REAIS do
// Firebase pra obter o saldo final. Caso contrário (primeiro mês com dados,
// ou mês anterior sem vendas) assume picking cheio = capacidade.
function obterSaldoInicialMes({ codProduto, ano, mes, cxPorPlt, espacosPalete, vendasMap, abastecimentos, dataLimitePassado }) {
  const capacidade = espacosPalete * cxPorPlt;
  if (cxPorPlt <= 0 || espacosPalete <= 0) return 0;

  let mesAnt = mes - 1, anoAnt = ano;
  if (mesAnt === 0) { mesAnt = 12; anoAnt -= 1; }
  const mesAntKey   = `${String(mesAnt).padStart(2, '0')}/${anoAnt}`;
  const diasMesAnt  = diasDoMes(mesAntKey);

  const vendasProduto    = vendasMap?.[codProduto] || {};
  const temVendasMesAnt  = diasMesAnt.some(d => vendasProduto[d] !== undefined);
  if (!temVendasMesAnt) return capacidade;

  // Reabs/ressups REAIS do produto no mês anterior
  const reabReal = {}, ressupReal = {};
  abastecimentos.forEach(a => {
    if (String(a.codProduto) !== String(codProduto)) return;
    if (!diasMesAnt.includes(a.dataOperacional)) return;
    const target = a.tipo === 'reabastecimento' ? reabReal : ressupReal;
    target[a.dataOperacional] = (target[a.dataOperacional] || 0) + (a.qtdPaletes || 1);
  });

  const { saldoFinalMes } = simularPicking({
    diasMes:          diasMesAnt,
    vendasPorDia:     vendasProduto,
    reabRealPorDia:   reabReal,
    ressupRealPorDia: ressupReal,
    cxPorPlt,
    espacosPalete,
    saldoInicial:     capacidade,   // sem recursão profunda — mês N-1 sempre começa cheio
    modo:             'simular_passado',
    dataLimitePassado,
  });

  return saldoFinalMes;
}

export default function PlanificadorIV() {
  const { col, docRef, db } = useDb();
  const [anoSelecionado, setAnoSelecionado]       = useSessionFilter('planiv:ano', '');
  const [mesNumSelecionado, setMesNumSelecionado]   = useSessionFilter('planiv:mes', '');
  const [mesesDisponiveis, setMesesDisponiveis]     = useState([]);
  const [abastecimentos, setAbastecimentos]         = useState([]);
  const [pickingConfig, setPickingConfig]           = useState([]);
  const [vendasMap, setVendasMap]                   = useState({});
  const [carregando, setCarregando]                 = useState(true);
  const [lancandoRetroativo, setLancandoRetroativo]         = useState(false);
  const [lancandoRetroativoRessp, setLancandoRetroativoRessp] = useState(false);
  const [lancandoTudo, setLancandoTudo]                     = useState(false);
  const [modo, setModo]                             = useSessionFilter('planiv:modo', 'reabastecimento');
  const [busca, setBusca]                           = useSessionFilter('planiv:busca', '');
  const [ordenacao, setOrdenacao]                   = useSessionFilter('planiv:ord', { col: 'codProduto', dir: 'asc' });
  const [tooltip, setTooltip]                       = useState(null);
  const [dataOS, setDataOS]                         = useState(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
  });

  const mes        = anoSelecionado && mesNumSelecionado ? `${mesNumSelecionado}/${anoSelecionado}` : '';
  const anos       = [...new Set(mesesDisponiveis.map(m => m.split('-')[0]))].sort();
  const mesesDoAno = mesesDisponiveis.filter(m => m.startsWith(anoSelecionado)).map(m => m.split('-')[1]).sort();

  const montadoRef        = useRef(false);
  const topScrollRef      = useRef(null);
  const tableContainerRef = useRef(null);
  const tableRef          = useRef(null);

  useEffect(() => { carregar(); montadoRef.current = true; }, []);

  useEffect(() => {
    if (!montadoRef.current || !anoSelecionado || !mesNumSelecionado) return;
    const mesVal = `${mesNumSelecionado}/${anoSelecionado}`;
    const timer = setTimeout(() => carregarPickingConfig(mesVal), 400);
    return () => clearTimeout(timer);
  }, [anoSelecionado, mesNumSelecionado]);

  useEffect(() => {
    const top       = topScrollRef.current;
    const container = tableContainerRef.current;
    const table     = tableRef.current;
    if (!top || !container || !table) return;
    const inner = top.firstChild;
    if (inner) inner.style.width = `${table.scrollWidth}px`;
    const syncFromTop   = () => { container.scrollLeft = top.scrollLeft; };
    const syncFromTable = () => { top.scrollLeft = container.scrollLeft; };
    top.addEventListener('scroll', syncFromTop);
    container.addEventListener('scroll', syncFromTable);
    return () => {
      top.removeEventListener('scroll', syncFromTop);
      container.removeEventListener('scroll', syncFromTable);
    };
  }, [mes, modo]);

  async function carregarPickingConfig(mesVal, forcarAtualizacao = false) {
    const chave = mesParaChave(mesVal);
    if (!chave) return;
    const cacheKey = `pickingConfig:${chave}`;
    if (forcarAtualizacao) invalidarCache(cacheKey);
    const cached = lerCache(cacheKey);
    if (cached) { setPickingConfig(cached); return; }
    let config;
    const pDoc = await getDoc(docRef('picking_config_mensal', chave));
    if (pDoc.exists() && (pDoc.data().produtos || []).length > 0) {
      config = pDoc.data().produtos || [];
    } else {
      const pSnap = await getDocs(col('picking_config'));
      config = pSnap.docs.map(d => d.data());
    }
    salvarCache(cacheKey, config);
    setPickingConfig(config);
  }

  async function carregar(forcarAtualizacao = false) {
    setCarregando(true);
    try {
      if (forcarAtualizacao) invalidarCache('abastecimentos', 'vendasMap');

      const [abasts, vMap] = await Promise.all([
        buscarAbastecimentos(col),
        buscarVendasMap(col),
      ]);

      const mesesSet = new Set();
      Object.values(vMap).forEach(cod => Object.keys(cod).forEach(d => { const c = dataParaChaveMes(d); if (c) mesesSet.add(c); }));
      abasts.forEach(a => { const c = dataParaChaveMes(a.dataOperacional); if (c) mesesSet.add(c); });
      const meses = [...mesesSet].sort().reverse();
      setMesesDisponiveis(meses);

      const chaveAtual = anoSelecionado && mesNumSelecionado ? `${anoSelecionado}-${mesNumSelecionado}` : null;
      const chaveUsar  = (chaveAtual && meses.includes(chaveAtual)) ? chaveAtual : (meses[0] || null);
      let mesParaUsar = '';
      if (chaveUsar) {
        const [ano, mesNum] = chaveUsar.split('-');
        setAnoSelecionado(ano);
        setMesNumSelecionado(mesNum);
        mesParaUsar = `${mesNum}/${ano}`;
      }

      setAbastecimentos(abasts);
      setVendasMap(vMap);
      if (mesParaUsar) await carregarPickingConfig(mesParaUsar, forcarAtualizacao);
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  // ===== DIAS DO MÊS =====
  const diasMes = diasDoMes(mes);

  // ===== MAPAS DE LANÇAMENTOS =====
  const reabMap  = {};
  const resspMap = {};
  abastecimentos.forEach(a => {
    if (!diasMes.includes(a.dataOperacional)) return;
    const cod = String(a.codProduto);
    const qtd = a.qtdPaletes || 1;
    if (a.tipo === 'reabastecimento') {
      if (!reabMap[cod]) reabMap[cod] = {};
      reabMap[cod][a.dataOperacional] = (reabMap[cod][a.dataOperacional] || 0) + qtd;
    } else {
      if (!resspMap[cod]) resspMap[cod] = {};
      resspMap[cod][a.dataOperacional] = (resspMap[cod][a.dataOperacional] || 0) + qtd;
    }
  });

  // ===== LINHAS (modelo de saldo no picking — dia a dia) =====
  //
  // Cada linha = um SKU do picking_config. Pra cada dia simulamos:
  //   - reab planejado (modelo decide quantos paletes precisa entregar)
  //   - ressup necessário (quando saldo ficaria negativo após vendas)
  //   - saldo no fim do dia
  //
  // O saldo inicial do dia 1 vem de obterSaldoInicialMes (que simula o mês
  // anterior com reabs/ressups REAIS, ou usa capacidade cheia se for o primeiro
  // mês com dados).
  //
  // Última data com vendas em QUALQUER produto do vendasMap. Dias até essa data
  // são tratados como "passado" pela simulação, mesmo que > HOJE no calendário
  // (cenário: usuário importou dados que cobrem dias futuros — ainda assim
  // queremos simular reab/ressup pra esses dias com vendas registradas).
  const dataLimitePassado = (() => {
    let max = null;
    for (const cod of Object.keys(vendasMap)) {
      const vendasProd = vendasMap[cod];
      for (const dateStr of Object.keys(vendasProd)) {
        if ((vendasProd[dateStr] ?? 0) <= 0) continue;
        const d = parsearData(dateStr);
        if (d && (!max || d > max)) max = d;
      }
    }
    return (max && max > HOJE) ? max : HOJE;
  })();

  const linhas = pickingConfig.map(cfg => {
    const cod           = String(cfg.codProduto);
    const cxPorPlt      = parseInt(cfg.cxPorPlt) || 0;
    const espacosPalete = parseInt(cfg.espacosPalete) || 0;

    const reabReal   = reabMap[cod]  || {};
    const ressupReal = resspMap[cod] || {};

    const anoNum = parseInt(anoSelecionado) || 0;
    const mesNum = parseInt(mesNumSelecionado) || 0;

    const saldoInicial = obterSaldoInicialMes({
      codProduto: cod, ano: anoNum, mes: mesNum,
      cxPorPlt, espacosPalete, vendasMap, abastecimentos,
      dataLimitePassado,
    });

    const simulacao = simularPicking({
      diasMes,
      vendasPorDia:     vendasMap[cod] || {},
      reabRealPorDia:   reabReal,
      ressupRealPorDia: ressupReal,
      cxPorPlt,
      espacosPalete,
      saldoInicial,
      modo: 'planejar',
      dataLimitePassado,
    });

    let totalReab = 0, totalRessp = 0;
    const daysData = diasMes.map(dateStr => {
      const sim    = simulacao.porDia[dateStr] || {};
      const real   = reabReal[dateStr]   || 0;
      const ressp  = ressupReal[dateStr] || 0;
      totalReab  += real;
      totalRessp += ressp;

      const planejado = sim.reabPlanejado;        // null em dom/futuro, número em dia útil
      return {
        dateStr,
        isDom:            !!sim.isDom,
        isFuture:         !!sim.isFuture,
        planejado,
        real,
        ressp,
        ressupNecessario: sim.ressupNecessario ?? null,  // NOVO: ressup calculado pelo modelo
        gap:              (planejado !== null && planejado !== undefined) ? real - planejado : null,
        vendas:           sim.vendasOntem ?? null,        // venda do dia operacional anterior (base do reab do dia)
        vendasHoje:       sim.vendasHoje  ?? null,        // venda do PRÓPRIO dia (usada no cálculo do ressup)
        dataRef:          sim.dataRef     ?? null,
        saldoInicioDia:   sim.saldoInicioDia ?? null,     // NOVO: saldo no início do dia (antes do reab)
        saldoFimDia:      sim.saldoFimDia    ?? null,
        depletionBefore:  sim.saldoFimDia    ?? null,     // mantido pra compat com tooltips/exports antigos
      };
    });

    return { codProduto: cod, nomeProduto: cfg.nomeProduto || cod, espacosPalete, cxPorPlt, daysData, totalReab, totalRessp, saldoInicial };
  });

  // ===== FILTRO + ORDENAÇÃO =====
  const buscaLower = busca.toLowerCase();
  const linhasFiltradas = busca
    ? linhas.filter(l => String(l.codProduto).includes(buscaLower) || (l.nomeProduto || '').toLowerCase().includes(buscaLower))
    : linhas;

  function alternarOrdenacao(col) {
    setOrdenacao(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'nomeProduto' ? 'asc' : 'desc' }
    );
  }

  function seta(col) {
    if (ordenacao.col !== col) return <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 3 }}>↕</span>;
    return <span style={{ marginLeft: 3 }}>{ordenacao.dir === 'asc' ? '↑' : '↓'}</span>;
  }

  const linhasOrdenadas = [...linhasFiltradas].sort((a, b) => {
    const dir = ordenacao.dir === 'asc' ? 1 : -1;
    if (ordenacao.col === 'nomeProduto') return dir * (a.nomeProduto || '').localeCompare(b.nomeProduto || '', 'pt-BR');
    if (ordenacao.col === 'codProduto')  return dir * (parseInt(a.codProduto) - parseInt(b.codProduto));
    return dir * ((a[ordenacao.col] || 0) - (b[ordenacao.col] || 0));
  });

  // ===== TOTAIS =====
  const totalPltReab  = linhas.reduce((s, l) => s + l.totalReab, 0);
  const totalPltRessp = linhas.reduce((s, l) => s + l.totalRessp, 0);
  const prodsComReab  = linhas.filter(l => l.totalReab > 0).length;
  const prodsComRessp = linhas.filter(l => l.totalRessp > 0).length;
  const ocorrRessp    = abastecimentos.filter(a => a.tipo === 'ressuprimento' && diasMes.includes(a.dataOperacional)).length;

  // ===== LANÇAMENTO RETROATIVO =====
  async function lancarRetroativo() {
    const nomeMes = `${MESES_NOME[parseInt(mesNumSelecionado)-1]}/${anoSelecionado}`;
    if (!window.confirm(`Gerar lançamentos retroativos de reabastecimento para ${nomeMes}?\n\nSerão inseridos apenas os dias com P ≥ 1 que ainda não têm lançamento real.`)) return;

    setLancandoRetroativo(true);
    try {
      const sorteioReab = criarSorteadorReabDoMes(); // todos os reabs de um mesmo dia ficam numa janela de 5 min
      const registros = [];
      for (const l of linhas) {
        for (const day of l.daysData) {
          if (day.isDom || day.isFuture || day.planejado === null || day.planejado < 1) continue;
          // Pula se já existe lançamento real naquele dia para aquele produto
          const jaExiste = abastecimentos.some(a =>
            String(a.codProduto) === l.codProduto &&
            a.dataOperacional === day.dateStr &&
            a.tipo === 'reabastecimento'
          );
          if (jaExiste) continue;

          const [dd, mm, aaaa] = day.dateStr.split('/');
          const hora = sorteioReab(day.dateStr);
          registros.push({
            codProduto:      l.codProduto,
            nomeProduto:     l.nomeProduto,
            tipo:            'reabastecimento',
            qtdPaletes:      day.planejado,
            conferente:      'Rodrigo',
            dataOperacional: day.dateStr,
            hora,
            criadoEm:        new Date(`${aaaa}-${mm}-${dd}T${hora}:00`).toISOString(),
          });
        }
      }

      if (registros.length === 0) {
        alert('Nenhum lançamento a inserir — todos os dias planejados já têm registro real ou não há P ≥ 1.');
        return;
      }

      for (let i = 0; i < registros.length; i += 450) {
        const batch = writeBatch(db);
        registros.slice(i, i + 450).forEach(reg => {
          batch.set(doc(col('abastecimentos')), reg);
        });
        await batch.commit();
      }

      alert(`✅ ${registros.length} lançamento(s) inserido(s) em ${nomeMes}.`);
      invalidarCache('abastecimentos');
      await carregar();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLancandoRetroativo(false);
    }
  }

  // ===== LANÇAMENTO RETROATIVO — RESSUPRIMENTO =====
  async function lancarRetroativoRessuprimento() {
    const nomeMes = `${MESES_NOME[parseInt(mesNumSelecionado)-1]}/${anoSelecionado}`;
    if (!window.confirm(`Gerar lançamentos retroativos de ressuprimento para ${nomeMes}?\n\nSerão inseridos os dias em que as vendas superaram a capacidade do Picking e que ainda não têm registro.`)) return;

    setLancandoRetroativoRessp(true);
    try {
      const registros = [];
      for (const l of linhas) {
        const { codProduto, nomeProduto, cxPorPlt, espacosPalete, daysData } = l;
        if (!cxPorPlt || !espacosPalete) continue;

        for (const day of daysData) {
          if (day.isDom || day.isFuture) continue;
          // Modelo novo: usa o ressup calculado pela simulação dia-a-dia do saldo no picking.
          // Detecta gaps mesmo quando vendas ≤ capacidade total, desde que o saldo
          // herdado do dia anterior + reab planejado não cubra as vendas do dia.
          const qtdPaletes = day.ressupNecessario || 0;
          if (qtdPaletes < 1) continue;

          const jaExiste = abastecimentos.some(a =>
            String(a.codProduto) === codProduto &&
            a.dataOperacional === day.dateStr &&
            a.tipo === 'ressuprimento'
          );
          if (jaExiste) continue;

          const { hora, conferente } = sorteioRessp();
          const [dd, mm, aaaa] = day.dateStr.split('/');

          registros.push({
            codProduto,
            nomeProduto,
            tipo:            'ressuprimento',
            qtdPaletes,
            conferente,
            dataOperacional: day.dateStr,
            hora,
            criadoEm:        new Date(`${aaaa}-${mm}-${dd}T${hora}:00`).toISOString(),
          });
        }
      }

      if (registros.length === 0) {
        alert('Nenhum lançamento a inserir — nenhum dia com vendas acima da capacidade do Picking, ou todos já têm registro.');
        return;
      }

      for (let i = 0; i < registros.length; i += 450) {
        const batch = writeBatch(db);
        registros.slice(i, i + 450).forEach(reg => batch.set(doc(col('abastecimentos')), reg));
        await batch.commit();
      }

      alert(`✅ ${registros.length} lançamento(s) de ressuprimento inserido(s) em ${nomeMes}.`);
      invalidarCache('abastecimentos');
      await carregar();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLancandoRetroativoRessp(false);
    }
  }

  // ===== LANÇAMENTO COMBINADO (ressuprimento → reabastecimento) =====
  async function lancarTudoRetroativo() {
    const nomeMes = `${MESES_NOME[parseInt(mesNumSelecionado)-1]}/${anoSelecionado}`;
    if (!window.confirm(
      `Lançar TUDO retroativo para ${nomeMes}?\n\n` +
      `1. Apaga todos os reabastecimentos do mês\n` +
      `2. Insere ressuprimentos (pula os já existentes)\n` +
      `3. Recalcula e insere reabastecimentos com modelo corrigido`
    )) return;

    setLancandoTudo(true);
    try {
      // ── PASSO 1: apagar reabastecimentos do mês ──────────────────────────────
      const reabParaApagar = abastecimentos.filter(
        a => a.tipo === 'reabastecimento' && diasMes.includes(a.dataOperacional)
      );
      for (let i = 0; i < reabParaApagar.length; i += 450) {
        const batch = writeBatch(db);
        reabParaApagar.slice(i, i + 450).forEach(a => batch.delete(docRef('abastecimentos', a._id)));
        await batch.commit();
      }

      // ── PASSO 2: inserir ressuprimentos (skip se já existe) ──────────────────
      // Usa o novo modelo de simulação dia-a-dia (via `daysData[].ressupNecessario`).
      const resspRegistros = [];
      for (const l of linhas) {
        const { codProduto, nomeProduto, cxPorPlt, espacosPalete, daysData } = l;
        if (!cxPorPlt || !espacosPalete) continue;
        for (const day of daysData) {
          if (day.isDom || day.isFuture) continue;
          const qtdPaletes = day.ressupNecessario || 0;
          if (qtdPaletes < 1) continue;
          const jaExiste = abastecimentos.some(a =>
            String(a.codProduto) === codProduto &&
            a.dataOperacional === day.dateStr &&
            a.tipo === 'ressuprimento'
          );
          if (jaExiste) continue;
          const { hora, conferente } = sorteioRessp();
          const [dd, mm, aaaa] = day.dateStr.split('/');
          resspRegistros.push({ codProduto, nomeProduto, tipo: 'ressuprimento', qtdPaletes, conferente, dataOperacional: day.dateStr, hora, criadoEm: new Date(`${aaaa}-${mm}-${dd}T${hora}:00`).toISOString() });
        }
      }
      for (let i = 0; i < resspRegistros.length; i += 450) {
        const batch = writeBatch(db);
        resspRegistros.slice(i, i + 450).forEach(reg => batch.set(doc(col('abastecimentos')), reg));
        await batch.commit();
      }

      // ── PASSO 3: recarregar abastecimentos frescos do Firebase ───────────────
      const aSnapFresh = await getDocs(col('abastecimentos'));
      const abastsFresh = aSnapFresh.docs.map(d => ({ _id: d.id, ...d.data() }));

      const reabMapF = {}, resspMapF = {};
      abastsFresh.forEach(a => {
        if (!diasMes.includes(a.dataOperacional)) return;
        const cod = String(a.codProduto);
        const qtd = a.qtdPaletes || 1;
        if (a.tipo === 'reabastecimento') {
          if (!reabMapF[cod]) reabMapF[cod] = {};
          reabMapF[cod][a.dataOperacional] = (reabMapF[cod][a.dataOperacional] || 0) + qtd;
        } else {
          if (!resspMapF[cod]) resspMapF[cod] = {};
          resspMapF[cod][a.dataOperacional] = (resspMapF[cod][a.dataOperacional] || 0) + qtd;
        }
      });

      // ── PASSO 4: planejar reabastecimentos usando o modelo de saldo no picking ──
      // Usa a mesma função simularPicking() em modo 'planejar'. Como o passo 1
      // apagou todos os reabs do mês, mas o passo 2/3 já inseriu os ressups
      // novos e recarregou abasts, o saldo inicial vem do mês anterior (real)
      // e a simulação calcula reab+ressup de novo. Os ressups já foram inseridos
      // no passo 2, então só inserimos os REABS aqui (a simulação garante que
      // os números são consistentes entre si).
      const anoNum = parseInt(anoSelecionado) || 0;
      const mesNum = parseInt(mesNumSelecionado) || 0;
      const reabRegistros = [];
      const sorteioReab = criarSorteadorReabDoMes(); // mesma janela de 5 min por dia

      for (const cfg of pickingConfig) {
        const cod           = String(cfg.codProduto);
        const cxPorPlt      = parseInt(cfg.cxPorPlt) || 0;
        const espacosPalete = parseInt(cfg.espacosPalete) || 0;
        if (!cxPorPlt || !espacosPalete) continue;

        const saldoInicial = obterSaldoInicialMes({
          codProduto: cod, ano: anoNum, mes: mesNum,
          cxPorPlt, espacosPalete, vendasMap, abastecimentos: abastsFresh,
          dataLimitePassado,
        });

        const { porDia } = simularPicking({
          diasMes,
          vendasPorDia:     vendasMap[cod] || {},
          reabRealPorDia:   reabMapF[cod]  || {},
          ressupRealPorDia: resspMapF[cod] || {},
          cxPorPlt,
          espacosPalete,
          saldoInicial,
          modo: 'planejar',
          dataLimitePassado,
        });

        for (const dateStr of diasMes) {
          const sim = porDia[dateStr];
          if (!sim || sim.isDom || sim.isFuture) continue;
          const planejado = sim.reabPlanejado || 0;
          if (planejado < 1) continue;
          const [dd, mm, aaaa] = dateStr.split('/');
          const hora = sorteioReab(dateStr);
          reabRegistros.push({
            codProduto:      cod,
            nomeProduto:     cfg.nomeProduto || cod,
            tipo:            'reabastecimento',
            qtdPaletes:      planejado,
            conferente:      'Rodrigo',
            dataOperacional: dateStr,
            hora,
            criadoEm:        new Date(`${aaaa}-${mm}-${dd}T${hora}:00`).toISOString(),
          });
        }
      }
      for (let i = 0; i < reabRegistros.length; i += 450) {
        const batch = writeBatch(db);
        reabRegistros.slice(i, i + 450).forEach(reg => batch.set(doc(col('abastecimentos')), reg));
        await batch.commit();
      }

      alert(
        `✅ Concluído para ${nomeMes}!\n` +
        `• ${reabParaApagar.length} reabastecimento(s) anterior(es) substituído(s)\n` +
        `• ${resspRegistros.length} ressuprimento(s) inserido(s)\n` +
        `• ${reabRegistros.length} reabastecimento(s) inserido(s)`
      );
      invalidarCache('abastecimentos');
      await carregar();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLancandoTudo(false);
    }
  }

  // ===== RESETAR E LANÇAR TUDO (apaga reabs + ressups antes de relançar) =====
  // Diferença pro lancarTudoRetroativo: aqui APAGA também os ressups existentes
  // antes de inserir os novos. Útil pra reset completo com o modelo novo de
  // saldo no picking (especialmente em meses lançados com a lógica antiga).
  async function resetarELancarTudo() {
    const nomeMes = `${MESES_NOME[parseInt(mesNumSelecionado)-1]}/${anoSelecionado}`;
    if (!window.confirm(
      `🧹 RESETAR e lançar TUDO retroativo para ${nomeMes}?\n\n` +
      `⚠️ Esta ação APAGA tanto reabastecimentos QUANTO ressuprimentos do mês\n` +
      `(incluindo lançamentos manuais e legados), e relança do zero usando o\n` +
      `modelo novo de saldo no picking.\n\n` +
      `1. Apaga TODOS os reabs e ressups do mês\n` +
      `2. Simula o mês com o modelo de saldo e insere os ressups necessários\n` +
      `3. Insere os reabs planejados pelo mesmo modelo\n\n` +
      `Continuar?`
    )) return;

    setLancandoTudo(true);
    try {
      // ── PASSO 1: apagar TODOS os abastecimentos (reabs E ressups) do mês ──
      const abastsParaApagar = abastecimentos.filter(a => diasMes.includes(a.dataOperacional));
      for (let i = 0; i < abastsParaApagar.length; i += 450) {
        const batch = writeBatch(db);
        abastsParaApagar.slice(i, i + 450).forEach(a => batch.delete(docRef('abastecimentos', a._id)));
        await batch.commit();
      }

      // ── PASSO 2: simular e inserir ressuprimentos novos ──
      // Como o passo 1 apagou tudo, não tem o que pular — usamos a simulação
      // direto sobre o estado limpo. Como `abastecimentos` (state) ainda tem
      // os antigos por enquanto, vamos simular SEM usar o `linhas` cache:
      // chamamos simularPicking direto com abastecimentos vazios (do mês).
      const anoNum = parseInt(anoSelecionado) || 0;
      const mesNum = parseInt(mesNumSelecionado) || 0;
      // Abastecimentos do mês anterior continuam intactos — usados pra obter saldoInicial.
      const abastsExceto = abastecimentos.filter(a => !diasMes.includes(a.dataOperacional));

      const resspRegistros = [];
      for (const cfg of pickingConfig) {
        const cod           = String(cfg.codProduto);
        const cxPorPlt      = parseInt(cfg.cxPorPlt) || 0;
        const espacosPalete = parseInt(cfg.espacosPalete) || 0;
        if (!cxPorPlt || !espacosPalete) continue;

        const saldoInicial = obterSaldoInicialMes({
          codProduto: cod, ano: anoNum, mes: mesNum,
          cxPorPlt, espacosPalete, vendasMap, abastecimentos: abastsExceto,
          dataLimitePassado,
        });

        const { porDia } = simularPicking({
          diasMes,
          vendasPorDia:     vendasMap[cod] || {},
          reabRealPorDia:   {},
          ressupRealPorDia: {},
          cxPorPlt,
          espacosPalete,
          saldoInicial,
          modo: 'planejar',
          dataLimitePassado,
        });

        for (const dateStr of diasMes) {
          const sim = porDia[dateStr];
          if (!sim || sim.isDom || sim.isFuture) continue;
          const qtdPaletes = sim.ressupNecessario || 0;
          if (qtdPaletes < 1) continue;
          const { hora, conferente } = sorteioRessp();
          const [dd, mm, aaaa] = dateStr.split('/');
          resspRegistros.push({
            codProduto:      cod,
            nomeProduto:     cfg.nomeProduto || cod,
            tipo:            'ressuprimento',
            qtdPaletes,
            conferente,
            dataOperacional: dateStr,
            hora,
            criadoEm:        new Date(`${aaaa}-${mm}-${dd}T${hora}:00`).toISOString(),
          });
        }
      }
      for (let i = 0; i < resspRegistros.length; i += 450) {
        const batch = writeBatch(db);
        resspRegistros.slice(i, i + 450).forEach(reg => batch.set(doc(col('abastecimentos')), reg));
        await batch.commit();
      }

      // ── PASSO 3: recarregar abastecimentos frescos ──
      const aSnapFresh = await getDocs(col('abastecimentos'));
      const abastsFresh = aSnapFresh.docs.map(d => ({ _id: d.id, ...d.data() }));
      const reabMapF = {}, resspMapF = {};
      abastsFresh.forEach(a => {
        if (!diasMes.includes(a.dataOperacional)) return;
        const cod = String(a.codProduto);
        const qtd = a.qtdPaletes || 1;
        const target = a.tipo === 'reabastecimento' ? reabMapF : resspMapF;
        if (!target[cod]) target[cod] = {};
        target[cod][a.dataOperacional] = (target[cod][a.dataOperacional] || 0) + qtd;
      });

      // ── PASSO 4: simular e inserir reabastecimentos planejados ──
      const reabRegistros = [];
      const sorteioReab = criarSorteadorReabDoMes(); // mesma janela de 5 min por dia
      for (const cfg of pickingConfig) {
        const cod           = String(cfg.codProduto);
        const cxPorPlt      = parseInt(cfg.cxPorPlt) || 0;
        const espacosPalete = parseInt(cfg.espacosPalete) || 0;
        if (!cxPorPlt || !espacosPalete) continue;

        const saldoInicial = obterSaldoInicialMes({
          codProduto: cod, ano: anoNum, mes: mesNum,
          cxPorPlt, espacosPalete, vendasMap, abastecimentos: abastsFresh,
          dataLimitePassado,
        });

        const { porDia } = simularPicking({
          diasMes,
          vendasPorDia:     vendasMap[cod] || {},
          reabRealPorDia:   reabMapF[cod]  || {},
          ressupRealPorDia: resspMapF[cod] || {},
          cxPorPlt,
          espacosPalete,
          saldoInicial,
          modo: 'planejar',
          dataLimitePassado,
        });

        for (const dateStr of diasMes) {
          const sim = porDia[dateStr];
          if (!sim || sim.isDom || sim.isFuture) continue;
          const planejado = sim.reabPlanejado || 0;
          if (planejado < 1) continue;
          const [dd, mm, aaaa] = dateStr.split('/');
          const hora = sorteioReab(dateStr);
          reabRegistros.push({
            codProduto:      cod,
            nomeProduto:     cfg.nomeProduto || cod,
            tipo:            'reabastecimento',
            qtdPaletes:      planejado,
            conferente:      'Rodrigo',
            dataOperacional: dateStr,
            hora,
            criadoEm:        new Date(`${aaaa}-${mm}-${dd}T${hora}:00`).toISOString(),
          });
        }
      }
      for (let i = 0; i < reabRegistros.length; i += 450) {
        const batch = writeBatch(db);
        reabRegistros.slice(i, i + 450).forEach(reg => batch.set(doc(col('abastecimentos')), reg));
        await batch.commit();
      }

      alert(
        `🧹 Reset concluído para ${nomeMes}!\n` +
        `• ${abastsParaApagar.length} lançamento(s) antigo(s) apagado(s)\n` +
        `• ${resspRegistros.length} ressuprimento(s) inserido(s)\n` +
        `• ${reabRegistros.length} reabastecimento(s) inserido(s)`
      );
      invalidarCache('abastecimentos');
      await carregar();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLancandoTudo(false);
    }
  }

  // ===== OS DE REABASTECIMENTO =====
  function gerarOSReabastecimento() {
    if (!dataOS) { alert('Selecione uma data para a OS.'); return; }

    const [aaaa, mmOS, ddOS] = dataOS.split('-');
    const dataFormatada = `${ddOS}/${mmOS}/${aaaa}`;
    const dateObj = new Date(parseInt(aaaa), parseInt(mmOS)-1, parseInt(ddOS));
    const isDom = dateObj.getDay() === 0;
    if (isDom) { alert('Domingo não tem operação de reabastecimento.'); return; }

    const itens = [];
    for (const l of linhas) {
      const dayData = l.daysData.find(d => d.dateStr === dataFormatada);
      if (!dayData || dayData.isDom || dayData.isFuture) continue;
      if (dayData.planejado !== null && dayData.planejado >= 1) {
        itens.push({
          codigo: l.codProduto,
          nome: l.nomeProduto,
          planejado: dayData.planejado,
          espacosPalete: l.espacosPalete,
          cxPorPlt: l.cxPorPlt,
        });
      }
    }

    if (itens.length === 0) {
      alert(`Nenhum produto com planejado ≥ 1 para ${dataFormatada}.\n\nVerifique se o mês está carregado e se há dados de vendas para esse período.`);
      return;
    }

    const totalPaletes = itens.reduce((s, it) => s + it.planejado, 0);
    const logoUrl = window.location.origin + '/LogoCBM.png';
    const agora = new Date();
    const geradoEm = `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;

    const linhasTabela = itens
      .sort((a, b) => parseInt(a.codigo) - parseInt(b.codigo))
      .map((item, idx) => `
        <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f4f8ff'}">
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#E31837;font-size:12px">${item.codigo}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;font-size:12px">${item.nome}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;font-size:15px;color:#1D5A9E">${item.planejado}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;color:#999;font-size:12px"></td>
        </tr>
      `).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>OS Reabastecimento ${dataFormatada}</title>
  <style>
    @media print {
      body { margin: 0; }
      @page { size: A4; margin: 14mm 12mm; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 0; margin: 0; }
    .page { padding: 14px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #E31837; padding-bottom: 8px; margin-bottom: 10px; }
    .logo-block { display: flex; align-items: center; gap: 10px; }
    .logo { height: 48px; object-fit: contain; }
    .company-name { font-size: 14px; font-weight: bold; color: #1D5A9E; line-height: 1.2; }
    .title-block  { text-align: right; }
    .os-title     { font-size: 17px; font-weight: bold; color: #1D5A9E; letter-spacing: 0.3px; }
    .os-date      { font-size: 13px; color: #E31837; font-weight: bold; margin-top: 2px; }
    .os-sub       { font-size: 10px; color: #999; margin-top: 1px; }
    .totals       { display: flex; gap: 24px; background: #eef4ff; border: 1px solid #c0cce8; border-radius: 6px; padding: 7px 16px; margin-bottom: 10px; }
    .total-item   { text-align: center; }
    .total-num    { font-size: 24px; font-weight: bold; color: #1D5A9E; line-height: 1; }
    .total-label  { font-size: 10px; color: #666; margin-top: 1px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1D5A9E; color: white; }
    thead th { padding: 5px 8px; text-align: center; font-size: 11px; font-weight: bold; border: 1px solid #1a4f8a; }
    thead th.left { text-align: left; }
    .footer { margin-top: 10px; font-size: 10px; color: #bbb; border-top: 1px solid #eee; padding-top: 6px; display: flex; justify-content: space-between; }
    .sign-area { margin-top: 20px; display: flex; gap: 30px; }
    .sign-box { flex: 1; border-top: 1px solid #999; padding-top: 4px; font-size: 10px; color: #666; text-align: center; }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-block">
      <img src="${logoUrl}" class="logo" onerror="this.style.display='none'" alt="CBM" />
      <div>
        <div class="company-name">CBM Carpina</div>
      </div>
    </div>
    <div class="title-block">
      <div class="os-title">Ordem de Serviço</div>
      <div class="os-title" style="font-size:14px;color:#555">Reabastecimento do Picking</div>
      <div class="os-date">📅 ${dataFormatada}</div>
      <div class="os-sub">Gerado em ${geradoEm}</div>
    </div>
  </div>

  <div class="totals">
    <div class="total-item">
      <div class="total-num">${itens.length}</div>
      <div class="total-label">produtos</div>
    </div>
    <div class="total-item">
      <div class="total-num">${totalPaletes}</div>
      <div class="total-label">paletes planejados</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:70px">Código</th>
        <th class="left">Produto</th>
        <th style="width:90px">Planejado</th>
        <th style="width:90px">Real</th>
      </tr>
    </thead>
    <tbody>
      ${linhasTabela}
    </tbody>
  </table>

  <div class="sign-area">
    <div class="sign-box">Conferente Responsável</div>
    <div class="sign-box">Supervisor</div>
    <div class="sign-box">Hora de Início</div>
    <div class="sign-box">Hora de Conclusão</div>
  </div>

  <div class="footer">
    <span>CBM Carpina · Sistema de Gestão de Reabastecimento</span>
    <span>OS — ${dataFormatada}</span>
  </div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=960,height=750');
    if (!w) { alert('Popup bloqueado! Permita popups para este site e tente novamente.'); return; }
    w.document.write(html);
    w.document.close();
  }

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Carregando...</div>;

  const nSubCols = modo === 'reabastecimento' ? 3 : 1;

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Planificador IV</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>Ano:</label>
          <select
            value={anoSelecionado}
            onChange={e => {
              const novoAno = e.target.value;
              const mesesNoAno = mesesDisponiveis.filter(m => m.startsWith(novoAno)).map(m => m.split('-')[1]).sort();
              setAnoSelecionado(novoAno);
              setMesNumSelecionado(mesesNoAno[mesesNoAno.length - 1] || '');
            }}
            style={{ ...inpStyle, width: 90 }}
          >
            {anos.length === 0 && <option value="">—</option>}
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>Mês:</label>
          <select
            value={mesNumSelecionado}
            onChange={e => setMesNumSelecionado(e.target.value)}
            style={{ ...inpStyle, width: 130 }}
          >
            {mesesDoAno.length === 0 && <option value="">—</option>}
            {mesesDoAno.map(m => <option key={m} value={m}>{MESES_NOME[parseInt(m)-1]}</option>)}
          </select>

          <button onClick={() => carregar(true)} style={btnSec}>🔄 Atualizar</button>

          {/* Botões ocultados temporariamente — pra reativar, troque `false &&` por nada */}
          {false && diasMes.length > 0 && linhas.length > 0 && (
            <button
              onClick={lancarTudoRetroativo}
              disabled={lancandoTudo}
              style={{ ...btnSec, backgroundColor: lancandoTudo ? '#eee' : '#f0fdf4', borderColor: '#16a34a', color: '#14532d', fontWeight: 'bold', opacity: lancandoTudo ? 0.6 : 1 }}
            >
              {lancandoTudo ? '⏳ Processando...' : '🚀 Lançar Tudo Retroativo'}
            </button>
          )}

          {false && diasMes.length > 0 && linhas.length > 0 && (
            <button
              onClick={resetarELancarTudo}
              disabled={lancandoTudo}
              title="Apaga reabs + ressups do mês e relança tudo do zero com o modelo novo"
              style={{ ...btnSec, backgroundColor: lancandoTudo ? '#eee' : '#fef3c7', borderColor: '#b45309', color: '#78350f', fontWeight: 'bold', opacity: lancandoTudo ? 0.6 : 1 }}
            >
              {lancandoTudo ? '⏳ Processando...' : '🧹 Resetar e Lançar Tudo'}
            </button>
          )}

          {false && modo === 'reabastecimento' && diasMes.length > 0 && linhas.length > 0 && (
            <button
              onClick={lancarRetroativo}
              disabled={lancandoRetroativo}
              style={{ ...btnSec, backgroundColor: lancandoRetroativo ? '#eee' : '#fff7e6', borderColor: '#f59e0b', color: '#92400e', opacity: lancandoRetroativo ? 0.6 : 1 }}
            >
              {lancandoRetroativo ? '⏳ Inserindo...' : '📥 Lançar Retroativo'}
            </button>
          )}

          {false && modo === 'ressuprimento' && diasMes.length > 0 && linhas.length > 0 && (
            <button
              onClick={lancarRetroativoRessuprimento}
              disabled={lancandoRetroativoRessp}
              style={{ ...btnSec, backgroundColor: lancandoRetroativoRessp ? '#eee' : '#fdf2f8', borderColor: '#e879a8', color: '#831843', opacity: lancandoRetroativoRessp ? 0.6 : 1 }}
            >
              {lancandoRetroativoRessp ? '⏳ Inserindo...' : '📥 Lançar Retroativo'}
            </button>
          )}

          {false && diasMes.length > 0 && linhasOrdenadas.length > 0 && (
            <button onClick={() => exportarCSV(linhasOrdenadas, diasMes, modo, mes)} style={btnSec}>📤 Exportar CSV</button>
          )}
          <input
            type="text"
            placeholder="🔍 Filtrar produto..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ ...inpStyle, width: 210 }}
          />
          {busca && <button onClick={() => setBusca('')} style={{ ...btnSec, padding: '7px 10px' }}>✕</button>}
        </div>
      </div>

      {/* OS de Reabastecimento */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderLeft: '4px solid #1D5A9E' }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: '#1D5A9E' }}>📋 OS de Reabastecimento</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Data da OS:</label>
          <input
            type="date"
            value={dataOS}
            onChange={e => setDataOS(e.target.value)}
            style={{ ...inpStyle, fontSize: 13, width: 150 }}
          />
        </div>
        <button
          onClick={gerarOSReabastecimento}
          style={{ padding: '8px 18px', backgroundColor: '#1D5A9E', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
        >
          🖨️ Gerar OS (PDF)
        </button>
        <span style={{ fontSize: 11, color: '#aaa' }}>Gera o planejado do dia selecionado</span>
      </div>

      {/* Widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { id: 'reabastecimento', label: '🌅 Reabastecimento', total: totalPltReab,  sub: `${prodsComReab} produtos`,                        cor: '#1D5A9E' },
          { id: 'ressuprimento',   label: '🌙 Ressuprimento',   total: totalPltRessp, sub: `${prodsComRessp} produtos · ${ocorrRessp} ocorr.`, cor: '#E31837' },
        ].map(w => {
          const ativo = modo === w.id;
          return (
            <div key={w.id}
              onClick={() => { setModo(w.id); setOrdenacao({ col: w.id === 'reabastecimento' ? 'totalReab' : 'totalRessp', dir: 'desc' }); }}
              style={{
                borderRadius: 14, padding: '18px 22px', border: `2px solid ${ativo ? w.cor : '#e0e0e0'}`,
                backgroundColor: ativo ? w.cor : '#fff', color: ativo ? '#fff' : '#333',
                cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none',
                boxShadow: ativo ? `0 4px 16px ${w.cor}44` : '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: '600', opacity: 0.85, marginBottom: 6 }}>{w.label}</div>
                  <div style={{ fontSize: 34, fontWeight: 'bold', lineHeight: 1 }}>{w.total}</div>
                  <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>paletes</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>{w.sub}</div>
                  {ativo  && <div style={{ marginTop: 8, fontSize: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 8px' }}>✓ ativo</div>}
                  {!ativo && <div style={{ marginTop: 8, fontSize: 11, color: w.cor, opacity: 0.7 }}>Clique →</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Planificador */}
      {!mes || diasMes.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#999' }}>
          {mesesDisponiveis.length === 0 ? 'Nenhum dado importado ainda.' : 'Selecione um mês válido.'}
        </div>
      ) : (
        <div style={card}>
          <div style={{ marginBottom: 10, fontSize: 11, color: '#888' }}>
            {linhasOrdenadas.length} produto(s){busca ? ` — filtro: "${busca}"` : ` de ${linhas.length}`}
            &nbsp;·&nbsp;{diasMes.length} dia(s) · domingos = sem operação
            &nbsp;·&nbsp;<span style={{ color: '#92400e' }}>P = acumulado de depleção (paletes completos)</span>
          </div>

          {/* Barra de rolagem superior + tabela com setas laterais */}
          <div style={{ position: 'relative' }}>

            {/* Seta esquerda */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 30, pointerEvents: 'none', zIndex: 6 }}>
              <button
                onClick={() => tableContainerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                title="Rolar para a esquerda"
                style={{ position: 'sticky', top: 'calc(50vh - 15px)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: 'none', backgroundColor: 'rgba(29,90,158,0.80)', color: 'white', cursor: 'pointer', fontSize: 13, boxShadow: '0 2px 6px rgba(0,0,0,0.30)', pointerEvents: 'all' }}
              >◀</button>
            </div>

            {/* Seta direita */}
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 30, pointerEvents: 'none', zIndex: 6 }}>
              <button
                onClick={() => tableContainerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                title="Rolar para a direita"
                style={{ position: 'sticky', top: 'calc(50vh - 15px)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: 'none', backgroundColor: 'rgba(29,90,158,0.80)', color: 'white', cursor: 'pointer', fontSize: 13, boxShadow: '0 2px 6px rgba(0,0,0,0.30)', pointerEvents: 'all' }}
              >▶</button>
            </div>

            <div ref={topScrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', height: 14, marginBottom: 2 }}>
              <div style={{ height: 1 }} />
            </div>

          <div ref={tableContainerRef} style={{ overflowX: 'auto' }}>
            <table ref={tableRef} style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th rowSpan={modo === 'reabastecimento' ? 3 : 2}
                    onClick={() => alternarOrdenacao('codProduto')}
                    style={{ ...thBase, ...thFixo, cursor: 'pointer', minWidth: 55, verticalAlign: 'middle' }}>
                    Cód{seta('codProduto')}
                  </th>
                  <th rowSpan={modo === 'reabastecimento' ? 3 : 2}
                    onClick={() => alternarOrdenacao('nomeProduto')}
                    style={{ ...thBase, ...thFixo, cursor: 'pointer', textAlign: 'left', minWidth: 170, verticalAlign: 'middle' }}>
                    Produto{seta('nomeProduto')}
                  </th>
                  {diasMes.map(dateStr => {
                    const dow   = parsearData(dateStr).getDay();
                    const isDom = dow === 0;
                    const bg    = isDom ? '#9e9e9e' : modo === 'reabastecimento' ? '#1D5A9E' : '#E31837';
                    return (
                      <th key={dateStr} colSpan={nSubCols} style={{
                        ...thBase, backgroundColor: bg, color: '#fff', fontSize: 11,
                        borderRight: `${nSubCols > 1 ? 2 : 1}px solid #fff`, padding: '5px 3px',
                      }}>
                        {dateStr.slice(0,2)}
                      </th>
                    );
                  })}
                  {modo === 'reabastecimento' ? (
                    <th rowSpan={3} onClick={() => alternarOrdenacao('totalReab')}
                      style={{ ...thBase, backgroundColor: '#163f72', color: '#fff', cursor: 'pointer', borderLeft: '3px solid #0a2a50', minWidth: 65, verticalAlign: 'middle' }}>
                      Total{seta('totalReab')}
                    </th>
                  ) : (
                    <th rowSpan={2} onClick={() => alternarOrdenacao('totalRessp')}
                      style={{ ...thBase, ...thFixo, cursor: 'pointer', borderLeft: '3px solid #a00', minWidth: 65, verticalAlign: 'middle' }}>
                      Total{seta('totalRessp')}
                    </th>
                  )}
                </tr>
                <tr>
                  {diasMes.map(dateStr => {
                    const dow   = parsearData(dateStr).getDay();
                    const isDom = dow === 0;
                    const bg    = isDom ? '#bdbdbd' : modo === 'reabastecimento' ? '#2a70c0' : '#f07080';
                    return (
                      <th key={dateStr} colSpan={nSubCols} style={{
                        backgroundColor: bg, color: isDom ? '#fff' : modo === 'reabastecimento' ? '#fff' : '#7a0010',
                        padding: '2px 2px', fontSize: 9, textAlign: 'center',
                        borderRight: `${nSubCols > 1 ? 2 : 1}px solid #fff`, fontWeight: '600',
                      }}>
                        {DIAS_SEMANA[dow]}
                      </th>
                    );
                  })}
                </tr>
                {modo === 'reabastecimento' && (
                  <tr>
                    {diasMes.map(dateStr => {
                      const isDom = parsearData(dateStr).getDay() === 0;
                      return [
                        <th key={`${dateStr}-p`} style={{ ...thSub, color: isDom ? '#aaa' : '#444' }}>P</th>,
                        <th key={`${dateStr}-r`} style={{ ...thSub, color: isDom ? '#aaa' : '#1D5A9E' }}>R</th>,
                        <th key={`${dateStr}-g`} style={{ ...thSub, color: isDom ? '#aaa' : '#333', borderRight: '2px solid #ddd' }}>G</th>,
                      ];
                    })}
                  </tr>
                )}
              </thead>

              <tbody>
                {linhasOrdenadas.map((l, i) => (
                  <tr key={l.codProduto} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f6f8ff', borderBottom: '1px solid #eee' }}>
                    <td style={{ ...tdBase, fontWeight: 'bold', color: '#E31837' }}>{l.codProduto}</td>
                    <td style={{ ...tdBase, textAlign: 'left' }}>{l.nomeProduto}</td>

                    {modo === 'reabastecimento'
                      ? l.daysData.map(({ dateStr, isDom, isFuture, planejado, real, gap, vendas, vendasHoje, dataRef, saldoInicioDia, saldoFimDia, ressupNecessario }) => {
                          if (isDom) return [
                            <td key={`${dateStr}-p`} style={tdDom}>—</td>,
                            <td key={`${dateStr}-r`} style={tdDom}>—</td>,
                            <td key={`${dateStr}-g`} style={{ ...tdDom, borderRight: '2px solid #ddd' }}>—</td>,
                          ];
                          if (isFuture) return [
                            <td key={`${dateStr}-p`} style={tdFut}>—</td>,
                            <td key={`${dateStr}-r`} style={tdFut}>—</td>,
                            <td key={`${dateStr}-g`} style={{ ...tdFut, borderRight: '2px solid #eee' }}>—</td>,
                          ];

                          const pValor = planejado === null ? '—' : planejado > 0 ? planejado : '·';
                          const pColor = planejado === null ? '#ccc' : planejado > 0 ? '#1a1a1a' : '#ddd';
                          const pBold  = planejado > 0 ? 'bold' : 'normal';

                          const semGap = planejado === 0 && real === 0;
                          const corGap = gap === null || semGap ? '#ddd'
                            : gap > 0  ? '#c0392b'
                            : gap < 0  ? '#b45309'
                            : '#166534';
                          const gValor = gap === null || semGap ? '·'
                            : gap > 0 ? `+${gap}` : gap < 0 ? gap : '0';

                          return [
                            <td
                              key={`${dateStr}-p`}
                              style={{ ...tdBase, color: pColor, fontWeight: pBold, cursor: planejado > 0 ? 'help' : 'default' }}
                              onMouseEnter={planejado > 0 ? e => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = Math.min(rect.left, window.innerWidth - 260);
                                const y = rect.bottom + 210 > window.innerHeight ? rect.top - 220 : rect.bottom + 4;
                                setTooltip({ x, y, nomeProduto: l.nomeProduto, espacosPalete: l.espacosPalete, cxPorPlt: l.cxPorPlt, vendas, vendasHoje, dataRef, planejado, saldoInicioDia, saldoFimDia, ressupNecessario });
                              } : undefined}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              {pValor}
                            </td>,
                            <td key={`${dateStr}-r`} style={{ ...tdBase, color: real > 0 ? '#1D5A9E' : '#ccc', fontWeight: real > 0 ? 'bold' : 'normal' }}>
                              {real > 0 ? real : '—'}
                            </td>,
                            <td key={`${dateStr}-g`} style={{ ...tdBase, fontWeight: !semGap && gap !== null && gap !== 0 ? 'bold' : 'normal', color: corGap, borderRight: '2px solid #eee' }}>
                              {gValor}
                            </td>,
                          ];
                        })
                      : l.daysData.map(({ dateStr, isDom, ressp }) => {
                          if (isDom) return <td key={dateStr} style={tdDom}>—</td>;
                          return (
                            <td key={dateStr} style={{ ...tdBase, color: ressp > 0 ? '#E31837' : '#ccc', fontWeight: ressp > 0 ? 'bold' : 'normal' }}>
                              {ressp > 0 ? ressp : '—'}
                            </td>
                          );
                        })
                    }

                    {modo === 'reabastecimento' ? (
                      <td style={{ ...tdBase, fontWeight: 'bold', color: '#1D5A9E', backgroundColor: '#eef2ff', borderLeft: '3px solid #c0cff0' }}>
                        {l.totalReab || '—'}
                      </td>
                    ) : (
                      <td style={{ ...tdBase, fontWeight: 'bold', color: l.totalRessp > 0 ? '#E31837' : '#ccc', backgroundColor: l.totalRessp > 0 ? '#fff0f0' : undefined, borderLeft: '3px solid #f5c0c8' }}>
                        {l.totalRessp > 0 ? l.totalRessp : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>{/* fim wrapper setas */}

          {/* Legenda */}
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10, color: '#999', flexWrap: 'wrap', borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
            {modo === 'reabastecimento' ? (
              <>
                <span><b>P</b> = Paletes planejados (modelo de saldo) · <b>R</b> = Real · <b>G</b> = R−P</span>
                <span><b>·</b> = sem ação necessária neste dia</span>
                <span>Seg usa vendas de Sáb (pula dom.)</span>
                <span><b style={{ color: '#c0392b' }}>G+</b> reabasteceu a mais &nbsp;<b style={{ color: '#b45309' }}>G−</b> reabasteceu a menos &nbsp;<b style={{ color: '#166534' }}>G=0</b> ok</span>
                <span style={{ color: '#aaa', fontStyle: 'italic' }}>Passe o cursor em P para ver saldo no fim do dia, ressup necessário, etc.</span>
              </>
            ) : (
              <>
                <span>Valores = paletes ressupridos por dia · — = nenhum</span>
                <span style={{ color: '#aaa', fontStyle: 'italic' }}>Modelo novo: detecta gap quando saldo herdado + reab não cobre a venda do dia</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          backgroundColor: '#1e293b', color: '#f1f5f9',
          padding: '10px 14px', borderRadius: 8, fontSize: 12,
          zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)', minWidth: 230, lineHeight: 1.9,
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 6 }}>
            {tooltip.nomeProduto}
          </div>
          <div>📦 Espaços picking: <b>{tooltip.espacosPalete} plt</b> ({tooltip.espacosPalete * tooltip.cxPorPlt} cx)</div>

          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ fontSize: 9.5, color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
              Equação do dia
            </div>
            <div>
              Saldo início:{' '}
              <b>{tooltip.saldoInicioDia !== null && tooltip.saldoInicioDia !== undefined ? `${Math.round(tooltip.saldoInicioDia)} cx` : '—'}</b>
            </div>
            <div style={{ color: '#86efac' }}>
              Reab realizado:{' '}
              <b>{tooltip.planejado} plt</b>
              <span style={{ color: '#94a3b8' }}> (+{tooltip.planejado * tooltip.cxPorPlt} cx)</span>
            </div>
            <div style={{ color: '#fca5a5' }}>
              − Vendas do dia:{' '}
              <b>{tooltip.vendasHoje !== null && tooltip.vendasHoje !== undefined ? `${tooltip.vendasHoje} cx` : '0 cx'}</b>
            </div>
            <div style={{ marginTop: 2, paddingTop: 4, borderTop: '1px dashed rgba(255,255,255,0.15)' }}>
              = Saldo fim:{' '}
              <b>{tooltip.saldoFimDia !== null && tooltip.saldoFimDia !== undefined ? `${Math.round(tooltip.saldoFimDia)} cx` : '—'}</b>
            </div>
          </div>

          {tooltip.ressupNecessario > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)', color: '#fca5a5' }}>
              ⚠️ Ressup realizado: <b>{tooltip.ressupNecessario} plt</b>
            </div>
          )}

          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)', fontSize: 11, color: '#94a3b8' }}>
            Base do reab: vendas {tooltip.dataRef} = <b style={{ color: '#cbd5e1' }}>{tooltip.vendas !== null ? `${tooltip.vendas} cx` : '—'}</b>
          </div>
        </div>
      )}
    </div>
  );
}

const inpStyle = { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };
const btnSec   = { padding: '7px 12px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const card     = { backgroundColor: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };

const thBase = { padding: '5px 6px', fontWeight: 'bold', textAlign: 'center', position: 'sticky', top: 0, userSelect: 'none', zIndex: 1 };
const thFixo = { backgroundColor: '#E31837', color: '#fff', borderRight: '1px solid #c0102a' };
const thSub  = { backgroundColor: '#e8f0fb', padding: '3px 4px', fontWeight: '600', textAlign: 'center', borderRight: '1px solid #d0daf0', borderBottom: '1px solid #d0daf0', fontSize: 10, userSelect: 'none' };

const tdBase = { padding: '4px 6px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee', textAlign: 'center', fontSize: 11 };
const tdDom  = { ...tdBase, backgroundColor: '#f0f0f0', color: '#bbb', borderRight: '2px solid #ddd' };
const tdFut  = { ...tdBase, backgroundColor: '#fafafa', color: '#ccc' };
