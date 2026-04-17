import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [nivel, setNivel] = useState('conferente');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const snap = await getDocs(collection(db, 'usuarios'));
    setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function cadastrar(e) {
    e.preventDefault();
    if (!nome || !senha) { alert('Preencha nome e senha.'); return; }
    if (nome.toLowerCase() === 'jobson') { alert('Nome reservado.'); return; }
    await addDoc(collection(db, 'usuarios'), { nome: nome.trim(), senha: senha.trim(), nivel });
    setNome(''); setSenha(''); setNivel('conferente');
    carregar();
  }

  async function excluir(id, nomeUsuario) {
    if (!window.confirm(`Excluir o usuário ${nomeUsuario}?`)) return;
    await deleteDoc(doc(db, 'usuarios', id));
    carregar();
  }

  return (
    <div>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Gerenciar Usuários</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        <div style={secao}>
          <h3 style={secaoTitulo}>Novo Usuário</h3>
          <form onSubmit={cadastrar}>
            <label style={lbl}>Nome</label>
            <input style={inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Carlos" />
            <label style={lbl}>Senha</label>
            <input style={inp} type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha" />
            <label style={lbl}>Nível</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['conferente', 'supervisor'].map(n => (
                <button type="button" key={n} onClick={() => setNivel(n)}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', backgroundColor: nivel === n ? '#E31837' : '#fff', color: nivel === n ? '#fff' : '#555', fontWeight: '500', fontSize: 13 }}>
                  {n === 'supervisor' ? '👑 Supervisor' : 'Conferente'}
                </button>
              ))}
            </div>
            <button type="submit" style={{ ...btnPrimario, width: '100%' }}>+ Cadastrar</button>
          </form>
        </div>

        <div style={secao}>
          <h3 style={secaoTitulo}>Usuários cadastrados ({usuarios.length})</h3>
          {usuarios.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: 15, color: '#333' }}>{u.nome}</div>
                <div style={{ fontSize: 12, color: u.nivel === 'supervisor' ? '#E31837' : '#999', marginTop: 2 }}>
                  {u.nivel === 'supervisor' ? '👑 Supervisor' : 'Conferente'}
                </div>
              </div>
              <button onClick={() => excluir(u.id, u.nome)} style={btnExcluir}>Excluir</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#E31837', fontSize: 15, fontWeight: 'bold', marginTop: 0, marginBottom: 16 };
const lbl = { fontSize: 13, color: '#555', display: 'block', marginBottom: 4, marginTop: 12 };
const inp = { width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 4 };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 };
const btnExcluir = { padding: '8px 16px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E31837' };