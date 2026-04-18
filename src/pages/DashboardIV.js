import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

function diaOperacionalHoje() {
  const agora = new Date();
  if (agora.getHours() < 7) agora.setDate(agora.getDate() - 1);
  return String(agora.getDate()).padStart(2,'0') + '/' +
    String(agora.getMonth()+1).padStart(2,'0') + '/' + agora.getFullYear();
}

function calcIvEsperado(mediaCxDia, espacosPalete, cxPorPlt) {
  if (!mediaCxDia || !espacosPalete || !cxPorPlt) return null;
  const capacidade = espacosPalete * cxPorPlt;
  return Math.max(0, Math.ceil(mediaCxDia / capacidade) - 1);
}

export default function DashboardIV() {
  const [dataFiltro, setDataFiltro] = useState(diaOperacionalHoje());
  const [abastecimentos, setAbastecimentos] = useState([]);
  const [pickingConfig, setPickingConfig] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    const [aSnap, pSnap] = await Promise.all([
      getDocs(collection(db, 'abastecimentos')),
      getDocs(collection(db, 'picking_config')),
    ]);
    setAbastecimentos(aSnap.docs.map(d => d.data()));
    setPickingConfig(pSnap.docs.map(d => d.data()));
    setCarregando(false);
  }

  const filtrados = abastecimentos.filter(a => a.dataOperacional === dataFiltro);

  const porProduto = {};
  filtrados.forEach(a => {
    if (!porProduto[a.codProduto]) {
      porProduto[a.codProduto] = { codProduto: a.codProduto, nomeProduto: a.nomeProduto, reab: 0, ressp: 0 };
    }
    if (a.tipo === 'reabastecimento') porProduto[a.codProduto].reab += a.qtdPaletes || 1;
    else porProduto[a.codProduto].ressp += a.qtdPaletes || 1;
  });

  const linhas = pickingConfig.map(cfg => {
    const dados = porProduto[cfg.codProduto] || { reab: 0, ressp: 0 };
    const ivEsp = calcIvEsperado(cfg.mediaCxDia, cfg.espacosPalete, cfg.cxPorPlt);
    const ivTotal = dados.reab + dados.ressp;
    let status = '➖';
    if (ivEsp !== null) {
      if (ivTotal > ivEsp) status = '⚠️';
      else if (ivEsp > 0 && ivTotal < Math.floor(ivEsp / 2)) status = '🆓';
      else status = '✅';
    }
    return { ...cfg, ...dados, ivEsp, ivTotal, status };
  });

  // Produtos lançados sem picking config
  const semConfig = Object.values(porProduto).filter(p => !pickingConfig.find(c => c.codProduto === p.codProduto));

  const totalReab = filtrados.filter(a => a.tipo === 'reabastecimento').reduce((s, a) => s + (a.qtdPaletes || 1), 0);
  const totalRessp = filtrados.filter(a => a.tipo === 'ressuprimento').reduce((s, a) => s + (a.qtdPaletes || 1), 0);
  const acimaMeta = linhas.filter(l => l.status === '⚠️').length;
  const ociosos = linhas.filter(l => l.status === '🆓').length;

  const dadosGrafico = linhas
    .filter(l => l.ivTotal > 0 || (l.ivEsp !== null && l.ivEsp > 0))
    .sort((a, b) => b.ivTotal - a.ivTotal)
    .slice(0, 12)
    .map(l => ({
      nome: l.nomeProduto?.split(' ').slice(0,2).join(' '),
      'IV Realizado': l.ivTotal,
      'IV Esperado': l.ivEsp ?? 0,
    }));

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Carregando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Dashboard IV — Reabastecimento / Ressuprimento</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }}
            placeholder="DD/MM/AAAA"
            value={dataFiltro}
            maxLength={10}
            onChange={e => setDataFiltro(e.target.value)}
          />
          <button onClick={carregar} style={btnSec}>🔄 Atualizar</button>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={card('#1D5A9E')}>
          <div style={cardNum}>{totalReab}</div>
          <div style={cardLabel}>Paletes Reabastecidos</div>
          <div style={cardSub}>🌅 Durante o dia</div>
        </div>
        <div style={card('#E31837')}>
          <div style={cardNum}>{totalRessp}</div>
          <div style={cardLabel}>Paletes Ressupridos</div>
          <div style={cardSub}>🌙 Durante o carregamento</div>
        </div>
        <div style={card('#c0392b')}>
          <div style={cardNum}>{acimaMeta}</div>
          <div style={cardLabel}>Produtos Acima do Esperado</div>
          <div style={cardSub}>⚠️ Oportunidade de espaço</div>
        </div>
        <div style={card('#27ae60')}>
          <div style={cardNum}>{ociosos}</div>
          <div style={cardLabel}>Possíveis Espaços Ociosos</div>
          <div style={cardSub}>🆓 IV muito abaixo do esperado</div>
        </div>
      </div>

      {/* Gráfico */}
      {dadosGrafico.length > 0 && (
        <div style={secao}>
          <h3 style={secaoTitulo}>IV Realizado vs Esperado por Produto</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dadosGrafico} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
              <XAxis dataKey="nome" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="IV Realizado" fill="#E31837" radius={[4,4,0,0]}>
                {dadosGrafico.map((entry, i) => (
                  <Cell key={i} fill={entry['IV Realizado'] > entry['IV Esperado'] ? '#c0392b' : '#E31837'} />
                ))}
              </Bar>
              <Bar dataKey="IV Esperado" fill="#1D5A9E" radius={[4,4,0,0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela */}
      <div style={{ ...secao, marginTop: 24 }}>
        <h3 style={secaoTitulo}>Detalhamento por Produto — {dataFiltro}</h3>
        {linhas.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum produto configurado. Acesse <b>Configurar Picking</b> para cadastrar.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  {['Produto', 'Espaços', 'Cap.(cx)', 'Média CX/dia', 'IV Esperado', 'IV Reab 🌅', 'IV Ressp 🌙', 'IV Total', 'Status'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.sort((a, b) => b.ivTotal - a.ivTotal).map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee', backgroundColor: l.status === '⚠️' ? '#fff8f8' : l.status === '🆓' ? '#f0fff4' : '#fff' }}>
                    <td style={td}><div style={{ fontWeight: '600' }}>{l.nomeProduto}</div><div style={{ fontSize: 11, color: '#999' }}>Cód: {l.codProduto}</div></td>
                    <td style={{ ...td, textAlign: 'center' }}>{l.espacosPalete}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{l.espacosPalete && l.cxPorPlt ? l.espacosPalete * l.cxPorPlt : '-'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{l.mediaCxDia || '-'}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 'bold', color: '#1D5A9E' }}>{l.ivEsp ?? '-'}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#1D5A9E', fontWeight: 'bold' }}>{l.reab || 0}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#E31837', fontWeight: 'bold' }}>{l.ressp || 0}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 'bold' }}>{l.ivTotal}</td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 18 }}>{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Produtos sem config */}
      {semConfig.length > 0 && (
        <div style={{ ...secao, marginTop: 16, borderLeft: '4px solid #f39c12' }}>
          <h3 style={{ ...secaoTitulo, color: '#f39c12' }}>⚠️ Produtos lançados sem configuração de picking ({semConfig.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {semConfig.map((p, i) => (
              <span key={i} style={{ backgroundColor: '#fff8e6', border: '1px solid #f39c12', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                {p.nomeProduto} (Reab: {p.reab} / Ressp: {p.ressp})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: 12, color: '#888' }}>
        <span>✅ IV dentro do esperado</span>
        <span>⚠️ IV acima do esperado — avaliar aumento de espaço palete</span>
        <span>🆓 IV muito baixo — possível espaço ocioso, avaliar redução</span>
        <span>➖ Sem configuração</span>
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#333', fontSize: 16, fontWeight: 'bold', marginBottom: 16, marginTop: 0 };
const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#666', fontWeight: '600', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px' };
const btnSec = { padding: '8px 14px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const card = cor => ({ backgroundColor: cor, borderRadius: 12, padding: 20, color: '#fff' });
const cardNum = { fontSize: 36, fontWeight: 'bold' };
const cardLabel = { fontSize: 14, fontWeight: '600', marginTop: 4 };
const cardSub = { fontSize: 12, opacity: 0.8, marginTop: 2 };
