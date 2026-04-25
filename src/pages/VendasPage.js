import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

function ordenarDatas(datas) {
  return [...datas].sort((a, b) => {
    const [dA, mA, aA] = a.split('/').map(Number);
    const [dB, mB, aB] = b.split('/').map(Number);
    return new Date(aA, mA-1, dA) - new Date(aB, mB-1, dB);
  });
}

export default function VendasPage() {
  const [relatorios, setRelatorios] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const q = query(collection(db, 'vendas_relatorio'), orderBy('importadoEm', 'desc'));
      const snap = await getDocs(q);
      const lista = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      setRelatorios(lista);
      if (lista.length > 0) setSelecionado(lista[0]);
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  function formatarDataHora(val) {
    if (!val) return '';
    const d = typeof val.toDate === 'function' ? val.toDate() : new Date(val);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  const cardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' };

  if (carregando) return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>⏳ Carregando...</div>;

  if (relatorios.length === 0) return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#E31837', marginBottom: '10px' }}>📊 Vendas</h1>
      <div style={{ ...cardStyle, textAlign: 'center', padding: '40px', color: '#999' }}>
        Nenhum relatório importado ainda. Use a aba <strong>Importar Vendas 03.02.36.08</strong> para importar.
      </div>
    </div>
  );

  const datas = selecionado ? ordenarDatas(selecionado.datas || []) : [];

  return (
    <div style={{ maxWidth: '100%', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#E31837', marginBottom: '4px' }}>📊 Vendas</h1>
      <p style={{ color: '#666', marginBottom: '20px', fontSize: '13px' }}>
        Quantidade de caixas vendidas por produto por dia (apenas produtos do Picking Config)
      </p>

      {/* SELETOR DE RELATÓRIO */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>📅 Relatório importado:</label>
          <select
            value={selecionado?._id || ''}
            onChange={e => setSelecionado(relatorios.find(r => r._id === e.target.value))}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', minWidth: '320px' }}
          >
            {relatorios.map(r => (
              <option key={r._id} value={r._id}>
                {formatarDataHora(r.importadoEm)} — {r.nomeArquivo || 'sem nome'} ({(r.produtos || []).length} produtos)
              </option>
            ))}
          </select>
        </div>

        {selecionado && (
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Período: <strong>{datas[0]}</strong> até <strong>{datas[datas.length - 1]}</strong> · <strong>{datas.length}</strong> dia(s) · <strong>{(selecionado.produtos || []).length}</strong> produto(s)
            </div>
            <input
              type="text"
              placeholder="🔍 Buscar por código ou descrição..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', width: 260 }}
            />
          </div>
        )}
      </div>

      {/* TABELA PIVÔ */}
      {selecionado && (
        <div style={cardStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th style={{ ...thFixo, minWidth: '70px' }}>Código</th>
                  <th style={{ ...thFixo, minWidth: '220px', textAlign: 'left' }}>Descrição</th>
                  {datas.map(d => (
                    <th key={d} style={thData}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(selecionado.produtos || []).filter(prod => {
                  if (!busca) return true;
                  const b = busca.toLowerCase();
                  return String(prod.codigo).toLowerCase().includes(b) || (prod.descricao || '').toLowerCase().includes(b);
                }).map((prod, idx) => (
                  <tr key={prod.codigo} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                    <td style={{ ...tdFixo, fontWeight: 'bold', color: '#E31837' }}>{prod.codigo}</td>
                    <td style={{ ...tdFixo, textAlign: 'left' }}>{prod.descricao}</td>
                    {datas.map(d => {
                      const qtd = prod.vendas?.[d];
                      return (
                        <td key={d} style={{ ...tdValor, color: qtd ? '#1D5A9E' : '#ccc' }}>
                          {qtd ? qtd.toLocaleString('pt-BR') : '—'}
                        </td>
                      );
                    })}
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

const thFixo = {
  backgroundColor: '#E31837', color: 'white', padding: '10px 14px', fontWeight: 'bold',
  textAlign: 'center', position: 'sticky', top: 0, borderRight: '1px solid #c0102a',
};
const thData = {
  backgroundColor: '#1D5A9E', color: 'white', padding: '10px 10px', fontWeight: 'bold',
  textAlign: 'center', position: 'sticky', top: 0, borderRight: '1px solid #164a8a', minWidth: '95px',
};
const tdFixo = {
  padding: '8px 14px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee', textAlign: 'center',
};
const tdValor = {
  padding: '8px 10px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee',
  textAlign: 'center', fontWeight: 'bold',
};
