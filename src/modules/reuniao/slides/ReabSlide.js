/**
 * ReabSlide — versão "slide" (16:9) do módulo Reabastecimento, pra ser capturada
 * como PNG e embutida no PowerPoint da Reunião. Reusa os MESMOS tokens/cores do
 * design system + Recharts, então o slide fica coerente com a cara do app.
 *
 * ATENÇÃO (tela parcial): a DashboardIV on-screen não espelha 1:1 o que o módulo
 * agrega pro deck. Este slide é montado a partir dos DADOS que o reabModulo
 * .buscarDados() devolve (total/qtdReab/qtdRessup/qtdProdutos/totalPaletes +
 * topProdutos/topConferentes/porMes, todos {name,value}) e dos blocos nativos —
 * usando a página só como referência de estilo/cores (azul reab, vermelho ressp).
 *
 * Renderiza numa largura fixa (1280px) e SEM animação (isAnimationActive={false})
 * pra captura estática.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
} from 'recharts';
import { D, intFmt, ChartCard } from '../../../design';

// Altura proporcional ao nº de barras (espelha o comportamento do WqiSlide).
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

export default function ReabSlide({ dados }) {
  // buscarDados devolve rankings/série já como {name,value}; sem corte próprio
  // (buscarDados já limita a 10) — o slide mostra o mesmo nº de barras dos blocos.
  const topProdutos    = (dados.topProdutos    || []).map(d => ({ produto: d.name, valor: d.value }));
  const topConferentes = (dados.topConferentes || []).map(d => ({ conferente: d.name, valor: d.value }));
  const porMes         = (dados.porMes         || []).map(d => ({ mes: d.name, valor: d.value }));

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              Reabastecimento · Produtividade do Empilhador
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Reabastecimento &amp; Ressuprimento
          </h1>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 5 numa linha */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="Operações Total" valor={intFmt(dados.total)}       cor={D.red} />
        <KpiMini label="Reabastecimentos" valor={intFmt(dados.qtdReab)}     cor={D.blue}  sub="Operação normal" />
        <KpiMini label="Ressuprimentos"   valor={intFmt(dados.qtdRessup)}   cor={D.amber} sub="Emergencial" />
        <KpiMini label="Produtos Únicos"  valor={intFmt(dados.qtdProdutos)} cor={D.green} />
        <KpiMini label="Total Paletes"    valor={intFmt(dados.totalPaletes)} cor={D.blue} />
      </div>

      {/* Grade de gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <ChartCard titulo="Top Produtos (qtd de operações)">
          {topProdutos.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(topProdutos.length)}>
              <BarChart data={topProdutos} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" tickFormatter={v => intFmt(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="produto" width={180} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 28 ? txt.slice(0, 28) + '…' : txt;
                    return <text x={x - 176} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="valor" name="Operações" fill={D.blue} radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: v => intFmt(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="Top Conferentes (qtd de operações)">
          {topConferentes.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(topConferentes.length)}>
              <BarChart data={topConferentes} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" tickFormatter={v => intFmt(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="conferente" width={170} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 26 ? txt.slice(0, 26) + '…' : txt;
                    return <text x={x - 166} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="valor" name="Operações" radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: v => intFmt(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
                  {topConferentes.map((_, i) => <Cell key={i} fill={D.amber} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <div style={{ gridColumn: '1 / -1' }}>
          <ChartCard titulo="Operações — Mês a Mês">
            {porMes.length === 0 ? <VazioSlide /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={porMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => intFmt(v)} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Bar dataKey="valor" name="Operações" radius={[5, 5, 0, 0]} maxBarSize={64} isAnimationActive={false}
                    label={{ position: 'top', formatter: v => intFmt(v), fontSize: 11, fill: D.textSec, fontFamily: D.font }}>
                    {porMes.map((_, i) => <Cell key={i} fill={D.green} />)}
                  </Bar>
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
export function elementoReabSlide(dados) {
  return <ReabSlide dados={dados} />;
}
