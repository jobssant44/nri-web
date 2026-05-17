import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid,
  XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { useDb } from '../../utils/db';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import {
  D, PageContainer, PageHeader, EmptyState, ChartCard,
  KPICardPrimary, KPICardSecondary, FilterBar, FilterField, sInput, tdStyle,
} from '../../design';
import { GestaoIdadeTabs } from '../../modules/gestao-idade/GestaoIdadeTabs';
import {
  avaliarPalete, tsToDate, fmtData, fmtNum, resolverPZV, COR,
  carregarLogsContagem, carregarProdutosMap, carregarPZVMap,
  THRESHOLD_BAIXO_DIAS,
} from '../../modules/gestao-idade/gestaoIdadeHelpers';

export default function EstoqueEstoquePage() {
  const { col } = useDb();
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filtroLocal, setFiltroLocal] = useSessionFilter('eee:local', 'Estoque');
  const [filtroCurva, setFiltroCurva] = useSessionFilter('eee:curva', 'Todas');
  const [filtroData, setFiltroData] = useSessionFilter('eee:data', '');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [logs, produtosMap, pzvMap] = await Promise.all([
        carregarLogsContagem({ col }),
        carregarProdutosMap({ col }),
        carregarPZVMap({ col }),
      ]);
      const avals = logs.map(log => {
        const cod = String(log.productCode || '').trim();
        const produto = produtosMap[cod];
        const pzv = resolverPZV(cod, pzvMap, produto);
        const a = avaliarPalete({
          log, dataReferencia: tsToDate(log.timestamp) || new Date(),
          produto, pzvDias: pzv, vendaMediaCxDia: 0, curvaProduto: log.productCurva,
        });
        a._ts = tsToDate(log.timestamp);
        // Classifica: "Liberado" ou "Gestão de Idade"
        // Regra: se prazo até vencer < THRESHOLD_BAIXO_DIAS (45) → Gestão de Idade
        if (a.prazo != null && a.prazo < THRESHOLD_BAIXO_DIAS) a._check = 'Gestão de Idade';
        else a._check = 'Liberado';
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

  const filtradas = useMemo(() => {
    return linhas.filter(l => {
      if (filtroLocal !== 'Todos' && l.local !== filtroLocal) return false;
      if (filtroCurva !== 'Todas' && l.curva !== filtroCurva) return false;
      if (filtroData) {
        if (!l._ts) return false;
        const k = `${l._ts.getFullYear()}-${String(l._ts.getMonth()+1).padStart(2,'0')}-${String(l._ts.getDate()).padStart(2,'0')}`;
        if (k !== filtroData) return false;
      }
      return true;
    }).sort((a, b) => (a.vencimento && b.vencimento ? a.vencimento - b.vencimento : 0));
  }, [linhas, filtroLocal, filtroCurva, filtroData]);

  const statusCount = useMemo(() => {
    let liberado = 0, gestao = 0;
    filtradas.forEach(l => {
      if (l._check === 'Gestão de Idade') gestao++;
      else liberado++;
    });
    return { liberado, gestao, total: liberado + gestao };
  }, [filtradas]);

  // Distribuição por rua
  const porRua = useMemo(() => {
    const map = {};
    filtradas.filter(l => l._check === 'Gestão de Idade').forEach(l => {
      const r = l.rua || '—';
      map[r] = (map[r] || 0) + 1;
    });
    return Object.entries(map).map(([rua, qtde]) => ({ rua, qtde })).sort((a, b) => b.qtde - a.qtde);
  }, [filtradas]);

  const dadosPie = [
    { nome: 'Liberado', valor: statusCount.liberado, cor: COR.liberado },
    { nome: 'Gestão de Idade', valor: statusCount.gestao, cor: COR.gestaoIdade },
  ];

  return (
    <PageContainer maxWidth={1400}>
      <PageHeader
        kicker="Gestão de Idade"
        titulo="Estoque x Estoque"
        sub="Status de cada palete contado: 'Liberado' (acima de 45 dias até vencer) ou 'Gestão de Idade' (próximo do vencimento)."
      />
      <GestaoIdadeTabs />

      <FilterBar>
        <FilterField label="Local">
          <select style={sInput} value={filtroLocal} onChange={e => setFiltroLocal(e.target.value)}>
            <option>Todos</option>
            <option>Estoque</option>
            <option>Picking</option>
            <option>PNC</option>
          </select>
        </FilterField>
        <FilterField label="Curva ABC">
          <select style={sInput} value={filtroCurva} onChange={e => setFiltroCurva(e.target.value)}>
            <option>Todas</option><option>A</option><option>B</option><option>C</option>
          </select>
        </FilterField>
        <FilterField label="Data Contagem">
          <select style={sInput} value={filtroData} onChange={e => setFiltroData(e.target.value)}>
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
        <EmptyState titulo="Sem contagens" descricao="Registre contagens no módulo Gerenciamento de Estoque." />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <KPICardPrimary
              label="Total de paletes"
              valor={String(statusCount.total)}
              cor={D.blue}
              sub="no filtro selecionado"
              destaque
            />
            <KPICardSecondary
              label="Liberados"
              valor={String(statusCount.liberado)}
              cor={COR.liberado}
              sub={`${statusCount.total > 0 ? Math.round((statusCount.liberado / statusCount.total) * 100) : 0}% do total`}
            />
            <KPICardSecondary
              label="Em Gestão de Idade"
              valor={String(statusCount.gestao)}
              cor={COR.gestaoIdade}
              sub={`${statusCount.total > 0 ? Math.round((statusCount.gestao / statusCount.total) * 100) : 0}% — atenção`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
            <ChartCard titulo="Status por palete">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={dadosPie} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={80} innerRadius={50} label={(p) => p.valor > 0 ? p.valor : ''}>
                    {dadosPie.map((d, i) => <Cell key={i} fill={d.cor} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: 12 }}>
                {dadosPie.map(d => (
                  <div key={d.nome} style={{ display: 'flex', alignItems: 'center', gap: 6, color: D.textSec }}>
                    <div style={{ width: 10, height: 10, background: d.cor, borderRadius: 2 }} />
                    {d.nome}: <strong style={{ color: d.cor, fontFamily: D.mono }}>{d.valor}</strong>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard titulo="Paletes em Gestão de Idade por rua">
              {porRua.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: D.textMuted, fontStyle: 'italic' }}>
                  Nenhum palete em Gestão de Idade.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, porRua.length * 28)}>
                  <BarChart data={porRua} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="rua" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip />
                    <Bar dataKey="qtde" fill={COR.gestaoIdade} radius={[0, 5, 5, 0]}>
                      <LabelList dataKey="qtde" position="right" style={{ fontSize: 11, fontFamily: D.mono }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Tabela */}
          <ChartCard titulo="Planificador Gestão de Bloqueio de Idade">
            <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    {['Item','Local','Rua','Descrição','Quant.','Curva','Vencimento','Prazo','Check Estoque'].map(c => (
                      <th key={c} style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((l, i) => (
                    <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                      <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{l.productCode}</td>
                      <td style={tdStyle}>{l.local || '—'}</td>
                      <td style={{ ...tdStyle, fontFamily: D.mono }}>{l.rua || '—'}</td>
                      <td style={{ ...tdStyle, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.descricao}>{l.descricao}</td>
                      <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{fmtNum(l.quantidadeCx, 0)}</td>
                      <td style={tdStyle}>
                        {l.curva ? (
                          <span style={{
                            padding: '2px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                            backgroundColor: l.curva === 'A' ? D.greenSoft : l.curva === 'B' ? D.amberSoft : D.redSoft,
                            color: l.curva === 'A' ? D.green : l.curva === 'B' ? D.amber : D.red,
                          }}>{l.curva}</span>
                        ) : '—'}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: D.mono }}>{fmtData(l.vencimento)}</td>
                      <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{l.prazo != null ? `${l.prazo}d` : '—'}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '3px 9px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                          background: l._check === 'Gestão de Idade' ? COR.gestaoIdade : COR.liberado,
                          color: '#fff',
                        }}>{l._check}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </PageContainer>
  );
}
