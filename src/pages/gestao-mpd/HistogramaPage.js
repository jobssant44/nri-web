// ─────────────────────────────────────────────────────────────────────────────
// HistogramaPage.js — Histograma de operação por hora-do-dia.
//
// Mostra, pra UMA fase escolhida, a distribuição dos mapas ao longo das 24h
// (00:00 a 23:00, agrupando por hora-cheia do campo horaOperacao):
//   - Barras = quantidade de mapas
//   - Linha tracejada = % do total (cada hora vs total filtrado)
//
// 4 fases selecionáveis (single-select, padrão Carregamento):
//   "Carregamento" → fase "Carregado"
//   "Saída"        → fase "Saida Cdd/Fab"     (com variações de acento)
//   "Chegada"      → fase "Entrada Cdd/Fab"
//   "Descarga"     → fase "PC_Fisica"
//
// Filtros globais: Frota (multi-select Ctrl+click) + Data início/fim (sobre
// dataOperacao, que é o dia em que a operação aconteceu).
//
// Reutiliza helpers/componentes exportados de _FasePage.js (D tokens, TopbarNav,
// MultiSelectDropdown, ChartCard, etc.) pra manter consistência visual com EFC/EFD/TI.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getDocs } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList, Cell,
} from 'recharts';
import {
  D, toISO, asLista, FILTROS_VAZIOS,
  sLabel, sInput,
  TopbarNav, MultiSelectDropdown, ChartCard,
  Skeleton, Vazio, EmptyState,
} from './_FasePage';

