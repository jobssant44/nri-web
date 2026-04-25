import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

function hoje() {
  const agora = new Date();
  if (agora.getHours() < 7) agora.setDate(agora.getDate() - 1);
  return formatarData(agora);
}

function formatarData(d) {
  return String(d.getDate()).padStart(2,'0') + '/' +
    String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

function parsearData(str) {
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
}

function formatarInput(valor) {
  const digits = valor.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
}

function subtrairUmDia(dataStr) {
  const d = parsearData(dataStr);
  if (!d) return null;
  d.setDate(d.getDate() - 1);
  return formatarData(d);
}

function entrePeriodo(dataStr, inicio, fim) {
  const d = parsearData(dataStr);
  if (!d) return false;
  if (inicio && d < inicio) return false;
  if (fim && d > fim) return false;
  return true;
}

export default function DashboardIV() {
  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFim, setDataFim] = useState(hoje());
  const [abastecimentos, setAbastecimentos] = useState([]);
  const [pickingConfig, setPickingConfig] = useState([]);
  const [vendasMap, setVendasMap] = useState({}); // codigo → { 'DD/MM/AAAA': qtdCaixas }
  const [carregando, setCarregando] = useState(true);
  const [ordenacao, setOrdenacao] = useState({ col: 'reabPaletes', dir: 'desc' });

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const [aSnap, pSnap] = await Promise.all([
        getDocs(collection(db, 'abastecimentos')),
        getDocs(collection(db, 'picking_config')),
      ]);

      // Vendas: pegar o relatório mais recente
      const vSnap = await getDocs(query(collection(db, 'vendas_relatorio'), orderBy('importadoEm', 'desc'), limit(1)));
      const vendasDoc = vSnap.docs[0]?.data();
      const vMap = {};
      if (vendasDoc?.produtos) {
        vendasDoc.produtos.forEach(p => { vMap[String(p.codigo)] = p.vendas || {}; });
      }

      setAbastecimentos(aSnap.docs.map(d => d.data()));
      setPickingConfig(pSnap.docs.map(d => d.data()));
      setVendasMap(vMap);
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  // ===== CÁLCULO PRINCIPAL =====
  const inicioParsed = parsearData(dataInicio);
  const fimParsed = parsearData(dataFim);

  // Filtrar abastecimentos no período
  const filtrados = abastecimentos.filter(a => entrePeriodo(a.dataOperacional, inicioParsed, fimParsed));

  // Acumular por produto
  const porProduto = {};

  filtrados.forEach(a => {
    const cod = String(a.codProduto);
    if (!porProduto[cod]) {
      porProduto[cod] = {
        codProduto: cod,
        nomeProduto: a.nomeProduto,
        reabPaletes: 0,
        resspPaletes: 0,
        resspOcorrencias: 0,
        vendasCaixasReab: 0, // soma de vendas dos dias de referência do reabastecimento
        vendasCaixasRessp: 0,
      };
    }

    const qtd = a.qtdPaletes || 1;

    if (a.tipo === 'reabastecimento') {
      porProduto[cod].reabPaletes += qtd;
      // Venda de referência = dia anterior ao dataOperacional
      const dataRef = subtrairUmDia(a.dataOperacional);
      if (dataRef && vendasMap[cod]?.[dataRef]) {
        porProduto[cod].vendasCaixasReab += vendasMap[cod][dataRef];
      }
    } else {
      porProduto[cod].resspPaletes += qtd;
      porProduto[cod].resspOcorrencias += 1;
      // Venda de referência = mesmo dia
      if (vendasMap[cod]?.[a.dataOperacional]) {
        porProduto[cod].vendasCaixasRessp += vendasMap[cod][a.dataOperacional];
      }
    }
  });

  // Cruzar com picking_config
  const linhas = pickingConfig.map(cfg => {
    const cod = String(cfg.codProduto);
    const dados = porProduto[cod] || { reabPaletes: 0, resspPaletes: 0, resspOcorrencias: 0, vendasCaixasReab: 0, vendasCaixasRessp: 0 };
    const cxPorPlt = parseInt(cfg.cxPorPlt) || 0;
    const capacidade = (cfg.espacosPalete || 0) * cxPorPlt;

    // Esperado reabastecimento = caixas vendidas no dia ref ÷ CX/PLT
    const esperadoPaletes = cxPorPlt > 0 ? dados.vendasCaixasReab / cxPorPlt : null;
    const diferenca = esperadoPaletes !== null ? dados.reabPaletes - esperadoPaletes : null;

    // Status reabastecimento
    let statusReab = '➖';
    if (esperadoPaletes !== null && dados.reabPaletes > 0) {
      const pct = esperadoPaletes > 0 ? (dados.reabPaletes / esperadoPaletes) : null;
      if (pct === null) statusReab = '➖';
      else if (pct >= 0.8 && pct <= 1.2) statusReab = '✅';
      else if (pct > 1.2) statusReab = '⚠️';
      else statusReab = '⬇️';
    } else if (dados.reabPaletes === 0 && esperadoPaletes === 0) {
      statusReab = '✅';
    }

    // Status ressuprimento — qualquer ocorrência é falha
    const statusRessp = dados.resspOcorrencias > 0 ? '🚨' : '✅';

    return {
      ...cfg,
      ...dados,
      capacidade,
      esperadoPaletes,
      diferenca,
      statusReab,
      statusRessp,
      ivTotal: dados.reabPaletes + dados.resspPaletes,
    };
  });

  // Produtos com atividade mas sem picking_config
  const codsConfig = new Set(pickingConfig.map(c => String(c.codProduto)));
  const semConfig = Object.values(porProduto).filter(p => !codsConfig.has(p.codProduto));

  // Cards de resumo
  const totalReabPaletes = filtrados.filter(a => a.tipo === 'reabastecimento').reduce((s,a) => s + (a.qtdPaletes||1), 0);
  const totalResspPaletes = filtrados.filter(a => a.tipo === 'ressuprimento').reduce((s,a) => s + (a.qtdPaletes||1), 0);
  const totalResspOcorrencias = filtrados.filter(a => a.tipo === 'ressuprimento').length;
  const produtosAcima = linhas.filter(l => l.statusReab === '⚠️').length;
  const produtosAbaixo = linhas.filter(l => l.statusReab === '⬇️').length;
  const produtosComRessp = linhas.filter(l => l.statusRessp === '🚨').length;

  // Ordenação da tabela
  function alternarOrdenacao(col) {
    setOrdenacao(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  }
  function seta(col) {
    if (ordenacao.col !== col) return <span style={{ color: '#ccc', marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{ordenacao.dir === 'asc' ? '↑' : '↓'}</span>;
  }
  const linhasOrdenadas = [...linhas].sort((a, b) => {
    let vA = a[ordenacao.col] ?? -Infinity;
    let vB = b[ordenacao.col] ?? -Infinity;
    return ordenacao.dir === 'asc' ? vA - vB : vB - vA;
  });

  // Gráfico: top 12 por IV total
  const dadosGrafico = linhas
    .filter(l => l.ivTotal > 0 || (l.esperadoPaletes !== null && l.esperadoPaletes > 0))
    .sort((a, b) => b.ivTotal - a.ivTotal)
    .slice(0, 12)
    .map(l => ({
      nome: l.nomeProduto?.split(' ').slice(0,2).join(' '),
      'Reabastecido': l.reabPaletes,
      'Esperado': l.esperadoPaletes !== null ? Math.round(l.esperadoPaletes * 10) / 10 : 0,
      'Ressuprido': l.resspPaletes,
    }));

  // Rankings
  const rankingMais = [...linhas].filter(l => l.reabPaletes > 0).sort((a,b) => b.reabPaletes - a.reabPaletes).slice(0, 5);
  const rankingMenos = [...linhas].filter(l => l.reabPaletes > 0).sort((a,b) => a.reabPaletes - b.reabPaletes).slice(0, 5);

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Carregando...</div>;

  return (
    <div>
      {/* Cabeçalho + filtro */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Dashboard IV — Reabastecimento / Ressuprimento</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>📅 Período:</label>
          <input
            style={inputStyle}
            placeholder="dd/mm/aaaa"
            value={dataInicio}
            onChange={e => setDataInicio(formatarInput(e.target.value))}
          />
          <span style={{ fontSize: 12, color: '#666' }}>até</span>
          <input
            style={inputStyle}
            placeholder="dd/mm/aaaa"
            value={dataFim}
            onChange={e => setDataFim(formatarInput(e.target.value))}
          />
          <button onClick={carregar} style={btnSec}>🔄 Atualizar</button>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={card('#1D5A9E')}>
          <div style={cardNum}>{totalReabPaletes}</div>
          <div style={cardLabel}>Paletes Reabastecidos</div>
          <div style={cardSub}>🌅 Após carregamento</div>
        </div>
        <div style={card('#E31837')}>
          <div style={cardNum}>{totalResspPaletes}</div>
          <div style={cardLabel}>Paletes Ressupridos</div>
          <div style={cardSub}>🚨 {totalResspOcorrencias} ocorrência(s) — falha</div>
        </div>
        <div style={card('#c0392b')}>
          <div style={cardNum}>{produtosAcima}</div>
          <div style={cardLabel}>Produtos Acima do Esperado</div>
          <div style={cardSub}>⚠️ Repôs mais do que vendeu</div>
        </div>
        <div style={card('#856404', '#fef3c7')}>
          <div style={{ ...cardNum, color: '#856404' }}>{produtosAbaixo}</div>
          <div style={{ ...cardLabel, color: '#856404' }}>Produtos Abaixo do Esperado</div>
          <div style={{ ...cardSub, color: '#a16207' }}>⬇️ Picking entrará defasado</div>
        </div>
        <div style={card('#166534', '#dcfce7')}>
          <div style={{ ...cardNum, color: '#166534' }}>{produtosComRessp}</div>
          <div style={{ ...cardLabel, color: '#166534' }}>Produtos com Ressuprimento</div>
          <div style={{ ...cardSub, color: '#166534' }}>🚨 Avaliar aumento de espaços</div>
        </div>
      </div>

      {/* Gráfico */}
      {dadosGrafico.length > 0 && (
        <div style={{ ...secao, marginBottom: 24 }}>
          <h3 style={secaoTitulo}>Paletes Reabastecidos vs Esperado (Top 12)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dadosGrafico} margin={{ top: 5, right: 20, left: 0, bottom: 70 }}>
              <XAxis dataKey="nome" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Reabastecido" fill="#1D5A9E" radius={[4,4,0,0]}>
                {dadosGrafico.map((entry, i) => (
                  <Cell key={i} fill={entry['Reabastecido'] > entry['Esperado'] * 1.2 ? '#c0392b' : '#1D5A9E'} />
                ))}
              </Bar>
              <Bar dataKey="Esperado" fill="#22c55e" radius={[4,4,0,0]} opacity={0.8} />
              <Bar dataKey="Ressuprido" fill="#E31837" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Rankings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={secao}>
          <h3 style={{ ...secaoTitulo, color: '#E31837' }}>🔝 Mais Reabastecidos</h3>
          {rankingMais.length === 0
            ? <p style={{ color: '#999', fontSize: 13 }}>Sem dados no período</p>
            : rankingMais.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
                <div>
                  <span style={{ color: '#E31837', fontWeight: 'bold', marginRight: 8 }}>#{i+1}</span>
                  <span>{l.nomeProduto}</span>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: '#1D5A9E', fontWeight: 'bold' }}>{l.reabPaletes} plt reab.</span>
                  {l.resspPaletes > 0 && <span style={{ color: '#E31837', fontWeight: 'bold' }}>{l.resspPaletes} plt ressp.</span>}
                </div>
              </div>
            ))
          }
        </div>
        <div style={secao}>
          <h3 style={{ ...secaoTitulo, color: '#1D5A9E' }}>🔻 Menos Reabastecidos</h3>
          {rankingMenos.length === 0
            ? <p style={{ color: '#999', fontSize: 13 }}>Sem dados no período</p>
            : rankingMenos.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
                <div>
                  <span style={{ color: '#1D5A9E', fontWeight: 'bold', marginRight: 8 }}>#{i+1}</span>
                  <span>{l.nomeProduto}</span>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: '#1D5A9E', fontWeight: 'bold' }}>{l.reabPaletes} plt reab.</span>
                  {l.resspPaletes > 0 && <span style={{ color: '#E31837', fontWeight: 'bold' }}>{l.resspPaletes} plt ressp.</span>}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Tabela principal */}
      <div style={secao}>
        <h3 style={secaoTitulo}>Detalhamento por Produto</h3>
        {linhas.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum produto configurado. Acesse <b>Configurar Picking</b>.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  {[
                    { label: 'Produto',              col: null },
                    { label: 'Espaços',              col: 'espacosPalete' },
                    { label: 'Cap. (cx)',             col: 'capacidade' },
                    { label: 'Vendas Ref. (cx)',      col: 'vendasCaixasReab' },
                    { label: 'Esperado (plt)',        col: 'esperadoPaletes' },
                    { label: 'Reabastecido (plt)',    col: 'reabPaletes' },
                    { label: 'Diferença',             col: 'diferenca' },
                    { label: 'Status Reab.',          col: null },
                    { label: 'Ressuprido (plt)',      col: 'resspPaletes' },
                    { label: 'Ocorr. Ressp.',         col: 'resspOcorrencias' },
                    { label: 'Status Ressp.',         col: null },
                  ].map(({ label, col }) => (
                    <th
                      key={label}
                      onClick={() => col && alternarOrdenacao(col)}
                      style={{ ...th, cursor: col ? 'pointer' : 'default', userSelect: 'none' }}
                    >
                      {label}{col && seta(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.map((l, i) => {
                  const bgRow = l.resspOcorrencias > 0 ? '#fff8f8' : l.statusReab === '⚠️' ? '#fff8f8' : l.statusReab === '⬇️' ? '#fffbeb' : '#fff';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #eee', backgroundColor: bgRow }}>
                      <td style={td}>
                        <div style={{ fontWeight: '600' }}>{l.nomeProduto}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>Cód: {l.codProduto}</div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>{l.espacosPalete}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{l.capacidade || '-'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{l.vendasCaixasReab > 0 ? Math.round(l.vendasCaixasReab) : '-'}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>
                        {l.esperadoPaletes !== null ? Math.round(l.esperadoPaletes * 10) / 10 : '-'}
                      </td>
                      <td style={{ ...td, textAlign: 'center', color: '#1D5A9E', fontWeight: 'bold' }}>{l.reabPaletes}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 'bold', color: l.diferenca > 0 ? '#c0392b' : l.diferenca < 0 ? '#856404' : '#166534' }}>
                        {l.diferenca !== null ? (l.diferenca > 0 ? `+${Math.round(l.diferenca * 10)/10}` : Math.round(l.diferenca * 10)/10) : '-'}
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontSize: 18 }}>{l.statusReab}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#E31837', fontWeight: 'bold' }}>{l.resspPaletes || 0}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#E31837', fontWeight: 'bold' }}>{l.resspOcorrencias || 0}</td>
                      <td style={{ ...td, textAlign: 'center', fontSize: 18 }}>{l.statusRessp}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Produtos sem config */}
      {semConfig.length > 0 && (
        <div style={{ ...secao, marginTop: 16, borderLeft: '4px solid #f39c12' }}>
          <h3 style={{ ...secaoTitulo, color: '#f39c12' }}>⚠️ Lançamentos sem configuração de picking ({semConfig.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {semConfig.map((p, i) => (
              <span key={i} style={{ backgroundColor: '#fff8e6', border: '1px solid #f39c12', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                {p.nomeProduto} — Reab: {p.reabPaletes} plt / Ressp: {p.resspPaletes} plt
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: 12, color: '#888', flexWrap: 'wrap' }}>
        <span>✅ Dentro do esperado (±20%)</span>
        <span>⚠️ Acima do esperado — repôs mais do que vendeu</span>
        <span>⬇️ Abaixo do esperado — picking entra defasado</span>
        <span>🚨 Ressuprimento — sempre falha operacional</span>
        <span>➖ Sem dados de venda para referência</span>
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#333', fontSize: 16, fontWeight: 'bold', marginBottom: 16, marginTop: 0 };
const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#666', fontWeight: '600', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px' };
const btnSec = { padding: '8px 14px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const inputStyle = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, width: 120 };
const card = (cor, bg) => ({
  backgroundColor: bg || cor, borderRadius: 12, padding: 20,
  color: bg ? cor : '#fff',
  border: bg ? `1px solid ${cor}` : 'none',
});
const cardNum = { fontSize: 36, fontWeight: 'bold' };
const cardLabel = { fontSize: 14, fontWeight: '600', marginTop: 4 };
const cardSub = { fontSize: 12, opacity: 0.8, marginTop: 2 };
