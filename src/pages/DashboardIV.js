import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useSessionFilter } from '../hooks/useSessionFilter';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function dataParaChaveMes(str) {
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}`;
}

function parsearData(str) {
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
}

function diasDoMes(chave) {
  if (!chave) return [];
  const [aaaa, mm] = chave.split('-');
  const ano = parseInt(aaaa), mes = parseInt(mm) - 1;
  const dias = [];
  const d = new Date(ano, mes, 1);
  while (d.getMonth() === mes) {
    dias.push(`${String(d.getDate()).padStart(2,'0')}/${mm}/${aaaa}`);
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

function cellColor(reab, ressp) {
  if (reab === 0 && ressp === 0) return '#f1f5f9';
  if (reab > 0 && ressp > 0)   return '#f97316';
  if (ressp > 0) return ressp >= 3 ? '#dc2626' : '#fca5a5';
  if (reab >= 6) return '#1e3a8a';
  if (reab >= 4) return '#1d4ed8';
  if (reab >= 2) return '#3b82f6';
  return '#93c5fd';
}

function cellText(reab, ressp) {
  if (reab === 0 && ressp === 0) return '';
  if (reab > 0 && ressp > 0) return `${reab}↑${ressp}↓`;
  if (ressp > 0) return ressp;
  return reab;
}

function extrairTipoEmbalagem(nome, cxPorPlt) {
  const upper = nome.toUpperCase();
  const m = upper.match(/\b(\d+[,.]?\d*\s*ML|\d+[,.]?\d*\s*L)\b/);
  if (m) return m[1].replace(/\s+/g, '').replace(',', '.');
  return `${cxPorPlt} CX/PLT`;
}

export default function DashboardIV() {
  const usuario = JSON.parse(localStorage.getItem('nri-usuario') || '{}');
  const isSupervisor = usuario?.nivel === 'supervisor';

  const [anoSelecionado, setAnoSelecionado]       = useSessionFilter('div:ano', '');
  const [mesNumSelecionado, setMesNumSelecionado] = useSessionFilter('div:mes', '');
  const [mesesDisponiveis, setMesesDisponiveis]   = useState([]);
  const [abastecimentos, setAbastecimentos]       = useState([]);
  const [pickingConfig, setPickingConfig]         = useState([]);
  const [vendasMap, setVendasMap]                 = useState({});
  const [carregando, setCarregando]               = useState(true);
  const [ordRanking, setOrdRanking]               = useSessionFilter('div:ord', { col: 'totalMovimentos', dir: 'desc' });
  const [tooltip, setTooltip]                     = useState(null);
  const [previewConfig, setPreviewConfig]         = useState(null);
  const [salvandoConfig, setSalvandoConfig]       = useState(false);

  const mesSel = anoSelecionado && mesNumSelecionado ? `${anoSelecionado}-${mesNumSelecionado}` : '';
  const anos      = [...new Set(mesesDisponiveis.map(m => m.split('-')[0]))].sort();
  const mesesDoAno = mesesDisponiveis.filter(m => m.startsWith(anoSelecionado)).map(m => m.split('-')[1]).sort();

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!anoSelecionado || !mesNumSelecionado) return;
    const chave = `${anoSelecionado}-${mesNumSelecionado}`;
    (async () => {
      try {
        const pDoc = await getDoc(doc(db, 'picking_config_mensal', chave));
        if (pDoc.exists() && (pDoc.data().produtos || []).length > 0) {
          setPickingConfig(pDoc.data().produtos || []);
        } else {
          const pSnap = await getDocs(collection(db, 'picking_config'));
          setPickingConfig(pSnap.docs.map(d => d.data()));
        }
      } catch {}
    })();
  }, [anoSelecionado, mesNumSelecionado]);

  async function carregar() {
    setCarregando(true);
    try {
      const [aSnap, vSnap] = await Promise.all([
        getDocs(collection(db, 'abastecimentos')),
        getDocs(query(collection(db, 'vendas_relatorio'), orderBy('importadoEm', 'asc'))),
      ]);

      const abasts = aSnap.docs.map(d => d.data());
      setAbastecimentos(abasts);

      const vMap = {};
      vSnap.docs.forEach(d => {
        (d.data().produtos || []).forEach(p => {
          const cod = String(p.codigo);
          if (!vMap[cod]) vMap[cod] = {};
          Object.entries(p.vendas || {}).forEach(([data, qty]) => { vMap[cod][data] = qty; });
        });
      });
      setVendasMap(vMap);

      const mesesSet = new Set();
      abasts.forEach(a => { const c = dataParaChaveMes(a.dataOperacional); if (c) mesesSet.add(c); });
      const meses = [...mesesSet].sort().reverse();
      setMesesDisponiveis(meses);

      if (meses.length > 0 && !anoSelecionado) {
        const [ano, mes] = meses[0].split('-');
        setAnoSelecionado(ano);
        setMesNumSelecionado(mes);
      }
    } catch (err) { console.error(err); }
    finally { setCarregando(false); }
  }

  // ── DADOS DO MÊS ──────────────────────────────────────────────────────────────
  const dias = diasDoMes(mesSel);
  const abastsFiltrados = abastecimentos.filter(a => dias.includes(a.dataOperacional));

  // Mapa de movimentos por produto × dia
  const movMap = {};
  abastsFiltrados.forEach(a => {
    const cod = String(a.codProduto);
    if (!movMap[cod]) movMap[cod] = {};
    if (!movMap[cod][a.dataOperacional]) movMap[cod][a.dataOperacional] = { reab: 0, ressp: 0 };
    const qtd = a.qtdPaletes || 1;
    if (a.tipo === 'reabastecimento') movMap[cod][a.dataOperacional].reab += qtd;
    else                              movMap[cod][a.dataOperacional].ressp += qtd;
  });

  // Métricas por produto
  const produtos = pickingConfig.map(cfg => {
    const cod          = String(cfg.codProduto);
    const cxPorPlt     = parseInt(cfg.cxPorPlt)     || 0;
    const espacos      = parseInt(cfg.espacosPalete) || 0;
    const capacidade   = espacos * cxPorPlt;

    let totalReab = 0, totalRessp = 0, reabDias = 0, resspDias = 0;
    dias.forEach(d => {
      const mov = movMap[cod]?.[d];
      if (mov?.reab  > 0) { totalReab  += mov.reab;  reabDias++;  }
      if (mov?.ressp > 0) { totalRessp += mov.ressp; resspDias++; }
    });

    const vendasDoDia = dias
      .filter(d => parsearData(d)?.getDay() !== 0)
      .map(d => vendasMap[cod]?.[d] ?? null)
      .filter(v => v !== null);
    const maxVendas   = vendasDoDia.length > 0 ? Math.max(...vendasDoDia) : null;
    const mediaVendas = vendasDoDia.length > 0 ? vendasDoDia.reduce((s,v) => s+v, 0) / vendasDoDia.length : null;
    const espacosIdeal = maxVendas !== null && cxPorPlt > 0 ? Math.ceil(maxVendas / cxPorPlt) : null;

    return {
      codProduto: cod, nomeProduto: cfg.nomeProduto || cod,
      cxPorPlt, espacos, capacidade,
      totalReab, totalRessp, reabDias, resspDias,
      maxVendas, mediaVendas, espacosIdeal,
      totalMovimentos: totalReab + totalRessp,
    };
  });

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const kpiReab        = abastsFiltrados.filter(a => a.tipo === 'reabastecimento').reduce((s,a) => s+(a.qtdPaletes||1), 0);
  const kpiRessp       = abastsFiltrados.filter(a => a.tipo === 'ressuprimento').reduce((s,a)  => s+(a.qtdPaletes||1), 0);
  const kpiProdRessp   = produtos.filter(p => p.resspDias > 0).length;

  // Evolução mês a mês (todos os registros, não só o mês selecionado)
  const dadosEvolucao = (() => {
    const porMes = {};
    abastecimentos.forEach(a => {
      const chave = dataParaChaveMes(a.dataOperacional);
      if (!chave) return;
      if (!porMes[chave]) porMes[chave] = { reab: 0, ressp: 0 };
      const qtd = a.qtdPaletes || 1;
      if (a.tipo === 'reabastecimento') porMes[chave].reab += qtd;
      else porMes[chave].ressp += qtd;
    });
    return Object.entries(porMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, v]) => {
        const [aaaa, mm] = chave.split('-');
        return { label: `${MESES_NOME[parseInt(mm)-1].slice(0,3)}/${aaaa.slice(2)}`, reab: v.reab, ressp: v.ressp, chave };
      });
  })();
  const kpiSubdim      = produtos.filter(p => p.espacosIdeal !== null && p.espacosIdeal > p.espacos).length;

  // ── DISTRIBUIÇÃO HORÁRIA ───────────────────────────────────────────────────────
  const porHora = {};
  abastsFiltrados.forEach(a => {
    const h = parseInt((a.hora || '00').split(':')[0]);
    if (isNaN(h)) return;
    if (!porHora[h]) porHora[h] = { hora: `${String(h).padStart(2,'0')}h`, reab: 0, ressp: 0 };
    const qtd = a.qtdPaletes || 1;
    if (a.tipo === 'reabastecimento') porHora[h].reab  += qtd;
    else                              porHora[h].ressp += qtd;
  });
  const dadosHora = Array.from({length: 24}, (_, h) => porHora[h] || { hora: `${String(h).padStart(2,'0')}h`, reab: 0, ressp: 0 })
    .filter(v => v.reab > 0 || v.ressp > 0);

  // ── RANKING ────────────────────────────────────────────────────────────────────
  function alternarOrd(col) {
    setOrdRanking(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  }
  function seta(col) {
    if (ordRanking.col !== col) return <span style={{ color:'#ccc', marginLeft:4 }}>↕</span>;
    return <span style={{ marginLeft:4 }}>{ordRanking.dir === 'asc' ? '↑' : '↓'}</span>;
  }
  const rankingOrdenado = [...produtos]
    .filter(p => p.totalMovimentos > 0 || (p.espacosIdeal !== null && p.espacosIdeal > p.espacos))
    .sort((a,b) => {
      const vA = a[ordRanking.col] ?? -Infinity;
      const vB = b[ordRanking.col] ?? -Infinity;
      return ordRanking.dir === 'asc' ? vA - vB : vB - vA;
    });

  // ── REBALANCEAMENTO ───────────────────────────────────────────────────────────
  const subdimensionados = [...produtos]
    .filter(p => p.espacosIdeal !== null && p.espacosIdeal > p.espacos)
    .sort((a,b) => (b.espacosIdeal - b.espacos) - (a.espacosIdeal - a.espacos));

  const superdimensionados = [...produtos]
    .filter(p => p.espacosIdeal !== null && p.espacosIdeal < p.espacos)
    .sort((a,b) => (b.espacos - b.espacosIdeal) - (a.espacos - a.espacosIdeal));

  const totalEspacos = produtos.reduce((s, p) => s + p.espacos, 0);
  const totalDeficit = subdimensionados.reduce((s, p) => s + (p.espacosIdeal - p.espacos), 0);
  const totalSurplus = superdimensionados.reduce((s, p) => s + (p.espacos - p.espacosIdeal), 0);
  const saldo        = totalSurplus - totalDeficit;

  // ── PALETES MISTOS ─────────────────────────────────────────────────────────────
  const candidatosMisto = produtos.filter(p => {
    if (!p.mediaVendas || p.cxPorPlt === 0) return false;
    return (p.mediaVendas / p.cxPorPlt) < 0.20;
  });

  const _gruposMap = {};
  candidatosMisto.forEach(p => {
    const tipo = extrairTipoEmbalagem(p.nomeProduto, p.cxPorPlt);
    if (!_gruposMap[tipo]) _gruposMap[tipo] = [];
    _gruposMap[tipo].push(p);
  });

  // Singletons = produtos sem par na mesma embalagem ou sobras de chunks maiores
  const _singletons = [];

  // Paletes com sinergia (mesma embalagem, máx. 4 produtos, teto 60% do palete)
  const gruposSinergia = Object.entries(_gruposMap)
    .flatMap(([tipo, prods]) => {
      const cxPlt    = prods[0].cxPorPlt;
      const teto     = Math.floor(cxPlt * 0.60);
      const diasAlvo = 5;
      const chunks   = [];
      for (let i = 0; i < prods.length; i += 4) {
        const chunk = prods.slice(i, i + 4);
        if (chunk.length >= 2) chunks.push(chunk);
        else _singletons.push(...chunk);
      }
      const multi = chunks.length > 1;
      return chunks.map((chunk, idx) => {
        const label = multi ? `${tipo} (${idx+1}/${chunks.length})` : tipo;
        let composicao = chunk.map(p => ({
          ...p,
          qtdCaixas: Math.max(1, Math.ceil((p.mediaVendas || 0) * diasAlvo)),
        }));
        const soma = composicao.reduce((s, p) => s + p.qtdCaixas, 0);
        if (soma > teto && soma > 0) {
          const fator = teto / soma;
          composicao = composicao.map(p => ({ ...p, qtdCaixas: Math.max(1, Math.floor(p.qtdCaixas * fator)) }));
        }
        const totalFinal       = composicao.reduce((s, p) => s + p.qtdCaixas, 0);
        const espacosLiberados = chunk.reduce((s, p) => s + p.espacos, 0) - 1;
        return { tipo: label, composicao, totalFinal, cxPlt, teto, espacosLiberados, sinergia: true };
      });
    })
    .filter(g => g.espacosLiberados > 0)
    .sort((a, b) => b.espacosLiberados - a.espacosLiberados);

  // Paletes diversos (sobras sem sinergia, agrupadas por maior liberação, 10% de cada palete)
  const _sortedSingletons = [..._singletons].sort((a, b) => b.espacos - a.espacos);
  const _gruposDiverso = [];
  for (let i = 0; i < _sortedSingletons.length; i += 4) {
    const chunk = _sortedSingletons.slice(i, i + 4);
    if (chunk.length < 2) continue;
    const composicao       = chunk.map(p => {
      const base     = Math.max(1, Math.floor(p.cxPorPlt * 0.10));
      const minUmDia = p.mediaVendas > 0 ? Math.ceil(p.mediaVendas) : 1;
      return { ...p, qtdCaixas: Math.max(base, minUmDia) };
    });
    const espacosLiberados = chunk.reduce((s, p) => s + p.espacos, 0) - 1;
    _gruposDiverso.push({ composicao, espacosLiberados, sinergia: false });
  }
  _gruposDiverso.sort((a, b) => b.espacosLiberados - a.espacosLiberados);
  _gruposDiverso.forEach((g, i) => Object.assign(g, { tipo: `Diverso ${i + 1}`, totalFinal: null, cxPlt: null, teto: null }));

  const gruposMisto        = [...gruposSinergia, ..._gruposDiverso];
  const totalEspacosMisto  = gruposMisto.reduce((s, g) => s + g.espacosLiberados, 0);
  const produtosMistoSet   = new Set(gruposMisto.flatMap(g => g.composicao.map(p => p.codProduto)));

  // Cedentes = superdimensionados + candidatos a misto ainda não listados
  const cedentesRebalanceamento = [
    ...superdimensionados,
    ...gruposMisto
      .flatMap(g => g.composicao)
      .filter((p, i, arr) => arr.findIndex(x => x.codProduto === p.codProduto) === i)
      .filter(p => !superdimensionados.some(s => s.codProduto === p.codProduto))
      .map(p => ({ ...p, _soMisto: true })),
  ].sort((a, b) => {
    const cedeA = a._soMisto ? a.espacos : a.espacos - (a.espacosIdeal || 0);
    const cedeB = b._soMisto ? b.espacos : b.espacos - (b.espacosIdeal || 0);
    return cedeB - cedeA;
  });

  // ── HEATMAP PRODUTOS ATIVOS ────────────────────────────────────────────────────
  const produtosHeatmap = produtos.filter(p => p.totalMovimentos > 0 || p.maxVendas !== null);

  // ── GERADOR DE PICKING PARA PRÓXIMO MÊS ───────────────────────────────────────
  function proximoMes() {
    if (!anoSelecionado || !mesNumSelecionado) return null;
    const m = parseInt(mesNumSelecionado), a = parseInt(anoSelecionado);
    return m === 12
      ? { ano: String(a + 1), mes: '01' }
      : { ano: String(a),     mes: String(m + 1).padStart(2, '0') };
  }

  function gerarConfigProximoMes() {
    const prox = proximoMes();
    if (!prox) return;

    // Fase 1 — misto: reduz para 1 espaço e acumula pool
    const novoEsp = {};
    let pool = 0;
    produtos.forEach(p => {
      if (produtosMistoSet.has(p.codProduto)) {
        novoEsp[p.codProduto] = 1;
        pool += p.espacos - 1;
      } else {
        novoEsp[p.codProduto] = p.espacos;
      }
    });

    // Fase 2 — subdimensionados por maior déficit
    const subdim = produtos
      .filter(p => p.espacosIdeal !== null && p.espacosIdeal > novoEsp[p.codProduto])
      .sort((a, b) => (b.espacosIdeal - novoEsp[b.codProduto]) - (a.espacosIdeal - novoEsp[a.codProduto]));

    for (const p of subdim) {
      if (pool <= 0) break;
      const ganho = Math.min(pool, p.espacosIdeal - novoEsp[p.codProduto]);
      novoEsp[p.codProduto] += ganho;
      pool -= ganho;
    }

    // Fase 3 — excedentes distribuídos por maior maxVendas (round-robin)
    if (pool > 0) {
      const ordenados = [...produtos]
        .filter(p => p.maxVendas !== null)
        .sort((a, b) => b.maxVendas - a.maxVendas);
      let i = 0;
      while (pool > 0 && ordenados.length > 0) {
        novoEsp[ordenados[i % ordenados.length].codProduto]++;
        pool--;
        i++;
      }
    }

    // Monta preview com motivo
    const linhas = produtos.map(p => {
      const novo = novoEsp[p.codProduto] ?? p.espacos;
      const diff = novo - p.espacos;
      let motivo = '➡️ Sem alteração';
      if (produtosMistoSet.has(p.codProduto))    motivo = '🔀 Palete misto';
      else if (diff > 0 && p.espacosIdeal !== null && novo <= p.espacosIdeal) motivo = '⬆️ Ganhou espaço';
      else if (diff > 0)                          motivo = '➕ Folga extra';
      return { codProduto: p.codProduto, nomeProduto: p.nomeProduto, cxPorPlt: p.cxPorPlt, espacosAtual: p.espacos, espacosNovo: novo, diff, motivo };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    setPreviewConfig({ linhas, prox });
  }

  async function salvarConfigProximoMes() {
    if (!previewConfig) return;
    setSalvandoConfig(true);
    try {
      const { linhas, prox } = previewConfig;
      const chave = `${prox.ano}-${prox.mes}`;
      const produtosParaSalvar = linhas.map(l => ({
        codProduto:    l.codProduto,
        nomeProduto:   l.nomeProduto,
        cxPorPlt:      l.cxPorPlt,
        espacosPalete: l.espacosNovo,
      }));
      await setDoc(doc(db, 'picking_config_mensal', chave), {
        produtos: produtosParaSalvar,
        geradoEm: new Date().toISOString(),
        geradoPor: usuario.nome || 'supervisor',
        baseadoEm: `${anoSelecionado}-${mesNumSelecionado}`,
      });
      alert(`Configuração de picking para ${MESES_NOME[parseInt(prox.mes)-1]}/${prox.ano} salva com sucesso!`);
      setPreviewConfig(null);
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    }
    setSalvandoConfig(false);
  }

  if (carregando) return <div style={{ textAlign:'center', padding:40, color:'#666' }}>⏳ Carregando...</div>;

  const nomeMes = anoSelecionado && mesNumSelecionado
    ? `${MESES_NOME[parseInt(mesNumSelecionado)-1]}/${anoSelecionado}`
    : '—';

  return (
    <div style={{ fontFamily:'Arial,sans-serif' }}>

      {/* Cabeçalho */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ color:'#333', margin:0 }}>Dashboard IV — Produtividade do Empilhador</h2>
          <p style={{ color:'#888', fontSize:13, margin:'4px 0 0' }}>Análise de reabastecimento e ressuprimento · {nomeMes}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <label style={{ fontSize:13, fontWeight:'bold', color:'#333' }}>Ano:</label>
          <select value={anoSelecionado} onChange={e => {
            const a = e.target.value;
            const ms = mesesDisponiveis.filter(m => m.startsWith(a)).map(m => m.split('-')[1]).sort();
            setAnoSelecionado(a);
            setMesNumSelecionado(ms[ms.length-1] || '');
          }} style={sel}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label style={{ fontSize:13, fontWeight:'bold', color:'#333' }}>Mês:</label>
          <select value={mesNumSelecionado} onChange={e => setMesNumSelecionado(e.target.value)} style={sel}>
            {mesesDoAno.map(m => <option key={m} value={m}>{MESES_NOME[parseInt(m)-1]}</option>)}
          </select>
          <button onClick={carregar} style={btn}>🔄 Atualizar</button>
          {isSupervisor && mesSel && produtos.length > 0 && (() => {
            const prox = proximoMes();
            if (!prox) return null;
            const nomeMesProx = `${MESES_NOME[parseInt(prox.mes)-1]}/${prox.ano}`;
            return (
              <button onClick={gerarConfigProximoMes} style={{ ...btn, backgroundColor:'#eff6ff', borderColor:'#bfdbfe', color:'#1D5A9E', fontWeight:'bold' }}>
                📋 Sugerir Picking para {nomeMesProx}
              </button>
            );
          })()}
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:16, marginBottom:24 }}>
        {[
          { label:'Paletes Reabastecidos', valor:kpiReab,      cor:'#1D5A9E', sub:'🌅 movidos durante o dia'     },
          { label:'Paletes Ressupridos',    valor:kpiRessp,     cor:'#E31837', sub:'🌙 movidos durante a noite'   },
          { label:'Produtos c/ Ressupr.',   valor:kpiProdRessp, cor:'#dc2626', sub:'🚨 picking subdimensionado'   },
        ].map(({ label, valor, cor, sub }) => (
          <div key={label} style={{ backgroundColor:'#fff', borderRadius:12, padding:'18px 20px', boxShadow:'0 2px 8px rgba(0,0,0,.08)', borderLeft:`4px solid ${cor}` }}>
            <div style={{ fontSize:34, fontWeight:'bold', color:cor, lineHeight:1 }}>{valor}</div>
            <div style={{ fontSize:13, fontWeight:'600', color:'#333', marginTop:6 }}>{label}</div>
            <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── EVOLUÇÃO MENSAL ── */}
      {dadosEvolucao.length > 1 && (
        <div style={{ ...secao, marginBottom:24 }}>
          <h3 style={titulo}>📈 Evolução Mensal — Reabastecimento × Ressuprimento</h3>
          <p style={{ fontSize:12, color:'#888', marginTop:-10, marginBottom:16 }}>
            Total de paletes movidos por mês em todo o histórico de registros.
          </p>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={dadosEvolucao} margin={{ top:4, right:16, left:0, bottom:4 }} barCategoryGap="30%">
              <XAxis dataKey="label" tick={{ fontSize:11, fill:'#666' }} />
              <YAxis tick={{ fontSize:11, fill:'#666' }} width={45} />
              <Tooltip
                contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid #e2e8f0' }}
                formatter={(value, name) => [value, name === 'reab' ? 'Reabastecimento' : 'Ressuprimento']}
              />
              <Legend
                formatter={v => v === 'reab' ? 'Reabastecimento' : 'Ressuprimento'}
                wrapperStyle={{ fontSize:12, paddingTop:8 }}
              />
              <Bar dataKey="reab"  name="reab"  fill="#1D5A9E" radius={[4,4,0,0]}>
                <LabelList dataKey="reab"  position="top" style={{ fontSize:10, fill:'#1D5A9E', fontWeight:'bold' }} />
              </Bar>
              <Bar dataKey="ressp" name="ressp" fill="#E31837" radius={[4,4,0,0]}>
                <LabelList dataKey="ressp" position="top" style={{ fontSize:10, fill:'#E31837', fontWeight:'bold' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── MAPA DE CALOR ── */}
      {produtosHeatmap.length > 0 && dias.length > 0 && (
        <div style={secao}>
          <h3 style={titulo}>🗓 Mapa de Calor — Movimentos por Produto × Dia</h3>
          <div style={{ display:'flex', gap:16, fontSize:11, color:'#666', marginBottom:10, flexWrap:'wrap' }}>
            {[['#93c5fd','Reab 1–1'],['#3b82f6','Reab 2–3'],['#1d4ed8','Reab 4–5'],['#1e3a8a','Reab 6+'],
              ['#fca5a5','Ressp 1–2'],['#dc2626','Ressp 3+'],['#f97316','Reab + Ressp']].map(([cor,label]) => (
              <span key={label} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:14, height:14, borderRadius:3, backgroundColor:cor, display:'inline-block' }}/>
                {label}
              </span>
            ))}
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr>
                  <th style={{ ...thHeat, minWidth:150, textAlign:'left', position:'sticky', left:0, backgroundColor:'#fff', zIndex:2 }}>Produto</th>
                  {dias.map(d => {
                    const isDom = parsearData(d)?.getDay() === 0;
                    return (
                      <th key={d} style={{ ...thHeat, minWidth:28, color: isDom ? '#bbb' : '#555', backgroundColor: isDom ? '#f8f8f8' : '#fff' }}>
                        {d.slice(0,2)}
                      </th>
                    );
                  })}
                  <th style={{ ...thHeat, minWidth:50 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {produtosHeatmap.map((p, i) => (
                  <tr key={p.codProduto} style={{ backgroundColor: i%2===0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...tdHeat, fontWeight:'600', fontSize:11, position:'sticky', left:0, backgroundColor: i%2===0 ? '#fff' : '#fafafa', zIndex:1, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                        title={p.nomeProduto}>
                      {p.nomeProduto.length > 22 ? p.nomeProduto.slice(0,22)+'…' : p.nomeProduto}
                    </td>
                    {dias.map(d => {
                      const mov = movMap[p.codProduto]?.[d];
                      const reab  = mov?.reab  || 0;
                      const ressp = mov?.ressp || 0;
                      const bg    = cellColor(reab, ressp);
                      const txt   = cellText(reab, ressp);
                      const isDom = parsearData(d)?.getDay() === 0;
                      return (
                        <td key={d}
                          style={{ ...tdHeat, backgroundColor: isDom ? '#f0f0f0' : bg, color: (reab>0||ressp>0) ? (bg==='#93c5fd'||bg==='#fca5a5'?'#333':'#fff') : '#ccc', textAlign:'center', cursor: txt ? 'help' : 'default', fontWeight:'bold' }}
                          onMouseEnter={txt ? e => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setTooltip({ x: r.left, y: r.bottom+4, reab, ressp, dia: d, nome: p.nomeProduto });
                          } : undefined}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {txt}
                        </td>
                      );
                    })}
                    <td style={{ ...tdHeat, textAlign:'center', fontWeight:'bold', color: p.resspDias > 0 ? '#E31837' : '#1D5A9E' }}>
                      {p.totalMovimentos}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Tooltip do mapa */}
          {tooltip && (
            <div style={{ position:'fixed', left:tooltip.x, top:tooltip.y, backgroundColor:'#1a1a1a', color:'#fff', borderRadius:8, padding:'8px 12px', fontSize:12, zIndex:9999, pointerEvents:'none', maxWidth:220, boxShadow:'0 4px 12px rgba(0,0,0,.3)' }}>
              <div style={{ fontWeight:'bold', marginBottom:4 }}>{tooltip.nome}</div>
              <div>📅 {tooltip.dia}</div>
              {tooltip.reab  > 0 && <div style={{ color:'#93c5fd' }}>🔵 Reabastecimento: {tooltip.reab} plt</div>}
              {tooltip.ressp > 0 && <div style={{ color:'#fca5a5' }}>🔴 Ressuprimento: {tooltip.ressp} plt</div>}
            </div>
          )}
        </div>
      )}

      {/* ── RANKING + HORÁRIO ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20, marginTop:20, alignItems:'start' }}>

        {/* Ranking de esforço */}
        <div style={secao}>
          <h3 style={titulo}>🏋️ Ranking de Esforço por Produto</h3>
          {rankingOrdenado.length === 0
            ? <p style={{ color:'#999', textAlign:'center', padding:20 }}>Sem movimentos no mês selecionado.</p>
            : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ backgroundColor:'#f8fafc' }}>
                    {[
                      { l:'Produto',       c:null             },
                      { l:'Reab (plt)',     c:'totalReab'     },
                      { l:'Reab (dias)',    c:'reabDias'      },
                      { l:'Ressp (plt)',    c:'totalRessp'    },
                      { l:'Ressp (dias)',   c:'resspDias'     },
                      { l:'Total mov.',     c:'totalMovimentos'},
                      { l:'Espaços',       c:'espacos'       },
                    ].map(({ l, c }) => (
                      <th key={l} onClick={() => c && alternarOrd(c)}
                        style={{ padding:'9px 10px', textAlign: l==='Produto' ? 'left' : 'center', borderBottom:'2px solid #e2e8f0', color:'#555', fontWeight:'600', whiteSpace:'nowrap', cursor: c ? 'pointer' : 'default', userSelect:'none' }}>
                        {l}{c && seta(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankingOrdenado.map((p, i) => {
                    const alertaRessp = p.resspDias > 0;
                    const alertaDim   = p.espacosIdeal !== null && p.espacosIdeal > p.espacos;
                    const isMisto     = produtosMistoSet.has(p.codProduto);
                    return (
                      <tr key={p.codProduto} style={{ borderBottom:'1px solid #f1f5f9', backgroundColor: alertaRessp ? '#fff8f8' : i%2===0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding:'8px 10px' }}>
                          <div style={{ fontWeight:'600', color:'#333' }}>
                            {alertaDim  && <span title="Picking subdimensionado" style={{ marginRight:4 }}>📐</span>}
                            {alertaRessp && <span title="Teve ressuprimento" style={{ marginRight:4 }}>🚨</span>}
                            {p.nomeProduto}
                          </div>
                          <div style={{ fontSize:10, color:'#aaa' }}>Cód: {p.codProduto}</div>
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:'bold', color:'#1D5A9E' }}>{p.totalReab || '—'}</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', color:'#64748b' }}>{p.reabDias || '—'}</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:'bold', color: p.totalRessp > 0 ? '#E31837' : '#ccc' }}>{p.totalRessp || '—'}</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', color: p.resspDias > 0 ? '#E31837' : '#ccc' }}>{p.resspDias || '—'}</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:'bold', color:'#333' }}>{p.totalMovimentos}</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', color: alertaDim ? '#d97706' : '#555' }}>
                          {p.espacos}{alertaDim && <span style={{ fontSize:10, color:'#d97706' }}> →{p.espacosIdeal}</span>}
                          {isMisto && <span title="Sugerido para palete misto" style={{ marginLeft:5, backgroundColor:'#e0e7ff', color:'#4338ca', borderRadius:4, padding:'1px 5px', fontSize:10, fontWeight:'bold' }}>🔀</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Distribuição horária */}
        <div style={secao}>
          <h3 style={titulo}>🕐 Distribuição por Hora</h3>
          <p style={{ fontSize:12, color:'#888', marginTop:-10, marginBottom:12 }}>Paletes movidos por hora do dia</p>
          {dadosHora.length === 0
            ? <p style={{ color:'#999', textAlign:'center', padding:20 }}>Sem dados de horário.</p>
            : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dadosHora} margin={{ top:0, right:10, left:-10, bottom:10 }}>
                <XAxis dataKey="hora" tick={{ fontSize:10 }} />
                <YAxis tick={{ fontSize:10 }} />
                <Tooltip
                  formatter={(v, name) => [`${v} plt`, name === 'reab' ? 'Reabastecimento' : 'Ressuprimento']}
                  labelFormatter={l => `Hora: ${l}`}
                />
                <Legend formatter={v => v === 'reab' ? 'Reabastecimento' : 'Ressuprimento'} wrapperStyle={{ fontSize:11 }} />
                <Bar dataKey="reab"  name="reab"  fill="#1D5A9E" radius={[4,4,0,0]} stackId="a" />
                <Bar dataKey="ressp" name="ressp" fill="#E31837" radius={[4,4,0,0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
          {dadosHora.length > 0 && (() => {
            const picoH = dadosHora.reduce((m, h) => (h.reab+h.ressp > m.reab+m.ressp ? h : m), dadosHora[0]);
            const totalNight = dadosHora.filter(h => { const n = parseInt(h.hora); return n >= 1 && n <= 5; }).reduce((s,h) => s+h.ressp, 0);
            const totalDay   = dadosHora.filter(h => { const n = parseInt(h.hora); return n >= 6 && n <= 18; }).reduce((s,h) => s+h.reab, 0);
            return (
              <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:6 }}>
                <div style={insight('#1D5A9E','#eff6ff')}>⏰ Pico: {picoH.hora} — {picoH.reab+picoH.ressp} paletes</div>
                <div style={insight('#7c3aed','#f5f3ff')}>🌙 Ressuprimentos noturnos: {totalNight} plt</div>
                <div style={insight('#059669','#ecfdf5')}>☀️ Reabastecimentos diurnos: {totalDay} plt</div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── REBALANCEAMENTO DO PICKING ── */}
      {(subdimensionados.length > 0 || superdimensionados.length > 0) && (
        <div style={{ ...secao, marginTop:20 }}>
          <h3 style={titulo}>📐 Rebalanceamento do Picking</h3>
          <p style={{ fontSize:12, color:'#888', marginTop:-10, marginBottom:16 }}>
            O espaço total do picking é fixo. Para aumentar espaços de um produto é preciso reduzir de outro.
          </p>

          {/* Mini-cards de balanço */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
            {[
              { label:'Total de Espaços',    valor: totalEspacos,                                   cor:'#1D5A9E', sub:'capacidade total do picking'       },
              { label:'Superávit Disponível', valor: totalSurplus > 0 ? `+${totalSurplus}` : '0',   cor:'#059669', sub:'espaços que podem ser cedidos'     },
              { label:'Déficit Necessário',   valor: totalDeficit > 0 ? `-${totalDeficit}` : '0',   cor:'#E31837', sub:'espaços faltando'                  },
              { label:'Saldo',                valor: saldo >= 0 ? `+${saldo}` : String(saldo),      cor: saldo >= 0 ? '#059669' : '#E31837',
                sub: saldo > 0 ? 'rebalanceamento possível + sobra' : saldo === 0 ? 'rebalanceamento exato possível' : 'espaços físicos faltando' },
            ].map(({ label, valor, cor, sub }) => (
              <div key={label} style={{ backgroundColor:'#f8fafc', borderRadius:10, padding:'14px 16px', borderLeft:`4px solid ${cor}` }}>
                <div style={{ fontSize:26, fontWeight:'bold', color:cor, lineHeight:1 }}>{valor}</div>
                <div style={{ fontSize:12, fontWeight:'600', color:'#333', marginTop:6 }}>{label}</div>
                <div style={{ fontSize:10, color:'#999', marginTop:2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Duas colunas: superávit × déficit */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, alignItems:'start' }}>

            {/* Superdimensionados — podem ceder */}
            <div>
              <div style={{ fontSize:13, fontWeight:'bold', color:'#059669', marginBottom:10 }}>
                <span style={{ backgroundColor:'#dcfce7', borderRadius:20, padding:'4px 12px' }}>✅ Podem ceder espaços ({cedentesRebalanceamento.length})</span>
              </div>
              {cedentesRebalanceamento.length === 0
                ? <p style={{ color:'#999', fontSize:12, textAlign:'center', padding:16 }}>Nenhum produto com espaço sobrando.</p>
                : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ backgroundColor:'#f0fdf4' }}>
                      <th style={thRebal}>Produto</th>
                      <th style={{ ...thRebal, textAlign:'center' }}>Atual</th>
                      <th style={{ ...thRebal, textAlign:'center' }}>Ideal</th>
                      <th style={{ ...thRebal, textAlign:'center' }}>Pode ceder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cedentesRebalanceamento.map((p, i) => {
                      const isMisto = produtosMistoSet.has(p.codProduto);
                      const cede    = p._soMisto ? p.espacos : p.espacos - p.espacosIdeal;
                      return (
                        <tr key={p.codProduto} style={{ borderBottom:'1px solid #f1f5f9', backgroundColor: isMisto ? '#ede9fe' : i%2===0 ? '#fff' : '#f0fdf4' }}>
                          <td style={{ padding:'8px 10px' }}>
                            <div style={{ fontWeight:'600', color:'#333', fontSize:11 }}>
                              {isMisto && <span title="Sugerido para palete misto" style={{ marginRight:4 }}>🔀</span>}
                              {p.nomeProduto.length > 24 ? p.nomeProduto.slice(0,24)+'…' : p.nomeProduto}
                            </div>
                            <div style={{ fontSize:10, color:'#aaa' }}>Cód: {p.codProduto}</div>
                          </td>
                          <td style={{ padding:'8px 10px', textAlign:'center', color:'#64748b' }}>{p.espacos}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center', color:'#64748b' }}>
                            {p._soMisto ? <span style={{ fontSize:10, color:'#7c3aed' }}>misto</span> : p.espacosIdeal}
                          </td>
                          <td style={{ padding:'8px 10px', textAlign:'center' }}>
                            <span style={{ backgroundColor: isMisto ? '#ede9fe' : '#dcfce7', color: isMisto ? '#4338ca' : '#166534', borderRadius:6, padding:'3px 10px', fontWeight:'bold', fontSize:11 }}>−{cede}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Subdimensionados — precisam de mais */}
            <div>
              <div style={{ fontSize:13, fontWeight:'bold', color:'#E31837', marginBottom:10 }}>
                <span style={{ backgroundColor:'#fee2e2', borderRadius:20, padding:'4px 12px' }}>⚠️ Precisam de mais espaços ({subdimensionados.length})</span>
              </div>
              {subdimensionados.length === 0
                ? <p style={{ color:'#999', fontSize:12, textAlign:'center', padding:16 }}>Nenhum produto subdimensionado.</p>
                : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ backgroundColor:'#fff8f8' }}>
                      <th style={thRebal}>Produto</th>
                      <th style={{ ...thRebal, textAlign:'center' }}>Atual</th>
                      <th style={{ ...thRebal, textAlign:'center' }}>Ideal</th>
                      <th style={{ ...thRebal, textAlign:'center' }}>Faltam</th>
                      <th style={{ ...thRebal, textAlign:'center' }}>Ressp./mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subdimensionados.map((p, i) => {
                      const faltam  = p.espacosIdeal - p.espacos;
                      const isMisto = produtosMistoSet.has(p.codProduto);
                      return (
                        <tr key={p.codProduto} style={{ borderBottom:'1px solid #f1f5f9', backgroundColor: isMisto ? '#ede9fe' : i%2===0 ? '#fff' : '#fff8f8' }}>
                          <td style={{ padding:'8px 10px' }}>
                            <div style={{ fontWeight:'600', color:'#333', fontSize:11 }}>
                              {isMisto && <span title="Sugerido para palete misto" style={{ marginRight:4 }}>🔀</span>}
                              {p.nomeProduto.length > 24 ? p.nomeProduto.slice(0,24)+'…' : p.nomeProduto}
                            </div>
                            <div style={{ fontSize:10, color:'#aaa' }}>Cód: {p.codProduto}</div>
                          </td>
                          <td style={{ padding:'8px 10px', textAlign:'center', color:'#64748b' }}>{p.espacos}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:'bold', color:'#059669' }}>{p.espacosIdeal}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center' }}>
                            <span style={{ backgroundColor:'#fee2e2', color:'#991b1b', borderRadius:6, padding:'3px 10px', fontWeight:'bold', fontSize:11 }}>+{faltam}</span>
                          </td>
                          <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:'bold', color:'#E31837' }}>{p.resspDias}d</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Callout final */}
          <div style={{ marginTop:16, padding:'12px 16px', backgroundColor: saldo >= 0 ? '#f0fdf4' : '#fff8f8', borderRadius:8, borderLeft:`4px solid ${saldo >= 0 ? '#16a34a' : '#E31837'}`, fontSize:12, color: saldo >= 0 ? '#166534' : '#991b1b' }}>
            {saldo >= 0
              ? <>✅ <strong>Rebalanceamento possível sem novos espaços físicos.</strong> O superávit de {totalSurplus} espaço{totalSurplus!==1?'s':''} cobre o déficit de {totalDeficit} espaço{totalDeficit!==1?'s':''}. Redistribuindo, eliminaria{' '}
                  <strong>{subdimensionados.reduce((s,p) => s+p.resspDias, 0)} viagem{subdimensionados.reduce((s,p) => s+p.resspDias, 0)!==1?'s':''} de ressuprimento</strong> neste mês.
                  {saldo > 0 && <> Sobram ainda {saldo} espaço{saldo>1?'s':''} livres para outros ajustes.</>}
                </>
              : <>⚠️ <strong>Rebalanceamento parcial.</strong> O superávit disponível ({totalSurplus} espaço{totalSurplus!==1?'s':''}) não cobre o déficit total ({totalDeficit} espaços). Faltam <strong>{Math.abs(saldo)} espaço{Math.abs(saldo)!==1?'s':''} físicos</strong> para eliminar todos os ressuprimentos. Priorize os produtos com mais dias de ressuprimento.</>
            }
          </div>
        </div>
      )}

      {/* ── PALETES MISTOS ── */}
      {gruposMisto.length > 0 && (
        <div style={{ ...secao, marginTop:20 }}>
          <h3 style={titulo}>🔀 Paletes Mistos Sugeridos</h3>
          <p style={{ fontSize:12, color:'#888', marginTop:-10, marginBottom:16 }}>
            Produtos com venda diária inferior a 20% da capacidade de um palete — candidatos a compartilhar um único palete. Paletes com sinergia agrupam a mesma embalagem; paletes diversos agrupam sobras de embalagens distintas.
          </p>

          <div style={{ padding:'10px 16px', backgroundColor:'#f0f1ff', borderRadius:8, borderLeft:'4px solid #4338ca', fontSize:12, color:'#3730a3', marginBottom:20, fontWeight:'600' }}>
            🔀 {gruposSinergia.length} com sinergia · {_gruposDiverso.length} diverso{_gruposDiverso.length>1?'s':''} ·
            libera <strong>{totalEspacosMisto} espaço{totalEspacosMisto>1?'s':''} de palete</strong> no picking ·
            {candidatosMisto.length} produto{candidatosMisto.length>1?'s':''} com baixa rotação identificado{candidatosMisto.length>1?'s':''}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:16 }}>
            {gruposMisto.map(({ tipo, composicao, totalFinal, cxPlt, teto, espacosLiberados, sinergia }) => {
              if (sinergia) {
                return (
                  <div key={tipo} style={{ border:'2px solid #c7d2fe', borderRadius:12, padding:16, backgroundColor:'#f8f9ff' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ fontWeight:'bold', color:'#4338ca', fontSize:14 }}>🔀 Embalagem {tipo}</div>
                      <span style={{ backgroundColor:'#dcfce7', color:'#166534', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:'bold' }}>
                        −{espacosLiberados} espaço{espacosLiberados>1?'s':''}
                      </span>
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                      <thead>
                        <tr style={{ backgroundColor:'#e0e7ff' }}>
                          <th style={thMisto}>Produto</th>
                          <th style={{ ...thMisto, textAlign:'center' }}>Esp. atual</th>
                          <th style={{ ...thMisto, textAlign:'center' }}>Caixas</th>
                          <th style={{ ...thMisto, textAlign:'center' }}>Dias</th>
                        </tr>
                      </thead>
                      <tbody>
                        {composicao.map((p, i) => {
                          const diasCobertos = p.mediaVendas > 0 ? Math.floor(p.qtdCaixas / p.mediaVendas) : null;
                          const taxa = ((p.mediaVendas / p.cxPorPlt) * 100).toFixed(1);
                          return (
                            <tr key={p.codProduto} style={{ borderBottom:'1px solid #e0e7ff', backgroundColor: i%2===0 ? '#fff' : '#f0f1ff' }}>
                              <td style={{ padding:'7px 8px' }}>
                                <div style={{ fontWeight:'600', color:'#333' }}>{p.nomeProduto.length>28 ? p.nomeProduto.slice(0,28)+'…' : p.nomeProduto}</div>
                                <div style={{ fontSize:10, color:'#aaa' }}>Cód: {p.codProduto} · rotação: {taxa}%</div>
                              </td>
                              <td style={{ padding:'7px 8px', textAlign:'center', color:'#64748b' }}>{p.espacos}</td>
                              <td style={{ padding:'7px 8px', textAlign:'center', fontWeight:'bold', color:'#4338ca' }}>{p.qtdCaixas}</td>
                              <td style={{ padding:'7px 8px', textAlign:'center', color:'#666' }}>{diasCobertos !== null ? `${diasCobertos}d` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ marginTop:10, padding:'6px 10px', backgroundColor:'#e0e7ff', borderRadius:6, fontSize:11, display:'flex', justifyContent:'space-between' }}>
                      <span style={{ color:'#4338ca' }}>Total do palete misto:</span>
                      <strong style={{ color:'#4338ca' }}>{totalFinal} / {cxPlt} cx ({Math.round(totalFinal/cxPlt*100)}% · máx 60%)</strong>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={tipo} style={{ border:'2px solid #fed7aa', borderRadius:12, padding:16, backgroundColor:'#fff7ed' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <div style={{ fontWeight:'bold', color:'#c2410c', fontSize:14 }}>🔀 Misto {tipo}</div>
                      <span style={{ backgroundColor:'#dcfce7', color:'#166534', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:'bold' }}>
                        −{espacosLiberados} espaço{espacosLiberados>1?'s':''}
                      </span>
                    </div>
                    <div style={{ fontSize:10, color:'#ea580c', marginBottom:10, fontStyle:'italic' }}>
                      Sem sinergia de embalagem · cada produto contribui com 10% do seu palete
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                      <thead>
                        <tr style={{ backgroundColor:'#ffedd5' }}>
                          <th style={thMistoDiverso}>Produto</th>
                          <th style={{ ...thMistoDiverso, textAlign:'center' }}>Esp. atual</th>
                          <th style={{ ...thMistoDiverso, textAlign:'center' }}>Caixas</th>
                          <th style={{ ...thMistoDiverso, textAlign:'center' }}>Dias</th>
                        </tr>
                      </thead>
                      <tbody>
                        {composicao.map((p, i) => {
                          const taxa = ((p.mediaVendas / p.cxPorPlt) * 100).toFixed(1);
                          const diasCobertos = p.mediaVendas > 0 ? Math.floor(p.qtdCaixas / p.mediaVendas) : null;
                          return (
                            <tr key={p.codProduto} style={{ borderBottom:'1px solid #fed7aa', backgroundColor: i%2===0 ? '#fff' : '#fff7ed' }}>
                              <td style={{ padding:'7px 8px' }}>
                                <div style={{ fontWeight:'600', color:'#333' }}>{p.nomeProduto.length>28 ? p.nomeProduto.slice(0,28)+'…' : p.nomeProduto}</div>
                                <div style={{ fontSize:10, color:'#aaa' }}>Cód: {p.codProduto} · rotação: {taxa}%</div>
                              </td>
                              <td style={{ padding:'7px 8px', textAlign:'center', color:'#64748b' }}>{p.espacos}</td>
                              <td style={{ padding:'7px 8px', textAlign:'center', fontWeight:'bold', color:'#c2410c' }}>{p.qtdCaixas}</td>
                              <td style={{ padding:'7px 8px', textAlign:'center', color:'#666' }}>{diasCobertos !== null ? `${diasCobertos}d` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ marginTop:10, padding:'6px 10px', backgroundColor:'#ffedd5', borderRadius:6, fontSize:11, color:'#c2410c', textAlign:'center' }}>
                      {composicao.length} produto{composicao.length>1?'s':''} · 10% de cada palete individual
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>
      )}

      {/* Legenda */}
      <div style={{ marginTop:20, display:'flex', gap:16, fontSize:11, color:'#aaa', flexWrap:'wrap' }}>
        <span>📐 Picking subdimensionado</span>
        <span>🚨 Teve ressuprimento no mês</span>
        <span>🔵 Reab = reabastecimento diurno</span>
        <span>🔴 Ressp = ressuprimento noturno</span>
      </div>

      {/* ── MODAL PREVIEW PICKING PRÓXIMO MÊS ── */}
      {previewConfig && (() => {
        const { linhas, prox } = previewConfig;
        const nomeMesProx = `${MESES_NOME[parseInt(prox.mes)-1]}/${prox.ano}`;
        const totalAtual  = linhas.reduce((s, l) => s + l.espacosAtual, 0);
        const totalNovo   = linhas.reduce((s, l) => s + l.espacosNovo,  0);
        const nMisto      = linhas.filter(l => l.motivo.includes('misto')).length;
        const nGanhou     = linhas.filter(l => l.motivo.includes('Ganhou')).length;
        const nFolga      = linhas.filter(l => l.motivo.includes('Folga')).length;
        return (
          <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ backgroundColor:'#fff', borderRadius:16, width:'100%', maxWidth:780, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 40px rgba(0,0,0,0.25)' }}>

              {/* Header modal */}
              <div style={{ padding:'20px 24px', borderBottom:'1px solid #e2e8f0' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:'bold', fontSize:16, color:'#1D5A9E' }}>📋 Sugestão de Picking — {nomeMesProx}</div>
                    <div style={{ fontSize:12, color:'#888', marginTop:4 }}>Baseado nos dados de {MESES_NOME[parseInt(mesNumSelecionado)-1]}/{anoSelecionado}</div>
                  </div>
                  <button onClick={() => setPreviewConfig(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#888' }}>✕</button>
                </div>
                {/* Resumo */}
                <div style={{ display:'flex', gap:12, marginTop:14, flexWrap:'wrap' }}>
                  {[
                    { label:'Total de espaços', valor:`${totalAtual} → ${totalNovo}`, cor: totalAtual === totalNovo ? '#166534' : '#b45309', bg: totalAtual === totalNovo ? '#dcfce7' : '#fef3c7' },
                    { label:'Paletes mistos',    valor:`${nMisto} produto${nMisto!==1?'s':''}`,  cor:'#4338ca', bg:'#ede9fe' },
                    { label:'Ganharam espaço',   valor:`${nGanhou} produto${nGanhou!==1?'s':''}`, cor:'#1D5A9E', bg:'#eff6ff' },
                    { label:'Folga extra',        valor:`${nFolga} produto${nFolga!==1?'s':''}`,  cor:'#c2410c', bg:'#fff7ed' },
                  ].map(({ label, valor, cor, bg }) => (
                    <div key={label} style={{ backgroundColor:bg, borderRadius:8, padding:'6px 12px', fontSize:11 }}>
                      <div style={{ color:'#666' }}>{label}</div>
                      <div style={{ fontWeight:'bold', color:cor, fontSize:13 }}>{valor}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabela scrollável */}
              <div style={{ overflowY:'auto', flex:1 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0, backgroundColor:'#f8fafc', zIndex:1 }}>
                    <tr>
                      <th style={thModal}>Produto</th>
                      <th style={{ ...thModal, textAlign:'center' }}>Esp. Atual</th>
                      <th style={{ ...thModal, textAlign:'center' }}>Esp. Novo</th>
                      <th style={{ ...thModal, textAlign:'center' }}>Diferença</th>
                      <th style={{ ...thModal, textAlign:'center' }}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={l.codProduto} style={{ borderBottom:'1px solid #f1f5f9', backgroundColor: i%2===0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ padding:'8px 12px' }}>
                          <div style={{ fontWeight:'600', color:'#333' }}>{l.nomeProduto.length>32 ? l.nomeProduto.slice(0,32)+'…' : l.nomeProduto}</div>
                          <div style={{ fontSize:10, color:'#aaa' }}>Cód: {l.codProduto}</div>
                        </td>
                        <td style={{ padding:'8px 12px', textAlign:'center', color:'#64748b' }}>{l.espacosAtual}</td>
                        <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:'bold', color: l.diff > 0 ? '#1D5A9E' : l.diff < 0 ? '#E31837' : '#64748b' }}>{l.espacosNovo}</td>
                        <td style={{ padding:'8px 12px', textAlign:'center' }}>
                          {l.diff !== 0 && (
                            <span style={{ backgroundColor: l.diff > 0 ? '#eff6ff' : '#fff1f2', color: l.diff > 0 ? '#1D5A9E' : '#E31837', borderRadius:6, padding:'2px 8px', fontWeight:'bold' }}>
                              {l.diff > 0 ? '+' : ''}{l.diff}
                            </span>
                          )}
                        </td>
                        <td style={{ padding:'8px 12px', textAlign:'center', fontSize:11, color:'#555' }}>{l.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer modal */}
              <div style={{ padding:'16px 24px', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button onClick={() => setPreviewConfig(null)} style={{ ...btn }}>Cancelar</button>
                <button
                  onClick={salvarConfigProximoMes}
                  disabled={salvandoConfig}
                  style={{ ...btn, backgroundColor:'#1D5A9E', color:'#fff', borderColor:'#1D5A9E', fontWeight:'bold', opacity: salvandoConfig ? 0.6 : 1, cursor: salvandoConfig ? 'not-allowed' : 'pointer' }}
                >
                  {salvandoConfig ? '⏳ Salvando...' : `✅ Salvar Picking de ${nomeMesProx}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const secao  = { backgroundColor:'#fff', borderRadius:12, padding:24, boxShadow:'0 2px 8px rgba(0,0,0,.07)' };
