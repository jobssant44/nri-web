import React, { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, CartesianGrid, XAxis, YAxis,
  Tooltip, ResponsiveContainer, BarChart, LabelList, Cell,
} from 'recharts';
import { useDb } from '../../utils/db';
import { useLocalFilter } from '../../hooks/useLocalFilter';
import {
  D, PageContainer, PageHeader, EmptyState, ChartCard,
  KPICardPrimary, KPICardSecondary, FilterBar, FilterField, sInput, tdStyle,
} from '../../design';
import { GestaoIdadeTabs } from '../../modules/gestao-idade/GestaoIdadeTabs';
import {
  avaliarPalete, detectarQuebraFEFO, tsToDate, fmtData, fmtNum,
  carregarLogsContagem, carregarProdutosMap, TOLERANCIA_QUEBRA_FEFO,
} from '../../modules/gestao-idade/gestaoIdadeHelpers';

const MESES_NOME = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

export default function EstoquePickingPage() {
  const { col } = useDb();
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dataContagemSel, setDataContagemSel] = useLocalFilter('exp:data', '');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [logs, produtosMap] = await Promise.all([
        carregarLogsContagem({ col }),
        carregarProdutosMap({ col }),
      ]);
      const avals = logs.map(log => {
        const cod = String(log.productCode || '').trim();
        const produto = produtosMap[cod];
        const a = avaliarPalete({
          log, dataReferencia: tsToDate(log.timestamp) || new Date(),
          produto, pzvDias: null, vendaMediaCxDia: 0, curvaProduto: log.productCurva,
        });
        a._ts = tsToDate(log.timestamp);
        return a;
      });
      setLinhas(avals);
    } finally {
      setLoading(false);
    }
  }

  const contagensDisponiveis = useMemo(() => {
    const set = new Set();
    linhas.forEach(l => {
      if (l._ts) set.add(`${l._ts.getFullYear()}-${String(l._ts.getMonth()+1).padStart(2,'0')}-${String(l._ts.getDate()).padStart(2,'0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [linhas]);

  const linhasDoFiltro = useMemo(() => {
    if (!dataContagemSel) return linhas;
    return linhas.filter(l => {
      if (!l._ts) return false;
      const k = `${l._ts.getFullYear()}-${String(l._ts.getMonth()+1).padStart(2,'0')}-${String(l._ts.getDate()).padStart(2,'0')}`;
      return k === dataContagemSel;
    });
  }, [linhas, dataContagemSel]);

  const quebras = useMemo(() => detectarQuebraFEFO(linhasDoFiltro), [linhasDoFiltro]);

  const totalComparacoes = quebras.length;
  const totalQuebras = quebras.filter(q => q.quebra).length;
  const pctQuebra = totalComparacoes ? (totalQuebras / totalComparacoes) * 100 : 0;

  // Por mês
  const porMes = useMemo(() => {
    const map = {}; // 'YYYY-MM' → { compar, quebras }
    linhas.forEach(l => {
      if (!l._ts) return;
      const k = `${l._ts.getFullYear()}-${String(l._ts.getMonth()+1).padStart(2,'0')}`;
      if (!map[k]) map[k] = [];
      map[k].push(l);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const qs = detectarQuebraFEFO(v);
        const total = qs.length;
        const quebras = qs.filter(q => q.quebra).length;
        return {
          mesLabel: MESES_NOME[parseInt(k.split('-')[1]) - 1] + '/' + k.split('-')[0].slice(2),
          quebras,
          pct: total ? Math.round((quebras / total) * 100) : 0,
        };
      });
  }, [linhas]);

  // Por dia (data de contagem)
  const porDia = useMemo(() => {
    const grupos = new Map();
    linhas.forEach(l => {
      if (!l._ts) return;
      const k = `${l._ts.getFullYear()}-${String(l._ts.getMonth()+1).padStart(2,'0')}-${String(l._ts.getDate()).padStart(2,'0')}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(l);
    });
    return Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const qs = detectarQuebraFEFO(v);
        const tot = qs.length;
        const q = qs.filter(x => x.quebra).length;
        const [, m, d] = k.split('-');
        return {
          diaLabel: `${d}/${m}`,
          quebras: q,
          pct: tot ? Math.round((q / tot) * 100) : 0,
        };
      });
  }, [linhas]);

  // Por embalagem
  const porEmbalagem = useMemo(() => {
    const map = {};
    quebras.filter(q => q.quebra).forEach(q => {
      // pega embalagem do primeiro log com esse produto
      const l = linhasDoFiltro.find(x => x.productCode === q.productCode);
      const e = l?.embalagem || '—';
      map[e] = (map[e] || 0) + 1;
    });
    return Object.entries(map).map(([emb, n]) => ({ embalagem: emb, qtde: n })).sort((a, b) => b.qtde - a.qtde);
  }, [quebras, linhasDoFiltro]);

  return (
    <PageContainer maxWidth={1400}>
      <PageHeader
        kicker="Gestão de Idade"
        titulo="Estoque x Picking"
        sub="Detecta quebra de FEFO — quando o produto no Picking tem vencimento maior que no Estoque (deveria sair primeiro o mais antigo)."
      />
      <GestaoIdadeTabs />

      <FilterBar>
        <FilterField label="Data Contagem">
          <select style={sInput} value={dataContagemSel} onChange={e => setDataContagemSel(e.target.value)}>
            <option value="">Todas</option>
            {contagensDisponiveis.map(d => {
              const [y, m, dia] = d.split('-');
              return <option key={d} value={d}>{`${dia}/${m}/${y}`}</option>;
            })}
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: D.textMuted }}>Carregando...</div>
      ) : linhas.length === 0 ? (
        <EmptyState titulo="Sem contagens" descricao="Registre contagens em ambos os locais (Estoque e Picking) para detectar quebras." />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 18 }}>
            <KPICardPrimary
              label="Quebras de FEFO"
              valor={String(totalQuebras)}
              cor={totalQuebras > 0 ? D.red : D.green}
              sub={`em ${totalComparacoes} comparação(ões)`}
              destaque={totalQuebras > 0}
            />
            <KPICardSecondary
              label="% Quebra"
              valor={`${pctQuebra.toFixed(1)}%`}
              cor={pctQuebra > 5 ? D.red : pctQuebra > 0 ? D.amber : D.green}
              sub="meta: 0%"
            />
            <KPICardSecondary
              label="Tolerância permitida"
              valor={`${TOLERANCIA_QUEBRA_FEFO} dia(s)`}
              cor={D.blue}
              sub="diferença máxima aceita"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ChartCard titulo="Ocorrência de quebra de FEFO por mês">
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={porMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="quebras" fill={D.blue} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="quebras" position="top" style={{ fontSize: 11, fontFamily: D.mono }} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="pct" stroke={D.amber} strokeWidth={2} dot={{ r: 4 }}>
                    <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 10, fontFamily: D.mono, fill: D.amber }} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard titulo="Ocorrência de quebra de FEFO por dia">
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={porDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis dataKey="diaLabel" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="quebras" fill={D.blue} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="quebras" position="top" style={{ fontSize: 11, fontFamily: D.mono }} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="pct" stroke={D.amber} strokeWidth={2} dot={{ r: 4 }}>
                    <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 10, fontFamily: D.mono, fill: D.amber }} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {porEmbalagem.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <ChartCard titulo="Ocorrência de quebra de FEFO por embalagem">
                <ResponsiveContainer width="100%" height={Math.max(200, porEmbalagem.length * 32)}>
                  <BarChart data={porEmbalagem} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="embalagem" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} width={140} />
                    <Tooltip />
                    <Bar dataKey="qtde" fill={D.red} radius={[0, 5, 5, 0]}>
                      <LabelList dataKey="qtde" position="right" style={{ fontSize: 11, fontFamily: D.mono }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* Tabela de detalhes */}
          <ChartCard titulo="Planificador Quebra de FEFO — Estoque x Picking">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
                <thead>
                  <tr>
                    {['Produto','Descrição','Curva','Vencimento Estoque','Vencimento Picking','Status','Diferença','Tolerância'].map(c => (
                      <th key={c} style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quebras.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: D.textMuted, fontStyle: 'italic' }}>Nenhum produto presente em ambos os locais para comparar.</td></tr>
                  ) : quebras.map((q, i) => {
                    const l = linhasDoFiltro.find(x => x.productCode === q.productCode);
                    return (
                      <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                        <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{q.productCode}</td>
                        <td style={{ ...tdStyle, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l?.descricao}>{l?.descricao || q.descricao}</td>
                        <td style={tdStyle}>
                          {q.curva ? (
                            <span style={{
                              padding: '2px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                              backgroundColor: q.curva === 'A' ? D.greenSoft : q.curva === 'B' ? D.amberSoft : D.redSoft,
                              color: q.curva === 'A' ? D.green : q.curva === 'B' ? D.amber : D.red,
                            }}>{q.curva}</span>
                          ) : '—'}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: D.mono }}>{fmtData(q.vencimentoEstoque)}</td>
                        <td style={{ ...tdStyle, fontFamily: D.mono }}>{fmtData(q.vencimentoPicking)}</td>
                        <td style={tdStyle}>
                          {q.quebra ? (
                            <span style={{ padding: '3px 9px', borderRadius: 6, backgroundColor: D.red, color: '#fff', fontSize: 10.5, fontWeight: 700 }}>Quebra de FEFO</span>
                          ) : (
                            <span style={{ padding: '3px 9px', borderRadius: 6, backgroundColor: D.green, color: '#fff', fontSize: 10.5, fontWeight: 700 }}>OK</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700, color: q.diferenca < 0 ? D.red : D.text, textAlign: 'right' }}>{q.diferenca}d</td>
                        <td style={{ ...tdStyle, fontFamily: D.mono, color: D.textMuted, textAlign: 'right' }}>{q.toleranciaPermitida}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </PageContainer>
  );
}

// (Suprime warnings de import não usados em alguns casos)
void Cell;
void fmtNum;
