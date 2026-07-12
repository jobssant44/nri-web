/**
 * WqiSlide — versão "slide" (16:9) da tela de WQI, pra ser capturada como PNG
 * e embutida no PowerPoint da Reunião. Reusa os MESMOS componentes/cores do app
 * (design system + Recharts), então o slide fica idêntico ao que o supervisor vê.
 *
 * Recebe `dados` no formato que o wqiModulo.buscarDados() já devolve
 * (name/value nos rankings, x/y/meta na série diária). Renderiza numa largura
 * fixa (1280px) e SEM animação (isAnimationActive={false}) pra captura estática.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts';
import { D, brl, numFmt, ChartCard } from '../../../design';

// Altura proporcional ao nº de barras (espelha o comportamento da WQIPage).
const alturaBarras = n => Math.min(Math.max(150, n * 24), 260);

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

export default function WqiSlide({ dados }) {
  const metaPorHL  = dados.meta || 0;
  const totalHecto = dados.totalHecto || 0;
  // Sem corte próprio — buscarDados já limita a 10; assim o slide mostra o mesmo
  // nº de barras da tela (a WQIPage não corta motivos e usa topN nas embalagens).
  const porMotivo    = (dados.porMotivo    || []).map(d => ({ motivo: d.name, valor: d.value }));
  const porEmbalagem = (dados.porEmbalagem || []).map(d => ({ embalagem: d.name, valor: d.value }));
  const porMes       = (dados.porMes       || []).map(d => ({ mes: d.name, valor: d.value }));
  // porDia.x vem como DD/MM (sem ano) do buscarDados — rótulo compacto pro slide.
  const porDia       = (dados.porDia       || []).map(d => ({ dia: d.x, valor: d.y, meta: d.meta }));

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              WQI · Gestão de Prejuízo
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Warehouse Quality Index
          </h1>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 5 numa linha */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="R$ Perda Total" valor={brl(dados.totalValor)} cor={D.red} />
        <KpiMini
          label={dados.dentroMeta ? 'Economia' : 'Estouro'}
          valor={brl(Math.abs(dados.saldo))}
          cor={dados.dentroMeta ? D.green : D.red}
          sub="Meta − R$ Perda"
        />
        <KpiMini label="Hecto Entregue" valor={numFmt(totalHecto)} cor={D.blue} />
        <KpiMini label="Meta R$" valor={brl(dados.metaRS)} cor={D.amber} sub={`R$ ${metaPorHL.toFixed(2).replace('.', ',')} × Hecto`} />
        <KpiMini label="Perda R$/HL" valor={totalHecto > 0 ? brl(dados.perdaRsHL) : '—'} cor={D.green} sub="R$ Perda ÷ Hecto" />
      </div>

      {/* 2×2 gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <ChartCard titulo="R$ Perda por Motivo">
          {porMotivo.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(porMotivo.length)}>
              <BarChart data={porMotivo} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="motivo" width={180} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 28 ? txt.slice(0, 28) + '…' : txt;
                    return <text x={x - 176} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="valor" name="R$ Perda" fill={D.blue} radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="Top R$ Perda por Embalagem">
          {porEmbalagem.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(porEmbalagem.length)}>
              <BarChart data={porEmbalagem} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="embalagem" width={170} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 26 ? txt.slice(0, 26) + '…' : txt;
                    return <text x={x - 166} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="valor" name="R$ Perda" radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
                  {porEmbalagem.map((_, i) => <Cell key={i} fill={D.red} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="R$ Perda — Mês a Mês">
          {porMes.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={porMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                <Bar dataKey="valor" name="R$ Perda" radius={[5, 5, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  {porMes.map((_, i) => <Cell key={i} fill={D.amber} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="R$ Perda — Dia a Dia">
          {porDia.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={porDia} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: D.font, paddingTop: 8 }} />
                <Line type="linear" dataKey="valor" name="R$ Perda" stroke={D.blue} strokeWidth={2} dot={{ r: 3, fill: D.blue }} isAnimationActive={false} />
                <Line type="linear" dataKey="meta" name="Meta" stroke={D.red} strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>
    </div>
  );
}

/** Factory: retorna o elemento pronto pra capturarParaPNG(). */
export function elementoWqiSlide(dados) {
  return <WqiSlide dados={dados} />;
}
