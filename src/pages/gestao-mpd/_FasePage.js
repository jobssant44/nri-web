import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

// ─── Navegação entre as 4 abas ───────────────────────────────────────────────
const PAGES = [
  { label: 'EFC',        path: '/gestao-mpd/efc' },
  { label: 'EFD',        path: '/gestao-mpd/efd' },
  { label: 'TI',         path: '/gestao-mpd/ti' },
  { label: 'Histograma', path: '/gestao-mpd/histograma' },
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg:          '#f8fafc',
  surface:     '#ffffff',
  border:      '#e2e8f0',
  borderLight: '#f1f5f9',
  text:        '#0f172a',
  textSec:     '#475569',
  textMuted:   '#94a3b8',
  red:         '#E31837',
  redSoft:     'rgba(227,24,55,0.07)',
  redBorder:   'rgba(227,24,55,0.18)',
  blue:        '#1D5A9E',
  blueSoft:    'rgba(29,90,158,0.07)',
  blueBorder:  'rgba(29,90,158,0.18)',
  green:       '#15803d',
  greenSoft:   'rgba(21,128,61,0.07)',
  amber:       '#b45309',
  amberSoft:   'rgba(180,83,9,0.07)',
  shadow:      '0 1px 2px rgba(15,23,42,0.03), 0 4px 16px rgba(15,23,42,0.04)',
  shadowMd:    '0 2px 8px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.05)',
  radius:      14,
  font:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
  mono:        "'JetBrains Mono', 'Fira Code', ui-monospace, 'Courier New', monospace",
  transition:  'all 0.22s cubic-bezier(0.16,1,0.3,1)',
};

