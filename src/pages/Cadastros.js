import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const ABAS = [
  { key: 'motoristas', label: 'Motoristas' },
  { key: 'cavalos', label: 'Cavalos' },
  { key: 'carretas', label: 'Carretas' },
  { key: 'origens', label: 'Origens' },
];

export default function Cadastros() {
  const [abaAtiva, setAbaAtiva] = useState('motoristas');
  const [dados, setDados] = useState({ motoristas: [], cavalos: [], carretas: [], origens: [] });
  const [novoItem, setNovoItem] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editandoValor, setEditandoValor] = useState('');

  useEffect(() => { carregarTodos(); }, []);

  async function carregarTodos() {
    const [mSnap, cSnap, crSnap, oSnap] = await Promise.all([
      getDocs(collection(db, 'motoristas')),
      getDocs(collection(db, 'cavalos')),
      getDocs(collection(db, 'carretas')),
      getDocs(collection(db, 'origens')),
    ]);
    setDados({
      motoristas: mSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      cavalos: cSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      carretas: crSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      origens: oSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  }

  async function adicionar() {
    if (!novoItem.trim()) return;
    if (dados[abaAtiva].some(i => i.valor.toLowerCase() === novoItem.trim().toLowerCase())) {
      alert('Item já cadastrado.'); return;
    }
    await addDoc(collection(db, abaAtiva), { valor: novoItem.trim() });
    setNovoItem('');
    carregarTodos();
  }

  async function excluir(id) {
    if (!window.confirm('Deseja excluir este item?')) return;
    await deleteDoc(doc(db, abaAtiva, id));
    carregarTodos();
  }

  async function salvarEdicao(id) {
    if (!editandoValor.trim()) return;
    await updateDoc(doc(db, abaAtiva, id), { valor: editandoValor.trim() });
    setEditandoId(null);
    carregarTodos();
  }

  return (
    <div>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Cadastros</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => { setAbaAtiva(a.key); setNovoItem(''); setEditandoId(null); }}
            style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid #ddd', cursor: 'pointer', fontWeight: '500', fontSize: 14, backgroundColor: abaAtiva === a.key ? '#E31837' : '#fff', color: abaAtiva === a.key ? '#fff' : '#555' }}>
            {a.label}
          </button>
        ))}
      </div>

      <div style={secao}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
            value={novoItem} onChange={e => setNovoItem(e.target.value)}
            placeholder={`Novo ${abaAtiva.slice(0,-1)}...`}
            onKeyDown={e => e.key === 'Enter' && adicionar()}
          />
          <button onClick={adicionar} style={btnPrimario}>+ Adicionar</button>
        </div>

        {dados[abaAtiva].length === 0 && <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum item cadastrado.</p>}

        {dados[abaAtiva].map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee', gap: 12 }}>
            {editandoId === item.id ? (
              <>
                <input style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                  value={editandoValor} onChange={e => setEditandoValor(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && salvarEdicao(item.id)}
                  autoFocus
                />
                <button onClick={() => salvarEdicao(item.id)} style={btnPrimario}>Salvar</button>
                <button onClick={() => setEditandoId(null)} style={btnSecundario}>Cancelar</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 15, color: '#333' }}>{item.valor}</span>
                <button onClick={() => { setEditandoId(item.id); setEditandoValor(item.valor); }} style={btnSecundario}>Editar</button>
                <button onClick={() => excluir(item.id)} style={btnExcluir}>Excluir</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 };
const btnSecundario = { padding: '8px 16px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnExcluir = { padding: '8px 16px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E31837' };