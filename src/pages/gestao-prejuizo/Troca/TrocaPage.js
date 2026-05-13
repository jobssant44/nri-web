import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useDb } from '../../../utils/db';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg:        '#f8fafc',
  surface:   '#ffffff',
  border:    '#e2e8f0',
  borderLight: '#f1f5f9',
  text:      '#0f172a',
  textSec:   '#475569',
  textMuted: '#94a3b8',
  red:       '#E31837',
  redSoft:   'rgba(227,24,55,0.07)',
  redBorder: 'rgba(227,24,55,0.18)',
  blue:      '#1D5A9E',
  blueSoft:  'rgba(29,90,158,0.07)',
  amber:     '#b45309',
  amberSoft: 'rgba(180,83,9,0.07)',
  green:     '#15803d',
  greenSoft: 'rgba(21,128,61,0.07)',
  greenBorder:'rgba(21,128,61,0.20)',
  shadow:    '0 1px 2px rgba(15,23,42,0.03), 0 4px 16px rgba(15,23,42,0.04)',
  shadowMd:  '0 2px 8px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.05)',
  radius:    14,
  font:      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
  mono:      "'JetBrains Mono', 'Fira Code', ui-monospace, 'Courier New', monospace",
  transition:'all 0.22s cubic-bezier(0.16,1,0.3,1)',
};

// ─── Keyframes injetados uma vez ──────────────────────────────────────────────
const STYLE_TAG_ID = 'troca-page-styles';
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
    .troca-chip:hover { opacity: 0.8; }
    .troca-btn-clear:hover { border-color: ${D.red} !important; color: ${D.red} !important; }
    .troca-bar-hover:hover { opacity: 0.9; }
    .recharts-wrapper,
    .recharts-wrapper svg,
    .recharts-wrapper *:focus,
    .recharts-surface { outline: none !important; }
  `;
  document.head.appendChild(st);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val ?? '').trim().replace(/\s/g, '');
  if (!str || str === '-') return 0;
  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  let s = str;
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(/,/g, '');
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

function mesAnoParaISO(mesAno) {
  if (!mesAno) return '';
  const [mm, yyyy] = mesAno.split('/');
  return `${yyyy}-${mm}`;
}

function isoParaBR(iso) {
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

const getNome     = l => l.descricao || l.codProduto || '—';
const getCliente  = l => l.nomeCliente || l.cliente || '—';
const getRN   = l => {
  const rn = String(l.rn || '').trim();
  if (!rn) return '(sem RN)';
  const s = rn.replace(/^0+/, '');
  return s || rn;
};

const brl    = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const numFmt = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);

// ─── Filtro cruzado ───────────────────────────────────────────────────────────
function filtrarLinhas(linhas, { excluir, filtroRN, filtroProduto, filtroMes, filtroDia, filtroCliente }) {
  return linhas.filter(l => {
    if (excluir !== 'rn'       && filtroRN       && getRN(l)         !== filtroRN)       return false;
    if (excluir !== 'produto'  && filtroProduto  && getNome(l)        !== filtroProduto)  return false;
    if (excluir !== 'mes'      && filtroMes      && toMesAno(l.data)  !== filtroMes)      return false;
    if (excluir !== 'dia'      && filtroDia      && toISO(l.data)     !== filtroDia)      return false;
    if (excluir !== 'cliente'  && filtroCliente  && getCliente(l)     !== filtroCliente)  return false;
    return true;
  });
}

// ─── Componentes de UI ────────────────────────────────────────────────────────

function TooltipBRL({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: D.surface,
      border: `1px solid ${D.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      boxShadow: D.shadowMd,
      fontFamily: D.font,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 5, color: D.text, fontSize: 12.5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? D.red, fontWeight: 600, fontFamily: D.mono, fontSize: 12 }}>
          {brl(p.value)}
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
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      minHeight: 120,
      animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: destaque ? 'rgba(255,255,255,0.7)' : D.textMuted,
        fontFamily: D.font,
        marginBottom: 12,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 32,
        fontWeight: 800,
        color: destaque ? '#ffffff' : D.text,
        fontFamily: D.mono,
        letterSpacing: -1.5,
        lineHeight: 1,
      }}>
        {valor}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: destaque ? 'rgba(255,255,255,0.55)' : D.textMuted, marginTop: 8, fontFamily: D.font }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function KPICardSecondary({ label, valor, cor, sub }) {
  return (
    <div style={{
      background: D.surface,
      border: `1px solid ${D.border}`,
      borderLeft: `3px solid ${cor}`,
      borderRadius: D.radius,
      padding: '18px 20px',
      boxShadow: D.shadow,
      animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: D.textMuted,
        fontFamily: D.font,
        marginBottom: 10,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 800,
        color: D.text,
        fontFamily: D.mono,
        letterSpacing: -0.8,
        lineHeight: 1,
      }}>
        {valor}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: D.textMuted, marginTop: 6, fontFamily: D.font }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ChartCard({ titulo, badge, children }) {
  return (
    <div style={{
      background: D.surface,
      border: `1px solid ${D.border}`,
      borderRadius: D.radius,
      padding: '22px 24px',
      boxShadow: D.shadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2, fontFamily: D.font }}>
            {typeof titulo === 'string' ? titulo : titulo}
          </span>
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
    <div className="troca-chip" style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 8px 5px 11px',
      background: D.redSoft,
      border: `1px solid ${D.redBorder}`,
      borderRadius: 8,
      fontSize: 11.5,
      color: D.red,
      fontWeight: 600,
      fontFamily: D.font,
      cursor: 'default',
      transition: D.transition,
    }}>
      {label}
      <button
        onClick={onClear}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: D.red,
          fontSize: 12,
          lineHeight: 1,
          padding: '1px 3px',
          borderRadius: 4,
          opacity: 0.7,
          transition: D.transition,
        }}
      >
        ✕
      </button>
    </div>
  );
}

