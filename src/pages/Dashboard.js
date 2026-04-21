import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const CORES = ['#E31837', '#1a5fa8', '#0F6E56', '#BA7517', '#534AB7', '#999'];

export default function Dashboard() {
  const [nris, setNris] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    const snap = await getDocs(collection(db, 'nris'));
    setNris(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setCarregando(false);
  }

  function parsearData(str) {
    if (!str || !str.includes('/')) return null;
    const [d, m, y] = str.split('/');
    return new Date(Number(y), Number(m)-1, Number(d));
  }

  const hoje = new Date();
  hoje.setHours(0,0,0,0);

  const vencendo30 = [];
  nris.forEach(n => {
    n.produtos?.forEach(p => {
      const venc = parsearData(p.validade);
      if (venc) {
        const diff = Math.ceil((venc - hoje) / (1000*60*60*24));
        if (diff >= 0 && diff <= 30) vencendo30.push({ ...p, nf: n.notaFiscal, motorista: n.motorista });
      }
    });
  });

  const porConferente = {};
  nris.forEach(n => {
    const c = n.conferente || 'N/A';
    porConferente[c] = (porConferente[c] || 0) + 1;
  });
  const dadosConferente = Object.entries(porConferente).map(([name, value]) => ({ name, value }));

  const porOrigem = {};
  nris.forEach(n => {
    const o = n.origem || 'N/A';
    porOrigem[o] = (porOrigem[o] || 0) + 1;
  });
  const dadosOrigem = Object.entries(porOrigem).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 6);

  const porProduto = {};
  nris.forEach(n => {
    n.produtos?.forEach(p => {
      const nome = p.nomeProduto || 'N/A';
      porProduto[nome] = (porProduto[nome] || 0) + 1;
    });
  });
  const dadosProduto = Object.entries(porProduto).map(([name, value]) => ({ name: name.slice(0,20), value })).sort((a,b) => b.value - a.value).slice(0, 8);

  const porMes = {};
  nris.forEach(n => {
    if (n.dataRecebimento?.includes('/')) {
      const [d, m, y] = n.dataRecebimento.split('/');
      const chave = `${m}/${y}`;
      porMes[chave] = (porMes[chave] || 0) + 1;
    }
  });
  const dadosMes = Object.entries(porMes).map(([name, value]) => ({ name, value })).slice(-6);

  if (carregando) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
      <p>Carregando dados...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: '1400px' }}>
      {/* Título */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 600,
          color: '#1a1a2e',
          marginBottom: 4,
        }}>
          Dashboard
        </h1>
        <p style={{
          fontSize: 14,
          color: '#888',
          marginBottom: 0,
        }}>
          Visão geral dos recebimentos e operações
        </p>
      </div>

      {/* Métricas principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total de NRIs', valor: nris.length, cor: '#E31837', icon: '📦' },
          { label: 'Total de Produtos', valor: nris.reduce((a, n) => a + (n.produtos?.length || 0), 0), cor: '#1a5fa8', icon: '📊' },
          { label: 'Vencendo em 30 dias', valor: vencendo30.length, cor: '#BA7517', icon: '⚠️' },
          { label: 'Conferentes ativos', valor: Object.keys(porConferente).length, cor: '#0F6E56', icon: '👥' },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#fff',
              borderRadius: 8,
              padding: 20,
              border: `1px solid #f0f0f0`,
              borderLeft: `3px solid ${c.cor}`,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ fontSize: 11, color: '#999', marginBottom: 12, fontWeight: 500 }}>
              {c.icon} {c.label}
            </div>
            <div style={{ fontSize: 36, fontWeight: 600, color: c.cor }}>
              {c.valor}
            </div>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>NRIs por Mês</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dadosMes} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#666' }} stroke="#f0f0f0" />
              <YAxis tick={{ fontSize: 12, fill: '#666' }} stroke="#f0f0f0" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #f0f0f0',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="#E31837" radius={[4, 4, 0, 0]} name="NRIs" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Recebimentos por Conferente</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={dadosConferente}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={{ fontSize: 11, fill: '#666' }}
              >
                {dadosConferente.map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #f0f0f0',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#666' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Produtos Mais Recebidos</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dadosProduto} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 140 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#666' }} stroke="#f0f0f0" />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#666' }} stroke="none" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #f0f0f0',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="#1a5fa8" radius={[0, 4, 4, 0]} name="Qtd" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Recebimentos por Origem</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dadosOrigem} margin={{ top: 10, right: 20, bottom: 40, left: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#666' }}
                stroke="#f0f0f0"
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fontSize: 12, fill: '#666' }} stroke="#f0f0f0" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #f0f0f0',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="#0F6E56" radius={[4, 4, 0, 0]} name="NRIs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela de vencimento */}
      {vencendo30.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ ...cardTitleStyle, color: '#BA7517', marginBottom: 20 }}>
            ⚠️ Produtos Vencendo em 30 dias ({vencendo30.length})
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f9f9f9',
                  borderBottom: '2px solid #e0e0e0',
                }}>
                  {['Produto', 'Cód', 'Validade', 'NF', 'Motorista'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '12px',
                        textAlign: 'left',
                        color: '#555',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vencendo30.map((p, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid #f0f0f0',
                      backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa',
                    }}
                  >
                    <td style={{ padding: '12px', color: '#333' }}>
                      {p.nomeProduto}
                    </td>
                    <td style={{ padding: '12px', color: '#666', fontFamily: 'monospace' }}>
                      {p.codProduto}
                    </td>
                    <td style={{ padding: '12px', color: '#BA7517', fontWeight: 600 }}>
                      {p.validade}
                    </td>
                    <td style={{ padding: '12px', color: '#666' }}>
                      {p.nf}
                    </td>
                    <td style={{ padding: '12px', color: '#666' }}>
                      {p.motorista}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: 8,
  padding: 24,
  border: '1px solid #f0f0f0',
  transition: 'all 0.2s',
};

const cardTitleStyle = {
  fontSize: 16,
  fontWeight: 600,
  color: '#1a1a2e',
  marginBottom: 20,
  marginTop: 0,
};