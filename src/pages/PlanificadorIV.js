import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

function formatarInputMes(valor) {
  const digits = valor.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0,2)}/${digits.slice(2)}`;
}

function parsearData(str) {
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
}

function formatarData(d) {
  return String(d.getDate()).padStart(2,'0') + '/' +
    String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

function mesAtual() {
  const agora = new Date();
  return `${String(agora.getMonth()+1).padStart(2,'0')}/${agora.getFullYear()}`;
}

function diasDoMes(mesAno) {
  if (!mesAno || !/^\d{2}\/\d{4}$/.test(mesAno)) return [];
  const [mes, ano] = mesAno.split('/').map(Number);
  if (mes < 1 || mes > 12) return [];
  const total = new Date(ano, mes, 0).getDate();
  const result = [];
  for (let d = 1; d <= total; d++) {
    result.push(`${String(d).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`);
  }
  return result;
}

function arredondar(v) { return Math.round(v * 10) / 10; }

function exportarCSV(linhasOrdenadas, diasMes, modo, mes) {
  const sep = ';';
  const linhas = [];

  if (modo === 'reabastecimento') {
    const h1 = ['Código', 'Produto', ...diasMes.flatMap(d => [`${d}-P`, `${d}-R`, `${d}-G`]), 'Total Reab'];
    linhas.push(h1.join(sep));
    linhasOrdenadas.forEach(l => {
      const row = [l.codProduto, l.nomeProduto];
      l.daysData.forEach(({ isDom, isFuture, planejado, real, gap }) => {
        if (isDom)    { row.push('DOM', 'DOM', 'DOM'); return; }
        if (isFuture) { row.push('0', '', ''); return; }
        row.push(planejado === null ? '' : Math.round(planejado));
        row.push(real > 0 ? real : '');
        row.push(gap === null ? '' : Math.round(gap));
      });
      row.push(l.totalReab || 0);
      linhas.push(row.join(sep));
    });
  } else {
    const h1 = ['Código', 'Produto', ...diasMes.map(d => d), 'Total Ressp'];
    linhas.push(h1.join(sep));
    linhasOrdenadas.forEach(l => {
      const row = [l.codProduto, l.nomeProduto];
      l.daysData.forEach(({ isDom, ressp }) => {
        row.push(isDom ? 'DOM' : ressp > 0 ? ressp : '');
      });
      row.push(l.totalRessp || 0);
      linhas.push(row.join(sep));
    });
  }

  const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planificador_iv_${modo}_${mes.replace('/', '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const HOJE = new Date(); HOJE.setHours(0,0,0,0);
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

export default function PlanificadorIV() {
  const [mes, setMes] = useState(mesAtual);
  const [abastecimentos, setAbastecimentos] = useState([]);
  const [pickingConfig, setPickingConfig] = useState([]);
  const [vendasMap, setVendasMap] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState('reabastecimento');
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState({ col: 'codProduto', dir: 'asc' });

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const [aSnap, pSnap, vSnap] = await Promise.all([
        getDocs(collection(db, 'abastecimentos')),
        getDocs(collection(db, 'picking_config')),
        getDocs(query(collection(db, 'vendas_relatorio'), orderBy('importadoEm', 'asc'))),
      ]);

      // Merge todos os relatórios de vendas (import mais recente prevalece por data/produto)
      const vMap = {};
      vSnap.docs.forEach(doc => {
        (doc.data().produtos || []).forEach(p => {
          const cod = String(p.codigo);
          if (!vMap[cod]) vMap[cod] = {};
          Object.entries(p.vendas || {}).forEach(([data, qtd]) => {
            vMap[cod][data] = qtd;
          });
        });
      });

      setAbastecimentos(aSnap.docs.map(d => d.data()));
      setPickingConfig(pSnap.docs.map(d => d.data()));
      setVendasMap(vMap);
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  // ===== DIAS DO MÊS =====
  const diasMes = diasDoMes(mes);

  // ===== MAPAS DE LANÇAMENTOS =====
  const reabMap = {};  // cod → { dateStr → paletes }
  const resspMap = {}; // cod → { dateStr → paletes }
  abastecimentos.forEach(a => {
    if (!diasMes.includes(a.dataOperacional)) return;
    const cod = String(a.codProduto);
    const qtd = a.qtdPaletes || 1;
    if (a.tipo === 'reabastecimento') {
      if (!reabMap[cod]) reabMap[cod] = {};
      reabMap[cod][a.dataOperacional] = (reabMap[cod][a.dataOperacional] || 0) + qtd;
    } else {
      if (!resspMap[cod]) resspMap[cod] = {};
      resspMap[cod][a.dataOperacional] = (resspMap[cod][a.dataOperacional] || 0) + qtd;
    }
  });

  // ===== LINHAS: todos os produtos do picking_config =====
  const linhas = pickingConfig.map(cfg => {
    const cod = String(cfg.codProduto);
    const cxPorPlt = parseInt(cfg.cxPorPlt) || 0;
    let totalReab = 0, totalRessp = 0;

    const daysData = diasMes.map(dateStr => {
      const d = parsearData(dateStr);
      const isFuture = d > HOJE;
      const isDom = d.getDay() === 0;
      const real = reabMap[cod]?.[dateStr] || 0;
      const ressp = resspMap[cod]?.[dateStr] || 0;

      totalReab += real;
      totalRessp += ressp;

      if (isDom || isFuture) {
        return { dateStr, isDom, isFuture, planejado: null, real, ressp, gap: null };
      }

      // Referência de vendas: Segunda → Sábado (D-2); demais → D-1
      const ref = new Date(d);
      ref.setDate(ref.getDate() - (d.getDay() === 1 ? 2 : 1));
      const dataRef = formatarData(ref);

      const vendas = vendasMap[cod]?.[dataRef];
      const planejado = (vendas !== undefined && vendas !== null && cxPorPlt > 0)
        ? vendas / cxPorPlt
        : null; // null = sem dado de venda → mostra —

      const gap = planejado !== null ? real - planejado : null;

      return { dateStr, isDom, isFuture, planejado, real, ressp, gap };
    });

    return { codProduto: cod, nomeProduto: cfg.nomeProduto || cod, daysData, totalReab, totalRessp };
  });

  // ===== FILTRO + ORDENAÇÃO =====
  const buscaLower = busca.toLowerCase();
  const linhasFiltradas = busca
    ? linhas.filter(l => String(l.codProduto).includes(buscaLower) || (l.nomeProduto || '').toLowerCase().includes(buscaLower))
    : linhas;

  function alternarOrdenacao(col) {
    setOrdenacao(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'nomeProduto' ? 'asc' : 'desc' }
    );
  }

  function seta(col) {
    if (ordenacao.col !== col) return <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 3 }}>↕</span>;
    return <span style={{ marginLeft: 3 }}>{ordenacao.dir === 'asc' ? '↑' : '↓'}</span>;
  }

  const linhasOrdenadas = [...linhasFiltradas].sort((a, b) => {
    const dir = ordenacao.dir === 'asc' ? 1 : -1;
    if (ordenacao.col === 'nomeProduto') return dir * (a.nomeProduto || '').localeCompare(b.nomeProduto || '', 'pt-BR');
    if (ordenacao.col === 'codProduto')  return dir * (parseInt(a.codProduto) - parseInt(b.codProduto));
    return dir * ((a[ordenacao.col] || 0) - (b[ordenacao.col] || 0));
  });

  // ===== TOTAIS PARA WIDGETS =====
  const totalPltReab  = linhas.reduce((s, l) => s + l.totalReab, 0);
  const totalPltRessp = linhas.reduce((s, l) => s + l.totalRessp, 0);
  const prodsComReab  = linhas.filter(l => l.totalReab > 0).length;
  const prodsComRessp = linhas.filter(l => l.totalRessp > 0).length;
  const ocorrRessp    = abastecimentos.filter(a => a.tipo === 'ressuprimento' && diasMes.includes(a.dataOperacional)).length;

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Carregando...</div>;

  const nSubCols = modo === 'reabastecimento' ? 3 : 1;

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Planificador IV</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>📅 Mês:</label>
          <input
            style={{ ...inpStyle, width: 100 }}
            placeholder="mm/aaaa"
            value={mes}
            onChange={e => setMes(formatarInputMes(e.target.value))}
          />
          <button onClick={carregar} style={btnSec}>🔄 Atualizar</button>
          {diasMes.length > 0 && linhasOrdenadas.length > 0 && (
            <button onClick={() => exportarCSV(linhasOrdenadas, diasMes, modo, mes)} style={btnSec}>📤 Exportar CSV</button>
          )}
          <input
            type="text"
            placeholder="🔍 Filtrar produto..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ ...inpStyle, width: 210 }}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={{ ...btnSec, padding: '7px 10px' }}>✕</button>
          )}
        </div>
      </div>

      {/* Widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          {
            id: 'reabastecimento',
            label: '🌅 Reabastecimento',
            total: totalPltReab,
            sub: `${prodsComReab} produtos`,
            cor: '#1D5A9E',
          },
          {
            id: 'ressuprimento',
            label: '🌙 Ressuprimento',
            total: totalPltRessp,
            sub: `${prodsComRessp} produtos · ${ocorrRessp} ocorr.`,
            cor: '#E31837',
          },
        ].map(w => {
          const ativo = modo === w.id;
          return (
            <div
              key={w.id}
              onClick={() => { setModo(w.id); setOrdenacao({ col: w.id === 'reabastecimento' ? 'totalReab' : 'totalRessp', dir: 'desc' }); }}
              style={{
                borderRadius: 14, padding: '18px 22px', border: `2px solid ${ativo ? w.cor : '#e0e0e0'}`,
                backgroundColor: ativo ? w.cor : '#fff', color: ativo ? '#fff' : '#333',
                cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none',
                boxShadow: ativo ? `0 4px 16px ${w.cor}44` : '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: '600', opacity: 0.85, marginBottom: 6 }}>{w.label}</div>
                  <div style={{ fontSize: 34, fontWeight: 'bold', lineHeight: 1 }}>{w.total}</div>
                  <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>paletes</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>{w.sub}</div>
                  {ativo && <div style={{ marginTop: 8, fontSize: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 8px' }}>✓ ativo</div>}
                  {!ativo && <div style={{ marginTop: 8, fontSize: 11, color: w.cor, opacity: 0.7 }}>Clique →</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Planificador */}
      {diasMes.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#999' }}>
          Informe um mês válido no formato MM/AAAA
        </div>
      ) : (
        <div style={card}>
          <div style={{ marginBottom: 10, fontSize: 11, color: '#888' }}>
            {linhasOrdenadas.length} produto(s) exibido(s){busca ? ` — filtro: "${busca}"` : ` de ${linhas.length}`}
            &nbsp;·&nbsp;{diasMes.length} dia(s)
            &nbsp;·&nbsp;domingos em cinza = sem operação
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
              <thead>
                {/* Linha 1: número do dia */}
                <tr>
                  <th rowSpan={modo === 'reabastecimento' ? 3 : 2}
                    onClick={() => alternarOrdenacao('codProduto')}
                    style={{ ...thBase, ...thFixo, cursor: 'pointer', minWidth: 55, verticalAlign: 'middle' }}>
                    Cód{seta('codProduto')}
                  </th>
                  <th rowSpan={modo === 'reabastecimento' ? 3 : 2}
                    onClick={() => alternarOrdenacao('nomeProduto')}
                    style={{ ...thBase, ...thFixo, cursor: 'pointer', textAlign: 'left', minWidth: 170, verticalAlign: 'middle' }}>
                    Produto{seta('nomeProduto')}
                  </th>

                  {diasMes.map(dateStr => {
                    const dow = parsearData(dateStr).getDay();
                    const isDom = dow === 0;
                    const bgDia = isDom ? '#9e9e9e' : modo === 'reabastecimento' ? '#1D5A9E' : '#E31837';
                    return (
                      <th key={dateStr} colSpan={nSubCols} style={{
                        ...thBase, backgroundColor: bgDia, color: '#fff', fontSize: 11,
                        borderRight: `${nSubCols > 1 ? 2 : 1}px solid #fff`, padding: '5px 3px', minWidth: nSubCols > 1 ? undefined : 32,
                      }}>
                        {dateStr.slice(0,2)}
                      </th>
                    );
                  })}

                  {modo === 'reabastecimento' ? (
                    <th rowSpan={3} onClick={() => alternarOrdenacao('totalReab')}
                      style={{ ...thBase, backgroundColor: '#163f72', color: '#fff', cursor: 'pointer', borderLeft: '3px solid #0a2a50', minWidth: 65, verticalAlign: 'middle' }}>
                      Total{seta('totalReab')}
                    </th>
                  ) : (
                    <th rowSpan={2} onClick={() => alternarOrdenacao('totalRessp')}
                      style={{ ...thBase, ...thFixo, cursor: 'pointer', borderLeft: '3px solid #a00', minWidth: 65, verticalAlign: 'middle' }}>
                      Total{seta('totalRessp')}
                    </th>
                  )}
                </tr>

                {/* Linha 2: dia da semana */}
                <tr>
                  {diasMes.map(dateStr => {
                    const dow = parsearData(dateStr).getDay();
                    const isDom = dow === 0;
                    const bg = isDom ? '#bdbdbd' : modo === 'reabastecimento' ? '#2a70c0' : '#f07080';
                    return (
                      <th key={dateStr} colSpan={nSubCols} style={{
                        backgroundColor: bg, color: isDom ? '#fff' : modo === 'reabastecimento' ? '#fff' : '#7a0010',
                        padding: '2px 2px', fontSize: 9, textAlign: 'center',
                        borderRight: `${nSubCols > 1 ? 2 : 1}px solid #fff`, fontWeight: '600',
                      }}>
                        {DIAS_SEMANA[dow]}
                      </th>
                    );
                  })}
                </tr>

                {/* Linha 3: P | R | G (apenas reabastecimento) */}
                {modo === 'reabastecimento' && (
                  <tr>
                    {diasMes.map(dateStr => {
                      const isDom = parsearData(dateStr).getDay() === 0;
                      return [
                        <th key={`${dateStr}-p`} style={{ ...thSub, color: isDom ? '#aaa' : '#444' }}>P</th>,
                        <th key={`${dateStr}-r`} style={{ ...thSub, color: isDom ? '#aaa' : '#1D5A9E' }}>R</th>,
                        <th key={`${dateStr}-g`} style={{ ...thSub, color: isDom ? '#aaa' : '#333', borderRight: '2px solid #ddd' }}>G</th>,
                      ];
                    })}
                  </tr>
                )}
              </thead>

              <tbody>
                {linhasOrdenadas.map((l, i) => (
                  <tr key={l.codProduto} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f6f8ff', borderBottom: '1px solid #eee' }}>
                    <td style={{ ...tdBase, fontWeight: 'bold', color: '#E31837' }}>{l.codProduto}</td>
                    <td style={{ ...tdBase, textAlign: 'left' }}>{l.nomeProduto}</td>

                    {modo === 'reabastecimento'
                      ? l.daysData.map(({ dateStr, isDom, isFuture, planejado, real, gap }) => {
                          if (isDom) return [
                            <td key={`${dateStr}-p`} style={tdDom}>—</td>,
                            <td key={`${dateStr}-r`} style={tdDom}>—</td>,
                            <td key={`${dateStr}-g`} style={{ ...tdDom, borderRight: '2px solid #ddd' }}>—</td>,
                          ];

                          if (isFuture) return [
                            <td key={`${dateStr}-p`} style={tdFut}>0</td>,
                            <td key={`${dateStr}-r`} style={tdFut}>—</td>,
                            <td key={`${dateStr}-g`} style={{ ...tdFut, borderRight: '2px solid #eee' }}>—</td>,
                          ];

                          const corGap = gap === null ? '#ccc'
                            : gap > 0.5 ? '#c0392b'
                            : gap < -0.5 ? '#b45309'
                            : '#166534';

                          return [
                            <td key={`${dateStr}-p`} style={{ ...tdBase, color: planejado === null ? '#ccc' : '#444' }}>
                              {planejado === null ? '—' : Math.round(planejado)}
                            </td>,
                            <td key={`${dateStr}-r`} style={{ ...tdBase, color: real > 0 ? '#1D5A9E' : '#ccc', fontWeight: real > 0 ? 'bold' : 'normal' }}>
                              {real > 0 ? real : '—'}
                            </td>,
                            <td key={`${dateStr}-g`} style={{ ...tdBase, fontWeight: gap !== null && Math.abs(gap) > 0.1 ? 'bold' : 'normal', color: corGap, borderRight: '2px solid #eee' }}>
                              {gap === null ? '—' : gap > 0 ? `+${Math.round(gap)}` : Math.round(gap)}
                            </td>,
                          ];
                        })
                      : l.daysData.map(({ dateStr, isDom, ressp }) => {
                          if (isDom) return <td key={dateStr} style={tdDom}>—</td>;
                          return (
                            <td key={dateStr} style={{ ...tdBase, color: ressp > 0 ? '#E31837' : '#ccc', fontWeight: ressp > 0 ? 'bold' : 'normal' }}>
                              {ressp > 0 ? ressp : '—'}
                            </td>
                          );
                        })
                    }

                    {modo === 'reabastecimento' ? (
                      <td style={{ ...tdBase, fontWeight: 'bold', color: '#1D5A9E', backgroundColor: '#eef2ff', borderLeft: '3px solid #c0cff0' }}>
                        {l.totalReab || '—'}
                      </td>
                    ) : (
                      <td style={{ ...tdBase, fontWeight: 'bold', color: l.totalRessp > 0 ? '#E31837' : '#ccc', backgroundColor: l.totalRessp > 0 ? '#fff0f0' : undefined, borderLeft: '3px solid #f5c0c8' }}>
                        {l.totalRessp > 0 ? l.totalRessp : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10, color: '#999', flexWrap: 'wrap', borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
            {modo === 'reabastecimento' ? (
              <>
                <span><b>P</b> = Planejado · <b>R</b> = Real · <b>G</b> = GAP (R−P)</span>
                <span>— em P = sem dado de venda ou domingo</span>
                <span>Seg usa vendas de Sáb (pula dom.)</span>
                <span><b style={{ color: '#c0392b' }}>G+</b> acima &nbsp;<b style={{ color: '#b45309' }}>G−</b> abaixo &nbsp;<b style={{ color: '#166534' }}>G≈0</b> ok</span>
              </>
            ) : (
              <>
                <span>Valores = paletes ressupridos por dia</span>
                <span>— = nenhum ressuprimento naquele dia</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inpStyle  = { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };
const btnSec    = { padding: '7px 12px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const card      = { backgroundColor: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };

const thBase = { padding: '5px 6px', fontWeight: 'bold', textAlign: 'center', position: 'sticky', top: 0, userSelect: 'none', zIndex: 1 };
const thFixo = { backgroundColor: '#E31837', color: '#fff', borderRight: '1px solid #c0102a' };
const thSub  = { backgroundColor: '#e8f0fb', padding: '3px 4px', fontWeight: '600', textAlign: 'center', borderRight: '1px solid #d0daf0', borderBottom: '1px solid #d0daf0', fontSize: 10, userSelect: 'none' };

const tdBase = { padding: '4px 6px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee', textAlign: 'center', fontSize: 11 };
const tdDom  = { ...tdBase, backgroundColor: '#f0f0f0', color: '#bbb', borderRight: '2px solid #ddd' };
const tdFut  = { ...tdBase, backgroundColor: '#fafafa', color: '#ccc' };
