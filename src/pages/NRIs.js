import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function NRIs({ usuario }) {
  const [nris, setNris] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => { carregarNRIs(); }, []);

  async function carregarNRIs() {
    setCarregando(true);
    const snap = await getDocs(collection(db, 'nris'));
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => {
      const toDate = s => {
        if (!s) return new Date(0);
        if (s.includes('/')) { const [d,m,y] = s.split('/'); return new Date(`${y}-${m}-${d}`); }
        return new Date(s);
      };
      return toDate(b.dataRecebimento) - toDate(a.dataRecebimento);
    });
    setNris(lista);
    setCarregando(false);
  }

  async function excluir(id, nf) {
    if (!window.confirm(`Deseja excluir a NRI da NF: ${nf}?`)) return;
    await deleteDoc(doc(db, 'nris', id));
    carregarNRIs();
  }

  const filtradas = nris.filter(n =>
    n.notaFiscal?.includes(filtro) ||
    n.motorista?.toLowerCase().includes(filtro.toLowerCase()) ||
    n.produtos?.some(p => p.nomeProduto?.toLowerCase().includes(filtro.toLowerCase()))
  );

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Carregando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Consultar NRIs</h2>
        <button onClick={carregarNRIs} style={btnSecundario}>🔄 Atualizar</button>
      </div>

      <input
        style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
        placeholder="Buscar por NF, motorista ou produto..."
        value={filtro}
        onChange={e => setFiltro(e.target.value)}
      />

      {filtradas.length === 0 && <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>Nenhuma NRI encontrada.</p>}

      {filtradas.map(item => (
        <div key={item.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 'bold', fontSize: 16, color: '#333' }}>NF: {item.notaFiscal}</span>
                <span style={{ fontSize: 13, color: '#999' }}>{item.dataRecebimento}</span>
              </div>
              <div style={{ fontSize: 13, color: '#555', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <span>🚗 Cavalo: {item.placaCavalo}</span>
                <span>🚛 Carreta: {item.placaCarreta}</span>
                <span>👤 Motorista: {item.motorista}</span>
                <span>📍 Origem: {item.origem}</span>
                <span>👷 Conferente: {item.conferente}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setExpandido(expandido === item.id ? null : item.id)} style={btnSecundario}>
                {expandido === item.id ? 'Recolher ▲' : `Ver ${item.produtos?.length || 0} produto(s) ▼`}
              </button>
              {usuario.nivel === 'supervisor' && (
                <button onClick={() => excluir(item.id, item.notaFiscal)} style={btnExcluir}>✕</button>
              )}
            </div>
          </div>

          {expandido === item.id && (
            <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9f9f9' }}>
                    {['Código', 'Produto', 'Qtd PLT', 'Qtd CX', 'Validade'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#666' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.produtos?.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 12px' }}>{p.codProduto}</td>
                      <td style={{ padding: '8px 12px' }}>{p.nomeProduto}</td>
                      <td style={{ padding: '8px 12px' }}>{p.qtdPlt || '-'}</td>
                      <td style={{ padding: '8px 12px' }}>{p.qtdCx || '-'}</td>
                      <td style={{ padding: '8px 12px', color: '#E31837', fontWeight: 'bold' }}>{p.validade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const card = { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #E31837' };
const btnSecundario = { padding: '8px 14px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnExcluir = { padding: '8px 12px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E31837', fontWeight: 'bold' };