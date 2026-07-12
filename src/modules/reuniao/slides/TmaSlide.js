/**
 * TmaSlide — versão "slide" (16:9) da tela de TMA, pra ser capturada como PNG
 * e embutida no PowerPoint da Reunião. Reusa os MESMOS componentes/cores do app
 * (design system + Recharts), então o slide fica igual ao que o supervisor vê.
 *
 * Recebe `dados` no formato que o tmaModulo.buscarDados() já devolve:
 *   { periodo, qtdRegistros, tmaMedio, motoristas, locais, placas,
 *     piorMotoristas:[{name,value}], piorLocais:[{name,value}], porMes:[{name,value}] }
 * Os `value` de piorMotoristas/piorLocais/porMes vêm em MINUTOS (inteiros).
 * Renderiza numa largura fixa (1280px) e SEM animação pra captura estática.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
} from 'recharts';
import { D, intFmt, ChartCard } from '../../../design';

// Altura proporcional ao nº de barras (espelha o comportamento das páginas).
const alturaBarras = n => Math.min(Math.max(150, n * 24), 260);

// ms → HH:MM:SS (idêntico ao formatarMs/formatarTMA da tela e do módulo).
function formatarTMA(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// minutos (inteiros, como o buscarDados devolve) → rótulo de tempo compacto.
const fmtMin = min => {
  const v = Math.max(0, Math.round(min || 0));
  const h = Math.floor(v / 60);
  const mm = v % 60;
  return h > 0 ? `${h}h${String(mm).padStart(2, '0')}` : `${mm}min`;
};

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

export default function TmaSlide({ dados }) {
  // buscarDados já limita a 10 e ordena — sem corte próprio, o slide mostra o
  // mesmo nº de barras dos rankings do módulo.
  const piorMotoristas = (dados.piorMotoristas || []).map(d => ({ motorista: d.name, valor: d.value }));
  const piorLocais     = (dados.piorLocais     || []).map(d => ({ local: d.name, valor: d.value }));
  const porMes         = (dados.porMes         || []).map(d => ({ mes: d.name, valor: d.value }));

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              TMA · Tempo Médio de Atendimento
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            TMA — Painel Geral
          </h1>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 4 numa linha (espelha os cards da tela) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="TMA Médio" valor={formatarTMA(dados.tmaMedio)} cor={D.red} />
        <KpiMini label="Total Registros" valor={intFmt(dados.qtdRegistros)} cor={D.blue} sub={`${intFmt(dados.placas)} placas`} />
        <KpiMini label="Locais" valor={intFmt(dados.locais)} cor={D.green} sub="locais atendidos" />
        <KpiMini label="Motoristas" valor={intFmt(dados.motoristas)} cor={D.amber} sub="motoristas" />
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <ChartCard titulo="Top 10 Motoristas — Pior TMA">
          {piorMotoristas.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(piorMotoristas.length)}>
              <BarChart data={piorMotoristas} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" tickFormatter={fmtMin} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="motorista" width={180} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 28 ? txt.slice(0, 28) + '…' : txt;
                    return <text x={x - 176} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="valor" name="TMA Médio" fill={D.red} radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: fmtMin, fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard titulo="Top 10 Locais — Pior TMA">
          {piorLocais.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(piorLocais.length)}>
              <BarChart data={piorLocais} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" tickFormatter={fmtMin} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="local" width={170} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 26 ? txt.slice(0, 26) + '…' : txt;
                    return <text x={x - 166} y={y} dy={4} textAnchor="start" fontSize={10} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="valor" name="TMA Médio" radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', formatter: fmtMin, fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
                  {piorLocais.map((_, i) => <Cell key={i} fill={D.amber} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <div style={{ gridColumn: '1 / -1' }}>
          <ChartCard titulo="TMA Médio — Mês a Mês">
            {porMes.length === 0 ? <VazioSlide /> : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={porMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtMin} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Bar dataKey="valor" name="TMA Médio" radius={[5, 5, 0, 0]} maxBarSize={48} isAnimationActive={false}
                    label={{ position: 'top', formatter: fmtMin, fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
                    {porMes.map((_, i) => <Cell key={i} fill={D.blue} />)}
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
export function elementoTmaSlide(dados) {
  return <TmaSlide dados={dados} />;
}
