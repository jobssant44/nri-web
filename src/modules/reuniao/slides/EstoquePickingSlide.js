/**
 * EstoquePickingSlide — versão "slide" (16:9) da página Estoque x Picking
 * (Gestão de Idade), pra ser capturada como PNG e embutida no PowerPoint da
 * Reunião. Reusa os MESMOS componentes/cores do app (design system + Recharts),
 * então o slide fica coerente com o dashboard on-screen.
 *
 * Recebe `dados` no formato que o estoquePickingModulo.buscarDados() devolve:
 *   totalQuebras, totalComparacoes, pctQuebra, tolerancia   (KPIs)
 *   porMes  [{ name, quebras, pct }]  → composed bar+line
 *   porDia  [{ name, quebras, pct }]  → composed bar+line
 *   porEmbalagem [{ name, value }]    → barH
 *   detalhe [{ productCode, descricao, curva, vencimento*, diferenca, ... }]
 *
 * Render em largura fixa (1280px) e SEM animação (isAnimationActive={false}).
 */
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  BarChart, LabelList, Cell,
} from 'recharts';
import { D, ChartCard } from '../../../design';
import { fmtData } from '../../gestao-idade/gestaoIdadeHelpers';

// Altura proporcional ao nº de barras (espelha o comportamento das páginas WJS).
const alturaBarras = n => Math.min(Math.max(200, n * 32), 320);

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