// ─── Configuração das 4 fases ─────────────────────────────────────────────────
// Cada fase tem um label de UI (mostrado no card e título) e uma função de
// match que tolera variações de string na coluna B do 03.11.20.
const FASES = [
  {
    id: 'carregamento',
    label: 'Carregamento',
    match: (f) => f === 'Carregado',
  },
  {
    id: 'saida',
    label: 'Saída',
    match: (f) => f === 'Saida Cdd/Fab' || f === 'Saída Cdd/Fab' || f === 'Saida CDD/Fab' || f === 'Saída CDD/Fab',
  },
  {
    id: 'chegada',
    label: 'Chegada',
    match: (f) => f === 'Entrada Cdd/Fab' || f === 'Entrada CDD/Fab',
  },
  {
    id: 'descarga',
    label: 'Descarga',
    match: (f) => f === 'PC_Fisica' || f === 'PC Fisica' || f === 'PC Física',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Extrai a hora-cheia (HH) de "HH:MM" ou "HH:MM:SS". Retorna null se inválido.
function extrairHoraCheia(horaStr) {
  if (!horaStr) return null;
  const m = String(horaStr).trim().match(/^(\d{1,2}):/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

// ─── Agregador do histograma ─────────────────────────────────────────────────
// Recebe linhas já filtradas (fase + frota + data) e produz array ordenado por
// hora, contendo só as horas em que apareceu pelo menos 1 mapa. Cada item:
//   { hora: 5, label: '05:00', mapas: 128, percent: 46.38 }
function agruparPorHora(linhas) {
  const cont = new Map(); // hora → contador
  linhas.forEach(l => {
    const h = extrairHoraCheia(l.horaOperacao);
    if (h == null) return;
    cont.set(h, (cont.get(h) ?? 0) + 1);
  });
  const total = [...cont.values()].reduce((s, n) => s + n, 0);
  return [...cont.entries()]
    .map(([hora, mapas]) => ({
      hora,
      label: `${String(hora).padStart(2, '0')}:00`,
      mapas,
      // 1 casa decimal pra UI; 0 quando total é 0 (defensivo)
      percent: total > 0 ? Math.round((mapas / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => a.hora - b.hora);
}

// ─── Tooltip do gráfico ──────────────────────────────────────────────────────
function TooltipHistograma({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  // Recharts passa 2 payloads: 1 pra Bar, 1 pra Line. Pego do primeiro.
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font, minWidth: 140 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: D.text, fontSize: 12.5 }}>{label}</div>
      <div style={{ color: D.blue, fontWeight: 700, fontFamily: D.mono, fontSize: 15 }}>
        {d.mapas.toLocaleString('pt-BR')} mapas
      </div>
      <div style={{ color: D.text, fontFamily: D.mono, fontSize: 12, marginTop: 2 }}>
        {d.percent.toFixed(2).replace('.', ',')}% do total
      </div>
    </div>
  );
}

// ─── Card de fase (botão de filtro) ──────────────────────────────────────────
// Single-select: clicar no card ativo NÃO desmarca (sempre tem 1 fase ativa).
// Mostra apenas o label da fase (Carregamento/Saída/Chegada/Descarga).
// Visual ativo: borda azul + fundo soft + texto azul.
function CardFase({ fase, ativo, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: ativo ? D.blueSoft : D.surface,
        border: `1.5px solid ${ativo ? D.blue : D.border}`,
        borderRadius: D.radius,
        padding: '18px 18px',
        cursor: ativo ? 'default' : 'pointer',
        transition: D.transition,
        animation: 'fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both',
        userSelect: 'none',
        textAlign: 'center',
      }}
      onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = D.bg; }}
      onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = D.surface; }}
    >
      <div style={{
        fontSize: 14, fontWeight: 700,
        color: ativo ? D.blue : D.text,
        letterSpacing: 0.2, fontFamily: D.font,
      }}>
        {fase.label}
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function HistogramaPage() {
  const { colRevenda } = useDb();
  const loc = useLocation();
  const [linhas, setLinhas]         = useState([]);
  const [carregando, setCarregando] = useState(true);
  // faseId controla o card ativo. Default: 'carregamento'.
  const [faseId, setFaseId]         = useState('carregamento');
  // Filtros globais: frota (multi), data início/fim. Mesma estrutura usada
  // nas páginas TI/EFC/EFD pra consistência (importado FILTROS_VAZIOS).
  const [filtros, setFiltros]       = useState(FILTROS_VAZIOS);

  useEffect(() => {
    let mounted = true;
    setCarregando(true);
    getDocs(colRevenda('relatorio031120'))
      .then(snap => { if (mounted) setLinhas(snap.docs.map(d => d.data())); })
      .catch(() => {})
      .finally(() => { if (mounted) setCarregando(false); });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fase ativa (objeto completo). Sempre tem 1 — default 'carregamento'.
  const faseAtiva = useMemo(
    () => FASES.find(f => f.id === faseId) ?? FASES[0],
    [faseId]
  );

  // Frotas únicas pra dropdown
  const uniqueFrotas = useMemo(() => {
    const set = new Set();
    linhas.forEach(l => { if (l.frotaCadastrada) set.add(l.frotaCadastrada); });
    return [...set].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }, [linhas]);

  // Linhas filtradas: fase + frota + range de data (sobre dataOperacao,
  // porque o histograma fala sobre quando a operação aconteceu).
  const linhasFiltradas = useMemo(() => {
    const frotas = asLista(filtros.frota);
    return linhas.filter(l => {
      // Fase ativa (sempre aplicada, é o foco do histograma)
      if (!faseAtiva.match(String(l.fase ?? '').trim())) return false;
      // Frota global
      if (frotas.length > 0 && !frotas.includes(l.frotaCadastrada)) return false;
      // Data início/fim sobre dataOperacao
      if (filtros.dataInicio || filtros.dataFim) {
        const iso = toISO(l.dataOperacao);
        if (filtros.dataInicio && (!iso || iso < filtros.dataInicio)) return false;
        if (filtros.dataFim    && (!iso || iso > filtros.dataFim))    return false;
      }
      return true;
    });
  }, [linhas, faseAtiva, filtros]);

  const dadosHist = useMemo(() => agruparPorHora(linhasFiltradas), [linhasFiltradas]);
  const totalFiltrado = useMemo(() => dadosHist.reduce((s, d) => s + d.mapas, 0), [dadosHist]);

  // Máximo de Y esquerdo (mapas) com 10% de folga; ticks da linha % vão de 0 a 100.
  const yMaxMapas = useMemo(() => {
    if (dadosHist.length === 0) return 10;
    const max = Math.max(...dadosHist.map(d => d.mapas));
    return Math.ceil(max * 1.15);
  }, [dadosHist]);

  const setGlobal = useCallback((campo, valor) => {
    setFiltros(f => ({ ...f, [campo]: valor }));
  }, []);

  const temFiltro = !!(filtros.frota?.length || filtros.dataInicio || filtros.dataFim);

  if (carregando) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <Skeleton height={14} width={120} radius={4} style={{ marginBottom: 8 }} />
            <Skeleton height={28} width={200} radius={6} />
          </div>
          <Skeleton height={32} width={300} radius={8} />
        </div>
        <Skeleton height={76} radius={D.radius} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height={90} radius={D.radius} />)}
        </div>
        <Skeleton height={320} radius={D.radius} />
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
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>Histograma</h1>
        </div>
        <TopbarNav current={loc.pathname} />
      </div>

      {/* ── Filtros globais (Frota + Data) ── */}
      <div style={{
        background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius,
        padding: '16px 20px', boxShadow: D.shadow, marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end',
      }}>
        <MultiSelectDropdown
          label="Frota"
          valor={filtros.frota}
          opcoes={uniqueFrotas}
          onChange={val => setGlobal('frota', val)}
          placeholderTodos="Todas as frotas"
        />
        <div style={{ width: 1, height: 36, background: D.border, alignSelf: 'flex-end', marginBottom: 2 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Data de</label>
          <input type="date" className="mpd-input" value={filtros.dataInicio} onChange={e => setGlobal('dataInicio', e.target.value)} style={sInput} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Data até</label>
          <input type="date" className="mpd-input" value={filtros.dataFim} onChange={e => setGlobal('dataFim', e.target.value)} style={sInput} />
        </div>
        {temFiltro && (
          <button className="mpd-btn-clear" onClick={() => setFiltros(FILTROS_VAZIOS)}
            style={{ alignSelf: 'flex-end', padding: '7px 14px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: D.textSec, fontFamily: D.font, transition: D.transition }}>
            Limpar todos
          </button>
        )}
      </div>

      {/* ── 4 cards de fase (single-select) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {FASES.map(fase => (
          <CardFase
            key={fase.id}
            fase={fase}
            ativo={faseId === fase.id}
            // Click no card ativo NÃO desmarca (mantém sempre 1 fase ativa)
            onClick={() => { if (faseId !== fase.id) setFaseId(fase.id); }}
          />
        ))}
      </div>

      {/* ── Empty state geral / Histograma ── */}
      {linhas.length === 0 ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState fase="Histograma" />
        </div>
      ) : (
        <ChartCard
          titulo={`Histograma de ${faseAtiva.label}`}
          badge={
            <span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>
              {totalFiltrado.toLocaleString('pt-BR')} mapa{totalFiltrado === 1 ? '' : 's'} no período
            </span>
          }
        >
          {dadosHist.length === 0 ? <Vazio /> : (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={dadosHist} margin={{ top: 28, right: 32, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }}
                  axisLine={false}
                  tickLine={false}
                />
                {/* Y esquerdo = quantidade de mapas */}
                <YAxis
                  yAxisId="left"
                  domain={[0, yMaxMapas]}
                  tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                {/* Y direito = % (sempre 0-100 pra a linha ficar estável) */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }}
                  tickFormatter={v => `${v}%`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<TooltipHistograma />} cursor={{ fill: D.blueSoft }} />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: D.font, paddingTop: 12 }}
                  iconType="circle"
                />
                {/* Barras: quantidade */}
                <Bar
                  yAxisId="left"
                  dataKey="mapas"
                  name="Mapas"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                >
                  {dadosHist.map(d => (
                    <Cell key={d.hora} fill={D.blue} />
                  ))}
                  <LabelList
                    dataKey="mapas"
                    position="top"
                    style={{ fontSize: 11, fill: D.text, fontFamily: D.mono, fontWeight: 700 }}
                  />
                </Bar>
                {/* Linha: % do total */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="percent"
                  name="% Mapas"
                  stroke={D.text}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ fill: D.text, r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0, fill: D.text }}
                >
                  <LabelList
                    dataKey="percent"
                    position="top"
                    formatter={v => `${v.toFixed(2).replace('.', ',')}%`}
                    style={{ fontSize: 10.5, fill: D.text, fontFamily: D.mono, fontWeight: 700 }}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      )}
    </div>
  );
}
