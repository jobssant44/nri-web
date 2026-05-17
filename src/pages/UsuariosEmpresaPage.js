import { useState, useEffect, useCallback } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { authSecundario, db } from '../firebaseConfig';
import { useUser } from '../context/UserContext';
import { useDb } from '../utils/db';
import { NIVEIS, NIVEIS_SUPERVISOR } from './admin/ConfigurarEmpresaPage';

const NIVEIS_PRECISA_REVENDA = ['ajudante', 'operador', 'porteiro', 'conferente', 'analista'];

export default function UsuariosEmpresaPage() {
  const { usuario, empresa } = useUser();
  const { col }              = useDb();
  const isAdmin              = usuario?.nivel === 'admin';
  const revendas             = empresa?.revendas ?? [];

  const meuIndex      = NIVEIS.findIndex(n => n.valor === usuario?.nivel);
  const niveisPermitidos = isAdmin ? NIVEIS : NIVEIS.filter((_, i) => i < meuIndex);

  const [usuarios,  setUsuarios]  = useState([]);
  const [novoEmail, setNovoEmail] = useState('');
  const [novoNome,  setNovoNome]  = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novoNivel, setNovoNivel] = useState('conferente');
  const [novaRevId, setNovaRevId] = useState('');
  const [criando,   setCriando]   = useState(false);
  const [erroUser,  setErroUser]  = useState('');

  const carregarUsuarios = useCallback(() => {
    getDocs(col('usuarios')).then(snap => {
      setUsuarios(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
  }, [col]);

  useEffect(() => { carregarUsuarios(); }, [carregarUsuarios]);

  async function criarUsuario(e) {
    e.preventDefault();
    setErroUser('');
    if (!novoEmail || !novoNome || !novaSenha) { setErroUser('Preencha todos os campos.'); return; }
    if (!isAdmin) {
      const targetIndex = NIVEIS.findIndex(n => n.valor === novoNivel);
      if (targetIndex >= meuIndex) { setErroUser('Você não pode criar usuários com nível igual ou superior ao seu.'); return; }
    }
    // Só exige revenda se o nível precisar E a empresa tiver revendas cadastradas.
    // Empresa "matriz única" (sem revendas) → revendaId = null.
    const empTemRevendas = revendas.filter(Boolean).length > 0;
    const precisaRev = NIVEIS_PRECISA_REVENDA.includes(novoNivel) && empTemRevendas;
    if (precisaRev && !novaRevId) { setErroUser('Selecione a revenda para este nível.'); return; }

    setCriando(true);
    try {
      const cred = await createUserWithEmailAndPassword(authSecundario, novoEmail.trim(), novaSenha.trim());
      const uid  = cred.user.uid;
      const dados = {
        email:     novoEmail.trim(),
        nome:      novoNome.trim(),
        nivel:     novoNivel,
        revendaId: precisaRev ? novaRevId : null,
        empresaId: usuario.empresaId,
        criadoEm:  new Date().toISOString(),
      };
      await setDoc(doc(db, 'usuarios_global', uid), dados);
      await setDoc(doc(col('usuarios'), uid), dados);
      setNovoEmail(''); setNovoNome(''); setNovaSenha(''); setNovoNivel('conferente'); setNovaRevId('');
      carregarUsuarios();
    } catch (err) {
      const msg = {
        'auth/email-already-in-use': 'Este e-mail já está em uso.',
        'auth/invalid-email':        'E-mail inválido.',
        'auth/weak-password':        'Senha fraca (mín. 6 caracteres).',
      }[err.code] ?? `Erro: ${err.message}`;
      setErroUser(msg);
    }
    setCriando(false);
  }

  async function excluirUsuario(uid, nome) {
    if (!window.confirm(`Excluir o usuário "${nome}"?`)) return;
    await deleteDoc(doc(col('usuarios'), uid));
    await deleteDoc(doc(db, 'usuarios_global', uid));
    carregarUsuarios();
  }

  // Esconde o campo Revenda no formulário quando a empresa não tem revendas
  // cadastradas (caso da matriz única — ex: CBB).
  const empTemRevendas = revendas.filter(Boolean).length > 0;
  const precisaRev = NIVEIS_PRECISA_REVENDA.includes(novoNivel) && empTemRevendas;

  return (
    <div>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Usuários</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>

        {/* Formulário */}
        <div style={secao}>
          <h3 style={secaoTitulo}>Novo Usuário</h3>
          <form onSubmit={criarUsuario}>
            <label style={lbl}>Nome</label>
            <input style={inp} value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Ex: Carlos" />

            <label style={lbl}>E-mail</label>
            <input style={inp} type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="carlos@email.com" />

            <label style={lbl}>Senha</label>
            <input style={inp} type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />

            <label style={lbl}>Nível</label>
            <select style={inp} value={novoNivel} onChange={e => setNovoNivel(e.target.value)}>
              {niveisPermitidos.map(n => <option key={n.valor} value={n.valor}>{n.label}</option>)}
            </select>

            {precisaRev && (
              <>
                <label style={lbl}>Revenda / Filial</label>
                <select style={inp} value={novaRevId} onChange={e => setNovaRevId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {revendas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </>
            )}

            {erroUser && <div style={erroBox}>{erroUser}</div>}

            <button type="submit" disabled={criando} style={{ ...btnPrimario, width: '100%', marginTop: 8, opacity: criando ? 0.6 : 1 }}>
              {criando ? 'Criando...' : '+ Criar usuário'}
            </button>
          </form>
        </div>

        {/* Lista */}
        <div style={secao}>
          <h3 style={secaoTitulo}>Usuários ({usuarios.length})</h3>
          {usuarios.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>Nenhum usuário cadastrado.</p>}
          {usuarios.map(u => {
            const rev = revendas.find(r => r.id === u.revendaId);
            const nivelLabel = NIVEIS.find(n => n.valor === u.nivel)?.label ?? u.nivel;
            const eSup = NIVEIS_SUPERVISOR.includes(u.nivel);
            return (
              <div key={u.uid} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#333' }}>{u.nome}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{u.email}</div>
                  <div style={{ fontSize: 12, marginTop: 2, display: 'flex', gap: 8 }}>
                    <span style={{ color: eSup ? '#E31837' : '#888', fontWeight: 500 }}>{nivelLabel}</span>
                    {rev && <span style={{ color: '#1D5A9E' }}>· {rev.nome}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={() => excluirUsuario(u.uid, u.nome)} style={btnExcluir}>Excluir</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const secao      = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#E31837', fontSize: 15, fontWeight: 'bold', marginTop: 0, marginBottom: 16 };
const lbl        = { fontSize: 12, color: '#555', display: 'block', marginBottom: 4, marginTop: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 };
const inp        = { width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 4 };
const btnPrimario = { padding: '9px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 };
const btnExcluir  = { padding: '7px 12px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: '#E31837' };
const erroBox     = { padding: '8px 12px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#991b1b', margin: '8px 0', fontWeight: 500 };