// Gráfico composto (barras de qtd + linha de %), igual à página on-screen.
function GraficoComposto({ data }) {
  if (!data || data.length === 0) return <VazioSlide />;
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data} margin={{ top: 16, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
        <Bar yAxisId="left" dataKey="quebras" name="Quebras" fill={D.blue} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          <LabelList dataKey="quebras" position="top" style={{ fontSize: 11, fontFamily: D.mono, fill: D.textSec }} />
        </Bar>
        <Line yAxisId="right" type="monotone" dataKey="pct" name="% Quebra" stroke={D.amber} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false}>
          <LabelList dataKey="pct" position="top" formatter={v => `${v}%`} style={{ fontSize: 10, fontFamily: D.mono, fill: D.amber }} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function EstoquePickingSlide({ dados }) {
  const porMes       = dados.porMes       || [];
  const porDia       = dados.porDia       || [];
  const porEmbalagem = dados.porEmbalagem || [];
  const detalhe      = dados.detalhe      || [];

  const totalQuebras = dados.totalQuebras || 0;
  const pctQuebra    = dados.pctQuebra || 0;
  const corQuebras   = totalQuebras > 0 ? D.red : D.green;
  const corPct       = pctQuebra > 5 ? D.red : pctQuebra > 0 ? D.amber : D.green;

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              Gestão de Idade · Estoque x Picking
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Estoque x Picking
          </h1>
          <div style={{ fontSize: 11, color: D.textMuted, marginTop: 4, fontFamily: D.font }}>
            Quebra de FEFO — Picking com vencimento maior que o Estoque
          </div>
        </div>
        <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
      </div>

      {/* KPIs — 3 numa linha (espelha os KPICards da página) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini label="Quebras de FEFO" valor={String(totalQuebras)}       cor={corQuebras} sub={`em ${dados.totalComparacoes || 0} comparação(ões)`} />
        <KpiMini label="% Quebra"        valor={`${pctQuebra.toFixed(1)}%`} cor={corPct}     sub="meta: 0%" />
        <KpiMini label="Tolerância"      valor={`${dados.tolerancia ?? 0} dia(s)`} cor={D.blue} sub="diferença máxima aceita" />
      </div>

      {/* Gráficos por mês / por dia (composed bar+line) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ChartCard titulo="Ocorrência de quebra de FEFO por mês">
          <GraficoComposto data={porMes} />
        </ChartCard>
        <ChartCard titulo="Ocorrência de quebra de FEFO por dia">
          <GraficoComposto data={porDia} />
        </ChartCard>
      </div>

      {/* Por embalagem — barH, largura total */}
      <div style={{ marginBottom: 16 }}>
        <ChartCard titulo="Ocorrência de quebra de FEFO por embalagem">
          {porEmbalagem.length === 0 ? <VazioSlide /> : (
            <ResponsiveContainer width="100%" height={alturaBarras(porEmbalagem.length)}>
              <BarChart data={porEmbalagem} layout="vertical" margin={{ top: 4, right: 40, left: 20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={160} axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => {
                    const txt = String(payload.value || '');
                    const trunc = txt.length > 22 ? txt.slice(0, 22) + '…' : txt;
                    return <text x={x - 156} y={y} dy={4} textAnchor="start" fontSize={11} fontFamily={D.font} fill={D.textSec}>{trunc}</text>;
                  }} />
                <Bar dataKey="value" name="Quebras" fill={D.red} radius={[0, 5, 5, 0]} isAnimationActive={false}
                  label={{ position: 'right', fontSize: 11, fill: D.textSec, fontFamily: D.mono }}>
                  {porEmbalagem.map((_, i) => <Cell key={i} fill={D.red} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Detalhamento — Estoque x Picking (produtos em ambos os locais) */}
      <ChartCard titulo="Planificador Quebra de FEFO — Estoque x Picking">
        {detalhe.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: D.textMuted, fontStyle: 'italic', fontSize: 12.5, fontFamily: D.font }}>
            Nenhum produto presente em ambos os locais para comparar.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
              <thead>
                <tr>
                  {['Produto', 'Descrição', 'Curva', 'Venc. Estoque', 'Venc. Picking', 'Status', 'Diferença', 'Tolerância'].map(c => (
                    <th key={c} style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalhe.slice(0, 12).map((q, i) => (
                  <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                    <td style={{ padding: '7px 10px', borderBottom: `1px solid ${D.borderLight}`, fontFamily: D.mono, fontWeight: 700, color: D.text }}>{q.productCode}</td>
                    <td style={{ padding: '7px 10px', borderBottom: `1px solid ${D.borderLight}`, color: D.textSec, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.descricao}</td>
                    <td style={{ padding: '7px 10px', borderBottom: `1px solid ${D.borderLight}` }}>
                      {q.curva ? (
                        <span style={{
                          padding: '2px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                          backgroundColor: q.curva === 'A' ? D.greenSoft : q.curva === 'B' ? D.amberSoft : D.redSoft,
                          color: q.curva === 'A' ? D.green : q.curva === 'B' ? D.amber : D.red,
                        }}>{q.curva}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', borderBottom: `1px solid ${D.borderLight}`, fontFamily: D.mono, color: D.textSec }}>{fmtData(q.vencimentoEstoque)}</td>
                    <td style={{ padding: '7px 10px', borderBottom: `1px solid ${D.borderLight}`, fontFamily: D.mono, color: D.textSec }}>{fmtData(q.vencimentoPicking)}</td>
                    <td style={{ padding: '7px 10px', borderBottom: `1px solid ${D.borderLight}` }}>
                      {q.quebra ? (
                        <span style={{ padding: '3px 9px', borderRadius: 6, backgroundColor: D.red, color: '#fff', fontSize: 10.5, fontWeight: 700 }}>Quebra de FEFO</span>
                      ) : (
                        <span style={{ padding: '3px 9px', borderRadius: 6, backgroundColor: D.green, color: '#fff', fontSize: 10.5, fontWeight: 700 }}>OK</span>
                      )}
                    </td>
                    <td style={{ padding: '7px 10px', borderBottom: `1px solid ${D.borderLight}`, fontFamily: D.mono, fontWeight: 700, color: q.diferenca < 0 ? D.red : D.text, textAlign: 'right' }}>{q.diferenca}d</td>
                    <td style={{ padding: '7px 10px', borderBottom: `1px solid ${D.borderLight}`, fontFamily: D.mono, color: D.textMuted, textAlign: 'right' }}>{q.toleranciaPermitida}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

/** Factory: retorna o elemento pronto pra capturarParaPNG(). */
export function elementoEstoquePickingSlide(dados) {
  return <EstoquePickingSlide dados={dados} />;
}