const titulo = { color:'#333', fontSize:15, fontWeight:'bold', marginBottom:16, marginTop:0 };
const btn    = { padding:'8px 14px', backgroundColor:'#f5f5f5', border:'1px solid #ddd', borderRadius:8, cursor:'pointer', fontSize:13 };
const sel    = { padding:'7px 10px', border:'1px solid #ddd', borderRadius:8, fontSize:13, minWidth:80 };
const thHeat = { padding:'6px 4px', borderBottom:'2px solid #e2e8f0', textAlign:'center', color:'#666', fontWeight:'600', whiteSpace:'nowrap', position:'sticky', top:0, backgroundColor:'#fff', zIndex:1 };
const tdHeat = { padding:'4px 3px', borderBottom:'1px solid #f1f5f9', fontSize:10, height:26 };
const insight  = (cor, bg) => ({ backgroundColor:bg, color:cor, borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:'600' });
const thRebal  = { padding:'8px 10px', borderBottom:'2px solid #e2e8f0', color:'#555', fontWeight:'600', whiteSpace:'nowrap', textAlign:'left' };
const thMisto       = { padding:'6px 8px', borderBottom:'2px solid #c7d2fe', color:'#4338ca', fontWeight:'600', whiteSpace:'nowrap', textAlign:'left' };
const thModal       = { padding:'8px 12px', borderBottom:'2px solid #e2e8f0', color:'#555', fontWeight:'600', whiteSpace:'nowrap', textAlign:'left' };
const thMistoDiverso = { padding:'6px 8px', borderBottom:'2px solid #fed7aa', color:'#c2410c', fontWeight:'600', whiteSpace:'nowrap', textAlign:'left' };
