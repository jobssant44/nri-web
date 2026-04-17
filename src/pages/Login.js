import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function Login({ onLogin }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    if (!nome || !senha) { setErro('Preencha nome e senha.'); return; }
    setCarregando(true);
    setErro('');
    if (nome.trim() === 'Jobson' && senha.trim() === '3573') {
      onLogin({ nome: 'Jobson', nivel: 'supervisor' });
      return;
    }
    try {
      const snapshot = await getDocs(collection(db, 'usuarios'));
      const usuarios = snapshot.docs.map(d => d.data());
      const encontrado = usuarios.find(u =>
        u.nome.toLowerCase() === nome.trim().toLowerCase() && u.senha === senha.trim()
      );
      if (encontrado) {
        onLogin({ nome: encontrado.nome, nivel: encontrado.nivel });
      } else {
        setErro('Nome ou senha incorretos.');
      }
    } catch (e) {
      setErro('Erro ao conectar. Verifique sua conexão.');
    }
    setCarregando(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 40, width: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <h1 style={{ color: '#E31837', textAlign: 'center', marginBottom: 4, fontSize: 28 }}>NRI Ambev</h1>
        <p style={{ color: '#666', textAlign: 'center', marginBottom: 32, fontSize: 14 }}>Conferência de Recebimento</p>
        <form onSubmit={entrar}>
          <label style={lbl}>Nome</label>
          <input style={inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" />
          <label style={lbl}>Senha</label>
          <input style={inp} type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Sua senha" />
          {erro && <p style={{ color: '#E31837', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
          <button type="submit" disabled={carregando} style={{ width: '100%', padding: 14, backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', marginTop: 8 }}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

const lbl = { fontSize: 13, color: '#555', display: 'block', marginBottom: 4, marginTop: 12 };
const inp = { width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' };