const STYLE_ID = 'mpd-fase-styles';
if (!document.getElementById(STYLE_ID)) {
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .mpd-chip:hover { opacity: 0.8; }
    .mpd-nav-btn { transition: all 0.18s cubic-bezier(0.16,1,0.3,1); }
    .mpd-nav-btn:hover { background: ${D.blueSoft} !important; color: ${D.blue} !important; border-color: ${D.blue} !important; }
    .mpd-select:focus, .mpd-input:focus { outline: none; border-color: ${D.blue} !important; box-shadow: 0 0 0 3px ${D.blueSoft}; }
    .mpd-btn-clear:hover { border-color: ${D.red} !important; color: ${D.red} !important; }
    .recharts-wrapper, .recharts-wrapper svg,
    .recharts-wrapper *:focus, .recharts-surface { outline: none !important; }
  `;
  document.head.appendChild(st);
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
function horaParaMinutos(h) {
  if (!h) return null;
  const s = String(h).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 0 && n < 1) return Math.round(n * 24 * 60);
  return null;
}

// eslint-disable-next-line no-unused-vars
function parseNum(val) {
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
    if (after.length === 3 && /^\d+$/.test(after) && /^\d/.test(str)) s = str.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDataBR(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  const n = parseFloat(s);
  if (!isNaN(n) && n > 1000) return new Date(Math.round((n - 25569) * 86400 * 1000));
  return null;
}

function toISO(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// eslint-disable-next-line no-unused-vars
function toMesAno(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Filtro cruzado ───────────────────────────────────────────────────────────
// Filtros globais (revenda, frota, período): sempre aplicados em todos os charts.
// Filtros de cross-filter (data, motorista, placa): excluídos no chart proprietário.
function filtrarLinhas(linhas, filtros, excluir = null) {
  return linhas.filter(l => {
    // Globais — aplicados sempre
    if (filtros.revenda && l.revenda          !== filtros.revenda) return false;
    if (filtros.frota   && l.frotaCadastrada  !== filtros.frota)   return false;
    if (filtros.dataInicio || filtros.dataFim) {
      const iso = toISO(l.dataEmissao);
      if (filtros.dataInicio && (!iso || iso < filtros.dataInicio)) return false;
      if (filtros.dataFim    && (!iso || iso > filtros.dataFim))    return false;
    }
    // Cross-filter — ignorado no chart da própria dimensão
    if (excluir !== 'data'      && filtros.data      && toISO(l.dataEmissao) !== filtros.data)      return false;
    if (excluir !== 'motorista' && filtros.motorista && l.motorista           !== filtros.motorista) return false;
    if (excluir !== 'placa'     && filtros.placa     && l.placa               !== filtros.placa)     return false;
    return true;
  });
}

const FILTROS_VAZIOS = { data: null, motorista: null, placa: null, revenda: '', frota: '', dataInicio: '', dataFim: '' };

// ─── Agregadores ──────────────────────────────────────────────────────────────
function agruparPorData(linhas) {
  const mapa = new Map();
  linhas.forEach(l => {
    const iso = toISO(l.dataEmissao);
    if (!iso) return;
    const cur = mapa.get(iso) ?? { iso, label: l.dataEmissao || iso, count: 0 };
    mapa.set(iso, { ...cur, count: cur.count + 1 });
  });
  return [...mapa.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

function agruparPorMotorista(linhas, top = 12) {
  const mapa = new Map();
  linhas.forEach(l => {
    const k = (l.motorista ?? '').trim() || '—';
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  });
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, count]) => ({ name, count }));
}

function agruparPorPlaca(linhas, top = 12) {
  const mapa = new Map();
  linhas.forEach(l => {
    const k = (l.placa ?? '').trim() || '—';
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  });
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, count]) => ({ name, count }));
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function TopbarNav({ current }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {PAGES.filter(p => p.path !== current).map(p => (
        <button key={p.path} className="mpd-nav-btn" onClick={() => navigate(p.path)}
          style={{ padding: '7px 16px', background: D.surface, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: D.textSec, fontFamily: D.font, letterSpacing: 0.2 }}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function KPICard({ label, valor, sub, cor, destaque }) {
  return (
    <div style={{
      background: destaque ? cor : D.surface,
      border: `1px solid ${destaque ? cor : D.border}`,
      borderLeft: destaque ? undefined : `3px solid ${cor}`,
      borderRadius: D.radius,
      padding: destaque ? '24px 24px 20px' : '18px 20px',
      boxShadow: destaque ? `0 4px 24px ${cor}22` : D.shadow,
      animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: destaque ? 'rgba(255,255,255,0.65)' : D.textMuted, fontFamily: D.font, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: destaque ? 30 : 22, fontWeight: 800, color: destaque ? '#fff' : D.text, fontFamily: D.mono, letterSpacing: -1, lineHeight: 1 }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: destaque ? 'rgba(255,255,255,0.5)' : D.textMuted, marginTop: 7, fontFamily: D.font }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ titulo, badge, children }) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '22px 24px', boxShadow: D.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2, fontFamily: D.font }}>{titulo}</span>
        </div>
        {badge}
      </div>
      <div style={{ borderTop: `1px solid ${D.borderLight}`, paddingTop: 16 }}>{children}</div>
    </div>
  );
}

function Chip({ label, onClear }) {
  return (
    <div className="mpd-chip" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 8px 5px 11px',
      background: D.redSoft, border: `1px solid ${D.redBorder}`,
      borderRadius: 8, fontSize: 11.5, color: D.red, fontWeight: 600,
      fontFamily: D.font, cursor: 'default', transition: D.transition,
    }}>
      {label}
      <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.red, fontSize: 12, lineHeight: 1, padding: '1px 3px', borderRadius: 3, opacity: 0.7 }}>✕</button>
    </div>
  );
}

function Skeleton({ width = '100%', height = 20, radius = 6, style: sx = {} }) {
  return (
    <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #f1f5f9 25%, #e8edf2 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.6s ease-in-out infinite', ...sx }} />
  );
}

function Vazio() {
  return (
    <div style={{ height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <svg width="24" height="24" fill="none" stroke={D.textMuted} strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <span style={{ fontSize: 12.5, color: D.textMuted, fontFamily: D.font, fontStyle: 'italic' }}>Sem dados para o filtro selecionado</span>
    </div>
  );
}

function EmptyState({ fase }) {
  return (
    <div style={{ padding: '72px 24px', textAlign: 'center', animation: 'fadeUp 0.4s ease both' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: D.redSoft, border: `1px solid ${D.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <svg width="26" height="26" fill="none" stroke={D.red} strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8, fontFamily: D.font }}>Nenhum dado de {fase} encontrado</div>
      <div style={{ fontSize: 13, color: D.textSec, maxWidth: 320, margin: '0 auto', lineHeight: 1.65, fontFamily: D.font }}>
        Importe o relatório <strong>03.11.20</strong> em <strong>Importar relatórios</strong> para visualizar os dados.
      </div>
    </div>
  );
}

function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font }}>
      <div style={{ fontWeight: 700, marginBottom: 5, color: D.text, fontSize: 12.5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? D.red, fontWeight: 600, fontFamily: D.mono, fontSize: 12 }}>
          {p.name ?? 'Qtd'}: {p.value}
        </div>
      ))}
    </div>
  );
}

