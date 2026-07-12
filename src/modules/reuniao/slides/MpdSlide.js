/**
 * MpdSlide — versão "slide" (16:9) do módulo MPD (Mapas de Carregamento), pra ser
 * capturada como PNG e embutida no PowerPoint da Reunião. Reusa os MESMOS tokens/cores
 * do app (design system + Recharts) e os MESMOS agregados dos blocos nativos do mpd.js.
 *
 * Tela "parcial": a página on-screen (_FasePage) mostra métricas de EFC, mas o módulo
 * MPD agrega volume de mapas (motoristas, fases, mês a mês). Este slide reflete os DADOS
 * do buscarDados do módulo (o que os blocos nativos plotam), usando a página só como
 * referência de estilo/cores.
 *
 * Recebe `dados` no formato que o mpdModulo.buscarDados() já devolve:
 *   { periodo, totalRegistros, totalMapas, totalMotoristas, totalPlacas, totalRevendas,
 *     topMotoristas:[{name,value}], porFase:[{name,value}], porMes:[{name,value}] }
 * Renderiza numa largura fixa (1280px) e SEM animação (isAnimationActive={false}).
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
} from 'recharts';
import { D, intFmt, ChartCard } from '../../../design';

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

export default function MpdSlide({ dados }) {
  // Sem corte próprio — buscarDados já limita topMotoristas a 10; assim o slide mostra
  // o mesmo nº de barras dos blocos nativos.
  const topMotoristas = (dados.topMotoristas || []).map(d => ({ motorista: d.name, valor: d.value }));
  const porFase       = (dados.porFase       || []).map(d => ({ fase: d.name, valor: d.value }));
  const porMes        = (dados.porMes        || []).map(d => ({ mes: d.name, valor: d.value }));

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              MPD · Mapas de Carregamento
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Gestão MPD
          </h1>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 5 numa linha */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="Total de Mapas" valor={intFmt(dados.totalMapas)}      cor={D.red} />
        <KpiMini label="Registros"       valor={intFmt(dados.totalRegistros)} cor={D.blue} />
        <KpiMini label="Motoristas"      valor={intFmt(dados.totalMotoristas)} cor={D.amber} />
        <KpiMini label="Placas"          valor={intFmt(dados.totalPlacas)}     cor={D.green} />
        <KpiMini label="Revendas"        valor={intFmt(dados.totalRevendas)}   cor={D.blue} />
      </div>

      {/* Grade de gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <ChartCard titulo="Top 10 Motoristas (qtd de mapas)">
          {topMotoristas.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(topMotoristas.length)}>
              <BarChart data={topMotoristas} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" tickFormatter={v => intFmt(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="motorista" width={180} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 28 ? txt.slice(0, 28) + '…' : txt;
                    return <text x={x - 176} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="valor" name="Mapas" fill={D.blue} radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: v => intFmt(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="Distribuição por Fase (qtd de mapas)">
          {porFase.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(porFase.length)}>
              <BarChart data={porFase} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" tickFormatter={v => intFmt(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="fase" width={170} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 26 ? txt.slice(0, 26) + '…' : txt;
                    return <text x={x - 166} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="valor" name="Mapas" radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: v => intFmt(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
                  {porFase.map((_, i) => <Cell key={i} fill={D.amber} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Mês a Mês — ocupa a linha inteira */}
        <div style={{ gridColumn: '1 / -1' }}>
          <ChartCard titulo="Mapas — Mês a Mês">
            {porMes.length === 0 ? <VazioSlide /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={porMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => intFmt(v)} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Bar dataKey="valor" name="Mapas" radius={[5, 5, 0, 0]} maxBarSize={48} isAnimationActive={false}
                    label={{ position: 'top', formatter: v => intFmt(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
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
export function elementoMpdSlide(dados) {
  return <MpdSlide dados={dados} />;
}
