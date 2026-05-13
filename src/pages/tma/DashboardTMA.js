import { useState, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function simplificarNome(nome) {
  if (!nome) return nome;
  if (!nome.toUpperCase().includes('AMBEV')) return nome;
  // Remove "AMBEV" e qualquer separador ao redor (-, –, /, |, espaços)
  const limpo = nome
    .replace(/AMBEV\s*[-–/|,]\s*/i, '')
    .replace(/\s*[-–/|,]\s*AMBEV/i, '')
    .replace(/\bAMBEV\b/i, '')
    .trim();
  return limpo || nome;
}

function parsarData(str) {
  if (!str) return null;
  const p = String(str).split('/');
  if (p.length !== 3) return null;
  const [dia, mes, ano] = p.map(Number);
  const d = new Date(ano, mes - 1, dia);
  return isNaN(d.getTime()) ? null : d;
}

function parsarFiltro(str) {
  if (!str) return null;
  const [ano, mes, dia] = str.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatarMs(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatarTickMs(ms) {
  if (ms === 0) return '00:00:00';
  return formatarMs(ms);
}

function avgMs(lista) {
  if (!lista || lista.length === 0) return null;
  return lista.reduce((acc, r) => acc + (r.tmaMs || 0), 0) / lista.length;
}

function ordenarDatas(datas) {
  return [...datas].sort((a, b) => {
    const pa = parsarData(a), pb = parsarData(b);
    return pa && pb ? pa - pb : 0;
  });
}

const CORES = [
  '#1D5A9E','#E31837','#059669','#7c3aed','#d97706',
  '#0891b2','#be185d','#4d7c0f','#9333ea','#b45309',
];

// ─── CheckboxDropdown ─────────────────────────────────────────────────────────

function CheckboxDropdown({ opcoes, selecionados, onChange, label }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function fechar(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, []);

  const todos = selecionados.length === 0;
  const texto = todos
    ? `${label} (todos)`
    : `${label} (${selecionados.length}/${opcoes.length})`;

  function toggle(op) {
    if (selecionados.includes(op)) {
      const novo = selecionados.filter(s => s !== op);
      onChange(novo);
    } else {
      onChange([...selecionados, op]);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      <button
        onClick={() => setAberto(a => !a)}
        style={{
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 500,
          border: `1px solid ${todos ? '#e5e7eb' : '#1D5A9E'}`,
          borderRadius: 6,
          backgroundColor: todos ? '#fafafa' : '#eff6ff',
          color: todos ? '#6b7280' : '#1D5A9E',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
        }}
      >
        {texto}
        <span style={{ fontSize: 9, marginTop: 1 }}>{aberto ? '▲' : '▼'}</span>
      </button>

      {aberto && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 4px)',
          zIndex: 50,
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '6px 0',
          minWidth: 180,
          maxHeight: 280,
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {/* Todos / Nenhum */}
          <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
            <button
              onClick={() => onChange([])}
              style={{ fontSize: 11, color: '#1D5A9E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
            >
              Todos
            </button>
            <span style={{ color: '#d1d5db' }}>|</span>
            <button
              onClick={() => onChange([...opcoes])}
              style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Nenhum
            </button>
          </div>

          {opcoes.map(op => {
            const marcado = todos || selecionados.includes(op);
            return (
              <label
                key={op}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#374151',
                  backgroundColor: selecionados.includes(op) && !todos ? '#eff6ff' : 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = selecionados.includes(op) && !todos ? '#eff6ff' : 'transparent'; }}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => toggle(op)}
                  style={{ accentColor: '#1D5A9E', cursor: 'pointer' }}
                />
                {op}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Card resumo ──────────────────────────────────────────────────────────────

function CardResumo({ titulo, valor, sufixo, cor, ativo }) {
  return (
    <div style={{
      backgroundColor: '#fff',
      border: `1px solid ${ativo ? cor : '#e5e7eb'}`,
      borderRadius: 10,
      padding: '16px 20px',
      borderLeft: `4px solid ${cor}`,
      boxShadow: ativo ? `0 0 0 2px ${cor}22` : '0 1px 3px rgba(0,0,0,0.05)',
      transition: 'all 0.15s',
    }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', lineHeight: 1 }}>{valor}</div>
      {sufixo && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sufixo}</div>}
    </div>
  );
}

// ─── Tooltip do gráfico ───────────────────────────────────────────────────────

function TooltipTMA({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const nome = d.local ?? d.mot ?? '';
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>{nome}</div>
      <div style={{ fontSize: 13, color: '#1D5A9E' }}>TMA Médio: <strong>{d.tmaFormatado}</strong></div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{d.count} registro(s)</div>
    </div>
  );
}

// ─── Dashboard principal ───────────────────────────────────────────────────────

function lsGet(chave, padrao) {
  try {
    const v = localStorage.getItem(chave);
    return v !== null ? JSON.parse(v) : padrao;
  } catch { return padrao; }
}

function lsSet(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
}

export default function DashboardTMA() {
  const { col, colRevenda } = useDb();
  const [registros, setRegistros] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const [filtro,    setFiltro]    = useState(() => lsGet('tma_filtro',    { de: '', ate: '' }));
  const [aba,       setAba]       = useState(() => lsGet('tma_aba',       'geral'));

  // Filtros do gráfico
  const [locaisChartFiltro,     setLocaisChartFiltro]     = useState(() => lsGet('tma_locaisChart',     []));
  const [motoristasChartFiltro, setMotoristasChartFiltro] = useState(() => lsGet('tma_motoristasChart', []));

  // Seleção de barras para filtro cruzado nos cards (não persiste — é transiente)
  const [barrasSelecionadas, setBarrasSelecionadas] = useState([]);

  // Filtros da aba Geral
  const [locaisGeralFiltro, setLocaisGeralFiltro] = useState(() => lsGet('tma_locaisGeral', []));

  // Filtros da aba Motorista
  const [motoristasTabFiltro,   setMotoristasTabFiltro]   = useState(() => lsGet('tma_motoristasTab',   []));
  const [locaisMotoristaFiltro, setLocaisMotoristaFiltro]  = useState(() => lsGet('tma_locaisMotorista', []));

  // Planificador viagens
  const [busca,     setBusca]     = useState(() => lsGet('tma_busca',     ''));
  const [ordenacao, setOrdenacao] = useState(() => lsGet('tma_ordenacao', { campo: 'dataInicio', dir: 'asc' }));

  // Persistência automática
  useEffect(() => { lsSet('tma_filtro',            filtro);               }, [filtro]);
  useEffect(() => { lsSet('tma_aba',               aba);                  }, [aba]);
  useEffect(() => { lsSet('tma_locaisChart',        locaisChartFiltro);    }, [locaisChartFiltro]);
  useEffect(() => { lsSet('tma_motoristasChart',    motoristasChartFiltro);}, [motoristasChartFiltro]);
  useEffect(() => { lsSet('tma_locaisGeral',        locaisGeralFiltro);    }, [locaisGeralFiltro]);
  useEffect(() => { lsSet('tma_motoristasTab',      motoristasTabFiltro);  }, [motoristasTabFiltro]);
  useEffect(() => { lsSet('tma_locaisMotorista',    locaisMotoristaFiltro);}, [locaisMotoristaFiltro]);
  useEffect(() => { lsSet('tma_busca',              busca);                }, [busca]);
  useEffect(() => { lsSet('tma_ordenacao',          ordenacao);            }, [ordenacao]);

  useEffect(() => {
    getDocs(colRevenda('tma_registros'))
      .then(snap => { setRegistros(snap.docs.map(d => d.data())); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Limpa seleção de barras ao trocar aba
  useEffect(() => { setBarrasSelecionadas([]); }, [aba]);

  // ── Filtragem por período ──────────────────────────────────────────────────
  const filtrados = registros.filter(r => {
    const data = parsarData(r.dataInicio);
    if (!data) return false;
    const de  = parsarFiltro(filtro.de);
    const ate = parsarFiltro(filtro.ate);
    if (de  && data < de)  return false;
    if (ate && data > ate) return false;
    return true;
  });

  // ── Registros filtrados pelas barras selecionadas (cards) ─────────────────
  const registrosCards = barrasSelecionadas.length > 0
    ? filtrados.filter(r =>
        aba === 'motorista'
          ? barrasSelecionadas.includes(r.motorista)
          : barrasSelecionadas.includes(r.local)
      )
    : filtrados;

  // ── Valores únicos ────────────────────────────────────────────────────────
  const locais     = [...new Set(filtrados.map(r => r.local).filter(Boolean))].sort();
  const motoristas = [...new Set(filtrados.map(r => r.motorista).filter(Boolean))].sort();
  const datas      = ordenarDatas([...new Set(filtrados.map(r => r.dataInicio).filter(Boolean))]);
  const placasUnicas = new Set(filtrados.map(r => r.placa).filter(Boolean)).size;

  // ── Dados do gráfico ──────────────────────────────────────────────────────
  const locaisGrafico     = locaisChartFiltro.length > 0     ? locais.filter(l => locaisChartFiltro.includes(l))         : locais;
  const motoristasGrafico = motoristasChartFiltro.length > 0 ? motoristas.filter(m => motoristasChartFiltro.includes(m)) : motoristas;

  const chartData = aba === 'motorista'
    ? motoristasGrafico.map((mot, idx) => {
        const regs = filtrados.filter(r => r.motorista === mot);
        const avg  = avgMs(regs) || 0;
        return { mot, tmaMs: avg, tmaFormatado: formatarMs(avg), count: regs.length, cor: CORES[idx % CORES.length] };
      })
    : locaisGrafico.map((local, idx) => {
        const regs = filtrados.filter(r => r.local === local);
        const avg  = avgMs(regs) || 0;
        return { local, tmaMs: avg, tmaFormatado: formatarMs(avg), count: regs.length, cor: CORES[idx % CORES.length] };
      });

  const chartXKey     = aba === 'motorista' ? 'mot' : 'local';
  const chartLabel    = aba === 'motorista' ? 'TMA por Motorista' : 'TMA Médio por Local';
  const chartOpcoes   = aba === 'motorista' ? motoristas : locais;
  const chartFiltro   = aba === 'motorista' ? motoristasChartFiltro : locaisChartFiltro;
  const setChartFiltro = aba === 'motorista' ? setMotoristasChartFiltro : setLocaisChartFiltro;

  // ── Click nas barras (filtro cruzado) ─────────────────────────────────────
  function handleBarClick(data, _idx, event) {
    const chave = aba === 'motorista' ? data.mot : data.local;
    if (!chave) return;
    const multi = event?.ctrlKey || event?.metaKey;
    setBarrasSelecionadas(prev => {
      if (multi) {
        return prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave];
      }
      return prev.length === 1 && prev[0] === chave ? [] : [chave];
    });
  }

  // ── Aba Geral ─────────────────────────────────────────────────────────────
  const locaisGeralVisiveis = locaisGeralFiltro.length > 0 ? locais.filter(l => locaisGeralFiltro.includes(l)) : locais;
  const porDiaLocal = {};
  filtrados.forEach(r => {
    if (!r.dataInicio || !r.local) return;
    porDiaLocal[r.dataInicio] ??= {};
    porDiaLocal[r.dataInicio][r.local] ??= [];
    porDiaLocal[r.dataInicio][r.local].push(r);
  });

  // ── Aba Motorista ─────────────────────────────────────────────────────────
  const motoristasVisiveis     = motoristasTabFiltro.length > 0   ? motoristas.filter(m => motoristasTabFiltro.includes(m))   : motoristas;
  const locaisMotoristaVisiveis = locaisMotoristaFiltro.length > 0 ? locais.filter(l => locaisMotoristaFiltro.includes(l))     : locais;
  const porMotorista = {};
  filtrados.forEach(r => {
    if (!r.motorista) return;
    porMotorista[r.motorista] ??= { _all: [] };
    porMotorista[r.motorista]._all.push(r);
    if (r.local) {
      porMotorista[r.motorista][r.local] ??= [];
      porMotorista[r.motorista][r.local].push(r);
    }
  });

  // ── Aba Planificador ──────────────────────────────────────────────────────
  const buscados = busca.trim()
    ? filtrados.filter(r => {
        const q = busca.toLowerCase();
        return r.placa?.toLowerCase().includes(q)     ||
               r.motorista?.toLowerCase().includes(q) ||
               r.local?.toLowerCase().includes(q)     ||
               r.revenda?.toLowerCase().includes(q);
      })
    : filtrados;

  const ordenados = [...buscados].sort((a, b) => {
    let va = a[ordenacao.campo] ?? '', vb = b[ordenacao.campo] ?? '';
    if (ordenacao.campo === 'dataInicio') { va = parsarData(va) || 0; vb = parsarData(vb) || 0; }
    else if (ordenacao.campo === 'tmaMs') { va = Number(va); vb = Number(vb); }
    if (va < vb) return ordenacao.dir === 'asc' ? -1 : 1;
    if (va > vb) return ordenacao.dir === 'asc' ?  1 : -1;
    return 0;
  });

  function toggleOrdem(campo) {
    setOrdenacao(prev =>
      prev.campo === campo
        ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { campo, dir: 'asc' }
    );
  }

  // ── Valores dos cards ─────────────────────────────────────────────────────
  const tmaGeral        = avgMs(registrosCards);
  const locaisAtivos    = new Set(registrosCards.map(r => r.local).filter(Boolean)).size;
  const motoristasCards = new Set(registrosCards.map(r => r.motorista).filter(Boolean)).size;
  const filtroAtivo     = barrasSelecionadas.length > 0;

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#6b7280', fontSize: 15 }}>Carregando dados...</div>;
  }

  if (registros.length === 0) {
    return (
      <div style={{ maxWidth: 500, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>📭</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Nenhum dado importado</div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          Acesse <strong>TMA → Importar relatório</strong> para carregar os dados.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, marginBottom: 4 }}>
            TMA — Painel Geral
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            {filtrados.length} registro(s) · {placasUnicas} placa(s) · {datas.length} dia(s) no período
            {filtroAtivo && (
              <span style={{ marginLeft: 8, color: '#1D5A9E', fontWeight: 600 }}>
                · Filtro ativo: {barrasSelecionadas.join(', ')}
                <button
                  onClick={() => setBarrasSelecionadas([])}
                  style={{ marginLeft: 6, fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  limpar
                </button>
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px' }}>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>PERÍODO</span>
          <span style={{ fontSize: 12, color: '#374151' }}>De</span>
          <input type="date" value={filtro.de}  onChange={e => setFiltro(f => ({ ...f, de:  e.target.value }))} style={s.inputData} />
          <span style={{ fontSize: 12, color: '#374151' }}>até</span>
          <input type="date" value={filtro.ate} onChange={e => setFiltro(f => ({ ...f, ate: e.target.value }))} style={s.inputData} />
          {(filtro.de || filtro.ate) && (
            <button onClick={() => setFiltro({ de: '', ate: '' })} style={s.btnReset}>✕</button>
          )}
        </div>
      </div>

      {/* ── Cards ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <CardResumo titulo="Total Registros"  valor={registrosCards.length} sufixo={`${placasUnicas} placas`}  cor="#1D5A9E" ativo={filtroAtivo} />
        <CardResumo titulo="TMA Médio Geral"  valor={formatarMs(tmaGeral)}                                     cor="#E31837" ativo={filtroAtivo} />
        <CardResumo titulo="Locais"           valor={locaisAtivos}          sufixo="locais atendidos"           cor="#059669" ativo={filtroAtivo} />
        <CardResumo titulo="Motoristas"       valor={motoristasCards}       sufixo="motoristas"                 cor="#d97706" ativo={filtroAtivo} />
      </div>

      {/* ── Gráfico ─────────────────────────────────────────────────────────── */}
      <div style={{ ...s.card, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={s.secTitulo}>{chartLabel}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
              Clique numa barra para filtrar os cards · Ctrl+clique para selecionar múltiplas
            </div>
          </div>
          <CheckboxDropdown
            opcoes={chartOpcoes}
            selecionados={chartFiltro}
            onChange={setChartFiltro}
            label={aba === 'motorista' ? 'Motoristas' : 'Locais'}
          />
        </div>

        {chartData.length === 0
          ? <div style={s.placeholder}>Nenhum dado para exibir.</div>
          : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 0, right: 10, left: 0, bottom: 60 }}
                onClick={() => {}}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey={chartXKey}
                  tick={{ fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  tickFormatter={simplificarNome}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                  tickFormatter={formatarTickMs}
                />
                <Tooltip content={<TooltipTMA />} />
                <Bar dataKey="tmaMs" radius={[6, 6, 0, 0]} maxBarSize={60} onClick={handleBarClick} cursor="pointer">
                  {chartData.map((entry, i) => {
                    const chave = entry[chartXKey];
                    const dimmed = filtroAtivo && !barrasSelecionadas.includes(chave);
                    return <Cell key={i} fill={dimmed ? '#e5e7eb' : entry.cor} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* ── Abas ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
        {[['geral','Geral'], ['motorista','Motorista'], ['planificador','Planificador viagens']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            style={{
              padding: '9px 20px',
              fontSize: 13,
              fontWeight: aba === k ? 700 : 400,
              border: 'none',
              borderBottom: aba === k ? '2px solid #1D5A9E' : '2px solid transparent',
              marginBottom: -2,
              borderRadius: 0,
              backgroundColor: 'transparent',
              color: aba === k ? '#1D5A9E' : '#6b7280',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ══ ABA: Geral ═══════════════════════════════════════════════════════ */}
      {aba === 'geral' && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={s.secTitulo}>TMA Médio — Dia × Local</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{datas.length} dia(s) · valor = média HH:MM:SS · (nº veículos)</div>
            </div>
            <CheckboxDropdown
              opcoes={locais}
              selecionados={locaisGeralFiltro}
              onChange={setLocaisGeralFiltro}
              label="Locais"
            />
          </div>

          {datas.length === 0
            ? <div style={s.placeholder}>Nenhum dado no período selecionado.</div>
            : (
              <div style={s.tabelaWrapper}>
                <table style={s.tabela}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, minWidth: 100 }}>Data</th>
                      {locaisGeralVisiveis.map(l => (
                        <th key={l} style={{ ...s.th, textAlign: 'center' }}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datas.map((data, i) => (
                      <tr key={data} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{data}</td>
                        {locaisGeralVisiveis.map(local => {
                          const regs = porDiaLocal[data]?.[local] || [];
                          const avg  = avgMs(regs);
                          return (
                            <td key={local} style={{ ...s.td, textAlign: 'center' }}>
                              {avg
                                ? <><span style={{ color: '#1D5A9E', fontWeight: 600 }}>{formatarMs(avg)}</span><div style={{ fontSize: 10, color: '#9ca3af' }}>{regs.length}x</div></>
                                : <span style={{ color: '#e5e7eb' }}>—</span>
                              }
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#1a1a2e' }}>
                      <td style={{ ...s.td, color: '#fff', fontWeight: 700 }}>Total período</td>
                      {locaisGeralVisiveis.map(local => {
                        const regs = filtrados.filter(r => r.local === local);
                        const avg  = avgMs(regs);
                        return (
                          <td key={local} style={{ ...s.td, textAlign: 'center', color: avg ? '#93c5fd' : '#4b5563', fontWeight: 600 }}>
                            {avg ? formatarMs(avg) : '—'}
                            {regs.length > 0 && <div style={{ fontSize: 10, color: '#6b7280' }}>{regs.length}x</div>}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* ══ ABA: Motorista ═══════════════════════════════════════════════════ */}
      {aba === 'motorista' && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={s.secTitulo}>TMA por Motorista</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>ordenado pelo TMA médio · clique no cabeçalho para reordenar</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <CheckboxDropdown
                opcoes={motoristas}
                selecionados={motoristasTabFiltro}
                onChange={setMotoristasTabFiltro}
                label="Motoristas"
              />
              <CheckboxDropdown
                opcoes={locais}
                selecionados={locaisMotoristaFiltro}
                onChange={setLocaisMotoristaFiltro}
                label="Locais"
              />
            </div>
          </div>

          {motoristasVisiveis.length === 0
            ? <div style={s.placeholder}>Nenhum dado no período selecionado.</div>
            : (
              <div style={s.tabelaWrapper}>
                <table style={s.tabela}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, width: 32, textAlign: 'center' }}>#</th>
                      <th style={s.th}>Motorista</th>
                      {locaisMotoristaVisiveis.map(l => (
                        <th key={l} style={{ ...s.th, textAlign: 'center' }}>{l}</th>
                      ))}
                      <th style={{ ...s.th, textAlign: 'center', backgroundColor: '#0d2d5c' }}>TMA Médio</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Viagens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {motoristasVisiveis
                      .map(mot => ({ mot, regs: porMotorista[mot]?._all || [] }))
                      .sort((a, b) => (avgMs(a.regs) || 0) - (avgMs(b.regs) || 0))
                      .map(({ mot, regs }, i) => (
                        <tr key={mot} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                          <td style={{ ...s.td, color: '#9ca3af', textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ ...s.td, fontWeight: 600 }}>{mot}</td>
                          {locaisMotoristaVisiveis.map(local => {
                            const lr  = porMotorista[mot]?.[local] || [];
                            const avg = avgMs(lr);
                            return (
                              <td key={local} style={{ ...s.td, textAlign: 'center', color: avg ? '#1D5A9E' : '#e5e7eb' }}>
                                {avg ? formatarMs(avg) : '—'}
                                {avg && <div style={{ fontSize: 10, color: '#9ca3af' }}>{lr.length}x</div>}
                              </td>
                            );
                          })}
                          <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: '#1a1a2e' }}>
                            {formatarMs(avgMs(regs))}
                          </td>
                          <td style={{ ...s.td, textAlign: 'center', color: '#6b7280' }}>{regs.length}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* ══ ABA: Planificador viagens ═════════════════════════════════════════ */}
      {aba === 'planificador' && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={s.secTitulo}>Planificador de Viagens</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{ordenados.length} registro(s)</div>
            </div>
            <input
              placeholder="🔍 Buscar placa, motorista, local, revenda..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, minWidth: 280, outline: 'none', backgroundColor: '#fafafa' }}
            />
          </div>

          {ordenados.length === 0
            ? <div style={s.placeholder}>Nenhum registro encontrado.</div>
            : (
              <div style={s.tabelaWrapper}>
                <table style={s.tabela}>
                  <thead>
                    <tr>
                      {[
                        { campo: 'placa',      label: 'Placa' },
                        { campo: 'local',      label: 'Local' },
                        { campo: 'revenda',    label: 'Revenda' },
                        { campo: 'motorista',  label: 'Motorista' },
                        { campo: 'dataInicio', label: 'Data Início' },
                        { campo: 'horaInicio', label: 'Hora Início' },
                        { campo: 'dataFim',    label: 'Data Fim' },
                        { campo: 'horaFim',    label: 'Hora Fim' },
                        { campo: 'tmaMs',      label: 'TMA' },
                      ].map(({ campo, label }) => (
                        <th
                          key={campo}
                          onClick={() => toggleOrdem(campo)}
                          style={{ ...s.th, cursor: 'pointer', userSelect: 'none', textAlign: campo === 'tmaMs' ? 'center' : 'left' }}
                        >
                          {label}
                          {ordenacao.campo === campo && (
                            <span style={{ marginLeft: 4, fontSize: 9 }}>{ordenacao.dir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordenados.slice(0, 300).map((r, i) => (
                      <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                        <td style={{ ...s.td, fontWeight: 700, color: '#1a1a2e' }}>{r.placa}</td>
                        <td style={s.td}>{r.local}</td>
                        <td style={{ ...s.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.revenda}</td>
                        <td style={s.td}>{r.motorista}</td>
                        <td style={s.td}>{r.dataInicio}</td>
                        <td style={s.td}>{r.horaInicio}</td>
                        <td style={s.td}>{r.dataFim}</td>
                        <td style={s.td}>{r.horaFim}</td>
                        <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: '#1D5A9E' }}>{r.tmaFormatado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ordenados.length > 300 && (
                  <div style={s.maisLinhas}>
                    Mostrando 300 de {ordenados.length} registros. Refine a busca para ver mais.
                  </div>
                )}
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = {
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 24,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    marginBottom: 20,
  },
  secTitulo: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a2e',
  },
  inputData: {
    padding: '5px 8px',
    borderRadius: 5,
    border: '1px solid #e5e7eb',
    fontSize: 13,
    color: '#374151',
    outline: 'none',
    backgroundColor: '#fafafa',
  },
  btnReset: {
    fontSize: 11,
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#6b7280',
    fontFamily: 'inherit',
  },
  tabelaWrapper: {
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 520,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
  },
  tabela: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '9px 12px',
    textAlign: 'left',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    fontSize: 12,
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  trPar:   { backgroundColor: '#fff' },
  trImpar: { backgroundColor: '#f9fafb' },
  td: {
    padding: '8px 12px',
    color: '#374151',
    borderTop: '1px solid #f0f0f0',
    whiteSpace: 'nowrap',
    fontSize: 12,
  },
  maisLinhas: {
    padding: '10px 14px',
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'center',
  },
  placeholder: {
    padding: '40px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
    fontStyle: 'italic',
  },
};
