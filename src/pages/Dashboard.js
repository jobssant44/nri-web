import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const CORES = ['#E31837', '#1a5fa8', '#0F6E56', '#BA7517', '#534AB7', '#333'];

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

  function calcularData(dataStr, dias) {
    if (!dataStr || !dataStr.includes('/')) return null;
    const [d, m, y] = dataStr.split('/').map(Number);
    const data = new Date(y, m-1, d);
    data.setDate(data.getDate() - dias);
    return data;
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

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Carregando...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 24, color: '#333' }}>Dashboard</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total de NRIs', valor: nris.length, cor: '#E31837' },
          { label: 'Total de Produtos', valor: nris.reduce((a, n) => a + (n.produtos?.length || 0), 0), cor: '#1a5fa8' },
          { label: 'Vencendo em 30 dias', valor: vencendo30.length, cor: '#BA7517' },
          { label: 'Conferentes ativos', valor: Object.keys(porConferente).length, cor: '#0F6E56' },
        ].map((c, i) => (
          <div key={i} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, borderLeft: `4px solid ${c.cor}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: c.cor }}>{c.valor}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        <div style={card}>
          <h3 style={cardTitle}>NRIs por Mês</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosMes}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#E31837" radius={[4,4,0,0]} name="NRIs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <h3 style={cardTitle}>Recebimentos por Conferente</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={dadosConferente} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {dadosConferente.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        <div style={card}>
          <h3 style={cardTitle}>Produtos Mais Recebidos</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosProduto} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={140} />
              <Tooltip />
              <Bar dataKey="value" fill="#1a5fa8" radius={[0,4,4,0]} name="Qtd" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <h3 style={cardTitle}>Recebimentos por Origem</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosOrigem}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#0F6E56" radius={[4,4,0,0]} name="NRIs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {vencendo30.length > 0 && (
        <div style={card}>
          <h3 style={{ ...cardTitle, color: '#BA7517' }}>⚠️ Produtos Vencendo em 30 dias ({vencendo30.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#fff8f0' }}>
                {['Produto', 'Cód', 'Validade', 'NF', 'Motorista'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vencendo30.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 12px' }}>{p.nomeProduto}</td>
                  <td style={{ padding: '8px 12px' }}>{p.codProduto}</td>
                  <td style={{ padding: '8px 12px', color: '#E31837', fontWeight: 'bold' }}>{p.validade}</td>
                  <td style={{ padding: '8px 12px' }}>{p.nf}</td>
                  <td style={{ padding: '8px 12px' }}>{p.motorista}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const card = { backgroundColor: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle = { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 16, marginTop: 0 };