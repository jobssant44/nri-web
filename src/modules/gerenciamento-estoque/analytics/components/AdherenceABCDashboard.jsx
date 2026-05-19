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
import { getDocs, writeBatch, serverTimestamp, query, where, updateDoc } from 'firebase/firestore';
import { useUser } from '../../../../context/UserContext';
import { NIVEIS_SUPERVISOR } from '../../../../pages/admin/ConfigurarEmpresaPage';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, Legend,
} from 'recharts';
import { useDb } from '../../../../utils/db';
import { useSessionFilter } from '../../../../hooks/useSessionFilter';
import { monthKey, calcularAderenteABC, CURVA_PRODUTO_PADRAO } from '../../shared/curvaLookup';
import { filtrarLogsAtivos } from '../../shared/inventoryLogsFilter';

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

// ─── Estilos compartilhados ─────────────────────────────────────────────────
// Extraídos pro escopo do módulo pra que subcomponentes (DetalheContagens)
// possam acessá-los sem precisar receber via props.
const cardStyle       = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' };
const tableStyle      = { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '12px' };
const thStyle         = { backgroundColor: '#E31837', color: 'white', padding: '10px', textAlign: 'left', fontWeight: 'bold' };
const tdStyle         = { padding: '8px 10px', borderBottom: '1px solid #ddd' };
const badgeAderente   = { display: 'inline-block', padding: '3px 10px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' };
const badgeNaoAderente = { display: 'inline-block', padding: '3px 10px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' };
const badgeIndet      = { display: 'inline-block', padding: '3px 10px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' };

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

  // Filtros da tabela "Detalhe das contagens"
  // Busca aplicada em código, descrição ou endereço (case-insensitive).
  const [buscaTabela, setBuscaTabela] = useSessionFilter('aderABC:buscaTab', '');
  // Ordenação: { col: 'data'|'endereco'|'codigo'|..., dir: 'asc'|'desc' } ou null
  const [ordTabela, setOrdTabela] = useSessionFilter('aderABC:ordTab', null);

  // Layout do mês selecionado — usado pra validar endereço e buscar a curva
  // nova na edição de uma linha. Carregado lazy: só quando muda dataSel/mesSel.
  // Mapa { 'A12': 'A', 'C03': 'C', ... } (endereço UPPERCASE → curva)
  const [layoutMes, setLayoutMes] = useState({});

  // ─── Estilos locais (cardStyle/tableStyle/etc. estão no escopo do módulo) ──
  const containerStyle = { maxWidth: '1200px', margin: '20px auto', padding: '20px', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' };
  const kpiCardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center' };
  const kpiTitulo = { fontSize: '11px', color: '#666', marginBottom: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const kpiValor = { fontSize: '34px', fontWeight: 'bold', marginBottom: '5px', fontFamily: 'monospace' };
  const inputStyle = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', minWidth: '180px' };
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
      // Soft delete: linhas com `excluido: true` somem de toda a UI.
      setLogs(filtrarLogsAtivos(snapLogs.docs.map(d => ({ id: d.id, ...d.data() }))));
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

  // ─── Layout do mês selecionado (pra validar edição de endereço) ───────
  // Carrega `locations_mensal` filtrado pelo mês relevante (derivado do filtro
  // atual). 1 query única — fica em cache local pelo IndexedDB Persistence.
  // NÃO incluir `col` nas deps (recriado a cada render do useDb).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const chave = modo === 'data'
      ? (dataSel ? dataSel.slice(0, 7) : '')
      : (mesSel || '');
    if (!chave) { setLayoutMes({}); return; }

    let cancelado = false;
    (async () => {
      try {
        const snap = await getDocs(query(col('locations_mensal'), where('chaveMes', '==', chave)));
        if (cancelado) return;
        const mapa = {};
        snap.docs.forEach(d => {
          const data = d.data();
          const end   = String(data.endereco || '').trim().toUpperCase();
          const curva = String(data.curva || '').trim().toUpperCase();
          if (end && curva) mapa[end] = curva;
        });
        setLayoutMes(mapa);
      } catch (e) {
        console.error('Falha ao carregar locations_mensal:', e);
        if (!cancelado) setLayoutMes({});
      }
    })();
    return () => { cancelado = true; };
  }, [modo, dataSel, mesSel]);

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
          <DetalheContagens
            filtrados={filtrados}
            curvaSelecionada={curvaSelecionada}
            setCurvaSelecionada={setCurvaSelecionada}
            produtosMap={produtosMap}
            buscaTabela={buscaTabela}
            setBuscaTabela={setBuscaTabela}
            ordTabela={ordTabela}
            setOrdTabela={setOrdTabela}
            setLogs={setLogs}
            layoutMes={layoutMes}
          />
        </>
      )}
    </div>
  );
}

