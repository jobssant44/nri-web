/**
 * Dashboard de Aderência à Curva ABC
 *
 * Mede: produto Curva X foi contado em endereço Curva X?
 *
 * Filtros:
 *  - Por data: dropdown de datas únicas de contagem (uma por semana)
 *  - Por mês:  consolida todas as contagens do mês escolhido
 *
 * Lê do log o snapshot histórico (aderenteABC + enderecoCurva + productCurva)
 * gravado no momento da contagem.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { getDocs } from 'firebase/firestore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, Legend,
} from 'recharts';
import { useDb } from '../../../../utils/db';
import { useSessionFilter } from '../../../../hooks/useSessionFilter';
import { monthKey, calcularAderenteABC, CURVA_PRODUTO_PADRAO } from '../../shared/curvaLookup';

// Resolve a curva efetiva do produto: usa a do snapshot do log, ou
// CURVA_PRODUTO_PADRAO ('C') quando produto não está cadastrado.
function curvaEfetiva(log) {
  return log.productCurva || CURVA_PRODUTO_PADRAO;
}

// Recalcula aderência ignorando o snapshot antigo do log e aplicando a regra
// nova (produto sem curva = C). Endereço sem curva continua indeterminado.
function aderenciaEfetiva(log) {
  return calcularAderenteABC(curvaEfetiva(log), log.enderecoCurva);
}

// Produtos contados em PNC (endereço começa com "PN", ou localArquivo === 'PNC')
// NÃO entram no cálculo de aderência ABC. Os logs continuam disponíveis para
// outras telas (Gestão de Idade, Histórico, etc.).
function isPNC(log) {
  if (log.localArquivo === 'PNC') return true;
  const end = String(log.endereco || '').trim().toUpperCase();
  return end.startsWith('PN');
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}
function fmtData(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function ymLabel(key) {
  const [y, m] = key.split('-');
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${meses[parseInt(m, 10) - 1]}/${y}`;
}

export function AdherenceABCDashboard() {
  const { col } = useDb();
  const [logs, setLogs] = useState([]);
  // Mapa codigo → descrição oficial da coleção `produtos` (campo descricao)
  const [produtosMap, setProdutosMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useSessionFilter('aderABC:modo', 'data'); // 'data' | 'mes'
  const [dataSel, setDataSel] = useSessionFilter('aderABC:data', '');
  const [mesSel, setMesSel] = useSessionFilter('aderABC:mes', '');
  // Curva selecionada (clique no gráfico ou nos cards) — filtra a tabela detalhada.
  // null = mostra tudo.
  const [curvaSelecionada, setCurvaSelecionada] = useSessionFilter('aderABC:curva', null);

  // ─── Estilos ──────────────────────────────────────────────────────────
  const containerStyle = { maxWidth: '1200px', margin: '20px auto', padding: '20px', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' };
  const cardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' };
  const kpiCardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center' };
  const kpiTitulo = { fontSize: '11px', color: '#666', marginBottom: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const kpiValor = { fontSize: '34px', fontWeight: 'bold', marginBottom: '5px', fontFamily: 'monospace' };
  const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '12px' };
  const thStyle = { backgroundColor: '#E31837', color: 'white', padding: '10px', textAlign: 'left', fontWeight: 'bold' };
  const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #ddd' };
  const inputStyle = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', minWidth: '180px' };
  const badgeAderente = { display: 'inline-block', padding: '3px 10px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' };
  const badgeNaoAderente = { display: 'inline-block', padding: '3px 10px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' };
  const badgeIndet = { display: 'inline-block', padding: '3px 10px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' };
  const tabBtn = (active) => ({
    padding: '8px 16px',
    backgroundColor: active ? '#E31837' : '#fff',
    color: active ? 'white' : '#666',
    border: `1px solid ${active ? '#E31837' : '#e2e8f0'}`,
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    marginRight: '6px',
  });

  // ─── Carregar logs + base de produtos ────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);
  async function carregar() {
    setLoading(true);
    try {
      const [snapLogs, snapProd] = await Promise.all([
        getDocs(col('inventory_logs')),
        getDocs(col('produtos')),
      ]);
      setLogs(snapLogs.docs.map(d => ({ id: d.id, ...d.data() })));
      const map = {};
      snapProd.docs.forEach(d => {
        const x = d.data();
        const cod = String(x.codigo || d.id || '').trim();
        if (cod) map[cod] = x.descricao || x.nome || '';
      });
      setProdutosMap(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ─── Datas e meses únicos para os filtros ─────────────────────────────
  const datasUnicas = useMemo(() => {
    const setD = new Set();
    logs.forEach(l => {
      const d = tsToDate(l.timestamp);
      if (d) setD.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    });
    return Array.from(setD).sort().reverse();
  }, [logs]);

  const mesesUnicos = useMemo(() => {
    const setM = new Set();
    logs.forEach(l => {
      if (l.chaveMes) { setM.add(l.chaveMes); return; }
      const d = tsToDate(l.timestamp);
      if (d) setM.add(monthKey(d.getFullYear(), d.getMonth() + 1));
    });
    return Array.from(setM).sort().reverse();
  }, [logs]);

  // ─── Filtrar logs ─────────────────────────────────────────────────────
  const filtradosBruto = useMemo(() => {
    if (modo === 'data') {
      if (!dataSel) return [];
      return logs.filter(l => {
        const d = tsToDate(l.timestamp);
        if (!d) return false;
        const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return k === dataSel;
      });
    }
    if (!mesSel) return [];
    return logs.filter(l => {
      const cm = l.chaveMes || (() => {
        const d = tsToDate(l.timestamp);
        return d ? monthKey(d.getFullYear(), d.getMonth() + 1) : null;
      })();
      return cm === mesSel;
    });
  }, [logs, modo, dataSel, mesSel]);

  // Para o cálculo de aderência ABC, paletes em PNC são EXCLUÍDOS
  // (não fazem sentido neste KPI). Os logs continuam disponíveis para outras telas.
  const filtrados = useMemo(() => filtradosBruto.filter(l => !isPNC(l)), [filtradosBruto]);

  // ─── Métricas ─────────────────────────────────────────────────────────
  // Recalcula on-the-fly aplicando a regra "produto sem curva = C".
  // Não toca os snapshots gravados — só corrige o que é mostrado.
  const metricas = useMemo(() => {
    let aderentes = 0, naoAderentes = 0, indeterminados = 0;
    filtrados.forEach(l => {
      const ader = aderenciaEfetiva(l);
      if (ader === true) aderentes++;
      else if (ader === false) naoAderentes++;
      else indeterminados++;
    });
    const computaveis = aderentes + naoAderentes;
    const percentual = computaveis > 0 ? Math.round((aderentes / computaveis) * 100) : null;
    return {
      total: filtrados.length,
      aderentes, naoAderentes, indeterminados,
      computaveis, percentual,
    };
  }, [filtrados]);

  // ─── Quebra por curva do produto ──────────────────────────────────────
  const porCurva = useMemo(() => {
    const map = { A: { aderentes: 0, naoAderentes: 0 }, B: { aderentes: 0, naoAderentes: 0 }, C: { aderentes: 0, naoAderentes: 0 } };
    filtrados.forEach(l => {
      const k = curvaEfetiva(l);
      if (!k || !map[k]) return;
      const ader = aderenciaEfetiva(l);
      if (ader === true) map[k].aderentes++;
      else if (ader === false) map[k].naoAderentes++;
    });
    return map;
  }, [filtrados]);

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#E31837', marginBottom: '20px' }}>📊 Aderência à Curva ABC</h1>

      {/* TOGGLE de modo */}
      <div style={cardStyle}>
        <div style={{ marginBottom: '12px' }}>
          <button style={tabBtn(modo === 'data')} onClick={() => setModo('data')}>📅 Por data de contagem</button>
          <button style={tabBtn(modo === 'mes')} onClick={() => setModo('mes')}>📆 Por mês (consolidado)</button>
        </div>

        {modo === 'data' && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Data:</label>
            <select value={dataSel} onChange={e => setDataSel(e.target.value)} style={inputStyle}>
              <option value="">-- Selecione uma data --</option>
              {datasUnicas.map(d => {
                const [y, m, dia] = d.split('-');
                return <option key={d} value={d}>{`${dia}/${m}/${y}`}</option>;
              })}
            </select>
            {dataSel && (
              <button onClick={() => setDataSel('')} style={{
                padding: '8px 14px', backgroundColor: '#6b7280', color: 'white',
                border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
              }}>🔄 Limpar</button>
            )}
            <button onClick={carregar} style={{
              padding: '8px 14px', backgroundColor: '#1D5A9E', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
              marginLeft: 'auto',
            }}>🔄 Recarregar</button>
          </div>
        )}

        {modo === 'mes' && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Mês:</label>
            <select value={mesSel} onChange={e => setMesSel(e.target.value)} style={inputStyle}>
              <option value="">-- Selecione um mês --</option>
              {mesesUnicos.map(m => <option key={m} value={m}>{ymLabel(m)}</option>)}
            </select>
            {mesSel && (
              <button onClick={() => setMesSel('')} style={{
                padding: '8px 14px', backgroundColor: '#6b7280', color: 'white',
                border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
              }}>🔄 Limpar</button>
            )}
            <button onClick={carregar} style={{
              padding: '8px 14px', backgroundColor: '#1D5A9E', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
              marginLeft: 'auto',
            }}>🔄 Recarregar</button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>⏳ Carregando contagens...</div>
      ) : logs.length === 0 ? (
        <div style={{ ...cardStyle, color: '#666' }}>
          📭 Nenhuma contagem registrada ainda. Use "Registrar Contagem" ou importe arquivos retroativos.
        </div>
      ) : (modo === 'data' && !dataSel) || (modo === 'mes' && !mesSel) ? (
        <div style={{ ...cardStyle, color: '#666' }}>
          {modo === 'data' ? '👆 Selecione uma data para ver os resultados.' : '👆 Selecione um mês para ver os resultados.'}
        </div>
      ) : metricas.total === 0 ? (
        <div style={{ ...cardStyle, color: '#666' }}>📭 Nenhuma contagem encontrada para esse filtro.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={gridStyle}>
            <div style={kpiCardStyle}>
              <div style={kpiTitulo}>Total de produtos</div>
              <div style={{ ...kpiValor, color: '#0f172a' }}>{metricas.computaveis}</div>
              <div style={{ fontSize: '11px', color: '#666' }}>aderentes + não aderentes</div>
            </div>

            <div style={{ ...kpiCardStyle, borderTop: '4px solid #22c55e' }}>
              <div style={kpiTitulo}>✅ Aderentes</div>
              <div style={{ ...kpiValor, color: '#22c55e' }}>{metricas.aderentes}</div>
              <div style={{ fontSize: '11px', color: '#166534' }}>produto X em endereço X</div>
            </div>

            <div style={{ ...kpiCardStyle, borderTop: '4px solid #ef4444' }}>
              <div style={kpiTitulo}>❌ Não aderentes</div>
              <div style={{ ...kpiValor, color: '#ef4444' }}>{metricas.naoAderentes}</div>
              <div style={{ fontSize: '11px', color: '#991b1b' }}>curva do prod ≠ endereço</div>
            </div>

            <div style={{
              ...kpiCardStyle,
              borderTop: '4px solid #1D5A9E',
              background: 'linear-gradient(135deg, #1D5A9E 0%, #0f172a 100%)',
              color: 'white',
            }}>
              <div style={{ ...kpiTitulo, color: 'rgba(255,255,255,0.75)' }}>📈 % Aderência</div>
              <div style={{ ...kpiValor, color: 'white' }}>
                {metricas.percentual == null ? '—' : `${metricas.percentual}%`}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                {metricas.percentual == null ? 'sem dados computáveis' :
                  metricas.percentual >= 80 ? '✅ Bom' : metricas.percentual >= 60 ? '⚠️ Aceitável' : '❌ Baixo'}
              </div>
            </div>
          </div>

          {/* Quebra por curva — gráfico interativo + cards clicáveis */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ color: '#E31837', fontSize: '14px', margin: 0 }}>📊 Aderência por curva do produto</h3>
              {curvaSelecionada && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                  background: curvaSelecionada === 'A' ? '#dcfce7' : curvaSelecionada === 'B' ? '#fef3c7' : '#fee2e2',
                  color: curvaSelecionada === 'A' ? '#166534' : curvaSelecionada === 'B' ? '#92400e' : '#991b1b',
                  border: `1px solid ${curvaSelecionada === 'A' ? '#86efac' : curvaSelecionada === 'B' ? '#fcd34d' : '#fca5a5'}`,
                }}>
                  Filtrando por Curva {curvaSelecionada}
                  <button
                    onClick={() => setCurvaSelecionada(null)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'inherit', fontSize: 13, padding: 0, lineHeight: 1, fontWeight: 700,
                    }}
                    title="Limpar filtro"
                  >✕</button>
                </div>
              )}
            </div>

            {/* Gráfico de colunas empilhadas */}
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={['A', 'B', 'C'].map(c => ({
                  curva: `Curva ${c}`,
                  curvaKey: c,
                  Aderentes: porCurva[c].aderentes,
                  'Não Aderentes': porCurva[c].naoAderentes,
                  total: porCurva[c].aderentes + porCurva[c].naoAderentes,
                  perc: (porCurva[c].aderentes + porCurva[c].naoAderentes) > 0
                    ? Math.round((porCurva[c].aderentes / (porCurva[c].aderentes + porCurva[c].naoAderentes)) * 100)
                    : 0,
                }))}
                margin={{ top: 24, right: 16, left: 0, bottom: 8 }}
                onClick={(e) => {
                  if (e?.activePayload?.[0]?.payload?.curvaKey) {
                    const c = e.activePayload[0].payload.curvaKey;
                    setCurvaSelecionada(prev => prev === c ? null : c);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="curva"
                  tick={(props) => {
                    const { x, y, payload } = props;
                    const c = payload.value.split(' ')[1];
                    const ativo = curvaSelecionada === c;
                    return (
                      <text x={x} y={y + 14} textAnchor="middle"
                        style={{
                          fontSize: 12, fill: ativo ? '#0f172a' : '#666',
                          fontWeight: ativo ? 800 : 500,
                          cursor: 'pointer',
                        }}>
                        {payload.value}
                      </text>
                    );
                  }}
                  axisLine={false} tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div style={{
                        background: '#fff', border: '1px solid #e5e7eb',
                        borderRadius: 8, padding: '10px 12px', fontSize: 12,
                        boxShadow: '0 6px 18px rgba(15,23,42,0.10)',
                      }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{d.curva}</div>
                        <div style={{ color: '#22c55e', fontWeight: 700, fontFamily: 'monospace' }}>
                          Aderentes: {d.Aderentes}
                        </div>
                        <div style={{ color: '#ef4444', fontWeight: 700, fontFamily: 'monospace' }}>
                          Não aderentes: {d['Não Aderentes']}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
                          Total: {d.total} · <strong>{d.perc}% de aderência</strong>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 10, color: '#999', fontStyle: 'italic' }}>
                          {curvaSelecionada === d.curvaKey ? 'Clique para limpar filtro' : 'Clique para filtrar tabela'}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="Aderentes" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} cursor="pointer">
                  <LabelList dataKey="Aderentes" position="center"
                    formatter={(v) => v > 0 ? v : ''}
                    style={{ fontSize: 11, fontFamily: 'monospace', fill: '#fff', fontWeight: 700 }}
                  />
                </Bar>
                <Bar dataKey="Não Aderentes" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} cursor="pointer">
                  <LabelList dataKey="Não Aderentes" position="center"
                    formatter={(v) => v > 0 ? v : ''}
                    style={{ fontSize: 11, fontFamily: 'monospace', fill: '#fff', fontWeight: 700 }}
                  />
                  <LabelList dataKey="perc" position="top"
                    formatter={(v) => `${v}%`}
                    style={{ fontSize: 11.5, fontFamily: 'monospace', fill: '#0f172a', fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Cards de curva — clicáveis, sincronizados com o gráfico */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: 12 }}>
              {['A', 'B', 'C'].map(c => {
                const v = porCurva[c];
                const tot = v.aderentes + v.naoAderentes;
                const perc = tot ? Math.round((v.aderentes / tot) * 100) : null;
                const corBase = c === 'A' ? '#22c55e' : c === 'B' ? '#f59e0b' : '#ef4444';
                const ativo = curvaSelecionada === c;
                return (
                  <div
                    key={c}
                    onClick={() => setCurvaSelecionada(prev => prev === c ? null : c)}
                    style={{
                      padding: '14px 16px',
                      border: `${ativo ? 2 : 1}px solid ${ativo ? corBase : corBase + '40'}`,
                      borderLeft: `4px solid ${corBase}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: ativo ? corBase + '10' : '#fff',
                      transition: 'all 0.15s ease',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => { if (!ativo) e.currentTarget.style.backgroundColor = '#fafafa'; }}
                    onMouseLeave={(e) => { if (!ativo) e.currentTarget.style.backgroundColor = '#fff'; }}
                    title={ativo ? 'Clique para limpar filtro' : `Clique para filtrar por Curva ${c}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                        Curva {c}
                      </span>
                      {ativo && <span style={{ fontSize: 10, color: corBase, fontWeight: 700 }}>● ativo</span>}
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: corBase, fontFamily: 'monospace' }}>
                      {perc == null ? '—' : `${perc}%`}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      {v.aderentes} aderente(s) / {tot} total
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabela detalhada */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ color: '#E31837', fontSize: '14px', margin: 0 }}>📋 Detalhe das contagens</h3>
              {curvaSelecionada && (
                <span style={{ fontSize: 11, color: '#666' }}>
                  Filtrado por <strong>Curva {curvaSelecionada}</strong> ·{' '}
                  <button onClick={() => setCurvaSelecionada(null)}
                    style={{ background: 'none', border: 'none', color: '#E31837', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
                    limpar
                  </button>
                </span>
              )}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
              <table style={tableStyle}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Data</th>
                    <th style={thStyle}>Endereço</th>
                    <th style={thStyle}>C.End</th>
                    <th style={thStyle}>Código</th>
                    <th style={thStyle}>Produto</th>
                    <th style={thStyle}>C.Prod</th>
                    <th style={thStyle}>Qtde</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados
                    .filter(l => !curvaSelecionada || curvaEfetiva(l) === curvaSelecionada)
                    .slice(0, 500).map((l, idx) => {
                    const d = tsToDate(l.timestamp);
                    const ader = aderenciaEfetiva(l);
                    const curvaProdEfet = curvaEfetiva(l);
                    const curvaDefault = !l.productCurva; // foi defaultada para 'C'
                    return (
                      <tr key={l.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                        <td style={tdStyle}>
                          <span style={ader === true ? badgeAderente : ader === false ? badgeNaoAderente : badgeIndet}>
                            {ader === true ? '✅ Aderente' : ader === false ? '❌ Não' : '⚠️ Indet.'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px' }}>{fmtData(d)}</td>
                        <td style={{ ...tdStyle, fontWeight: 'bold' }}>{l.endereco || `${l.area || ''}-${l.street || ''}-${l.palettePosition || ''}`}</td>
                        <td style={tdStyle}>{l.enderecoCurva || <span style={{ color: '#999' }}>—</span>}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{l.productCode}</td>
                        <td style={tdStyle}>
                          {produtosMap[String(l.productCode).trim()]
                            || l.productName
                            || <span style={{ color: '#999' }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          {curvaProdEfet}
                          {curvaDefault && (
                            <span title="Produto sem curva cadastrada — assumido C"
                              style={{ marginLeft: 4, fontSize: 10, color: '#999', fontStyle: 'italic' }}>*</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{l.quantidade ?? '—'}{l.unidade ? ` ${l.unidade}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(() => {
              const totalNaTabela = filtrados.filter(l => !curvaSelecionada || curvaEfetiva(l) === curvaSelecionada).length;
              return totalNaTabela > 500 ? (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>
                  ⓘ Mostrando apenas as 500 primeiras linhas (de {totalNaTabela}).
                </div>
              ) : null;
            })()}
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', fontStyle: 'italic' }}>
              ⓘ Produtos sem curva cadastrada são tratados como <strong>C</strong> (marcado com *).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
