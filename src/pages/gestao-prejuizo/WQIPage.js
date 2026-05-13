import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts';

// ─── Mapeamento de motivos ─────────────────────────────────────────────────────
const MOTIVOS_WQI = {
  '901': 'Quebra por Movimentação',
  '902': 'Blitz de Puxada',
  '903': 'Perda / Diferença',
  '904': 'Prejuízo Inventário',
  '905': 'Micro Furo',
  '906': 'Quebra de FEFO',
  '907': 'Erro de Programação',
  '908': 'Furto / Sinistro',
};

function resolverMotivo(val) {
  const chave = String(val ?? '').trim();
  return MOTIVOS_WQI[chave] ?? chave;
}

function gerarChave(l) {
  return `${l.nota || 'SN'}_${l.produto || 'SP'}_${String(l.emissao || '').replace(/\//g, '')}`;
}

// ─── Design tokens ─────────────────────────────────────────────────────────────
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
  amber:       '#b45309',
  amberSoft:   'rgba(180,83,9,0.07)',
  green:       '#15803d',
  greenSoft:   'rgba(21,128,61,0.07)',
  greenBorder: 'rgba(21,128,61,0.20)',
  shadow:      '0 1px 2px rgba(15,23,42,0.03), 0 4px 16px rgba(15,23,42,0.04)',
  shadowMd:    '0 2px 8px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.05)',
  radius:      14,
  font:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
  mono:        "'JetBrains Mono', 'Fira Code', ui-monospace, 'Courier New', monospace",
  transition:  'all 0.22s cubic-bezier(0.16,1,0.3,1)',
};

// ─── Keyframes + outline Recharts ──────────────────────────────────────────────
const STYLE_TAG_ID = 'wqi-page-styles';
if (!document.getElementById(STYLE_TAG_ID)) {
  const st = document.createElement('style');
  st.id = STYLE_TAG_ID;
  st.textContent = `
    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .wqi-chip:hover { opacity: 0.8; }
    .wqi-btn-clear:hover  { border-color: ${D.red}  !important; color: ${D.red}  !important; }
    .wqi-btn-voltar:hover { border-color: ${D.blue} !important; color: ${D.blue} !important; }
    .wqi-btn-nav:hover    { background: ${D.blueSoft} !important; border-color: ${D.blue} !important; color: ${D.blue} !important; }
    .recharts-wrapper,
    .recharts-wrapper svg,
    .recharts-wrapper *:focus,
    .recharts-surface { outline: none !important; }
  `;
  document.head.appendChild(st);
}

// ─── Utilitários ───────────────────────────────────────────────────────────────
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
    if (after.length === 3 && /^\d+$/.test(after) && /^\d/.test(str))
      s = str.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDataBR(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function toISO(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMesAno(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const brl    = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const numFmt = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);

// ─── Componentes de UI ─────────────────────────────────────────────────────────

function TooltipBRL({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: 10, padding: '10px 14px',
      fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 5, color: D.text, fontSize: 12.5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? D.red, fontWeight: 600, fontFamily: D.mono, fontSize: 12 }}>
          {p.name}: {brl(p.value)}
        </div>
      ))}
    </div>
  );
}

function KPICardPrimary({ label, valor, cor, sub, destaque }) {
  return (
    <div style={{
      background: destaque ? cor : D.surface,
      border: `1px solid ${destaque ? cor : D.border}`,
      borderRadius: D.radius,
      padding: '28px 28px 24px',
      boxShadow: destaque ? `0 4px 24px ${cor}22` : D.shadow,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      minHeight: 120, animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: destaque ? 'rgba(255,255,255,0.7)' : D.textMuted, fontFamily: D.font, marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: destaque ? '#ffffff' : D.text, fontFamily: D.mono, letterSpacing: -1.5, lineHeight: 1 }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 11, color: destaque ? 'rgba(255,255,255,0.55)' : D.textMuted, marginTop: 8, fontFamily: D.font }}>{sub}</div>}
    </div>
  );
}

