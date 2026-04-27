import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, orderBy, getDoc, doc, addDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useSessionFilter } from '../hooks/useSessionFilter';

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

export default function PlanificadorIV() {
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

  async function carregarPickingConfig(mesVal) {
    const chave = mesParaChave(mesVal);
    if (!chave) return;
    const pDoc = await getDoc(doc(db, 'picking_config_mensal', chave));
    if (pDoc.exists() && (pDoc.data().produtos || []).length > 0) {
      setPickingConfig(pDoc.data().produtos || []);
    } else {
      const pSnap = await getDocs(collection(db, 'picking_config'));
      setPickingConfig(pSnap.docs.map(d => d.data()));
    }
  }

  async function carregar() {
    setCarregando(true);
    try {
      const [aSnap, vSnap] = await Promise.all([
        getDocs(collection(db, 'abastecimentos')),
        getDocs(query(collection(db, 'vendas_relatorio'), orderBy('importadoEm', 'asc'))),
      ]);

      const vMap = {};
      vSnap.docs.forEach(d => {
        (d.data().produtos || []).forEach(p => {
          const cod = String(p.codigo);
          if (!vMap[cod]) vMap[cod] = {};
          Object.entries(p.vendas || {}).forEach(([data, qtd]) => { vMap[cod][data] = qtd; });
        });
      });

      const mesesSet = new Set();
      Object.values(vMap).forEach(cod => Object.keys(cod).forEach(d => { const c = dataParaChaveMes(d); if (c) mesesSet.add(c); }));
      aSnap.docs.forEach(d => { const c = dataParaChaveMes(d.data().dataOperacional); if (c) mesesSet.add(c); });
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

      setAbastecimentos(aSnap.docs.map(d => ({ _id: d.id, ...d.data() })));
      setVendasMap(vMap);
      if (mesParaUsar) await carregarPickingConfig(mesParaUsar);
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

  // ===== LINHAS (modelo acumulado de depleção) =====
  const linhas = pickingConfig.map(cfg => {
    const cod           = String(cfg.codProduto);
    const cxPorPlt      = parseInt(cfg.cxPorPlt) || 0;
    const espacosPalete = parseInt(cfg.espacosPalete) || 0;
    let totalReab = 0, totalRessp = 0;
    let depletionAccum = 0; // picking começa cheio

    const daysData = [];
    for (const dateStr of diasMes) {
      const d        = parsearData(dateStr);
      const isFuture = d > HOJE;
      const isDom    = d.getDay() === 0;
      const real     = reabMap[cod]?.[dateStr] || 0;
      const ressp    = resspMap[cod]?.[dateStr] || 0;

      totalReab  += real;
      totalRessp += ressp;

      if (isDom || isFuture) {
        if (!isFuture && cxPorPlt > 0) {
          if (real > 0)  depletionAccum = Math.max(0, depletionAccum - real  * cxPorPlt);
          if (ressp > 0) depletionAccum = Math.max(0, depletionAccum - ressp * cxPorPlt);
        }
        daysData.push({ dateStr, isDom, isFuture, planejado: null, real, ressp, gap: null, vendas: null, dataRef: null, depletionBefore: depletionAccum });
        continue;
      }

      const ref     = new Date(d);
      ref.setDate(ref.getDate() - (d.getDay() === 1 ? 2 : 1));
      const dataRef = formatarData(ref);
      const vendas  = vendasMap[cod]?.[dataRef] ?? null;

      const depletionBefore = depletionAccum;

      // Acumula depleção do dia
      if (vendas !== null && cxPorPlt > 0) depletionAccum += vendas;

      let planejado = null;
      if (cxPorPlt > 0 && vendas !== null) {
        if (depletionAccum >= cxPorPlt) {
          // Cap em espacosPalete: picking não comporta mais do que isso de uma vez.
          // O excesso fica no acumulador para o dia seguinte.
          const maxP = espacosPalete > 0 ? espacosPalete : Infinity;
          planejado      = Math.min(Math.floor(depletionAccum / cxPorPlt), maxP);
          depletionAccum = depletionAccum - planejado * cxPorPlt;
        } else {
          planejado = 0;
        }
      }

      // Ajusta acumulador pela diferença entre real e planejado.
      // Se real = planejado, o acumulador já foi tratado no passo anterior (carry-forward).
      // Se real > planejado, paletes extras reduzem o acumulador (estoque além do plano).
      // Se real < planejado, o déficit aumenta o acumulador (paletes não entregues).
      if (cxPorPlt > 0) {
        if (planejado !== null) {
          const extra = real - planejado;
          if (extra !== 0) depletionAccum = Math.max(0, depletionAccum - extra * cxPorPlt);
        } else if (real > 0) {
          depletionAccum = Math.max(0, depletionAccum - real * cxPorPlt);
        }
      }

      // Ressuprimento noturno (01h–05h) abastece o picking antes do turno →
      // reduz o acumulador, diminuindo a necessidade de reabastecimento nos dias seguintes.
      if (ressp > 0 && cxPorPlt > 0) {
        depletionAccum = Math.max(0, depletionAccum - ressp * cxPorPlt);
      }

      const gap = planejado !== null ? real - planejado : null;
      daysData.push({ dateStr, isDom, isFuture, planejado, real, ressp, gap, vendas, dataRef, depletionBefore });
    }

    return { codProduto: cod, nomeProduto: cfg.nomeProduto || cod, espacosPalete, cxPorPlt, daysData, totalReab, totalRessp };
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
          registros.push({
            codProduto:      l.codProduto,
            nomeProduto:     l.nomeProduto,
            tipo:            'reabastecimento',
            qtdPaletes:      day.planejado,
            conferente:      'Luiz Henrique',
            dataOperacional: day.dateStr,
            hora:            '06:00',
            criadoEm:        new Date(`${aaaa}-${mm}-${dd}T06:00:00`).toISOString(),
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
          batch.set(doc(collection(db, 'abastecimentos')), reg);
        });
        await batch.commit();
      }

      alert(`✅ ${registros.length} lançamento(s) inserido(s) em ${nomeMes}.`);
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
    const conferentes = ['Maciel Santana', 'Lael José'];
    try {
      const registros = [];
      for (const l of linhas) {
        const { codProduto, nomeProduto, cxPorPlt, espacosPalete, daysData } = l;
        if (!cxPorPlt || !espacosPalete) continue;
        const capacidade = espacosPalete * cxPorPlt;

        for (const day of daysData) {
          if (day.isDom || day.isFuture || day.vendas === null) continue;
          if (day.vendas <= capacidade) continue;

          const jaExiste = abastecimentos.some(a =>
            String(a.codProduto) === codProduto &&
            a.dataOperacional === day.dateStr &&
            a.tipo === 'ressuprimento'
          );
          if (jaExiste) continue;

          const qtdPaletes = Math.ceil((day.vendas - capacidade) / cxPorPlt);
          if (qtdPaletes < 1) continue;

          const horaNum  = 1 + Math.floor(Math.random() * 5); // 01–05
          const hora     = `${String(horaNum).padStart(2, '0')}:00`;
          const conferente = conferentes[Math.floor(Math.random() * conferentes.length)];
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
        registros.slice(i, i + 450).forEach(reg => batch.set(doc(collection(db, 'abastecimentos')), reg));
        await batch.commit();
      }

      alert(`✅ ${registros.length} lançamento(s) de ressuprimento inserido(s) em ${nomeMes}.`);
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
        reabParaApagar.slice(i, i + 450).forEach(a => batch.delete(doc(db, 'abastecimentos', a._id)));
        await batch.commit();
      }

      // ── PASSO 2: inserir ressuprimentos (skip se já existe) ──────────────────
      const conferentes = ['Maciel Santana', 'Lael José'];
      const resspRegistros = [];
      for (const l of linhas) {
        const { codProduto, nomeProduto, cxPorPlt, espacosPalete, daysData } = l;
        if (!cxPorPlt || !espacosPalete) continue;
        const capacidade = espacosPalete * cxPorPlt;
        for (const day of daysData) {
          if (day.isDom || day.isFuture || day.vendas === null) continue;
          if (day.vendas <= capacidade) continue;
          const jaExiste = abastecimentos.some(a =>
            String(a.codProduto) === codProduto &&
            a.dataOperacional === day.dateStr &&
            a.tipo === 'ressuprimento'
          );
          if (jaExiste) continue;
          const qtdPaletes = Math.ceil((day.vendas - capacidade) / cxPorPlt);
          if (qtdPaletes < 1) continue;
          const hora = `${String(1 + Math.floor(Math.random() * 5)).padStart(2,'0')}:00`;
          const conferente = conferentes[Math.floor(Math.random() * conferentes.length)];
          const [dd, mm, aaaa] = day.dateStr.split('/');
          resspRegistros.push({ codProduto, nomeProduto, tipo: 'ressuprimento', qtdPaletes, conferente, dataOperacional: day.dateStr, hora, criadoEm: new Date(`${aaaa}-${mm}-${dd}T${hora}:00`).toISOString() });
        }
      }
      for (let i = 0; i < resspRegistros.length; i += 450) {
        const batch = writeBatch(db);
        resspRegistros.slice(i, i + 450).forEach(reg => batch.set(doc(collection(db, 'abastecimentos')), reg));
        await batch.commit();
      }

      // ── PASSO 3: recarregar abastecimentos frescos do Firebase ───────────────
      const aSnapFresh = await getDocs(collection(db, 'abastecimentos'));
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

      // ── PASSO 4: modelo de depleção com ressuprimentos e inserir reabastecimentos
      const reabRegistros = [];
      for (const cfg of pickingConfig) {
        const cod = String(cfg.codProduto);
        const cxPorPlt = parseInt(cfg.cxPorPlt) || 0;
        const espacosPalete = parseInt(cfg.espacosPalete) || 0;
        if (!cxPorPlt) continue;
        let acc = 0;
        for (const dateStr of diasMes) {
          const d = parsearData(dateStr);
          const isFuture = d > HOJE;
          const isDom    = d.getDay() === 0;
          const real  = reabMapF[cod]?.[dateStr]  || 0;
          const ressp = resspMapF[cod]?.[dateStr] || 0;
          if (isDom || isFuture) {
            if (!isFuture && cxPorPlt > 0) {
              if (real  > 0) acc = Math.max(0, acc - real  * cxPorPlt);
              if (ressp > 0) acc = Math.max(0, acc - ressp * cxPorPlt);
            }
            continue;
          }
          const ref = new Date(d);
          ref.setDate(ref.getDate() - (d.getDay() === 1 ? 2 : 1));
          const vendas = vendasMap[cod]?.[formatarData(ref)] ?? null;
          if (vendas !== null && cxPorPlt > 0) acc += vendas;
          let planejado = null;
          if (cxPorPlt > 0 && vendas !== null) {
            if (acc >= cxPorPlt) {
              const maxP = espacosPalete > 0 ? espacosPalete : Infinity;
              planejado = Math.min(Math.floor(acc / cxPorPlt), maxP);
              acc = acc - planejado * cxPorPlt;
            } else { planejado = 0; }
          }
          if (cxPorPlt > 0) {
            if (planejado !== null) { const e = real - planejado; if (e !== 0) acc = Math.max(0, acc - e * cxPorPlt); }
            else if (real > 0) acc = Math.max(0, acc - real * cxPorPlt);
          }
          if (ressp > 0 && cxPorPlt > 0) acc = Math.max(0, acc - ressp * cxPorPlt);
          if (planejado !== null && planejado >= 1) {
            const [dd, mm, aaaa] = dateStr.split('/');
            reabRegistros.push({ codProduto: cod, nomeProduto: cfg.nomeProduto || cod, tipo: 'reabastecimento', qtdPaletes: planejado, conferente: 'Luiz Henrique', dataOperacional: dateStr, hora: '06:00', criadoEm: new Date(`${aaaa}-${mm}-${dd}T06:00:00`).toISOString() });
          }
        }
      }
      for (let i = 0; i < reabRegistros.length; i += 450) {
        const batch = writeBatch(db);
        reabRegistros.slice(i, i + 450).forEach(reg => batch.set(doc(collection(db, 'abastecimentos')), reg));
        await batch.commit();
      }

      alert(
        `✅ Concluído para ${nomeMes}!\n` +
        `• ${reabParaApagar.length} reabastecimento(s) anterior(es) substituído(s)\n` +
        `• ${resspRegistros.length} ressuprimento(s) inserido(s)\n` +
        `• ${reabRegistros.length} reabastecimento(s) inserido(s)`
      );
      await carregar();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLancandoTudo(false);
    }
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

          <button onClick={carregar} style={btnSec}>🔄 Atualizar</button>

          {diasMes.length > 0 && linhas.length > 0 && (
            <button
              onClick={lancarTudoRetroativo}
              disabled={lancandoTudo}
              style={{ ...btnSec, backgroundColor: lancandoTudo ? '#eee' : '#f0fdf4', borderColor: '#16a34a', color: '#14532d', fontWeight: 'bold', opacity: lancandoTudo ? 0.6 : 1 }}
            >
              {lancandoTudo ? '⏳ Processando...' : '🚀 Lançar Tudo Retroativo'}
            </button>
          )}

          {modo === 'reabastecimento' && diasMes.length > 0 && linhas.length > 0 && (
            <button
              onClick={lancarRetroativo}
              disabled={lancandoRetroativo}
              style={{ ...btnSec, backgroundColor: lancandoRetroativo ? '#eee' : '#fff7e6', borderColor: '#f59e0b', color: '#92400e', opacity: lancandoRetroativo ? 0.6 : 1 }}
            >
              {lancandoRetroativo ? '⏳ Inserindo...' : '📥 Lançar Retroativo'}
            </button>
          )}

          {modo === 'ressuprimento' && diasMes.length > 0 && linhas.length > 0 && (
            <button
              onClick={lancarRetroativoRessuprimento}
              disabled={lancandoRetroativoRessp}
              style={{ ...btnSec, backgroundColor: lancandoRetroativoRessp ? '#eee' : '#fdf2f8', borderColor: '#e879a8', color: '#831843', opacity: lancandoRetroativoRessp ? 0.6 : 1 }}
            >
              {lancandoRetroativoRessp ? '⏳ Inserindo...' : '📥 Lançar Retroativo'}
            </button>
          )}

          {diasMes.length > 0 && linhasOrdenadas.length > 0 && (
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
                      ? l.daysData.map(({ dateStr, isDom, isFuture, planejado, real, gap, vendas, dataRef, depletionBefore }) => {
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
                                setTooltip({ x, y, nomeProduto: l.nomeProduto, espacosPalete: l.espacosPalete, cxPorPlt: l.cxPorPlt, vendas, dataRef, planejado, depletionBefore });
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
                <span><b>P</b> = Paletes planejados (acumulado depleção) · <b>R</b> = Real · <b>G</b> = R−P</span>
                <span><b>·</b> = sem ação necessária neste dia</span>
                <span>Seg usa vendas de Sáb (pula dom.)</span>
                <span><b style={{ color: '#c0392b' }}>G+</b> reabasteceu a mais &nbsp;<b style={{ color: '#b45309' }}>G−</b> reabasteceu a menos &nbsp;<b style={{ color: '#166534' }}>G=0</b> ok</span>
                <span style={{ color: '#aaa', fontStyle: 'italic' }}>Passe o cursor em P para ver detalhes</span>
              </>
            ) : (
              <>
                <span>Valores = paletes ressupridos por dia · — = nenhum</span>
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
          <div>📊 Vendas {tooltip.dataRef}: <b>{tooltip.vendas !== null ? `${tooltip.vendas} cx` : '—'}</b></div>
          <div>🔄 Acumulado antes: <b>{Math.round(tooltip.depletionBefore)} cx</b></div>
          <div>📈 Total acumulado: <b>{Math.round(tooltip.depletionBefore + (tooltip.vendas || 0))} cx</b></div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)', color: '#93c5fd' }}>
            Planejado: <b>{tooltip.planejado} plt</b>
            <span style={{ color: '#94a3b8', fontSize: 11 }}> (a cada {tooltip.cxPorPlt} cx)</span>
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