// ─── Estilos dos controles de filtro ─────────────────────────────────────────
const sLabel  = { fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: D.textSec, fontFamily: D.font };
const sSelect = {
  padding: '7px 32px 7px 11px', border: `1px solid ${D.border}`, borderRadius: 8,
  fontSize: 12.5, color: D.text, background: `${D.bg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%2394a3b8' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E") no-repeat right 10px center`,
  fontFamily: D.font, cursor: 'pointer', minWidth: 155,
  WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
  transition: D.transition,
};
const sInput  = { padding: '7px 11px', border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 12.5, color: D.text, background: D.bg, fontFamily: D.font, transition: D.transition };
const tdS     = { padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 12, fontFamily: D.font };

// ─── Página da Fase (EFC / EFD / TI) ─────────────────────────────────────────
export default function FasePage({ fase, faseCodigo: faseCod }) {
  const faseCodigo = faseCod ?? fase;
  const loc = useLocation();
  const [linhas, setLinhas]         = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros]       = useState(FILTROS_VAZIOS);
  const [metaPercent, setMetaPercent]   = useState(null);
  const [metaHorario, setMetaHorario]   = useState(null);

  useEffect(() => {
    let mounted = true;
    setCarregando(true);
    Promise.all([
      getDocs(collection(db, 'relatorio031120')),
      getDoc(doc(db, 'metas_mpd', 'config')),
    ]).then(([snap, metaSnap]) => {
      if (!mounted) return;
      setLinhas(snap.docs.map(d => d.data()));
      if (metaSnap.exists()) {
        const m = metaSnap.data();
        setMetaPercent(m?.percents?.[fase] ?? null);
        setMetaHorario(m?.horarios?.[fase] ?? null);
      }
    }).catch(() => {}).finally(() => { if (mounted) setCarregando(false); });
    return () => { mounted = false; };
  }, [fase]);

  // Linhas com filtros globais apenas (sem cross-filter, sem fase) — base para KPIs
  const linhasGlobal = useMemo(() => linhas.filter(l => {
    if (filtros.revenda    && l.revenda         !== filtros.revenda) return false;
    if (filtros.frota      && l.frotaCadastrada !== filtros.frota)   return false;
    if (filtros.dataInicio || filtros.dataFim) {
      const iso = toISO(l.dataEmissao);
      if (filtros.dataInicio && (!iso || iso < filtros.dataInicio)) return false;
      if (filtros.dataFim    && (!iso || iso > filtros.dataFim))    return false;
    }
    return true;
  }), [linhas, filtros]);

  // Linhas desta fase (filtros globais já aplicados)
  const linhasFase = useMemo(
    () => linhasGlobal.filter(l => String(l.fase ?? '').trim() === faseCodigo),
    [linhasGlobal, faseCodigo]
  );

  // Listas únicas para os selects (derivadas de todas as linhas, sem filtros)
  const uniqueRevendas = useMemo(
    () => [...new Set(linhas.map(l => (l.revenda ?? '').trim()).filter(Boolean))].sort(),
    [linhas]
  );
  const uniqueFrotas = useMemo(
    () => [...new Set(linhas.map(l => (l.frotaCadastrada ?? '').trim()).filter(Boolean))].sort(),
    [linhas]
  );

  // Memos com filtro cruzado — cada chart exclui sua própria dimensão
  const dadosData       = useMemo(() => agruparPorData(filtrarLinhas(linhasFase, filtros, 'data')),           [linhasFase, filtros]);
  const dadosMotorista  = useMemo(() => agruparPorMotorista(filtrarLinhas(linhasFase, filtros, 'motorista')), [linhasFase, filtros]);
  const dadosPlaca      = useMemo(() => agruparPorPlaca(filtrarLinhas(linhasFase, filtros, 'placa')),         [linhasFase, filtros]);
  const linhasFiltradas = useMemo(() => filtrarLinhas(linhasFase, filtros),                                   [linhasFase, filtros]);

  // ── KPI calculations — respondem a todos os filtros incluindo cross-filter ──
  const totalMapas = useMemo(
    () => new Set(filtrarLinhas(linhas, filtros).map(l => l.mapa).filter(Boolean)).size,
    [linhas, filtros]
  );

  const mapaOK = useMemo(() => {
    const metaMin = horaParaMinutos(metaHorario);
    const ok = new Set();
    linhasFiltradas.forEach(l => {
      if (!l.mapa) return;
      const isoOp = toISO(l.dataOperacao);
      const isoEm = toISO(l.dataEmissao);
      if (!isoOp || !isoEm) return;

      if (isoOp < isoEm) {
        // Operação anterior à emissão → OK automático
        ok.add(l.mapa);
      } else if (isoOp === isoEm && metaMin !== null) {
        // Mesmo dia → OK somente se hora <= meta
        const hMin = horaParaMinutos(l.horaOperacao);
        if (hMin !== null && hMin <= metaMin) ok.add(l.mapa);
      }
      // isoOp > isoEm → NOK automático (não adiciona)
    });
    return ok.size;
  }, [linhasFiltradas, metaHorario]);

  const mapaNOK    = useMemo(() => totalMapas - mapaOK, [totalMapas, mapaOK]);
  const efcPercent = useMemo(
    () => totalMapas > 0 ? Math.round(mapaOK / totalMapas * 100) : null,
    [mapaOK, totalMapas]
  );

  function toggle(dim, val) {
    setFiltros(prev => ({ ...prev, [dim]: prev[dim] === val ? null : val }));
  }
  function setGlobal(campo, val) {
    setFiltros(prev => ({ ...prev, [campo]: val }));
  }

  const temFiltroGlobal = filtros.revenda || filtros.frota || filtros.dataInicio || filtros.dataFim;
  const temFiltroChart  = filtros.data || filtros.motorista || filtros.placa;
  const temFiltro       = temFiltroGlobal || temFiltroChart;

  // ── Skeleton
  if (carregando) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <Skeleton height={10} width={80} radius={4} style={{ marginBottom: 10 }} />
            <Skeleton height={28} width={120} radius={6} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map(i => <Skeleton key={i} height={34} width={80} radius={8} />)}
          </div>
        </div>
        <Skeleton height={76} radius={D.radius} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={100} radius={D.radius} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Skeleton height={260} radius={D.radius} />
          <Skeleton height={260} radius={D.radius} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>Gestão MDP</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>{fase}</h1>
        </div>
        <TopbarNav current={loc.pathname} />
      </div>

      {/* ── Barra de filtros globais ── */}
      <div style={{
        background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius,
        padding: '16px 20px', boxShadow: D.shadow, marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end',
      }}>
        {/* Revenda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Revenda</label>
          <select
            className="mpd-select"
            value={filtros.revenda}
            onChange={e => setGlobal('revenda', e.target.value)}
            style={sSelect}
          >
            <option value="">Todas as revendas</option>
            {uniqueRevendas.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Frota */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Frota</label>
          <select
            className="mpd-select"
            value={filtros.frota}
            onChange={e => setGlobal('frota', e.target.value)}
            style={sSelect}
          >
            <option value="">Todas as frotas</option>
            {uniqueFrotas.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* Separador visual */}
        <div style={{ width: 1, height: 36, background: D.border, alignSelf: 'flex-end', marginBottom: 2 }} />

        {/* Data de */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Data de</label>
          <input
            type="date"
            className="mpd-input"
            value={filtros.dataInicio}
            onChange={e => setGlobal('dataInicio', e.target.value)}
            style={sInput}
          />
        </div>

        {/* Data até */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Data até</label>
          <input
            type="date"
            className="mpd-input"
            value={filtros.dataFim}
            onChange={e => setGlobal('dataFim', e.target.value)}
            style={sInput}
          />
        </div>

        {/* Limpar filtros globais */}
        {temFiltro && (
          <button
            className="mpd-btn-clear"
            onClick={() => setFiltros(FILTROS_VAZIOS)}
            style={{
              alignSelf: 'flex-end', padding: '7px 14px',
              background: 'none', border: `1px solid ${D.border}`, borderRadius: 8,
              cursor: 'pointer', fontSize: 12, color: D.textSec, fontFamily: D.font,
              transition: D.transition,
            }}
          >
            Limpar todos
          </button>
        )}
      </div>

      {/* ── Chips de cross-filter (cliques nos gráficos) ── */}
      {temFiltroChart && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, animation: 'fadeUp 0.25s ease both' }}>
          {filtros.data      && <Chip label={`Data: ${filtros.data}`}           onClear={() => toggle('data', filtros.data)} />}
          {filtros.motorista && <Chip label={`Motorista: ${filtros.motorista}`}  onClear={() => toggle('motorista', filtros.motorista)} />}
          {filtros.placa     && <Chip label={`Placa: ${filtros.placa}`}          onClear={() => toggle('placa', filtros.placa)} />}
        </div>
      )}

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
        <KPICard label="Mapa"      valor={totalMapas.toLocaleString('pt-BR')}                          cor={D.amber} sub="únicos" />
        <KPICard label={fase}      valor={efcPercent !== null ? `${efcPercent}%` : '—'}                cor={D.blue}  sub="eficiência" />
        <KPICard label="Meta"      valor={metaPercent !== null ? `${metaPercent}%` : '—'}              cor={D.green} sub="porcentagem" />
        <KPICard label="Mapas OK"  valor={mapaOK.toLocaleString('pt-BR')}  cor={D.green} sub="dentro da meta" />
        <KPICard label="Mapas NOK" valor={mapaNOK.toLocaleString('pt-BR')} cor={D.red}   sub="fora da meta" />
      </div>

      {/* ── Empty state / Gráficos ── */}
      {linhasFase.length === 0 ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState fase={fase} />
        </div>
      ) : (
        <>
          {/* ── Gráficos ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

            <ChartCard titulo="Operações por Data" badge={<span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>clique para filtrar</span>}>
              {dadosData.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dadosData} margin={{ top: 4, right: 4, left: -16, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} angle={-35} textAnchor="end" interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} allowDecimals={false} />
                    <Tooltip content={<TooltipCustom />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40} onClick={d => toggle('data', d.iso)} style={{ cursor: 'pointer' }}>
                      {dadosData.map(d => <Cell key={d.iso} fill={filtros.data && filtros.data !== d.iso ? D.borderLight : D.red} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard titulo="Top Motoristas" badge={<span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>clique para filtrar</span>}>
              {dadosMotorista.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dadosMotorista} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} width={110} />
                    <Tooltip content={<TooltipCustom />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} onClick={d => toggle('motorista', d.name)} style={{ cursor: 'pointer' }}>
                      {dadosMotorista.map(d => <Cell key={d.name} fill={filtros.motorista && filtros.motorista !== d.name ? D.borderLight : D.blue} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>

          <div style={{ marginBottom: 20 }}>
            <ChartCard titulo="Top Placas" badge={<span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>clique para filtrar</span>}>
              {dadosPlaca.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dadosPlaca} margin={{ top: 4, right: 4, left: -16, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} angle={-25} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} allowDecimals={false} />
                    <Tooltip content={<TooltipCustom />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36} onClick={d => toggle('placa', d.name)} style={{ cursor: 'pointer' }}>
                      {dadosPlaca.map(d => <Cell key={d.name} fill={filtros.placa && filtros.placa !== d.name ? D.borderLight : D.amber} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* ── Tabela ── */}
          <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden', boxShadow: D.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${D.borderLight}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: D.text, fontFamily: D.font }}>Detalhamento</span>
              </div>
              <span style={{ fontSize: 11.5, color: D.textMuted, fontFamily: D.font }}>
                {linhasFiltradas.length.toLocaleString('pt-BR')} registro(s)
                {temFiltro && <> — <strong style={{ color: D.red }}>filtro ativo</strong></>}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Revenda','Mapa','Placa','Frota','Data Emissão','Hora','Motorista','Usuário'].map(c => (
                      <th key={c} style={{ background: D.text, color: '#fff', padding: '9px 14px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11, fontFamily: D.font, letterSpacing: 0.3 }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.length === 0 ? (
                    <tr><td colSpan={8}><Vazio /></td></tr>
                  ) : (
                    linhasFiltradas.slice(0, 200).map((l, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                        <td style={tdS}>{l.revenda || '—'}</td>
                        <td style={tdS}>{l.mapa || '—'}</td>
                        <td style={{ ...tdS, fontWeight: 600, fontFamily: D.mono, fontSize: 11 }}>{l.placa || '—'}</td>
                        <td style={tdS}>{l.frotaCadastrada || '—'}</td>
                        <td style={tdS}>{l.dataEmissao || '—'}</td>
                        <td style={{ ...tdS, fontFamily: D.mono, fontSize: 11 }}>{l.horaOperacao || '—'}</td>
                        <td style={tdS}>{l.motorista || '—'}</td>
                        <td style={tdS}>{l.usuario || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {linhasFiltradas.length > 200 && (
              <div style={{ padding: '10px 20px', fontSize: 12, color: D.textMuted, borderTop: `1px solid ${D.borderLight}`, fontStyle: 'italic', fontFamily: D.font }}>
                Exibindo 200 de {linhasFiltradas.length.toLocaleString('pt-BR')} registros
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
