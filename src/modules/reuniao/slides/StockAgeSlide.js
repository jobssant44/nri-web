/**
 * StockAgeSlide — versão "slide" (16:9) da tela Stock Age Index, pra ser
 * capturada como PNG e embutida no PowerPoint da Reunião. Reusa os MESMOS
 * tokens/cores do app (design system + Recharts), reproduzindo os KPIs e
 * gráficos da página on-screen (StockAgeIndexPage):
 *   KPIs:   % Stock Age Index (meta 90), Hecto Total, HL<60%SL, HL<30d,
 *           Hecto<45d, Status
 *   Bar:    % Stock Age por Curva ABC (com ReferenceLine meta 90)
 *   Line:   % Stock Age por Mês (com ReferenceLine meta 90)
 *
 * Render em largura fixa (1280px) e SEM animação (isAnimationActive={false}).
 */
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';
import { D, numFmt, intFmt, ChartCard } from '../../../design';

const META = 90;

const fmtPct = (v, casas = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(casas)}%`);
const corPct = v => (v >= META ? D.green : v >= 70 ? D.amber : D.red);

function VazioSlide() {
  return (
    <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: D.textMuted, fontStyle: 'italic', fontFamily: D.font }}>
      Sem dados para o período
    </div>
  );
}

function KpiMini({ label, valor, cor, sub }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `3px solid ${cor}`, borderRadius: D.radius,
      padding: '14px 16px', boxShadow: D.shadow,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -0.8, lineHeight: 1 }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 10, color: D.textMuted, fontFamily: D.font }}>{sub}</div>}
    </div>
  );
}

export default function StockAgeSlide({ dados }) {
  const porCurva = dados.porCurva || [];
  const porMes   = dados.porMes   || [];
  const corStatus = corPct(dados.stockAgeIndex || 0);

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              Gestão de Idade · Stock Age
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Stock Age Index
          </h1>
          <div style={{ fontSize: 11, color: D.textMuted, marginTop: 4, fontFamily: D.font }}>
            % de hectolitros acima de 60% de shelf life · Meta {META}%
          </div>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 6 numa linha (espelha os cards da página) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="% Stock Age" valor={fmtPct(dados.stockAgeIndex)} cor={corStatus} sub={`Meta: ${META}%`} />
        <KpiMini label="Hecto Total" valor={numFmt(dados.hectoTotal)}    cor={D.blue}    sub={`${intFmt(dados.paletes)} palete(s)`} />
        <KpiMini label="HL < 60% SL" valor={numFmt(dados.hectoSegregar)} cor={D.red}     sub={`${fmtPct(dados.pctSegregar, 1)} do total`} />
        <KpiMini label="HL < 30 Dias" valor={numFmt(dados.hl30)}         cor={D.red}     sub="Crítico" />
        <KpiMini label="Hecto < 45d"  valor={numFmt(dados.hecto45)}      cor={D.amber}   sub="Atenção" />
        <KpiMini label="Status"       valor={dados.statusLabel || '—'}   cor={corStatus} sub={`vs meta ${META}%`} />
      </div>

      {/* Grade de gráficos — Curva ABC + Mês a Mês */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <ChartCard titulo="% Stock Age Index por Curva ABC">
          {porCurva.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porCurva}>
                <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <ReferenceLine y={META} stroke={D.green} strokeDasharray="4 4" label={{ value: `Meta ${META}%`, fill: D.green, fontSize: 11 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {porCurva.map((e, i) => <Cell key={i} fill={corPct(e.value)} />)}
                  <LabelList dataKey="value" position="top" formatter={v => `${Math.round(v)}%`} style={{ fontSize: 11, fontFamily: D.mono, fill: D.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="% Stock Age Index por Mês">
          {porMes.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={porMes} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <ReferenceLine y={META} stroke={D.green} strokeDasharray="4 4" label={{ value: `Meta ${META}%`, fill: D.green, fontSize: 11 }} />
                <Line type="monotone" dataKey="value" stroke={D.red} strokeWidth={2.5} dot={{ r: 4, fill: D.red, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false}>
                  <LabelList dataKey="value" position="top" formatter={v => `${v}%`} style={{ fontSize: 10, fontFamily: D.mono, fill: D.text }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>
    </div>
  );
}

/** Factory: retorna o elemento pronto pra capturarParaPNG(). */
export function elementoStockAgeSlide(dados) {
  return <StockAgeSlide dados={dados} />;
}
