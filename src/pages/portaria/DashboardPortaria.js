import { useState, useEffect, useMemo } from 'react';
import { getDocs, query, orderBy, limit } from 'firebase/firestore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from 'recharts';
import { useDb } from '../../utils/db';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import {
  D, PageContainer, PageHeader, EmptyState, BotaoNav, BotaoClear,
  KPICardPrimary, KPICardSecondary, ChartCard, FilterBar, FilterField,
  Tabela, Vazio, sInput, tdStyle,
} from '../../design';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function fmtDuracao(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

function ymKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ymLabel(key) {
  const [y, m] = key.split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

const TABS = [
  { key: 'carretas',  label: 'Carretas (TMV)', cor: '#1D5A9E' },
  { key: 'terceiros', label: 'Terceiros (TMA)', cor: '#E31837' },
];

export default function DashboardPortaria() {
  const { col } = useDb();
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [tab, setTab] = useSessionFilter('portaria:dash:tab', 'carretas');
  const [dataIni, setDataIni] = useSessionFilter('portaria:dash:di', '');
  const [dataFim, setDataFim] = useSessionFilter('portaria:dash:df', '');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const snap = await getDocs(query(col('portaria_registros'), orderBy('entradaEm', 'desc'), limit(5000)));
      setRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      const snap = await getDocs(col('portaria_registros'));
      setRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    setCarregando(false);
  }

  const tipoAlvo = tab === 'carretas' ? 'carreta_propria' : 'terceiro';
  const cor = TABS.find(t => t.key === tab).cor;

  const filtrados = useMemo(() => {
    const di = dataIni ? new Date(dataIni + 'T00:00:00') : null;
    const df = dataFim ? new Date(dataFim + 'T23:59:59') : null;
    return registros.filter(r => {
      if (r.tipo !== tipoAlvo) return false;
      const entrada = tsToDate(r.entradaEm);
      if (di && entrada && entrada < di) return false;
      if (df && entrada && entrada > df) return false;
      return true;
    });
  }, [registros, tipoAlvo, dataIni, dataFim]);

  const finalizados = useMemo(
    () => filtrados.filter(r => r.status === 'finalizado' && Number.isFinite(r.duracaoMin)),
    [filtrados]
  );

  const emAndamento = useMemo(
    () => filtrados.filter(r => r.status === 'em_andamento').length,
    [filtrados]
  );

  // KPIs
  const kpis = useMemo(() => {
    const total = finalizados.length;
    if (total === 0) {
      return { tm: null, dentroSla: null, percSla: null, foraSla: 0, maior: null, total: 0 };
    }
    const somaMin = finalizados.reduce((s, r) => s + r.duracaoMin, 0);
    const tm = somaMin / total;
    const comSla = finalizados.filter(r => r.slaMin);
    const dentro = comSla.filter(r => r.duracaoMin <= r.slaMin).length;
    const percSla = comSla.length ? (dentro / comSla.length) * 100 : null;
    const maior = finalizados.reduce((m, r) => r.duracaoMin > (m?.duracaoMin || 0) ? r : m, null);
    return {
      tm: Math.round(tm),
      percSla,
      foraSla: comSla.length - dentro,
      maior, total,
    };
  }, [finalizados]);

  // Agregação por dimensão (destino/tipo, motorista, carreta/empresa)
  const porDimensao = useMemo(() => {
    function agrupar(keyFn) {
      const map = new Map();
      finalizados.forEach(r => {
        const k = keyFn(r) || '—';
        if (!map.has(k)) map.set(k, { soma: 0, qt: 0, foraSla: 0, dentroSla: 0 });
        const v = map.get(k);
        v.soma += r.duracaoMin;
        v.qt += 1;
        if (r.slaMin) {
          if (r.duracaoMin <= r.slaMin) v.dentroSla += 1;
          else v.foraSla += 1;
        }
      });
      return Array.from(map.entries()).map(([nome, v]) => ({
        nome,
        media: Math.round(v.soma / v.qt),
        qt: v.qt,
        foraSla: v.foraSla,
        dentroSla: v.dentroSla,
      })).sort((a, b) => b.media - a.media);
    }
    return {
      porDest: agrupar(r => tab === 'carretas' ? r.destinoNome : r.tipoAtendimentoNome),
      porMot:  agrupar(r => r.motoristaNome),
      porVeic: agrupar(r => tab === 'carretas' ? r.carretaPlaca : r.empresa || r.placaVeiculo),
    };
  }, [finalizados, tab]);

  // Evolução por mês
  const evolucao = useMemo(() => {
    const map = new Map();
    finalizados.forEach(r => {
      const d = tsToDate(r.entradaEm);
      if (!d) return;
      const k = ymKey(d);
      if (!map.has(k)) map.set(k, { soma: 0, qt: 0 });
      const v = map.get(k);
      v.soma += r.duracaoMin;
      v.qt += 1;
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ mes: ymLabel(k), media: Math.round(v.soma / v.qt), qt: v.qt }));
  }, [finalizados]);

  // Top viagens mais demoradas
  const topDemoradas = useMemo(
    () => [...finalizados].sort((a, b) => b.duracaoMin - a.duracaoMin).slice(0, 10),
    [finalizados]
  );

  function limpar() { setDataIni(''); setDataFim(''); }

  return (
    <PageContainer maxWidth={1280}>
      <PageHeader
        kicker="Portaria"
        titulo="Dashboard"
        sub="Tempo médio de viagem (carretas) e tempo médio de atendimento (terceiros) com SLA."
        acoes={
          <>
            <BotaoNav onClick={() => window.location.assign('/portaria')}>Operação</BotaoNav>
            <BotaoNav onClick={() => window.location.assign('/portaria/registros')}>Registros</BotaoNav>
          </>
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {TABS.map(t => {
          const ativo = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 14px',
                background: ativo ? t.cor : D.surface,
                color: ativo ? '#fff' : D.textSec,
                border: `1px solid ${ativo ? t.cor : D.border}`,
                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: D.font, transition: D.transition,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <FilterBar>
        <FilterField label="De">
          <input type="date" style={sInput} value={dataIni} onChange={e => setDataIni(e.target.value)} />
        </FilterField>
        <FilterField label="Até">
          <input type="date" style={sInput} value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </FilterField>
        {(dataIni || dataFim) && <BotaoClear onClick={limpar} />}
      </FilterBar>

      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: D.textMuted }}>Carregando…</div>
      ) : registros.length === 0 ? (
        <EmptyState
          titulo="Sem registros ainda"
          descricao="Use o Painel de Operação para começar a registrar saídas e entradas."
        />
      ) : finalizados.length === 0 ? (
        <EmptyState
          titulo="Nenhum registro finalizado no período"
          descricao="Ajuste o período acima ou aguarde fechamentos no Painel."
        />
      ) : (
        <>
          {/* KPIs principais */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <KPICardPrimary
              label={tab === 'carretas' ? 'TMV — Tempo Médio de Viagem' : 'TMA — Tempo Médio de Atendimento'}
              valor={fmtDuracao(kpis.tm)}
              cor={cor}
              sub={`${kpis.total} ${tab === 'carretas' ? 'viagem(ns)' : 'atendimento(s)'} finalizados`}
              destaque
            />
            <KPICardPrimary
              label="% dentro do SLA"
              valor={kpis.percSla == null ? '—' : `${kpis.percSla.toFixed(1)}%`}
              cor={kpis.percSla == null ? D.textMuted : kpis.percSla >= 90 ? D.green : kpis.percSla >= 70 ? D.amber : D.red}
              sub={kpis.percSla == null ? 'Defina SLA nos Cadastros' : `${kpis.foraSla} fora do prazo`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <KPICardSecondary
              label="Em andamento agora"
              valor={String(emAndamento)}
              cor={D.amber}
              sub={tab === 'carretas' ? 'carretas em viagem' : 'veículos no pátio'}
            />
            <KPICardSecondary
              label="Total no período"
              valor={String(kpis.total)}
              cor={D.text}
              sub="finalizados"
            />
            <KPICardSecondary
              label="Maior duração"
              valor={fmtDuracao(kpis.maior?.duracaoMin)}
              cor={D.red}
              sub={kpis.maior
                ? (tab === 'carretas'
                    ? `${kpis.maior.carretaPlaca || '—'} · ${kpis.maior.destinoNome || ''}`
                    : `${kpis.maior.placaVeiculo || '—'} · ${kpis.maior.tipoAtendimentoNome || ''}`)
                : '—'
              }
            />
          </div>

          {/* Por dimensão principal (destino ou tipo) */}
          <div style={{ marginBottom: 16 }}>
            <ChartCard titulo={tab === 'carretas' ? 'TMV por destino' : 'TMA por tipo de atendimento'}>
              {porDimensao.porDest.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.max(200, porDimensao.porDest.length * 36)}>
                  <BarChart data={porDimensao.porDest} layout="vertical" margin={{ left: 20, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${v}m`} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} width={130} />
                    <Tooltip content={<TooltipDuracao />} />
                    <Bar dataKey="media" radius={[0, 5, 5, 0]}>
                      {porDimensao.porDest.map((entry, i) => (
                        <Cell key={i} fill={cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Por motorista e por veículo (lado a lado) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ChartCard titulo={`Top 10 por motorista`}>
              {porDimensao.porMot.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porDimensao.porMot.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}m`} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip content={<TooltipDuracao />} />
                    <Bar dataKey="media" radius={[0, 5, 5, 0]} fill={cor} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard titulo={tab === 'carretas' ? 'Top 10 por carreta' : 'Top 10 por empresa'}>
              {porDimensao.porVeic.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porDimensao.porVeic.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}m`} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip content={<TooltipDuracao />} />
                    <Bar dataKey="media" radius={[0, 5, 5, 0]} fill={cor} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Evolução mensal */}
          <div style={{ marginBottom: 16 }}>
            <ChartCard titulo="Evolução mensal">
              {evolucao.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={evolucao} margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}m`} />
                    <Tooltip content={<TooltipDuracao />} />
                    <Line type="monotone" dataKey="media" stroke={cor} strokeWidth={2.5} dot={{ r: 4, fill: cor, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Top 10 viagens mais demoradas */}
          <ChartCard titulo="Top 10 mais demorados">
            <Tabela
              colunas={['#', 'Data', tab === 'carretas' ? 'Carreta' : 'Placa', 'Motorista', tab === 'carretas' ? 'Destino' : 'Tipo', 'Duração', 'SLA']}
              linhas={topDemoradas}
              renderLinha={(r, i) => {
                const entrada = tsToDate(r.entradaEm);
                const atrasado = r.slaMin && r.duracaoMin > r.slaMin;
                return (
                  <tr key={r.id} style={{ background: i % 2 ? D.bg : '#fff' }}>
                    <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, fontSize: 11.5 }}>{entrada?.toLocaleDateString('pt-BR') || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700, color: D.text }}>
                      {tab === 'carretas' ? r.carretaPlaca : r.placaVeiculo}
                    </td>
                    <td style={tdStyle}>{r.motoristaNome || '—'}</td>
                    <td style={tdStyle}>{(tab === 'carretas' ? r.destinoNome : r.tipoAtendimentoNome) || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700, color: atrasado ? D.red : D.text }}>
                      {fmtDuracao(r.duracaoMin)}{atrasado && ' ⚠️'}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: D.mono }}>{r.slaMin ? `${r.slaMin} min` : '—'}</td>
                  </tr>
                );
              }}
              vazio="Sem dados"
            />
          </ChartCard>
        </>
      )}
    </PageContainer>
  );
}

function TooltipDuracao({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10,
      padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font,
    }}>
      <div style={{ fontWeight: 700, color: D.text, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || D.red, fontFamily: D.mono, fontWeight: 600 }}>
          {p.name === 'media' ? 'Média' : p.name}: {fmtDuracao(p.value)}
        </div>
      ))}
      {payload[0]?.payload?.qt != null && (
        <div style={{ marginTop: 4, fontSize: 11, color: D.textMuted, fontFamily: D.mono }}>
          {payload[0].payload.qt} registro(s)
        </div>
      )}
    </div>
  );
}