function KPICardSecondary({ label, valor, cor, sub }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `3px solid ${cor}`, borderRadius: D.radius,
      padding: '18px 20px', boxShadow: D.shadow,
      animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -0.8, lineHeight: 1 }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: D.textMuted, marginTop: 6, fontFamily: D.font }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ titulo, badge, children }) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '22px 24px', boxShadow: D.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2, fontFamily: D.font }}>{titulo}</span>
        </div>
        {badge}
      </div>
      <div style={{ borderTop: `1px solid ${D.borderLight}`, paddingTop: 18 }}>
        {children}
      </div>
    </div>
  );
}

function Chip({ label, onClear }) {
  return (
    <div className="wqi-chip" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 8px 5px 11px',
      background: D.redSoft, border: `1px solid ${D.redBorder}`,
      borderRadius: 8, fontSize: 11.5, color: D.red, fontWeight: 600,
      fontFamily: D.font, cursor: 'default', transition: D.transition,
    }}>
      {label}
      <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.red, fontSize: 12, lineHeight: 1, padding: '1px 3px', borderRadius: 4, opacity: 0.7, transition: D.transition }}>
        ✕
      </button>
    </div>
  );
}

function Vazio() {
  return (
    <div style={{ height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <svg width="24" height="24" fill="none" stroke={D.textMuted} strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <span style={{ fontSize: 12.5, color: D.textMuted, fontFamily: D.font, fontStyle: 'italic' }}>Sem dados para o filtro selecionado</span>
    </div>
  );
}

function Skeleton({ width = '100%', height = 20, radius = 6, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e8edf2 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.6s ease-in-out infinite',
      ...style,
    }} />
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '64px 24px', textAlign: 'center', animation: 'fadeUp 0.4s ease both' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: D.redSoft, border: `1px solid ${D.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <svg width="26" height="26" fill="none" stroke={D.red} strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8, fontFamily: D.font }}>
        Nenhum dado de WQI importado
      </div>
      <div style={{ fontSize: 13, color: D.textSec, maxWidth: 300, margin: '0 auto', lineHeight: 1.6, fontFamily: D.font }}>
        Importe o relatório <strong>03.02.37</strong> na página{' '}
        <strong>Importar relatórios</strong> para visualizar os dados.
      </div>
    </div>
  );
}

function BotaoVoltar({ onClick }) {
  return (
    <button className="wqi-btn-voltar" onClick={onClick} style={{
      background: 'none', border: `1px solid ${D.border}`, borderRadius: 8,
      cursor: 'pointer', color: D.textSec, fontSize: 12,
      padding: '7px 14px', fontWeight: 500, fontFamily: D.font,
      display: 'flex', alignItems: 'center', gap: 6, transition: D.transition,
    }}>
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
      </svg>
      Voltar
    </button>
  );
}

// ─── Tabela reutilizável ────────────────────────────────────────────────────────
function Tabela({ colunas, linhas, renderLinha, vazio = 'Sem registros' }) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden', boxShadow: D.shadow }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
          <thead>
            <tr>
              {colunas.map(c => (
                <th key={c} style={{ background: D.text, color: '#fff', padding: '9px 14px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11, letterSpacing: 0.3 }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0
              ? <tr><td colSpan={colunas.length} style={{ textAlign: 'center', padding: 28, color: D.textMuted, fontStyle: 'italic' }}>{vazio}</td></tr>
              : linhas.map((l, i) => renderLinha(l, i))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tdStyle = { padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap' };

// ─── Sub-página: Registro de Quebras ──────────────────────────────────────────

function RegistroDeQuebras({ onVoltar, linhasBase, colaboradores, areas, motivos, classificacoes, onSalvar }) {
  const { docRef, stamp } = useDb();
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim,    setFiltroDataFim]    = useState('');
  const [salvando,         setSalvando]         = useState({});

  async function salvar(chave, campo, valor) {
    setSalvando(prev => ({ ...prev, [chave]: true }));
    const atual = classificacoes[chave] || {};
    const novo  = { ...atual, [campo]: valor };
    try {
      await setDoc(docRef('prejuizo_classificacoes', chave), { ...novo, ...stamp() });
      onSalvar(chave, novo);
    } finally {
      setSalvando(prev => ({ ...prev, [chave]: false }));
    }
  }

  const linhasFiltradas = useMemo(() => {
    if (!filtroDataInicio && !filtroDataFim) return [];
    return linhasBase.filter(l => {
      const iso = toISO(l.emissao);
      if (!iso) return false;
      if (filtroDataInicio && iso < filtroDataInicio) return false;
      if (filtroDataFim   && iso > filtroDataFim)   return false;
      return true;
    });
  }, [linhasBase, filtroDataInicio, filtroDataFim]);

  const classificadas = linhasFiltradas.filter(l => classificacoes[gerarChave(l)]?.colaborador);
  const filtroAtivo   = filtroDataInicio || filtroDataFim;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 28, animation: 'fadeUp 0.3s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <BotaoVoltar onClick={onVoltar} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
            WQI
          </span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>
          Registro de Quebras
        </h1>
      </div>

      {/* Filtros */}
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '14px 20px', boxShadow: D.shadow, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={sLabel}>Data de</label>
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={sInput} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={sLabel}>Data até</label>
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={sInput} />
        </div>
        {linhasFiltradas.length > 0 && (
          <div style={{ alignSelf: 'flex-end', fontSize: 12, color: D.textSec, fontFamily: D.font, paddingBottom: 8 }}>
            <span style={{ fontWeight: 600, color: D.text }}>{linhasFiltradas.length}</span> registro(s) ·{' '}
            <span style={{ fontWeight: 600, color: D.green }}>{classificadas.length}</span> classificado(s)
          </div>
        )}
        {filtroAtivo && (
          <button className="wqi-btn-clear" onClick={() => { setFiltroDataInicio(''); setFiltroDataFim(''); }} style={sBtnClear}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {!filtroDataInicio && !filtroDataFim ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow, padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: D.blueSoft, border: `1px solid ${D.blueBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="22" height="22" fill="none" stroke={D.blue} strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 6, fontFamily: D.font }}>Selecione um período</div>
          <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.font }}>Use os filtros acima para carregar os registros do período desejado.</div>
        </div>
      ) : linhasFiltradas.length === 0 ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <Vazio />
        </div>
      ) : (
        <Tabela
          colunas={['Data', 'Cód. Produto', 'Descrição', 'R$ Perda', 'Colaborador', 'Área', 'Motivo']}
          linhas={linhasFiltradas}
          renderLinha={(l, i) => {
            const chave = gerarChave(l);
            const cls   = classificacoes[chave] || {};
            const load  = salvando[chave];
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                <td style={tdStyle}>{l.emissao || '—'}</td>
                <td style={tdStyle}>{l.produto  || '—'}</td>
                <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.descricao || '—'}</td>
                <td style={{ ...tdStyle, color: D.red, fontWeight: 700, fontFamily: D.mono }}>{brl(parseNum(l.valor))}</td>
                <td style={tdStyle}>
                  <select value={cls.colaborador || ''} disabled={load} onChange={e => salvar(chave, 'colaborador', e.target.value)} style={sSelectInline}>
                    <option value="">—</option>
                    {colaboradores.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <select value={cls.area || ''} disabled={load} onChange={e => salvar(chave, 'area', e.target.value)} style={sSelectInline}>
                    <option value="">—</option>
                    {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <select value={cls.motivo || ''} disabled={load} onChange={e => salvar(chave, 'motivo', e.target.value)} style={sSelectInline}>
                    <option value="">—</option>
                    {motivos.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
              </tr>
            );
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-página: Quebra por Ajudante ──────────────────────────────────────────

function QuebraPorAjudante({ onVoltar, linhasBase, classificacoes, colaboradores, areas, motivos }) {
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim,    setFiltroDataFim]    = useState('');
  const [filtroColab,      setFiltroColab]      = useState('');
  const [filtroArea,       setFiltroArea]       = useState('');
  const [filtroMotivo,     setFiltroMotivo]     = useState('');

  const linhasEnriquecidas = useMemo(() =>
    linhasBase.map(l => ({ ...l, ...(classificacoes[gerarChave(l)] || {}) })),
    [linhasBase, classificacoes]
  );

  const linhasFiltradas = useMemo(() => {
    return linhasEnriquecidas.filter(l => {
      if (filtroDataInicio || filtroDataFim) {
        const iso = toISO(l.emissao);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
      }
      if (filtroColab  && l.colaborador !== filtroColab)  return false;
      if (filtroArea   && l.area        !== filtroArea)   return false;
      if (filtroMotivo && l.motivo      !== filtroMotivo) return false;
      return true;
    });
  }, [linhasEnriquecidas, filtroDataInicio, filtroDataFim, filtroColab, filtroArea, filtroMotivo]);

  const classificadas    = useMemo(() => linhasFiltradas.filter(l => l.colaborador), [linhasFiltradas]);
  const naoClassificadas = linhasFiltradas.length - classificadas.length;
  const totalValor       = useMemo(() => linhasFiltradas.reduce((s, l) => s + parseNum(l.valor), 0), [linhasFiltradas]);
  const totalClass       = useMemo(() => classificadas.reduce((s, l) => s + parseNum(l.valor), 0), [classificadas]);

  const topProdutos = useMemo(() => {
    const map = {};
    classificadas.forEach(l => {
      const k = l.descricao || l.produto || '—';
      map[k] = (map[k] || 0) + parseNum(l.valor);
    });
    return Object.entries(map).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 6);
  }, [classificadas]);

  const porArea = useMemo(() => {
    const map = {};
    classificadas.filter(l => l.area).forEach(l => { map[l.area] = (map[l.area] || 0) + parseNum(l.valor); });
    return Object.entries(map).map(([area, valor]) => ({ area, valor })).sort((a, b) => b.valor - a.valor);
  }, [classificadas]);

  const porMotivoClass = useMemo(() => {
    const map = {};
    classificadas.filter(l => l.motivo).forEach(l => { map[l.motivo] = (map[l.motivo] || 0) + parseNum(l.valor); });
    return Object.entries(map).map(([motivo, valor]) => ({ motivo, valor })).sort((a, b) => b.valor - a.valor);
  }, [classificadas]);

  const filtroAtivo = filtroDataInicio || filtroDataFim || filtroColab || filtroArea || filtroMotivo;

  function limparFiltros() {
    setFiltroDataInicio(''); setFiltroDataFim('');
    setFiltroColab(''); setFiltroArea(''); setFiltroMotivo('');
  }

  const maxProduto = topProdutos[0]?.valor || 1;
  const maxArea    = porArea[0]?.valor     || 1;
  const maxMotivo  = porMotivoClass[0]?.valor || 1;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 28, animation: 'fadeUp 0.3s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <BotaoVoltar onClick={onVoltar} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>WQI</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>
          Quebra por Ajudante
        </h1>
      </div>

      {/* Filtros */}
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '14px 20px', boxShadow: D.shadow, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        {[
          { label: 'Data de',     node: <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={sInput} /> },
          { label: 'Data até',    node: <input type="date" value={filtroDataFim}    onChange={e => setFiltroDataFim(e.target.value)}    style={sInput} /> },
          { label: 'Colaborador', node: (
            <select value={filtroColab} onChange={e => setFiltroColab(e.target.value)} style={sInput}>
              <option value="">Todos</option>
              {colaboradores.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )},
          { label: 'Área', node: (
            <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={sInput}>
              <option value="">Todas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )},
          { label: 'Motivo', node: (
            <select value={filtroMotivo} onChange={e => setFiltroMotivo(e.target.value)} style={sInput}>
              <option value="">Todos</option>
              {motivos.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )},
        ].map(({ label, node }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={sLabel}>{label}</label>
            {node}
          </div>
        ))}
        {filtroAtivo && (
          <button className="wqi-btn-clear" onClick={limparFiltros} style={sBtnClear}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* 4 cards — bento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>

        {/* Card resumo */}
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderLeft: `3px solid ${D.red}`, borderRadius: D.radius, padding: '20px', boxShadow: D.shadow, animation: 'fadeUp 0.35s ease both' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font, marginBottom: 10 }}>R$ Perda Total</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -1, lineHeight: 1, marginBottom: 14 }}>{brl(totalValor)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: D.font }}>
              <span style={{ color: D.textSec }}>Classificado</span>
              <span style={{ color: D.green, fontWeight: 700, fontFamily: D.mono }}>{brl(totalClass)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: D.font }}>
              <span style={{ color: D.textSec }}>Sem classif.</span>
              <span style={{ color: D.textMuted, fontWeight: 600, fontFamily: D.mono }}>{naoClassificadas}</span>
            </div>
          </div>
        </div>

        {/* Card top produtos */}
        <MiniRanking titulo="Top Produtos" itens={topProdutos.map(p => ({ label: p.nome, valor: p.valor }))} cor={D.red} max={maxProduto} />

        {/* Card por área */}
        <MiniRanking titulo="Por Área" itens={porArea.map(a => ({ label: a.area, valor: a.valor }))} cor={D.blue} max={maxArea} />

        {/* Card por motivo */}
        <MiniRanking titulo="Por Motivo" itens={porMotivoClass.map(m => ({ label: m.motivo, valor: m.valor }))} cor={D.amber} max={maxMotivo} />
      </div>

      {/* Tabela detalhada (apenas quando colaborador selecionado) */}
      {filtroColab && (
        <div style={{ animation: 'fadeUp 0.3s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: D.text, fontFamily: D.font }}>
              Quebras — {filtroColab}
            </span>
            <span style={{ fontSize: 12, color: D.textSec, fontFamily: D.font }}>
              {linhasFiltradas.length} registro(s) · {brl(totalValor)}
            </span>
          </div>
          <Tabela
            colunas={['Data', 'Cód. Produto', 'Descrição', 'R$ Perda', 'Área', 'Motivo']}
            linhas={linhasFiltradas}
            renderLinha={(l, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                <td style={tdStyle}>{l.emissao || '—'}</td>
                <td style={tdStyle}>{l.produto  || '—'}</td>
                <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.descricao || '—'}</td>
                <td style={{ ...tdStyle, color: D.red, fontWeight: 700, fontFamily: D.mono }}>{brl(parseNum(l.valor))}</td>
                <td style={tdStyle}>{l.area   || '—'}</td>
                <td style={tdStyle}>{l.motivo || '—'}</td>
              </tr>
            )}
          />
        </div>
      )}
    </div>
  );
}

