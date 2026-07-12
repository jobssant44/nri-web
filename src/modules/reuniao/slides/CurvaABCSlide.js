/**
 * CurvaABCSlide — versão "slide" (16:9) do Dashboard Curva ABC, pra ser
 * capturada como PNG e embutida no PowerPoint da Reunião. Reusa os MESMOS
 * componentes/cores do app (design system + Recharts), então o slide fica
 * fiel ao que o supervisor vê na tela.
 *
 * Recebe `dados` no formato que o curvaABCModulo.buscarDados() já devolve:
 *   periodo, mesUsado, qtdProdutos, totalCx, qtdA, qtdB, qtdC,
 *   topProdutosCx [{name,value}] (top 20), topAberto/topFechado [{name,value}] (top 10).
 * Renderiza numa largura fixa (1280px) e SEM animação (isAnimationActive={false})
 * pra captura estática.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { D, intFmt, ChartCard } from '../../../design';

// Cores das curvas — iguais à página on-screen (COR_A/COR_B/COR_C = verde/âmbar/vermelho).
const COR_A = D.green;
const COR_B = D.amber;
const COR_C = D.red;

// Altura proporcional ao nº de barras (espelha o comportamento das páginas WJS).
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

// Barra horizontal (código - nome) → valor em caixas. Reusa a lógica de rótulo
// truncado do WqiSlide.
function GraficoBarrasH({ dados, cor }) {
  return (
    <ResponsiveContainer width="100%" height={alturaBarras(dados.length)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 84, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
        <XAxis type="number" tickFormatter={v => intFmt(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={200} axisLine={false} tickLine={false} interval={0}
          tick={({ x, y, payload }) => {
            const txt = String(payload.value || '');
            const trunc = txt.length > 32 ? txt.slice(0, 32) + '…' : txt;
            return <text x={x - 196} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
          }} />
        <Bar dataKey="value" name="Caixas" fill={cor} radius={[0, 5, 5, 0]} isAnimationActive={false}
          label={{ position: 'right', formatter: v => intFmt(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function CurvaABCSlide({ dados }) {
  const qtdProdutos = dados.qtdProdutos || 0;
  const totalCx     = dados.totalCx || 0;
  const qtdA        = dados.qtdA || 0;
  const qtdB        = dados.qtdB || 0;
  const qtdC        = dados.qtdC || 0;
  const pct = n => (qtdProdutos > 0 ? `${((n / qtdProdutos) * 100).toFixed(1)}% dos SKUs` : '—');

  const topProdutosCx = dados.topProdutosCx || [];
  const topAberto     = dados.topAberto || [];
  const topFechado    = dados.topFechado || [];

  const distribuicao = [
    { name: 'A', value: qtdA },
    { name: 'B', value: qtdB },
    { name: 'C', value: qtdC },
  ];
  const temDistribuicao = (qtdA + qtdB + qtdC) > 0;

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              Curva ABC · Giro de Estoque
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Dashboard Curva ABC{dados.mesUsado ? ` · ${dados.mesUsado}` : ''}
          </h1>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 4 numa linha (espelha a tela: Total + Curva A/B/C) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="Total Caixas — Armazém" valor={intFmt(totalCx)} cor={D.text} sub={`${intFmt(qtdProdutos)} SKUs ativos`} />
        <KpiMini label="Curva A — Alto Giro"  valor={intFmt(qtdA)} cor={COR_A} sub={pct(qtdA)} />
        <KpiMini label="Curva B — Médio Giro" valor={intFmt(qtdB)} cor={COR_B} sub={pct(qtdB)} />
        <KpiMini label="Curva C — Baixo Giro" valor={intFmt(qtdC)} cor={COR_C} sub={pct(qtdC)} />
      </div>

      {/* 2×2 gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <ChartCard titulo="Distribuição por Curva">
          {!temDistribuicao ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={distribuicao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                  isAnimationActive={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {[COR_A, COR_B, COR_C].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="Top 20 Produtos por Caixas Totais">
          {topProdutosCx.length === 0 ? <VazioSlide /> : (
            <GraficoBarrasH dados={topProdutosCx} cor={D.red} />
          )}
        </ChartCard>

        <ChartCard titulo="Top 10 Produtos — Palete Aberto (picking)">
          {topAberto.length === 0 ? <VazioSlide /> : (
            <GraficoBarrasH dados={topAberto} cor={D.blue} />
          )}
        </ChartCard>

        <ChartCard titulo="Top 10 Produtos — Palete Fechado (estoque)">
          {topFechado.length === 0 ? <VazioSlide /> : (
            <GraficoBarrasH dados={topFechado} cor={D.amber} />
          )}
        </ChartCard>

      </div>
    </div>
  );
}

/** Factory: retorna o elemento pronto pra capturarParaPNG(). */
export function elementoCurvaABCSlide(dados) {
  return <CurvaABCSlide dados={dados} />;
}
