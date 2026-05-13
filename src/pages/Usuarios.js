import { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { authSecundario, db } from '../firebaseConfig';
import { useUser } from '../context/UserContext';
import { useDb } from '../utils/db';
import { NIVEIS, NIVEIS_SUPERVISOR } from './admin/ConfigurarEmpresaPage';

export default function Usuarios() {
  const { usuario, empresa } = useUser();
  const { col }              = useDb();

  const [usuarios,   setUsuarios]   = useState([]);
  const [email,      setEmail]      = useState('');
  const [nome,       setNome]       = useState('');
  const [senha,      setSenha]      = useState('');
  const [nivel,      setNivel]      = useState('conferente');
  const [revendaId,  setRevendaId]  = useState('');
  const [salvando,   setSalvando]   = useState(false);
  const [erro,       setErro]       = useState('');

  useEffect(() => { carregar(); }, []); // eslint-disable-line

  async function carregar() {
    const snap = await getDocs(col('usuarios'));
    setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function cadastrar(e) {
    e.preventDefault();
    setErro('');
    if (!email || !nome || !senha) { setErro('Preencha todos os campos.'); return; }
    const precisaRevenda = !NIVEIS_SUPERVISOR.includes(nivel);
    if (precisaRevenda && !revendaId) { setErro('Selecione a revenda.'); return; }

    setSalvando(true);
    try {
      // Create Firebase Auth user via secondary app (doesn't log out current admin)
      const cred = await createUserWithEmailAndPassword(authSecundario, email.trim(), senha.trim());
      const uid  = cred.user.uid;

      const dados = {
        email:     email.trim(),
        nome:      nome.trim(),
        nivel,
        revendaId: precisaRevenda ? revendaId : null,
        empresaId: usuario.empresaId,
        criadoEm:  new Date().toISOString(),
      };

      // Write to flat global index (for login lookup)
      await setDoc(doc(db, 'usuarios_global', uid), dados);
      // Write to empresa sub-collection (for listing/management)
      await setDoc(doc(col('usuarios'), uid), dados);

      setEmail(''); setNome(''); setSenha(''); setNivel('conferente'); setRevendaId('');
      await carregar();
    } catch (err) {
      const msg = {
        'auth/email-already-in-use': 'Este e-mail já está em uso.',
        'auth/invalid-email':        'E-mail inválido.',
        'auth/weak-password':        'Senha fraca (mínimo 6 caracteres).',
      }[err.code] ?? `Erro: ${err.message}`;
      setErro(msg);
    }
    setSalvando(false);
  }

  async function excluir(id, nomeUsuario) {
    if (!window.confirm(`Excluir o usuário ${nomeUsuario}?`)) return;
    // Remove from empresa sub-collection and global index
    await deleteDoc(doc(col('usuarios'), id));
    await deleteDoc(doc(db, 'usuarios_global', id));
    await carregar();
  }

  const precisaRevenda = !NIVEIS_SUPERVISOR.includes(nivel);
  const revendas       = empresa?.revendas ?? [];

  return (
    <div>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Gerenciar Usuários</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>

        {/* ── Formulário ── */}
        <div style={secao}>
          <h3 style={secaoTitulo}>Novo Usuário</h3>
          <form onSubmit={cadastrar}>
            <label style={lbl}>Nome</label>
            <input style={inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Carlos" />

            <label style={lbl}>E-mail</label>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="carlos@email.com" />

            <label style={lbl}>Senha</label>
            <input style={inp} type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />

            <label style={lbl}>Nível</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {NIVEIS.map(n => (
                <button type="button" key={n.valor} onClick={() => setNivel(n.valor)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', textAlign: 'left', backgroundColor: nivel === n.valor ? '#E31837' : '#fff', color: nivel === n.valor ? '#fff' : '#555', fontWeight: '500', fontSize: 13 }}>
                  {n.label}
                </button>
              ))}
            </div>

            {precisaRevenda && (
              <>
                <label style={lbl}>Revenda / Filial</label>
                <select style={inp} value={revendaId} onChange={e => setRevendaId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {revendas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </>
            )}

            {erro && <div style={erroBox}>{erro}</div>}

            <button type="submit" disabled={salvando} style={{ ...btnPrimario, width: '100%', marginTop: 8, opacity: salvando ? 0.6 : 1 }}>
              {salvando ? 'Cadastrando...' : '+ Cadastrar'}
            </button>
          </form>
        </div>

        {/* ── Lista ── */}
        <div style={secao}>
          <h3 style={secaoTitulo}>Usuários cadastrados ({usuarios.length})</h3>
          {usuarios.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: 15, color: '#333' }}>{u.nome}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{u.email}</div>
                <div style={{ fontSize: 12, color: labelCor(u.nivel), marginTop: 2 }}>
                  {labelNivel(u.nivel)}{u.revendaId ? ` · ${revendas.find(r => r.id === u.revendaId)?.nome ?? u.revendaId}` : ''}
                </div>
              </div>
              <button onClick={() => excluir(u.id, u.nome)} style={btnExcluir}>Excluir</button>
            </div>
          ))}
          {usuarios.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>Nenhum usuário cadastrado.</p>}
        </div>
      </div>
    </div>
  );
}

function labelNivel(nivel) {
  if (nivel === 'admin') return 'Admin';
  return NIVEIS.find(n => n.valor === nivel)?.label ?? nivel;
}
function labelCor(nivel) {
  return NIVEIS_SUPERVISOR.includes(nivel) ? '#E31837' : '#999';
}

const secao      = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#E31837', fontSize: 15, fontWeight: 'bold', marginTop: 0, marginBottom: 16 };
const lbl        = { fontSize: 13, color: '#555', display: 'block', marginBottom: 4, marginTop: 12 };
const inp        = { width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 4 };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 };
const btnExcluir = { padding: '8px 16px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E31837' };
const erroBox    = { padding: '8px 12px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#991b1b', margin: '8px 0', fontWeight: 500 };