// ─── Detalhe das contagens (tabela com busca + sort + soft delete) ────────
// Componente extraído pra encapsular: busca por texto (código/descrição/endereço),
// ordenação por coluna clicável e seleção/exclusão (soft delete) por supervisor.
//
// Sobre a exclusão:
//   - Faz `updateDoc(log, { excluido: true, excluidoEm, excluidoPor })` — não
//     apaga fisicamente o doc. Linhas excluídas somem de TODA a UI por causa
//     do `filtrarLogsAtivos` chamado nos loaders das 6 telas que leem
//     inventory_logs (ver src/modules/gerenciamento-estoque/shared/inventoryLogsFilter.js).
//   - Após gravar, remove as linhas do estado `logs` local (via `setLogs`)
//     pra que KPIs/gráficos/aderência se atualizem instantaneamente sem refetch.
//   - Pra recuperar uma linha excluída por engano, é necessário rodar um script
//     com firebase-admin SDK que faça `updateDoc(..., { excluido: false })`.
function DetalheContagens({
  filtrados, curvaSelecionada, setCurvaSelecionada, produtosMap,
  buscaTabela, setBuscaTabela, ordTabela, setOrdTabela, setLogs,
  layoutMes,
}) {
  const { db, docRef } = useDb();
  const { usuario } = useUser();
  const isSupervisor = NIVEIS_SUPERVISOR.includes(usuario?.nivel);

  // Set<string> de IDs de logs selecionados pra exclusão.
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [excluindo, setExcluindo] = useState(false);

  // Edição inline do endereço.
  // `editandoId` = id do log em modo edit (ou null).
  // `valorEdit`  = texto atual digitado.
  // `salvandoEdit` = id do log sendo gravado no Firestore agora.
  const [editandoId, setEditandoId]   = useState(null);
  const [valorEdit, setValorEdit]     = useState('');
  const [salvandoEdit, setSalvandoEdit] = useState(null);
  // Helper de comparação: trata números/strings/null de forma consistente
  function comparar(a, b, dir) {
    const mul = dir === 'desc' ? -1 : 1;
    if (a == null && b == null) return 0;
    if (a == null) return 1;          // null/undefined sempre por último
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul;
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true }) * mul;
  }

  // Valor a comparar pra cada coluna. Mantém em sync com a renderização.
  function valorColuna(log, col) {
    switch (col) {
      case 'status':    return aderenciaEfetiva(log) === true ? 0 : aderenciaEfetiva(log) === false ? 1 : 2;
      case 'data':      return tsToDate(log.timestamp)?.getTime() ?? null;
      case 'endereco':  return log.endereco || `${log.area || ''}-${log.street || ''}-${log.palettePosition || ''}`;
      case 'cend':      return log.enderecoCurva || null;
      case 'codigo':    return log.productCode || null;
      case 'produto':   return produtosMap[String(log.productCode).trim()] || log.productName || '';
      case 'cprod':     return curvaEfetiva(log);
      case 'qtde':      return Number(log.quantidade) || 0;
      default:          return null;
    }
  }

  // Click no cabeçalho: 1ª vez asc → 2ª desc → 3ª limpa (volta à ordem original)
  function toggleSort(col) {
    if (!ordTabela || ordTabela.col !== col) { setOrdTabela({ col, dir: 'asc' }); return; }
    if (ordTabela.dir === 'asc') { setOrdTabela({ col, dir: 'desc' }); return; }
    setOrdTabela(null);
  }

  function setaSort(col) {
    if (!ordTabela || ordTabela.col !== col) return <span style={{ color: '#ccc', marginLeft: 4 }}>⇅</span>;
    return <span style={{ color: '#E31837', marginLeft: 4 }}>{ordTabela.dir === 'asc' ? '▲' : '▼'}</span>;
  }

  // Pipeline: curva selecionada → busca por texto → sort (sem mutar array original)
  const linhasProcessadas = useMemo(() => {
    let arr = filtrados;
    if (curvaSelecionada) arr = arr.filter(l => curvaEfetiva(l) === curvaSelecionada);
    if (buscaTabela && buscaTabela.trim()) {
      const q = buscaTabela.trim().toLowerCase();
      arr = arr.filter(l => {
        const codigo  = String(l.productCode || '').toLowerCase();
        const nome    = String(produtosMap[String(l.productCode).trim()] || l.productName || '').toLowerCase();
        const end     = String(l.endereco || '').toLowerCase();
        return codigo.includes(q) || nome.includes(q) || end.includes(q);
      });
    }
    if (ordTabela?.col) {
      arr = arr.slice().sort((a, b) =>
        comparar(valorColuna(a, ordTabela.col), valorColuna(b, ordTabela.col), ordTabela.dir)
      );
    }
    return arr;
  }, [filtrados, curvaSelecionada, buscaTabela, ordTabela, produtosMap]);

  const totalProcessadas = linhasProcessadas.length;
  const linhas = linhasProcessadas.slice(0, 500);

  // Helpers de seleção
  const idsVisiveis = useMemo(() => linhas.map(l => l.id).filter(Boolean), [linhas]);
  const todasVisiveisMarcadas = idsVisiveis.length > 0 && idsVisiveis.every(id => selecionadas.has(id));

  function toggleLinha(id) {
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleTodasVisiveis() {
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (todasVisiveisMarcadas) {
        idsVisiveis.forEach(id => next.delete(id));
      } else {
        idsVisiveis.forEach(id => next.add(id));
      }
      return next;
    });
  }

  // Soft delete em lote. Mostra confirmação dupla; >10 exige digitar "EXCLUIR".
  async function excluirSelecionadas() {
    const ids = Array.from(selecionadas);
    if (ids.length === 0) return;
    if (!isSupervisor) return; // proteção redundante — UI já esconde o botão

    if (ids.length <= 10) {
      if (!window.confirm(
        `Excluir ${ids.length} contagem(ns)?\n\n`
        + `Esta ação não pode ser desfeita pela interface — apenas via suporte técnico.`
      )) return;
    } else {
      const palavra = window.prompt(
        `⚠️ Você vai excluir ${ids.length} contagens.\n\n`
        + `Digite a palavra EXCLUIR (em caixa alta) para confirmar:`
      );
      if (palavra !== 'EXCLUIR') {
        alert('Confirmação inválida. Nenhuma linha foi excluída.');
        return;
      }
    }

    setExcluindo(true);
    try {
      const CHUNK = 450; // limite de writeBatch (500) com folga
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(id => {
          batch.update(docRef('inventory_logs', id), {
            excluido: true,
            excluidoEm: serverTimestamp(),
            excluidoPor: { uid: usuario?.uid || null, nome: usuario?.nome || '' },
          });
        });
        await batch.commit();
      }
      // Remove do estado local pra que KPIs/gráficos/aderência se atualizem agora.
      setLogs(prev => prev.filter(l => !selecionadas.has(l.id)));
      setSelecionadas(new Set());
    } catch (e) {
      alert('Erro ao excluir: ' + e.message);
    } finally {
      setExcluindo(false);
    }
  }

  // ── Edição inline do endereço ───────────────────────────────────────────
  function iniciarEdicao(log) {
    setEditandoId(log.id);
    setValorEdit(String(log.endereco || ''));
  }
  function cancelarEdicao() {
    setEditandoId(null);
    setValorEdit('');
  }

  // Salva o novo endereço + recalcula a curva e a aderência.
  // 1 read (já em cache: o `layoutMes` foi carregado uma vez por mês selecionado).
  // 1 write (updateDoc do log).
  // KPIs/gráficos/% se atualizam automaticamente porque rodam em useMemo
  // sobre o array `logs` — basta atualizar o estado local.
  async function salvarEdicao(log) {
    const novoEnd = String(valorEdit || '').trim().toUpperCase();
    if (!novoEnd) {
      alert('Informe um endereço.');
      return;
    }
    if (novoEnd === String(log.endereco || '').trim().toUpperCase()) {
      cancelarEdicao();
      return;
    }
    // Validação bloqueante: endereço precisa existir no layout do mês.
    const novaCurva = layoutMes[novoEnd];
    if (!novaCurva) {
      alert(`Endereço "${novoEnd}" não está cadastrado no layout deste mês.\n\n`
        + 'Cadastre em Estoque → Importar Layout antes de editar.');
      return;
    }

    setSalvandoEdit(log.id);
    try {
      const novaAderencia = calcularAderenteABC(curvaEfetiva(log), novaCurva);
      await updateDoc(docRef('inventory_logs', log.id), {
        endereco: novoEnd,
        enderecoCurva: novaCurva,
        aderenteABC: novaAderencia,
      });
      // Atualiza estado local pra refletir nos KPIs / gráficos / status.
      setLogs(prev => prev.map(l => l.id === log.id
        ? { ...l, endereco: novoEnd, enderecoCurva: novaCurva, aderenteABC: novaAderencia }
        : l
      ));
      cancelarEdicao();
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSalvandoEdit(null);
    }
  }

  // Lista de endereços do layout do mês — usada pelo <datalist> de autocomplete.
  const enderecosLayout = useMemo(() => Object.keys(layoutMes || {}).sort(), [layoutMes]);

  return (
    <div style={cardStyle}>
      {/* Datalist global — alimenta o autocomplete da edição inline. */}
      <datalist id="layout-mes-enderecos">
        {enderecosLayout.map(e => <option key={e} value={e} />)}
      </datalist>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#E31837', fontSize: '14px', margin: 0 }}>📋 Detalhe das contagens</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {curvaSelecionada && (
            <span style={{ fontSize: 11, color: '#666' }}>
              Filtrado por <strong>Curva {curvaSelecionada}</strong> ·{' '}
              <button onClick={() => setCurvaSelecionada(null)}
                style={{ background: 'none', border: 'none', color: '#E31837', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
                limpar
              </button>
            </span>
          )}
          <input
            type="text"
            placeholder="Buscar código, descrição ou endereço..."
            value={buscaTabela}
            onChange={(e) => setBuscaTabela(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd',
              fontSize: 12, minWidth: 240, outline: 'none',
            }}
          />
          {buscaTabela && (
            <button onClick={() => setBuscaTabela('')}
              style={{ background: 'none', border: 'none', color: '#E31837', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
              limpar busca
            </button>
          )}
          {isSupervisor && selecionadas.size > 0 && (
            <button
              onClick={excluirSelecionadas}
              disabled={excluindo}
              style={{
                padding: '6px 14px', backgroundColor: '#E31837', color: '#fff',
                border: 'none', borderRadius: 6, cursor: excluindo ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 700, opacity: excluindo ? 0.6 : 1,
              }}
            >
              {excluindo ? 'Excluindo...' : `🗑️ Excluir ${selecionadas.size} selecionada(s)`}
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
        <table style={tableStyle}>
          <thead style={{ position: 'sticky', top: 0 }}>
            <tr>
              {[
                ['status', 'Status'], ['data', 'Data'], ['endereco', 'Endereço'],
                ['cend', 'C.End'], ['codigo', 'Código'], ['produto', 'Produto'],
                ['cprod', 'C.Prod'], ['qtde', 'Qtde'],
              ].map(([col, label]) => (
                <th key={col}
                  onClick={() => toggleSort(col)}
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  title="Clique para ordenar"
                >
                  {label}{setaSort(col)}
                </th>
              ))}
              {isSupervisor && (
                <th style={{ ...thStyle, textAlign: 'center', width: 44 }} title="Selecionar para excluir">
                  <input
                    type="checkbox"
                    checked={todasVisiveisMarcadas}
                    onChange={toggleTodasVisiveis}
                    style={{ cursor: 'pointer', accentColor: '#fff' }}
                    title={todasVisiveisMarcadas ? 'Desmarcar todas visíveis' : 'Marcar todas visíveis'}
                  />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, idx) => {
              const d = tsToDate(l.timestamp);
              const ader = aderenciaEfetiva(l);
              const curvaProdEfet = curvaEfetiva(l);
              const curvaDefault = !l.productCurva;
              return (
                <tr key={l.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                  <td style={tdStyle}>
                    <span style={ader === true ? badgeAderente : ader === false ? badgeNaoAderente : badgeIndet}>
                      {ader === true ? '✅ Aderente' : ader === false ? '❌ Não' : '⚠️ Indet.'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px' }}>{fmtData(d)}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>
                    {editandoId === l.id ? (
                      // Modo edição inline (supervisor)
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={valorEdit}
                          autoFocus
                          onChange={(e) => setValorEdit(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') salvarEdicao(l);
                            else if (e.key === 'Escape') cancelarEdicao();
                          }}
                          list="layout-mes-enderecos"
                          disabled={salvandoEdit === l.id}
                          style={{
                            width: 90, padding: '3px 6px', fontFamily: 'monospace',
                            fontSize: 12, border: '1px solid #E31837', borderRadius: 4,
                            textTransform: 'uppercase',
                          }}
                        />
                        <button
                          onClick={() => salvarEdicao(l)}
                          disabled={salvandoEdit === l.id}
                          title="Salvar (Enter)"
                          style={{
                            background: salvandoEdit === l.id ? '#ccc' : '#16a34a',
                            color: '#fff', border: 'none', borderRadius: 4, padding: '3px 7px',
                            cursor: salvandoEdit === l.id ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700,
                          }}
                        >{salvandoEdit === l.id ? '…' : '✓'}</button>
                        <button
                          onClick={cancelarEdicao}
                          disabled={salvandoEdit === l.id}
                          title="Cancelar (Esc)"
                          style={{
                            background: '#fff', color: '#666', border: '1px solid #ccc',
                            borderRadius: 4, padding: '3px 7px', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                          }}
                        >✕</button>
                      </div>
                    ) : (
                      // Modo view — supervisor enxerga o lápis ao passar o mouse
                      <span
                        onClick={isSupervisor ? () => iniciarEdicao(l) : undefined}
                        title={isSupervisor ? 'Clique pra editar o endereço (recalcula aderência)' : ''}
                        style={isSupervisor ? { cursor: 'pointer', borderBottom: '1px dashed #ccc' } : {}}
                      >
                        {l.endereco || `${l.area || ''}-${l.street || ''}-${l.palettePosition || ''}`}
                        {isSupervisor && <span style={{ marginLeft: 4, color: '#999', fontSize: 10 }}>✏️</span>}
                      </span>
                    )}
                  </td>
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
                  {isSupervisor && (
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selecionadas.has(l.id)}
                        onChange={() => toggleLinha(l.id)}
                        style={{ cursor: 'pointer', accentColor: '#E31837' }}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={isSupervisor ? 9 : 8} style={{ ...tdStyle, textAlign: 'center', color: '#999', padding: 24 }}>
                  Nenhuma contagem encontrada com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalProcessadas > 500 && (
        <div style={{ fontSize: '11px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>
          ⓘ Mostrando apenas as 500 primeiras linhas (de {totalProcessadas}).
        </div>
      )}
      <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', fontStyle: 'italic' }}>
        ⓘ Produtos sem curva cadastrada são tratados como <strong>C</strong> (marcado com *).
      </div>
    </div>
  );
}
