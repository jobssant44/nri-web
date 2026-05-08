import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';

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
  amber:       '#b45309',
  purple:      '#7c3aed',
  shadow:      '0 1px 2px rgba(15,23,42,0.03), 0 4px 16px rgba(15,23,42,0.04)',
  shadowMd:    '0 2px 8px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.05)',
  radius:      14,
  font:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
  mono:        "'JetBrains Mono', 'Fira Code', ui-monospace, 'Courier New', monospace",
  transition:  'all 0.22s cubic-bezier(0.16,1,0.3,1)',
};

const CORES_FASE = {
  EFC: D.red,
  EFD: D.blue,
  TI:  D.amber,
};

const STYLE_ID = 'mpd-hist-styles';
if (!document.getElementById(STYLE_ID)) {
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @keyframes fadeUp  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .mpd-hist-nav:hover { background: ${D.blueSoft} !important; color: ${D.blue} !important; border-color: ${D.blue} !important; }
    .mpd-hist-chip:hover { opacity: 0.8; }
    .recharts-wrapper, .recharts-wrapper svg,
    .recharts-wrapper *:focus, .recharts-surface { outline: none !important; }
  `;
  document.head.appendChild(st);
}

// ─── Utils ────────────────────────────────────────────────────────────────────
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

// ─── Filtro cruzado ───────────────────────────────────────────────────────────
function filtrar(linhas, filtros, excluir = null) {
  return linhas.filter(l => {
    if (excluir !== 'fase'      && filtros.fase      && String(l.fase ?? '').trim().toUpperCase() !== filtros.fase)      return false;
    if (excluir !== 'data'      && filtros.data      && toISO(l.dataOperacao) !== filtros.data)                          return false;
    if (excluir !== 'motorista' && filtros.motorista && l.motorista !== filtros.motorista)                               return false;
    return true;
  });
}

// ─── Agregadores ──────────────────────────────────────────────────────────────
function histPorFase(linhas) {
  const FASES = ['EFC', 'EFD', 'TI'];
  const mapa = new Map();
  linhas.forEach(l => {
    const f = String(l.fase ?? '').trim().toUpperCase();
    if (!FASES.includes(f)) return;
    const iso = toISO(l.dataOperacao);
    if (!iso) return;
    const cur = mapa.get(iso) ?? { iso, label: l.dataOperacao || iso, EFC: 0, EFD: 0, TI: 0 };
    mapa.set(iso, { ...cur, [f]: (cur[f] ?? 0) + 1 });
  });
  return [...mapa.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

function totalPorFase(linhas) {
  const acc = { EFC: 0, EFD: 0, TI: 0 };
  linhas.forEach(l => {
    const f = String(l.fase ?? '').trim().toUpperCase();
    if (f in acc) acc[f]++;
  });
  return acc;
}

function topPorFase(linhas, campo, top = 10) {
  const FASES = ['EFC', 'EFD', 'TI'];
  const mapa = new Map();
  linhas.forEach(l => {
    const f = String(l.fase ?? '').trim().toUpperCase();
    if (!FASES.includes(f)) return;
    const k = (l[campo] ?? '').trim() || '—';
    const cur = mapa.get(k) ?? { name: k, EFC: 0, EFD: 0, TI: 0 };
    mapa.set(k, { ...cur, [f]: (cur[f] ?? 0) + 1 });
  });
  return [...mapa.values()]
    .sort((a, b) => (b.EFC + b.EFD + b.TI) - (a.EFC + a.EFD + a.TI))
    .slice(0, top);
}

// ─── Componentes ──────────────────────────────────────────────────────────────
function TopbarNav({ current }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {PAGES.filter(p => p.path !== current).map(p => (
        <button key={p.path} className="mpd-hist-nav"
          onClick={() => navigate(p.path)}
          style={{ padding: '7px 16px', background: D.surface, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: D.textSec, fontFamily: D.font, letterSpacing: 0.2, transition: D.transition }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function KPICard({ label, valor, cor }) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderLeft: `3px solid ${cor}`, borderRadius: D.radius, padding: '18px 20px', boxShadow: D.shadow, animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -1, lineHeight: 1 }}>{valor}</div>
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

function Chip({ label, cor, onClear }) {
  return (
    <div className="mpd-hist-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 11px', background: `${cor}14`, border: `1px solid ${cor}44`, borderRadius: 8, fontSize: 11.5, color: cor, fontWeight: 600, fontFamily: D.font, cursor: 'default', transition: D.transition }}>
      {label}
      <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: cor, fontSize: 12, lineHeight: 1, padding: '1px 3px', borderRadius: 3, opacity: 0.7 }}>✕</button>
    </div>
  );
}

function Skeleton({ width = '100%', height = 20, radius = 6 }) {
  return (
    <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #f1f5f9 25%, #e8edf2 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.6s ease-in-out infinite' }} />
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

function EmptyState() {
  return (
    <div style={{ padding: '72px 24px', textAlign: 'center', animation: 'fadeUp 0.4s ease both' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: D.redSoft, border: `1px solid ${D.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <svg width="26" height="26" fill="none" stroke={D.red} strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8, fontFamily: D.font }}>Nenhum dado importado</div>
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
      <div style={{ fontWeight: 700, marginBottom: 6, color: D.text, fontSize: 12.5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.fill ?? p.color, fontWeight: 600, fontFamily: D.mono, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill ?? p.color, flexShrink: 0 }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

// ─── Página Histograma ────────────────────────────────────────────────────────
export default function HistogramaPage() {
  const loc = useLocation();
  const [linhas, setLinhas]         = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros]       = useState({ fase: null, data: null, motorista: null });

  useEffect(() => {
    let mounted = true;
    setCarregando(true);
    getDocs(collection(db, 'relatorio031120'))
      .then(snap => { if (mounted) setLinhas(snap.docs.map(d => d.data())); })
      .catch(() => {})
      .finally(() => { if (mounted) setCarregando(false); });
    return () => { mounted = false; };
  }, []);

  // Memos com filtro cruzado — cada chart exclui sua própria dimensão
  const dadosHist       = useMemo(() => histPorFase(filtrar(linhas, filtros, 'data')),           [linhas, filtros]);
  const dadosFaseTotais = useMemo(() => totalPorFase(filtrar(linhas, filtros, 'fase')),           [linhas, filtros]);
  const dadosMotorista  = useMemo(() => topPorFase(filtrar(linhas, filtros, 'motorista'), 'motorista', 12), [linhas, filtros]);

  const linhasFiltradas = useMemo(() => filtrar(linhas, filtros), [linhas, filtros]);

  function toggle(dim, val) {
    setFiltros(prev => ({ ...prev, [dim]: prev[dim] === val ? null : val }));
  }

  const temFiltro = filtros.fase || filtros.data || filtros.motorista;

  if (carregando) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
          <Skeleton height={28} width={180} radius={6} />
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,2,3].map(i => <Skeleton key={i} height={34} width={80} radius={8} />)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          {[1,2,3].map(i => <Skeleton key={i} height={90} radius={D.radius} />)}
        </div>
        <Skeleton height={300} radius={D.radius} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>Gestão MDP</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>Histograma</h1>
        </div>
        <TopbarNav current={loc.pathname} />
      </div>

      {/* Chips de filtro */}
      {temFiltro && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, animation: 'fadeUp 0.25s ease both' }}>
          {filtros.fase      && <Chip label={`Fase: ${filtros.fase}`}           cor={CORES_FASE[filtros.fase] ?? D.blue} onClear={() => toggle('fase', filtros.fase)} />}
          {filtros.data      && <Chip label={`Data: ${filtros.data}`}           cor={D.textSec}                          onClear={() => toggle('data', filtros.data)} />}
          {filtros.motorista && <Chip label={`Motorista: ${filtros.motorista}`} cor={D.textSec}                          onClear={() => toggle('motorista', filtros.motorista)} />}
          <button onClick={() => setFiltros({ fase: null, data: null, motorista: null })}
            style={{ background: 'none', border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 11.5, color: D.textSec, padding: '5px 12px', fontFamily: D.font, transition: D.transition }}>
            Limpar todos
          </button>
        </div>
      )}

      {/* Empty state */}
      {linhas.length === 0 ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState />
        </div>
      ) : (
        <>
          {/* KPI por fase (clicáveis) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            {['EFC', 'EFD', 'TI'].map(f => (
              <div
                key={f}
                onClick={() => toggle('fase', f)}
                style={{
                  background: filtros.fase === f ? `${CORES_FASE[f]}12` : D.surface,
                  border: `1.5px solid ${filtros.fase === f ? CORES_FASE[f] : D.border}`,
                  borderLeft: `3px solid ${CORES_FASE[f]}`,
                  borderRadius: D.radius,
                  padding: '18px 20px',
                  boxShadow: D.shadow,
                  cursor: 'pointer',
                  animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
                  transition: D.transition,
                }}
              >
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font, marginBottom: 10 }}>{f}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -1, lineHeight: 1 }}>
                  {(dadosFaseTotais[f] ?? 0).toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize: 10.5, color: D.textMuted, marginTop: 6, fontFamily: D.font }}>operações</div>
              </div>
            ))}
          </div>

          {/* Histograma por dia */}
          <div style={{ marginBottom: 20 }}>
            <ChartCard
              titulo="Distribuição por Data — todas as fases"
              badge={<span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>clique nas barras para filtrar por data</span>}
            >
              {dadosHist.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dadosHist} margin={{ top: 4, right: 4, left: -16, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} angle={-35} textAnchor="end" interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} allowDecimals={false} />
                    <Tooltip content={<TooltipCustom />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: D.font, paddingTop: 8 }} />
                    {['EFC', 'EFD', 'TI'].map(f => (
                      <Bar key={f} dataKey={f} stackId="a" fill={CORES_FASE[f]} maxBarSize={40}
                        onClick={(d) => toggle('data', d.iso)}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Top motoristas por fase */}
          <div style={{ marginBottom: 20 }}>
            <ChartCard
              titulo="Top Motoristas por Fase"
              badge={<span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>clique para filtrar por motorista</span>}
            >
              {dadosMotorista.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dadosMotorista} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} width={120} />
                    <Tooltip content={<TooltipCustom />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: D.font, paddingTop: 8 }} />
                    {['EFC', 'EFD', 'TI'].map(f => (
                      <Bar key={f} dataKey={f} stackId="a" fill={CORES_FASE[f]} maxBarSize={22}
                        onClick={(d) => toggle('motorista', d.name)}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Tabela resumo */}
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
                    {['Fase','Mapa','Placa','Data Operação','Hora','Motorista','Usuário'].map(c => (
                      <th key={c} style={{ background: D.text, color: '#fff', padding: '9px 14px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11, fontFamily: D.font, letterSpacing: 0.3 }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.length === 0 ? (
                    <tr><td colSpan={7}><Vazio /></td></tr>
                  ) : (
                    linhasFiltradas.slice(0, 200).map((l, i) => {
                      const fase = String(l.fase ?? '').trim().toUpperCase();
                      const cor  = CORES_FASE[fase] ?? D.textSec;
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                          <td style={{ padding: '8px 14px', borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 12, fontFamily: D.font }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', background: `${cor}14`, border: `1px solid ${cor}44`, borderRadius: 5, fontSize: 10.5, fontWeight: 700, color: cor, letterSpacing: 0.5 }}>{fase || '—'}</span>
                          </td>
                          <td style={{ padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 12, fontFamily: D.font }}>{l.mapa || '—'}</td>
                          <td style={{ padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 11, fontFamily: D.mono, fontWeight: 600 }}>{l.placa || '—'}</td>
                          <td style={{ padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 12, fontFamily: D.font }}>{l.dataOperacao || '—'}</td>
                          <td style={{ padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 11, fontFamily: D.mono }}>{l.horaOperacao || '—'}</td>
                          <td style={{ padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 12, fontFamily: D.font }}>{l.motorista || '—'}</td>
                          <td style={{ padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 12, fontFamily: D.font }}>{l.usuario || '—'}</td>
                        </tr>
                      );
                    })
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
