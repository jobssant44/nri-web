import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';
import { useDb } from '../../utils/db';
import { useLocalFilter } from '../../hooks/useLocalFilter';
import {
  D, PageContainer, PageHeader, EmptyState, ChartCard,
  KPICardPrimary, KPICardSecondary, FilterBar, FilterField, sInput, tdStyle,
} from '../../design';
import { GestaoIdadeTabs } from '../../modules/gestao-idade/GestaoIdadeTabs';
import {
  avaliarPalete, calcularStockAge, tsToDate, fmtNum, fmtPct, resolverPZV,
  carregarLogsContagem, carregarProdutosMap, carregarPZVMap, carregarVendaMediaMap,
  THRESHOLD_SEGREGAR_PCT,
} from '../../modules/gestao-idade/gestaoIdadeHelpers';

const MESES_NOME = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const META = 90; // meta % do stock age index

export default function StockAgeIndexPage() {
  const { col } = useDb();
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [anoSel, setAnoSel] = useLocalFilter('sai:ano', '');
  const [mesSel, setMesSel] = useLocalFilter('sai:mes', '');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [logs, produtosMap, pzvMap, vendaMap] = await Promise.all([
        carregarLogsContagem({ col }),
        carregarProdutosMap({ col }),
        carregarPZVMap({ col }),
        carregarVendaMediaMap({ col, diasJanela: 30 }),
      ]);
      const avals = logs.map(log => {
        const cod = String(log.productCode || '').trim();
        const produto = produtosMap[cod];
        const pzv = resolverPZV(cod, pzvMap, produto);
        const v = vendaMap[cod] || 0;
        const a = avaliarPalete({
          log, dataReferencia: tsToDate(log.timestamp) || new Date(),
          produto, pzvDias: pzv, vendaMediaCxDia: v, curvaProduto: log.productCurva,
        });
        // Anota timestamp pra filtrar por ano/mês
        a._ts = tsToDate(log.timestamp);
        return a;
      });
      setLinhas(avals);

      // Default: ano/mês mais recente
      if (avals.length > 0) {
        const mais = avals.reduce((m, x) => (x._ts && (!m || x._ts > m) ? x._ts : m), null);
        if (mais) {
          if (!anoSel) setAnoSel(String(mais.getFullYear()));
          if (!mesSel) setMesSel(String(mais.getMonth() + 1));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // Filtros disponíveis
  const anosDisponiveis = useMemo(() => {
    const s = new Set();
    linhas.forEach(l => l._ts && s.add(l._ts.getFullYear()));
    return Array.from(s).sort((a, b) => b - a);
  }, [linhas]);

  const filtradas = useMemo(() => {
    return linhas.filter(l => {
      if (!l._ts) return false;
      if (anoSel && l._ts.getFullYear() !== parseInt(anoSel)) return false;
      if (mesSel && (l._ts.getMonth() + 1) !== parseInt(mesSel)) return false;
      return true;
    });
  }, [linhas, anoSel, mesSel]);

  const agreg = useMemo(() => calcularStockAge(filtradas), [filtradas]);

  // Por curva
  const porCurva = useMemo(() => {
    const map = { A: { hecto: 0, hectoSL60: 0 }, B: { hecto: 0, hectoSL60: 0 }, C: { hecto: 0, hectoSL60: 0 } };
    filtradas.forEach(l => {
      if (!l.curva || !map[l.curva]) return;
      map[l.curva].hecto += l.hectoTotal;
      if (l.pctShelfLife != null && l.pctShelfLife < THRESHOLD_SEGREGAR_PCT) {
        map[l.curva].hectoSL60 += l.hectoTotal;
      }
    });
    return ['A','B','C'].map(c => ({
      curva: c,
      pct: map[c].hecto > 0 ? ((map[c].hecto - map[c].hectoSL60) / map[c].hecto) * 100 : 0,
      hecto: map[c].hecto,
      hectoSL60: map[c].hectoSL60,
    }));
  }, [filtradas]);

  // Por mês (no ano selecionado)
  const porMes = useMemo(() => {
    const map = {}; // mes(1-12) → { hecto, hectoSL60 }
    linhas.forEach(l => {
      if (!l._ts) return;
      if (anoSel && l._ts.getFullYear() !== parseInt(anoSel)) return;
      const m = l._ts.getMonth() + 1;
      if (!map[m]) map[m] = { hecto: 0, hectoSL60: 0 };
      map[m].hecto += l.hectoTotal;
      if (l.pctShelfLife != null && l.pctShelfLife < THRESHOLD_SEGREGAR_PCT) {
        map[m].hectoSL60 += l.hectoTotal;
      }
    });
    return Object.entries(map)
      .map(([m, v]) => ({
        mes: MESES_NOME[parseInt(m) - 1],
        pct: v.hecto > 0 ? Math.round(((v.hecto - v.hectoSL60) / v.hecto) * 100) : 0,
      }))
      .sort((a, b) => MESES_NOME.indexOf(a.mes) - MESES_NOME.indexOf(b.mes));
  }, [linhas, anoSel]);

  // Por embalagem
  const porEmbalagem = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const e = l.embalagem || '—';
      if (!map[e]) map[e] = { hecto: 0, hectoSL60: 0 };
      map[e].hecto += l.hectoTotal;
      if (l.pctShelfLife != null && l.pctShelfLife < THRESHOLD_SEGREGAR_PCT) {
        map[e].hectoSL60 += l.hectoTotal;
      }
    });
    return Object.entries(map)
      .map(([e, v]) => ({
        embalagem: e,
        hecto: v.hecto,
        hectoSL60: v.hectoSL60,
        pct: v.hecto > 0 ? (v.hectoSL60 / v.hecto) * 100 : 0,
      }))
      .sort((a, b) => b.hecto - a.hecto);
  }, [filtradas]);

  return (
    <PageContainer maxWidth={1400}>
      <PageHeader
        kicker="Gestão de Idade"
        titulo="Stock Age Index"
        sub="Indicador de saúde do estoque (% de hectolitros acima de 60% de shelf life)."
      />

      <GestaoIdadeTabs />

      <FilterBar>
        <FilterField label="Ano">
          <select style={sInput} value={anoSel} onChange={e => setAnoSel(e.target.value)}>
            <option value="">Todos</option>
            {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </FilterField>
        <FilterField label="Mês">
          <select style={sInput} value={mesSel} onChange={e => setMesSel(e.target.value)}>
            <option value="">Todos</option>
            {MESES_NOME.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: D.textMuted }}>Carregando...</div>
      ) : linhas.length === 0 ? (
        <EmptyState titulo="Sem contagens" descricao="Registre ou importe contagens no módulo Gerenciamento de Estoque." />
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <KPICardPrimary
              label="% Stock Age Index"
              valor={fmtPct(agreg.stockAgeIndex, 2)}
              cor={agreg.stockAgeIndex >= META ? D.green : agreg.stockAgeIndex >= 70 ? D.amber : D.red}
              sub={`Meta: ${META}%`}
              destaque
            />
            <KPICardPrimary
              label="Hecto Total"
              valor={fmtNum(agreg.hectoTotal, 2)}
              cor={D.blue}
              sub={`${filtradas.length} palete(s) contado(s)`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
            <KPICardSecondary
              label="HL < 60% Shelf Life"
              valor={fmtNum(agreg.hectoSegregar, 2)}
              cor={D.red}
              sub={`${fmtPct(agreg.pctSegregar, 1)} do total`}
            />
            <KPICardSecondary
              label="HL < 30 Dias"
              valor={fmtNum(agreg.hl30, 2)}
              cor={D.red}
              sub="Crítico — vencimento próximo"
            />
            <KPICardSecondary
              label="Hecto < 45 Dias"
              valor={fmtNum(agreg.hecto45, 2)}
              cor={D.amber}
              sub="Atenção"
            />
            <KPICardSecondary
              label="Status"
              valor={agreg.stockAgeIndex >= META ? 'OK' : agreg.stockAgeIndex >= 70 ? 'Atenção' : 'Crítico'}
              cor={agreg.stockAgeIndex >= META ? D.green : agreg.stockAgeIndex >= 70 ? D.amber : D.red}
              sub={`vs meta de ${META}%`}
            />
          </div>

          {/* Gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ChartCard titulo="% Stock Age Index por Curva ABC">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porCurva}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis dataKey="curva" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => fmtPct(v, 1)} />
                  <ReferenceLine y={META} stroke={D.green} strokeDasharray="4 4" label={{ value: `Meta ${META}%`, fill: D.green, fontSize: 11 }} />
                  <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                    {porCurva.map((e, i) => (
                      <Cell key={i} fill={e.pct >= META ? D.green : e.pct >= 70 ? D.amber : D.red} />
                    ))}
                    <LabelList dataKey="pct" position="top" formatter={(v) => `${Math.round(v)}%`} style={{ fontSize: 11, fontFamily: D.mono, fill: D.text }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard titulo="% Stock Age Index por Mês">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={porMes} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <ReferenceLine y={META} stroke={D.green} strokeDasharray="4 4" label={{ value: `Meta ${META}%`, fill: D.green, fontSize: 11 }} />
                  <Line type="monotone" dataKey="pct" stroke={D.red} strokeWidth={2.5} dot={{ r: 4, fill: D.red, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }}>
                    <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 10, fontFamily: D.mono, fill: D.text }} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Tabela por curva */}
          <div style={{
            background: D.surface, border: `1px solid ${D.border}`,
            borderRadius: D.radius, padding: '18px 22px', marginBottom: 16, boxShadow: D.shadow,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: D.text, marginBottom: 8 }}>Detalhe por Curva</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...tdStyle, color: D.text, fontWeight: 700 }}>Curva</th>
                  <th style={{ ...tdStyle, color: D.text, fontWeight: 700, textAlign: 'right' }}>Hecto</th>
                  <th style={{ ...tdStyle, color: D.text, fontWeight: 700, textAlign: 'right' }}>Hecto &lt; 60% SL</th>
                  <th style={{ ...tdStyle, color: D.text, fontWeight: 700, textAlign: 'right' }}>% Saudável</th>
                </tr>
              </thead>
              <tbody>
                {porCurva.map(c => (
                  <tr key={c.curva}>
                    <td style={tdStyle}><strong>{c.curva}</strong></td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{fmtNum(c.hecto, 2)}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', color: c.hectoSL60 > 0 ? D.red : D.textMuted }}>{fmtNum(c.hectoSL60, 2)}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', fontWeight: 700, color: c.pct >= META ? D.green : c.pct >= 70 ? D.amber : D.red }}>{fmtPct(c.pct, 1)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${D.border}` }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', fontWeight: 700 }}>{fmtNum(agreg.hectoTotal, 2)}</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', fontWeight: 700, color: D.red }}>{fmtNum(agreg.hectoSegregar, 2)}</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', fontWeight: 700, color: agreg.stockAgeIndex >= META ? D.green : agreg.stockAgeIndex >= 70 ? D.amber : D.red }}>{fmtPct(agreg.stockAgeIndex, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Por Embalagem */}
          <ChartCard titulo="% Stock Age Index por Embalagem">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...tdStyle, color: D.text, fontWeight: 700 }}>Embalagem</th>
                  <th style={{ ...tdStyle, color: D.text, fontWeight: 700, textAlign: 'right' }}>Hecto</th>
                  <th style={{ ...tdStyle, color: D.text, fontWeight: 700, textAlign: 'right' }}>Hecto &lt; 60% SL</th>
                  <th style={{ ...tdStyle, color: D.text, fontWeight: 700, textAlign: 'right' }}>% Crítico</th>
                </tr>
              </thead>
              <tbody>
                {porEmbalagem.map((e, i) => (
                  <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                    <td style={tdStyle}>{e.embalagem}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{fmtNum(e.hecto, 2)}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', color: e.hectoSL60 > 0 ? D.red : D.textMuted }}>{fmtNum(e.hectoSL60, 2)}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', fontWeight: 700, color: e.pct === 0 ? D.green : e.pct < 30 ? D.amber : D.red }}>{fmtPct(e.pct, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        </>
      )}
    </PageContainer>
  );
}
