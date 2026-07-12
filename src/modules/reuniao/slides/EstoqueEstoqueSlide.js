/**
 * EstoqueEstoqueSlide — versão "slide" (16:9) da página Estoque x Estoque
 * (Gestão de Idade), pra ser capturada como PNG e embutida no PowerPoint da
 * Reunião. Reusa os MESMOS tokens/cores do app (design system + Recharts) e
 * reproduz os KPIs e gráficos da PÁGINA on-screen:
 *   total, liberado, gestao            (KPIs)
 *   statusPie [{name,value}]           → pizza Status por palete
 *                                        (Liberado = verde / Gestão de Idade = âmbar)
 *   porRua    [{name,value}]           → Paletes em Gestão de Idade por Rua (barH)
 *
 * Render em largura fixa (1280px) e SEM animação (isAnimationActive={false}).
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Legend, Cell,
} from 'recharts';
import { D, intFmt, ChartCard } from '../../../design';
import { COR } from '../../gestao-idade/gestaoIdadeHelpers';

// Altura proporcional ao nº de barras (espelha o comportamento das páginas WJS).
const alturaBarras = n => Math.min(Math.max(150, n * 24), 320);

// Cores por status — casam com a página (Liberado = verde, Gestão de Idade = âmbar).
function corStatus(name) {
  return String(name || '').startsWith('Gest') ? COR.gestaoIdade : COR.liberado;
}

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

export default function EstoqueEstoqueSlide({ dados }) {
  const statusPie = dados.statusPie || [];
  const porRua    = dados.porRua    || [];
  const total     = dados.total || 0;
  const pctLib = total > 0 ? Math.round(((dados.liberado || 0) / total) * 100) : 0;
  const pctGes = total > 0 ? Math.round(((dados.gestao   || 0) / total) * 100) : 0;

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              Gestão de Idade
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Estoque x Estoque
          </h1>
          <div style={{ fontSize: 11, color: D.textMuted, marginTop: 4, fontFamily: D.font }}>
            Liberado (≥ 45 dias até vencer) ou Gestão de Idade (próximo do vencimento)
          </div>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 3 numa linha (espelha os KPICards da página) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="Total de Paletes" valor={intFmt(total)}          cor={D.blue} />
        <KpiMini label="Liberados"        valor={intFmt(dados.liberado)} cor={COR.liberado}    sub={`${pctLib}% do total`} />
        <KpiMini label="Em Gestão de Idade" valor={intFmt(dados.gestao)} cor={COR.gestaoIdade} sub={`${pctGes}% — atenção`} />
      </div>

      {/* Grade de gráficos — pizza (1) + barras por rua (2) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>

        {/* Status por palete — donut */}
        <ChartCard titulo="Status por palete">
          {statusPie.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <Pie
                  data={statusPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={82}
                  paddingAngle={2}
                  isAnimationActive={false}
                  label={({ value }) => (value > 0 ? intFmt(value) : '')}
                  labelLine={false}
                  stroke={D.surface}
                  strokeWidth={2}
                >
                  {statusPie.map((d, i) => <Cell key={i} fill={corStatus(d.name)} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: D.font, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Paletes em Gestão de Idade por Rua — barras horizontais */}
        <ChartCard titulo="Paletes em Gestão de Idade por Rua">
          {porRua.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(porRua.length)}>
              <BarChart data={porRua} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={90} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 14 ? txt.slice(0, 14) + '…' : txt;
                    return <text x={x - 86} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.mono} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="value" name="Paletes" fill={COR.gestaoIdade} radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: v => intFmt(v), fontSize: 10, fill: D.textSec, fontFamily: D.mono }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>
    </div>
  );
}

/** Factory: retorna o elemento pronto pra capturarParaPNG(). */
export function elementoEstoqueEstoqueSlide(dados) {
  return <EstoqueEstoqueSlide dados={dados} />;
}