function MiniRanking({ titulo, itens, cor, max }) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderLeft: `3px solid ${cor}`, borderRadius: D.radius, padding: '20px', boxShadow: D.shadow, animation: 'fadeUp 0.4s ease both' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font, marginBottom: 12 }}>{titulo}</div>
      {itens.length === 0
        ? <div style={{ fontSize: 11, color: D.textMuted, fontStyle: 'italic', fontFamily: D.font }}>Sem dados classificados</div>
        : itens.map(({ label, valor }) => (
          <div key={label} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, fontFamily: D.font }}>
              <span style={{ color: D.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{label}</span>
              <span style={{ color: cor, fontWeight: 700, flexShrink: 0, marginLeft: 4, fontFamily: D.mono }}>{brl(valor)}</span>
            </div>
            <div style={{ height: 3, background: D.borderLight, borderRadius: 2 }}>
              <div style={{ height: 3, width: `${(valor / max) * 100}%`, background: cor, borderRadius: 2 }} />
            </div>
          </div>
        ))
      }
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function WQIPage() {
  const { col, colRevenda } = useDb();
  const [linhasBase,       setLinhasBase]       = useState([]);
  const [hectoBase,        setHectoBase]        = useState([]);
  const [colaboradores,    setColaboradores]    = useState([]);
  const [areas,            setAreas]            = useState([]);
  const [motivos,          setMotivos]          = useState([]);
  const [classificacoes,   setClassificacoes]   = useState({});
  const [topN,             setTopN]             = useState(10);
  const [subPagina,        setSubPagina]        = useState('wqi');
  const [carregando,       setCarregando]       = useState(true);
  const [erro,             setErro]             = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim,    setFiltroDataFim]    = useState('');
  const [filtroMotivo,     setFiltroMotivo]     = useState('');

  useEffect(() => {
    async function carregar() {
      try {
        const [snap030237, snapHecto, snapColabs, snapAreas, snapMotivos, snapClass] = await Promise.all([
          getDocs(colRevenda('relatorio_030237')),
          getDocs(colRevenda('relatorio_030147hecto')),
          getDocs(col('prejuizo_colaboradores')),
          getDocs(col('prejuizo_areas')),
          getDocs(col('prejuizo_motivos')),
          getDocs(colRevenda('prejuizo_classificacoes')),
        ]);
        const todas = [];
        snap030237.docs.forEach(d => {
          (d.data().linhas || []).forEach(l => {
            const op = parseInt(l.operacao, 10);
            if (op < 101 || op > 108) return;
            if (String(l.status ?? '').trim().toUpperCase() === 'C') return;
            todas.push(l);
          });
        });
        setLinhasBase(todas);
        setHectoBase(snapHecto.docs.map(d => d.data()));
        setColaboradores(snapColabs.docs.map(d => d.data().nome).filter(Boolean).sort());
        setAreas(snapAreas.docs.map(d => d.data().nome).filter(Boolean).sort());
        setMotivos(snapMotivos.docs.map(d => d.data().nome).filter(Boolean).sort());
        const clsMap = {};
        snapClass.docs.forEach(d => { clsMap[d.id] = d.data(); });
        setClassificacoes(clsMap);
      } catch (e) {
        setErro('Erro ao carregar dados: ' + e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  function handleSalvarClassificacao(chave, dados) {
    setClassificacoes(prev => ({ ...prev, [chave]: dados }));
  }

  const motivosUnicos = useMemo(() => {
    const set = new Set(linhasBase.map(l => resolverMotivo(l.vendedor)).filter(Boolean));
    return [...set].sort();
  }, [linhasBase]);

  const filtradas = useMemo(() => {
    return linhasBase.filter(l => {
      if (filtroDataInicio || filtroDataFim) {
        const iso = toISO(l.emissao);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
      }
      if (filtroMotivo && resolverMotivo(l.vendedor) !== filtroMotivo) return false;
      return true;
    });
  }, [linhasBase, filtroDataInicio, filtroDataFim, filtroMotivo]);

  const totalHecto = useMemo(() => {
    return hectoBase
      .filter(h => {
        if (!filtroDataInicio && !filtroDataFim) return true;
        const iso = toISO(h.data);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
        return true;
      })
      .reduce((s, h) => s + parseNum(h.totalHecto), 0);
  }, [hectoBase, filtroDataInicio, filtroDataFim]);

  const totalValor = useMemo(
    () => filtradas.reduce((s, l) => s + parseNum(l.valor), 0),
    [filtradas]
  );

  const porMotivo = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const m = resolverMotivo(l.vendedor) || '(Em branco)';
      map[m] = (map[m] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([motivo, valor]) => ({ motivo, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor);
  }, [filtradas]);

  const topEmbalagem = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const e = l.descricao || l.produto || '(Em branco)';
      map[e] = (map[e] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([embalagem, valor]) => ({ embalagem, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, topN);
  }, [filtradas, topN]);

  const porDia = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const d = l.emissao ? String(l.emissao).trim() : null;
      if (!d) return;
      map[d] = (map[d] || 0) + parseNum(l.valor);
    });
    const hectoMap = {};
    hectoBase.forEach(h => {
      const iso = toISO(h.data);
      if (iso) hectoMap[iso] = (hectoMap[iso] || 0) + parseNum(h.totalHecto);
    });
    return Object.entries(map)
      .sort(([a], [b]) => (parseDataBR(a) || 0) - (parseDataBR(b) || 0))
      .map(([dia, valor]) => {
        const dataAtual = parseDataBR(dia);
        let meta = null;
        if (dataAtual) {
          const buscarHecto = n => {
            const d = new Date(dataAtual); d.setDate(d.getDate() - n);
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return hectoMap[iso] || 0;
          };
          const hecto = buscarHecto(1) || buscarHecto(2);
          if (hecto > 0) meta = Math.round(hecto * 0.50 * 100) / 100;
        }
        return { dia, valor: Math.round(valor * 100) / 100, meta };
      });
  }, [filtradas, hectoBase]);

  const porMes = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const m = toMesAno(l.emissao);
      if (m) map[m] = (map[m] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .sort(([a], [b]) => {
        const [ma, ya] = a.split('/').map(Number);
        const [mb, yb] = b.split('/').map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      })
      .map(([mes, valor]) => ({ mes, valor: Math.round(valor * 100) / 100 }));
  }, [filtradas]);

  // ── Sub-páginas ──────────────────────────────────────────────────────────────
  if (subPagina === 'registro') {
    return <RegistroDeQuebras onVoltar={() => setSubPagina('wqi')} linhasBase={linhasBase} colaboradores={colaboradores} areas={areas} motivos={motivos} classificacoes={classificacoes} onSalvar={handleSalvarClassificacao} />;
  }
  if (subPagina === 'ajudante') {
    return <QuebraPorAjudante onVoltar={() => setSubPagina('wqi')} linhasBase={linhasBase} classificacoes={classificacoes} colaboradores={colaboradores} areas={areas} motivos={motivos} />;
  }

  // ── Skeleton loading ─────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: D.font }}>
        <div style={{ marginBottom: 32 }}>
          <Skeleton width={120} height={11} radius={4} style={{ marginBottom: 10 }} />
          <Skeleton width={280} height={28} radius={6} style={{ marginBottom: 8 }} />
          <Skeleton width={200} height={13} radius={4} />
        </div>
        <Skeleton height={60} radius={D.radius} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Skeleton height={120} radius={D.radius} />
          <Skeleton height={120} radius={D.radius} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <Skeleton height={88} radius={D.radius} />
          <Skeleton height={88} radius={D.radius} />
          <Skeleton height={88} radius={D.radius} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Skeleton height={280} radius={D.radius} />
          <Skeleton height={280} radius={D.radius} />
        </div>
        <Skeleton height={260} radius={D.radius} style={{ marginBottom: 16 }} />
        <Skeleton height={280} radius={D.radius} />
      </div>
    );
  }

  const filtroAtivo = filtroDataInicio || filtroDataFim || filtroMotivo;
  const temDados    = linhasBase.length > 0;
  const metaRS      = totalHecto * 0.50;
  const saldo       = metaRS - totalValor;
  const dentroMeta  = saldo >= 0;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: D.font }}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, animation: 'fadeUp 0.3s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
                Gestão de Prejuízo
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>
              Warehouse Quality Index
            </h1>
            {linhasBase.length > 0 && (
              <p style={{ fontSize: 12, color: D.textMuted, margin: '6px 0 0', fontFamily: D.font }}>
                {linhasBase.length.toLocaleString('pt-BR')} registros
                {filtroAtivo ? ` · ${filtradas.length.toLocaleString('pt-BR')} após filtros` : ''}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="wqi-btn-nav" onClick={() => setSubPagina('registro')} style={sBtnNav}>
              Registro de Quebras
            </button>
            <button className="wqi-btn-nav" onClick={() => setSubPagina('ajudante')} style={sBtnNav}>
              Quebra por Ajudante
            </button>
          </div>
        </div>
      </div>

      {/* ── Erro ───────────────────────────────────────────────────────────── */}
      {erro && (
        <div style={{ padding: '12px 16px', background: D.redSoft, color: D.red, borderRadius: 10, border: `1px solid ${D.redBorder}`, marginBottom: 20, fontSize: 13, fontWeight: 500 }}>
          {erro}
        </div>
      )}

      {/* ── Filtros de barra ───────────────────────────────────────────────── */}
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '14px 20px', boxShadow: D.shadow, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={sLabel}>Data de</label>
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={sInput} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={sLabel}>Data até</label>
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={sInput} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={sLabel}>Motivo</label>
          <select value={filtroMotivo} onChange={e => setFiltroMotivo(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {motivosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {filtroAtivo && (
          <button className="wqi-btn-clear" onClick={() => { setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroMotivo(''); }} style={sBtnClear}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── KPIs — bento assimétrico ────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <KPICardPrimary label="R$ Perda Total" valor={brl(totalValor)} cor={D.red} />
          <KPICardPrimary
            label={dentroMeta ? 'Economia' : 'Estouro'}
            valor={brl(Math.abs(saldo))}
            cor={dentroMeta ? D.green : D.red}
            sub="Meta − R$ Perda"
            destaque
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <KPICardSecondary label="Hecto Entregue" valor={numFmt(totalHecto)} cor={D.blue} />
          <KPICardSecondary label="Meta R$" valor={brl(metaRS)} cor={D.amber} sub="R$ 0,50 × Hecto" />
          <KPICardSecondary label="Perda R$/HL" valor={totalHecto > 0 ? brl(totalValor / totalHecto) : '—'} cor={D.green} sub="R$ Perda ÷ Hecto" />
        </div>
      </div>

      {/* ── Sem dados ──────────────────────────────────────────────────────── */}
      {!temDados && (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState />
        </div>
      )}

      {temDados && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Chips de filtro ativo ─────────────────────────────────────── */}
          {filtroAtivo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 16px', background: D.surface, border: `1px solid ${D.redBorder}`, borderRadius: D.radius, boxShadow: D.shadow, animation: 'fadeUp 0.25s ease both' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted }}>Filtros ativos</span>
              <div style={{ width: 1, height: 14, background: D.border }} />
              {filtroDataInicio && <Chip label={`De: ${filtroDataInicio}`} onClear={() => setFiltroDataInicio('')} />}
              {filtroDataFim    && <Chip label={`Até: ${filtroDataFim}`}   onClear={() => setFiltroDataFim('')} />}
              {filtroMotivo     && <Chip label={filtroMotivo}              onClear={() => setFiltroMotivo('')} />}
            </div>
          )}

          {/* ── Motivo + Embalagem lado a lado ───────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <ChartCard titulo="R$ Perda por Motivo">
              {porMotivo.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, porMotivo.length * 38), 380)}>
                  <BarChart data={porMotivo} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="motivo" width={140} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 20 ? v.slice(0, 20) + '…' : v} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.blueSoft }} />
                    <Bar dataKey="valor" name="R$ Perda" fill={D.blue} radius={[0, 5, 5, 0]}
                      label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              titulo={`Top ${topN} R$ Perda por Embalagem`}
              badge={
                <select value={topN} onChange={e => setTopN(Number(e.target.value))} style={{ ...sInput, fontSize: 11, padding: '4px 8px', minWidth: 'auto' }}>
                  {[1, 3, 5, 10, 15, 20].map(n => <option key={n} value={n}>Top {n}</option>)}
                </select>
              }
            >
              {topEmbalagem.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, topEmbalagem.length * 34), 360)}>
                  <BarChart data={topEmbalagem} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="embalagem" width={130} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.redSoft }} />
                    <Bar dataKey="valor" name="R$ Perda" radius={[0, 5, 5, 0]}
                      label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
                      {topEmbalagem.map((_, i) => <Cell key={i} fill={D.red} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>

          {/* ── R$ Perda por Mês ─────────────────────────────────────────── */}
          <ChartCard titulo="R$ Perda — Mês a Mês">
            {porMes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={porMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} />
                  <Line type="linear" dataKey="valor" name="R$ Perda" stroke={D.red} strokeWidth={2} dot={{ r: 4, fill: D.red }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ── R$ Perda por Dia (com meta) ───────────────────────────────── */}
          <ChartCard titulo="R$ Perda — Dia a Dia">
            {porDia.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={porDia} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: D.font, paddingTop: 8 }} />
                  <Line type="linear" dataKey="valor" name="R$ Perda" stroke={D.blue} strokeWidth={2} dot={{ r: 3, fill: D.blue }} activeDot={{ r: 6 }} />
                  <Line type="linear" dataKey="meta" name="Meta (R$0,50 × HL anterior)" stroke={D.red} strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 5 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

        </div>
      )}
    </div>
  );
}

// ─── Estilos base ──────────────────────────────────────────────────────────────
const sLabel = { fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted };
const sInput = {
  padding: '7px 10px', border: `1px solid ${D.border}`, borderRadius: 8,
  fontSize: 13, color: D.text, backgroundColor: D.surface,
  minWidth: 150, fontFamily: D.font, outline: 'none', transition: D.transition,
};
const sBtnClear = {
  padding: '8px 14px', background: 'transparent',
  border: `1px solid ${D.border}`, borderRadius: 8,
  fontSize: 12, color: D.textSec, cursor: 'pointer',
  fontWeight: 500, transition: D.transition, alignSelf: 'flex-end', fontFamily: D.font,
};
const sBtnNav = {
  padding: '8px 16px', background: 'transparent',
  border: `1px solid ${D.border}`, borderRadius: 8,
  fontSize: 12, color: D.textSec, cursor: 'pointer',
  fontWeight: 500, transition: D.transition, fontFamily: D.font,
};
const sSelectInline = {
  padding: '4px 8px', border: `1px solid ${D.border}`, borderRadius: 6,
  fontSize: 11, color: D.textSec, cursor: 'pointer',
  minWidth: 120, fontFamily: D.font, outline: 'none', background: D.surface,
};
