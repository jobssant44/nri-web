/**
 * ReposicaoSlide — versão "slide" (16:9) da tela de Reposição, pra ser capturada
 * como PNG e embutida no PowerPoint da Reunião. Reusa os MESMOS componentes/cores
 * do app (design system + Recharts), então o slide fica idêntico ao dashboard que
 * o supervisor vê na ReposicaoPage.
 *
 * Recebe `dados` no formato que o reposicaoModulo.buscarDados() já devolve:
 *   - porMes:      [{ name, value }]
 *   - porDia:      [{ x, y, meta }]
 *   - porMotivos / porProdutos / porMotoristas / porAjudantes / porPlacas /
 *     porRN / porClientes: [{ name, value }]
 * Renderiza numa largura fixa (1280px) e SEM animação (isAnimationActive={false})
 * pra captura estática.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie,
} from 'recharts';
import { D, brl, numFmt, ChartCard } from '../../../design';

// Altura proporcional ao nº de barras (espelha o comportamento da ReposicaoPage).
const alturaBarras = n => Math.min(Math.max(150, n * 24), 260);

// Paleta circular pra Pizza de Motivos (8 cores) — idêntica à ReposicaoPage.
const CORES_PIZZA = [
  D.red, D.blue, D.amber, D.green,
  '#a855f7', '#06b6d4', '#f97316', '#64748b',
];

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

// Card de barra horizontal reutilizável (mesmo layout dos rankings da ReposicaoPage).
// `dados` = [{ label, valor }].
function CardBarraH({ titulo, dados, cor, larguraRot = 180, trunc = 28 }) {
  return (
    <ChartCard titulo={titulo}>
      {dados.length === 0 ? <VazioSlide /> : (
        <ResponsiveContainer width="100%" height={alturaBarras(dados.length)}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
            <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={larguraRot} axisLine={false} tickLine={false} interval={0}
              tick={({ x, y, payload }) => {
                const txt = String(payload.value || '');
                const t = txt.length > trunc ? txt.slice(0, trunc) + '…' : txt;
                return <text x={x - (larguraRot - 4)} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{t}</text>;
              }} />
            <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} isAnimationActive={false}
              label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
              {dados.map((_, i) => <Cell key={i} fill={cor} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// Legenda compacta estática pra Pizza de Motivos (mostra rótulo e %).
function LegendaMini({ dados }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 10px', marginTop: 8, padding: '0 4px' }}>
      {dados.map((d, i) => {
        const pct = total > 0 ? (d.valor / total) * 100 : 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: CORES_PIZZA[i % CORES_PIZZA.length], flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: D.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: D.font }}>
              {d.label}
            </span>
            <span style={{ fontSize: 9.5, color: D.textMuted, fontFamily: D.mono }}>{pct.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ReposicaoSlide({ dados }) {
  const metaPorHL = dados.meta || 0;
  const totalHecto = dados.totalHecto || 0;

  // Séries temporais — mesmos nomes/cores da ReposicaoPage.
  const porMes = (dados.porMes || []).map(d => ({ mes: d.name, valor: d.value }));
  const porDia = (dados.porDia || []).map(d => ({ dia: d.x, valor: d.y, meta: d.meta }));

  // Rankings [{ label, valor }] — buscarDados devolve { name, value }.
  const porMotivos    = (dados.porMotivos    || []).map(d => ({ label: d.name, valor: d.value }));
  const porProdutos   = (dados.porProdutos   || []).map(d => ({ label: d.name, valor: d.value }));
  const porMotoristas = (dados.porMotoristas || []).map(d => ({ label: d.name, valor: d.value }));
  const porAjudantes  = (dados.porAjudantes  || []).map(d => ({ label: d.name, valor: d.value }));
  const porPlacas     = (dados.porPlacas     || []).map(d => ({ label: d.name, valor: d.value }));
  const porRN         = (dados.porRN         || []).map(d => ({ label: d.name, valor: d.value }));
  const porClientes   = (dados.porClientes   || []).map(d => ({ label: d.name, valor: d.value }));

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              Reposição · Gestão de Prejuízo
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Reposição
          </h1>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 5 numa linha (mesma ordem/fórmula da ReposicaoPage) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="R$ Reposição Total" valor={brl(dados.totalValor)} cor={D.red} />
        <KpiMini
          label={dados.dentroMeta ? 'Economia' : 'Estouro'}
          valor={brl(Math.abs(dados.saldo))}
          cor={dados.dentroMeta ? D.green : D.red}
          sub="Meta − R$ Reposição"
        />
        <KpiMini label="Hecto Entregue" valor={numFmt(totalHecto)} cor={D.blue} />
        <KpiMini label="Meta R$" valor={brl(dados.metaRS)} cor={D.amber} sub={`R$ ${metaPorHL.toFixed(2).replace('.', ',')} × Hecto`} />
        <KpiMini label="Reposição R$/HL" valor={totalHecto > 0 ? brl(dados.reposRsHL) : '—'} cor={D.green} sub="R$ Reposição ÷ Hecto" />
      </div>

      {/* Grade de gráficos (2 colunas) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Mês a Mês (barras) — amber */}
        <ChartCard titulo="R$ Reposição — Mês a Mês">
          {porMes.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={porMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                <Bar dataKey="valor" name="R$ Reposição" radius={[5, 5, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  {porMes.map((_, i) => <Cell key={i} fill={D.amber} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Dia a Dia (linha) — verde real + meta vermelha tracejada */}
        <ChartCard titulo="R$ Reposição — Dia a Dia">
          {porDia.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={porDia} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: D.font, paddingTop: 8 }} />
                <Line type="monotone" dataKey="valor" name="R$ Reposição" stroke={D.green} strokeWidth={2} dot={{ r: 3, fill: D.green }} isAnimationActive={false} />
                <Line type="linear" dataKey="meta" name="Meta" stroke={D.red} strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Motivo (pizza) + legenda */}
        <ChartCard titulo="R$ Reposição por Motivo">
          {porMotivos.length === 0 ? <VazioSlide /> : (
            <>
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={porMotivos}
                    dataKey="valor"
                    nameKey="label"
                    cx="50%" cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    paddingAngle={1}
                    labelLine={false}
                    label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                    isAnimationActive={false}
                  >
                    {porMotivos.map((_, i) => (
                      <Cell key={i} fill={CORES_PIZZA[i % CORES_PIZZA.length]} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <LegendaMini dados={porMotivos} />
            </>
          )}
        </ChartCard>

        {/* Produtos — vermelho */}
        <CardBarraH titulo="Top Produtos por R$ Reposição" dados={porProdutos} cor={D.red} larguraRot={180} trunc={28} />

        {/* Motoristas — amber */}
        <CardBarraH titulo="Top Motoristas por R$ Reposição" dados={porMotoristas} cor={D.amber} larguraRot={180} trunc={28} />

        {/* Ajudantes — verde */}
        <CardBarraH titulo="Top Ajudantes por R$ Reposição" dados={porAjudantes} cor={D.green} larguraRot={180} trunc={28} />

        {/* Placas — azul */}
        <CardBarraH titulo="Top Placas por R$ Reposição" dados={porPlacas} cor={D.blue} larguraRot={120} trunc={16} />

        {/* RN — azul */}
        <CardBarraH titulo="R$ Reposição por RN" dados={porRN} cor={D.blue} larguraRot={180} trunc={28} />

        {/* Clientes — slate, largura total */}
        <div style={{ gridColumn: '1 / -1' }}>
          <CardBarraH titulo="Top Clientes por R$ Reposição" dados={porClientes} cor="#64748b" larguraRot={280} trunc={44} />
        </div>

      </div>
    </div>
  );
}

/** Factory: retorna o elemento pronto pra capturarParaPNG(). */
export function elementoReposicaoSlide(dados) {
  return <ReposicaoSlide dados={dados} />;
}