function Vazio() {
  return (
    <div style={{
      height: 120,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    }}>
      <svg width="24" height="24" fill="none" stroke={D.textMuted} strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <span style={{ fontSize: 12.5, color: D.textMuted, fontFamily: D.font, fontStyle: 'italic' }}>
        Sem dados para o filtro selecionado
      </span>
    </div>
  );
}

function Skeleton({ width = '100%', height = 20, radius = 6, style = {} }) {
  return (
    <div style={{
      width, height,
      borderRadius: radius,
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
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 16,
        background: D.redSoft,
        border: `1px solid ${D.redBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <svg width="26" height="26" fill="none" stroke={D.red} strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8, fontFamily: D.font }}>
        Nenhum dado de troca importado
      </div>
      <div style={{ fontSize: 13, color: D.textSec, maxWidth: 300, margin: '0 auto', lineHeight: 1.6, fontFamily: D.font }}>
        Importe o relatório <strong>03.02.37</strong> na página{' '}
        <strong>Importar relatórios</strong> para visualizar os dados.
      </div>
    </div>
  );
}

function DotDia({ cx, cy, payload, filtroDia }) {
  const selected = filtroDia && filtroDia === payload?.iso;
  return (
    <circle
      cx={cx} cy={cy}
      r={selected ? 6 : 3}
      fill={selected ? '#fff' : D.green}
      stroke={D.green}
      strokeWidth={selected ? 2.5 : 0}
    />
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function TrocaPage() {
  const { col, colRevenda } = useDb();
  const [linhasBase,       setLinhasBase]       = useState([]);
  const [hectoBase,        setHectoBase]        = useState([]);
  const [carregando,       setCarregando]       = useState(true);
  const [erro,             setErro]             = useState('');

  const [filtroRevenda,    setFiltroRevenda]    = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim,    setFiltroDataFim]    = useState('');

  const [filtroRN,       setFiltroRN]       = useState('');
  const [filtroProduto,  setFiltroProduto]  = useState('');
  const [filtroMes,      setFiltroMes]      = useState('');
  const [filtroDia,      setFiltroDia]      = useState('');
  const [filtroCliente,  setFiltroCliente]  = useState('');

  const [topN,        setTopN]        = useState(10);
  const [topNCliente, setTopNCliente] = useState(10);

  useEffect(() => {
    async function carregar() {
      try {
        const [snapTroca, snapHecto] = await Promise.all([
          getDocs(colRevenda('relatorio_030237')),
          getDocs(colRevenda('relatorio_030147hecto')),
        ]);
        const todas = [];
        snapTroca.docs.forEach(d => {
          (d.data().linhas || []).forEach(l => {
            // Pré-filtros: Operação = 5 · Status = A · Origem = Digitado
            const opNum  = parseFloat(String(l.operacao      || '').trim().replace(',', '.'));
            const status = String(l.status        || '').trim().toUpperCase();
            const origem = String(l.origemPedido  || '').trim().toLowerCase();
            if (opNum !== 5 || status !== 'A' || origem !== 'digitado') return;
            // Normaliza campos para o restante do componente
            todas.push({
              ...l,
              data:        l.dataOperacao || l.data || '',
              nomeCliente: l.nome         || l.nomeCliente || '',
              codProduto:  l.produto      || l.codProduto  || '',
            });
          });
        });
        setLinhasBase(todas);
        setHectoBase(snapHecto.docs.map(d => d.data()));
      } catch (e) {
        setErro('Erro ao carregar dados: ' + e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  const linhasFiltradas = useMemo(() => {
    return linhasBase.filter(l => {
      if (filtroDataInicio || filtroDataFim) {
        const iso = toISO(l.data);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
      }
      return true;
    });
  }, [linhasBase, filtroDataInicio, filtroDataFim]);

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

  const totalTroca = useMemo(
    () => linhasFiltradas.reduce((s, l) => s + parseNum(l.valor), 0),
    [linhasFiltradas]
  );
  const metaTroca = totalHecto * 0.20;
  const trocaRsHL = totalHecto > 0 ? totalTroca / totalHecto : 0;
  const saldo     = metaTroca - totalTroca;
  const economia  = saldo >= 0;

  const filtrosInterativos = { filtroRN, filtroProduto, filtroMes, filtroDia, filtroCliente };

  const linhasParaRN = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'rn', ...filtrosInterativos }),
    [linhasFiltradas, filtroProduto, filtroMes, filtroDia, filtroCliente] // eslint-disable-line
  );
  const linhasParaProdutos = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'produto', ...filtrosInterativos }),
    [linhasFiltradas, filtroRN, filtroMes, filtroDia, filtroCliente] // eslint-disable-line
  );
  const linhasParaMes = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'mes', ...filtrosInterativos }),
    [linhasFiltradas, filtroRN, filtroProduto, filtroDia, filtroCliente] // eslint-disable-line
  );
  const linhasParaDia = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'dia', ...filtrosInterativos }),
    [linhasFiltradas, filtroRN, filtroProduto, filtroMes, filtroCliente] // eslint-disable-line
  );
  const linhasParaCliente = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'cliente', ...filtrosInterativos }),
    [linhasFiltradas, filtroRN, filtroProduto, filtroMes, filtroDia] // eslint-disable-line
  );

  const dadosRN = useMemo(() => {
    const map = {};
    linhasParaRN.forEach(l => {
      const rn = getRN(l);
      map[rn] = (map[rn] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([rn, valor]) => ({ rn, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor);
  }, [linhasParaRN]);

  const dadosProdutos = useMemo(() => {
    const map = {};
    linhasParaProdutos.forEach(l => {
      const nome = getNome(l);
      map[nome] = (map[nome] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, topN);
  }, [linhasParaProdutos, topN]);

  const dadosMes = useMemo(() => {
    const map = {};
    linhasParaMes.forEach(l => {
      const mes = toMesAno(l.data);
      if (!mes) return;
      map[mes] = (map[mes] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([mes, valor]) => ({ mes, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => mesAnoParaISO(a.mes).localeCompare(mesAnoParaISO(b.mes)));
  }, [linhasParaMes]);

  const dadosDia = useMemo(() => {
    const map = {};
    linhasParaDia.forEach(l => {
      const iso = toISO(l.data);
      if (!iso) return;
      map[iso] = (map[iso] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([iso, valor]) => {
        const [yyyy, mm, dd] = iso.split('-');
        return { dia: `${dd}/${mm}`, iso, valor: Math.round(valor * 100) / 100 };
      })
      .sort((a, b) => a.iso.localeCompare(b.iso));
  }, [linhasParaDia]);

  const dadosClientes = useMemo(() => {
    const map = {};
    linhasParaCliente.forEach(l => {
      const cli = getCliente(l);
      map[cli] = (map[cli] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([cliente, valor]) => ({ cliente, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, topNCliente);
  }, [linhasParaCliente, topNCliente]);

  function handleClickRN(data) {
    const rn = data?.rn;
    if (rn) setFiltroRN(prev => prev === rn ? '' : rn);
  }
  function handleClickProduto(data) {
    const nome = data?.nome;
    if (nome) setFiltroProduto(prev => prev === nome ? '' : nome);
  }
  function handleClickMes(data) {
    const mes = data?.mes;
    if (mes) setFiltroMes(prev => prev === mes ? '' : mes);
  }
  function handleClickDia(_, payload) {
    const iso = payload?.payload?.iso;
    if (iso) setFiltroDia(prev => prev === iso ? '' : iso);
  }
  function handleClickCliente(data) {
    const cli = data?.cliente;
    if (cli) setFiltroCliente(prev => prev === cli ? '' : cli);
  }
  function limparTodosFiltrosGrafico() {
    setFiltroRN(''); setFiltroProduto(''); setFiltroMes(''); setFiltroDia(''); setFiltroCliente('');
  }

  const filtroBarraAtivo   = filtroRevenda || filtroDataInicio || filtroDataFim;
  const filtroGraficoAtivo = filtroRN || filtroProduto || filtroMes || filtroDia || filtroCliente;
  const temDados           = linhasBase.length > 0;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: D.font }}>
        <div style={{ marginBottom: 32 }}>
          <Skeleton width={120} height={11} radius={4} style={{ marginBottom: 10 }} />
          <Skeleton width={180} height={28} radius={6} style={{ marginBottom: 8 }} />
          <Skeleton width={260} height={13} radius={4} />
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
        <Skeleton height={260} radius={D.radius} style={{ marginBottom: 16 }} />
        <Skeleton height={260} radius={D.radius} />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: D.font }}>

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, animation: 'fadeUp 0.3s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
            Gestão de Prejuízo
          </span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>
          Troca
        </h1>
      </div>

      {/* ── Erro ─────────────────────────────────────────────────────────── */}
      {erro && (
        <div style={{
          padding: '12px 16px',
          background: D.redSoft,
          color: D.red,
          borderRadius: 10,
          border: `1px solid ${D.redBorder}`,
          marginBottom: 20,
          fontSize: 13,
          fontWeight: 500,
        }}>
          {erro}
        </div>
      )}

      {/* ── Filtros de barra ─────────────────────────────────────────────── */}
      <div style={{
        background: D.surface,
        border: `1px solid ${D.border}`,
        borderRadius: D.radius,
        padding: '14px 20px',
        boxShadow: D.shadow,
        marginBottom: 20,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted }}>Revenda</label>
          <select value={filtroRevenda} onChange={e => setFiltroRevenda(e.target.value)} style={s.input}>
            <option value="">Todas</option>
            <option value="Carpina">Carpina</option>
            <option value="Palmares">Palmares</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted }}>Data de</label>
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={s.input} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted }}>Data até</label>
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={s.input} />
        </div>
        {filtroBarraAtivo && (
          <button
            className="troca-btn-clear"
            onClick={() => { setFiltroRevenda(''); setFiltroDataInicio(''); setFiltroDataFim(''); }}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: `1px solid ${D.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: D.textSec,
              cursor: 'pointer',
              fontWeight: 500,
              transition: D.transition,
              alignSelf: 'flex-end',
              fontFamily: D.font,
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── KPIs — bento assimétrico ──────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        {/* Linha 1: 2 KPIs primários */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <KPICardPrimary
            label="R$ Troca"
            valor={brl(totalTroca)}
            cor={D.red}
          />
          <KPICardPrimary
            label={economia ? 'Economia' : 'Estouro'}
            valor={brl(Math.abs(saldo))}
            cor={economia ? D.green : D.red}
            sub="Meta − R$ Troca"
            destaque
          />
        </div>
        {/* Linha 2: 3 KPIs secundários */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <KPICardSecondary label="Hecto"         valor={numFmt(totalHecto)}                     cor={D.blue} />
          <KPICardSecondary label="Meta Troca R$" valor={brl(metaTroca)}                         cor={D.amber} sub="R$ 0,20 × Hecto" />
          <KPICardSecondary label="Troca R$/HL"   valor={totalHecto > 0 ? brl(trocaRsHL) : '—'} cor={D.green} sub="R$ Troca ÷ Hecto" />
        </div>
      </div>

      {/* ── Sem dados ────────────────────────────────────────────────────── */}
      {!temDados && (
        <div style={{
          background: D.surface,
          border: `1px solid ${D.border}`,
          borderRadius: D.radius,
          boxShadow: D.shadow,
        }}>
          <EmptyState />
        </div>
      )}

      {temDados && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Chips dos filtros ativos ──────────────────────────────────── */}
          {filtroGraficoAtivo && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '12px 16px',
              background: D.surface,
              border: `1px solid ${D.redBorder}`,
              borderRadius: D.radius,
              boxShadow: D.shadow,
              animation: 'fadeUp 0.25s ease both',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted }}>
                Filtros ativos
              </span>
              <div style={{ width: 1, height: 14, background: D.border }} />
              {filtroRN       && <Chip label={`RN ${filtroRN}`}               onClear={() => setFiltroRN('')} />}
              {filtroProduto  && <Chip label={`Produto: ${filtroProduto}`}   onClear={() => setFiltroProduto('')} />}
              {filtroCliente  && <Chip label={`Cliente: ${filtroCliente}`}   onClear={() => setFiltroCliente('')} />}
              {filtroMes      && <Chip label={`Mês: ${filtroMes}`}           onClear={() => setFiltroMes('')} />}
              {filtroDia      && <Chip label={`Dia: ${isoParaBR(filtroDia)}`} onClear={() => setFiltroDia('')} />}
              <button
                onClick={limparTodosFiltrosGrafico}
                style={{
                  fontSize: 11,
                  color: D.textMuted,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  marginLeft: 4,
                  fontFamily: D.font,
                  transition: D.transition,
                }}
              >
                Limpar tudo
              </button>
            </div>
          )}

          {/* ── RN + Produtos lado a lado ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <ChartCard titulo="R$ Troca por RN">
              {dadosRN.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosRN.length * 34), 360)}>
                  <BarChart data={dadosRN} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="rn" width={80} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.blueSoft }} />
                    <Bar dataKey="valor" name="R$ Troca" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickRN} style={{ cursor: 'pointer' }}>
                      {dadosRN.map((entry, i) => (
                        <Cell key={i} fill={D.blue} opacity={filtroRN && filtroRN !== entry.rn ? 0.18 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              titulo="Top Produtos por R$ Troca"
              badge={
                <select
                  value={topN}
                  onChange={e => setTopN(Number(e.target.value))}
                  style={{ ...s.input, fontSize: 11, padding: '4px 8px', minWidth: 'auto' }}
                >
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                  <option value={15}>Top 15</option>
                  <option value={20}>Top 20</option>
                </select>
              }
            >
              {dadosProdutos.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosProdutos.length * 34), 360)}>
                  <BarChart data={dadosProdutos} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.redSoft }} />
                    <Bar dataKey="valor" name="R$ Troca" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickProduto} style={{ cursor: 'pointer' }}>
                      {dadosProdutos.map((entry, i) => (
                        <Cell key={i} fill={D.red} opacity={filtroProduto && filtroProduto !== entry.nome ? 0.18 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>

          {/* ── Clientes — largura total ─────────────────────────────────── */}
          <ChartCard
            titulo="Top Clientes por R$ Troca"
            badge={
              <select
                value={topNCliente}
                onChange={e => setTopNCliente(Number(e.target.value))}
                style={{ ...s.input, fontSize: 11, padding: '4px 8px', minWidth: 'auto' }}
              >
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={15}>Top 15</option>
                <option value={20}>Top 20</option>
              </select>
            }
          >
            {dadosClientes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosClientes.length * 34), 700)}>
                <BarChart data={dadosClientes} layout="vertical" margin={{ top: 4, right: 110, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                  <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="cliente" width={180} tick={{ fontSize: 10.5, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 26 ? v.slice(0, 26) + '…' : v} />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: 'rgba(100,116,139,0.06)' }} />
                  <Bar dataKey="valor" name="R$ Troca" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10.5, fill: D.textSec, fontFamily: D.font }} onClick={handleClickCliente} style={{ cursor: 'pointer' }}>
                    {dadosClientes.map((entry, i) => (
                      <Cell key={i} fill="#64748b" opacity={filtroCliente && filtroCliente !== entry.cliente ? 0.18 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ── Mês a Mês — largura total ─────────────────────────────────── */}
          <ChartCard titulo="R$ Troca — Mês a Mês">
            {dadosMes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: D.amberSoft }} />
                  <Bar dataKey="valor" name="R$ Troca" radius={[5, 5, 0, 0]} onClick={handleClickMes} style={{ cursor: 'pointer' }}>
                    {dadosMes.map((entry, i) => (
                      <Cell key={i} fill={D.amber} opacity={filtroMes && filtroMes !== entry.mes ? 0.18 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ── Dia a Dia — largura total ─────────────────────────────────── */}
          <ChartCard titulo="R$ Troca — Dia a Dia">
            {dadosDia.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dadosDia} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }}
                    axisLine={false}
                    tickLine={false}
                    interval={dadosDia.length > 20 ? Math.floor(dadosDia.length / 10) : 0}
                  />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name="R$ Troca"
                    stroke={D.green}
                    strokeWidth={2}
                    activeDot={{ r: 6, cursor: 'pointer', onClick: handleClickDia, fill: D.green, stroke: '#fff', strokeWidth: 2 }}
                    dot={props => <DotDia {...props} filtroDia={filtroDia} />}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

        </div>
      )}
    </div>
  );
}

// ─── Estilos base ─────────────────────────────────────────────────────────────
const s = {
  input: {
    padding:         '7px 10px',
    border:          `1px solid ${D.border}`,
    borderRadius:    8,
    fontSize:        13,
    color:           D.text,
    backgroundColor: D.surface,
    minWidth:        150,
    fontFamily:      D.font,
    outline:         'none',
    transition:      D.transition,
  },
};
