/**
 * FefoSlide — versão "slide" (16:9) do módulo Gestão de FEFO, pra ser capturada
 * como PNG e embutida no PowerPoint da Reunião. Reusa os MESMOS tokens/cores do
 * app (design system + Recharts), então o slide fica coerente com o dashboard.
 *
 * ATENÇÃO (tela parcial): a página on-screen (GestaoFEFOPage) é uma tabela e não
 * espelha 1:1 o que o módulo agrega. Este slide é montado a partir do que o
 * `fefoModulo.buscarDados()` devolve — os MESMOS dados dos blocos nativos:
 *   total, qtdVencido, qtdSegregar, qtdAtencao, qtdOK  (KPIs)
 *   distribuicao [{name, value}]   → Distribuição por Status (qtd coletas)
 *   topCriticos  [{name, value}]   → Top 10 Produtos com mais coletas críticas
 *   topVencendo  [{name, value}]   → Top 10 Produtos vencendo (value = prazo em dias)
 *
 * Render em largura fixa (1280px) e SEM animação (isAnimationActive={false}).
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Legend, Cell,
} from 'recharts';
import { D, intFmt, ChartCard } from '../../../design';

// Altura proporcional ao nº de barras (espelha o comportamento das páginas WJS).
const alturaBarras = n => Math.min(Math.max(150, n * 24), 260);

// Cores por status de validade — casam com o intento dos blocos nativos:
// Vencido = slate, Segregar = vermelho, Atenção = âmbar, OK = verde.
const CINZA_VENCIDO = '#64748b';
function corStatus(name) {
  const s = String(name || '');
  if (s.startsWith('Vencido'))  return CINZA_VENCIDO;
  if (s.startsWith('Segregar')) return D.red;
  if (s.startsWith('Atenç') || s.startsWith('Aten')) return D.amber;
  return D.green;
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

export default function FefoSlide({ dados }) {
  const distribuicao = dados.distribuicao || [];
  const topCriticos  = dados.topCriticos  || [];
  const topVencendo  = dados.topVencendo  || [];

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              Gestão de Idade · FEFO
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Gestão de FEFO
          </h1>
          <div style={{ fontSize: 11, color: D.textMuted, marginTop: 4, fontFamily: D.font }}>
            Foto do estoque em {dados.refLabel}
          </div>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 5 numa linha (espelha o blocoKPIs nativo) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="Total Coletas" valor={intFmt(dados.total)}       cor={D.blue} />
        <KpiMini label="Vencido"       valor={intFmt(dados.qtdVencido)}  cor={CINZA_VENCIDO} sub="Prazo < 0 dias" />
        <KpiMini label="Segregar"      valor={intFmt(dados.qtdSegregar)} cor={D.red}         sub="≤ 30 dias" />
        <KpiMini label="Atenção"       valor={intFmt(dados.qtdAtencao)}  cor={D.amber}       sub="31 a 60 dias" />
        <KpiMini label="OK"            valor={intFmt(dados.qtdOK)}       cor={D.green}       sub="> 60 dias" />
      </div>

      {/* Grade de gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Distribuição por Status — donut (qtd coletas por status) */}
        <ChartCard titulo="Distribuição por Status (qtd coletas)">
          {distribuicao.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <Pie
                  data={distribuicao}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={82}
                  paddingAngle={2}
                  isAnimationActive={false}
                  label={({ value }) => intFmt(value)}
                  labelLine={false}
                  stroke={D.surface}
                  strokeWidth={2}
                >
                  {distribuicao.map((d, i) => <Cell key={i} fill={corStatus(d.name)} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: D.font, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Top 10 Produtos — Mais Coletas Críticas */}
        <ChartCard titulo="Top 10 Produtos — Mais Coletas Críticas">
          {topCriticos.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(topCriticos.length)}>
              <BarChart data={topCriticos} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={210} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 32 ? txt.slice(0, 32) + '…' : txt;
                    return <text x={x - 206} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="value" name="Coletas críticas" fill={D.red} radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: v => intFmt(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Top 10 Produtos Vencendo (menor prazo) — largura total */}
        <div style={{ gridColumn: '1 / -1' }}>
          <ChartCard titulo="Top 10 Produtos Vencendo (menor prazo)">
            {topVencendo.length === 0 ? <VazioSlide /> : (
              <ResponsiveContainer width="100%" height={alturaBarras(topVencendo.length)}>
                <BarChart data={topVencendo} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                  <XAxis type="number" allowDecimals={false} tickFormatter={v => `${v}d`} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={320} axisLine={false} tickLine={false} interval={0}
                    tick={({ x, y, payload }) => {
                      const txt = String(payload.value || '');
                      const trunc = txt.length > 48 ? txt.slice(0, 48) + '…' : txt;
                      return <text x={x - 316} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                    }} />
                  <Bar dataKey="value" name="Prazo (dias)" fill={D.amber} radius={[0, 5, 5, 0]} isAnimationActive={false}
                    label={{ position: 'right', formatter: v => `${v}d`, fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

      </div>
    </div>
  );
}

/** Factory: retorna o elemento pronto pra capturarParaPNG(). */
export function elementoFefoSlide(dados) {
  return <FefoSlide dados={dados} />;
}
