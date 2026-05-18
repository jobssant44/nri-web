import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { authSecundario, db } from '../../firebaseConfig';

const TODOS_MODULOS = [
  { slug: 'recebimento',     label: 'Recebimento de Mercadoria' },
  { slug: 'reabastecimento', label: 'Reabastecimento / Ressuprimento' },
  { slug: 'curva-abc',       label: 'Curva ABC' },
  { slug: 'estoque',         label: 'Gerenciamento de Estoque' },
  { slug: 'armazem',         label: 'Mapa do Armazém' },
  { slug: 'gestao-idade',    label: 'Gestão de Idade' },
  { slug: 'prejuizo',        label: 'Gestão de Prejuízo' },
  { slug: 'pavg',            label: 'PAVG' },
  { slug: 'mpd',             label: 'Gestão MDP' },
  { slug: 'tma',             label: 'TMA' },
  { slug: 'conciliacao',     label: 'Conciliação de Estoque' },
  { slug: 'portaria',        label: 'Portaria' },
  { slug: 'plano-acao',      label: 'Plano de Ação' },
];

export const NIVEIS = [
  { valor: 'ajudante',    label: 'Ajudante' },
  { valor: 'operador',    label: 'Operador' },
  { valor: 'porteiro',    label: 'Porteiro' },
  { valor: 'conferente',  label: 'Conferente' },
  { valor: 'analista',    label: 'Analista' },
  { valor: 'supervisor',  label: 'Supervisor' },
  { valor: 'coordenador', label: 'Coordenador' },
  { valor: 'gerente',     label: 'Gerente' },
  { valor: 'diretor',     label: 'Diretor' },
];

// Níveis com acesso de supervisor (importar, cadastros, gerenciar)
export const NIVEIS_SUPERVISOR = ['admin', 'supervisor', 'coordenador', 'gerente', 'diretor'];
// Níveis vinculados a uma revenda específica (precisam de revendaId)
const NIVEIS_PRECISA_REVENDA = ['ajudante', 'operador', 'porteiro', 'conferente', 'analista'];

export default function ConfigurarEmpresaPage() {
  const { id } = useParams();

  const [empresa,     setEmpresa]     = useState(null);
  const [modulos,     setModulos]     = useState([]);
  const [revendas,    setRevendas]    = useState([]);
  const [novaRevenda, setNovaRevenda] = useState('');
  const [salvando,    setSalvando]    = useState(false);
  const [okConfig,    setOkConfig]    = useState(false);

  // Estado do formulário de usuário
  const [usuarios,   setUsuarios]   = useState([]);
  const [novoEmail,  setNovoEmail]  = useState('');
  const [novoNome,   setNovoNome]   = useState('');
  const [novaSenha,  setNovaSenha]  = useState('');
  const [novoNivel,  setNovoNivel]  = useState('conferente');
  const [novaRevId,  setNovaRevId]  = useState('');
  const [criando,    setCriando]    = useState(false);
  const [erroUser,   setErroUser]   = useState('');

  const carregarEmpresa = useCallback(() => {
    getDoc(doc(db, 'empresas', id)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setEmpresa({ id: snap.id, ...d });
      setModulos(d.modulos ?? []);
      setRevendas(d.revendas ?? []);
    });
  }, [id]);

  const carregarUsuarios = useCallback(() => {
    getDocs(collection(db, 'empresas', id, 'usuarios')).then(snap => {
      setUsuarios(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
  }, [id]);

  useEffect(() => {
    carregarEmpresa();
    carregarUsuarios();
  }, [carregarEmpresa, carregarUsuarios]);

  // ── Módulos e Revendas ────────────────────────────────────────────────────────

  function toggleModulo(slug) {
    setModulos(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  function adicionarRevenda() {
    const nome = novaRevenda.trim();
    if (!nome) return;
    setRevendas(prev => [...prev, { id: `rev_${Date.now()}`, nome }]);
    setNovaRevenda('');
  }

  function removerRevenda(rid) {
    setRevendas(prev => prev.filter(r => r.id !== rid));
  }

  async function salvarConfig() {
    setSalvando(true);
    await updateDoc(doc(db, 'empresas', id), { modulos, revendas });
    setSalvando(false);
    setOkConfig(true);
    setTimeout(() => setOkConfig(false), 2500);
  }

  // ── Usuários ──────────────────────────────────────────────────────────────────

  async function criarUsuario(e) {
    e.preventDefault();
    setErroUser('');
    if (!novoEmail || !novoNome || !novaSenha) { setErroUser('Preencha todos os campos.'); return; }
    // Só exige revenda se o nível precisar E a empresa realmente tiver
    // revendas cadastradas. Empresa "matriz única" (sem revendas) → revendaId = null.
    const empTemRevendas = (revendas || []).filter(Boolean).length > 0;
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
        empresaId: id,
        criadoEm:  new Date().toISOString(),
      };
      await setDoc(doc(db, 'usuarios_global', uid), dados);
      await setDoc(doc(db, 'empresas', id, 'usuarios', uid), dados);
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
    await deleteDoc(doc(db, 'empresas', id, 'usuarios', uid));
    await deleteDoc(doc(db, 'usuarios_global', uid));
    carregarUsuarios();
  }

  // Empresa "matriz única" (sem revendas configuradas) → nem mostra o campo
  // de revenda no formulário. O usuário fica com revendaId = null.
  const empTemRevendas = (revendas || []).filter(Boolean).length > 0;
  const precisaRev = NIVEIS_PRECISA_REVENDA.includes(novoNivel) && empTemRevendas;

  if (!empresa) return <div style={{ padding: 40, color: '#aaa' }}>Carregando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link to="/admin/empresas" style={{ color: '#E31837', fontSize: 13, textDecoration: 'none' }}>← Voltar</Link>
        <h2 style={{ color: '#333', margin: 0 }}>Configurar: {empresa.nome}</h2>
      </div>

      {/* ── Módulos + Revendas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>

        <div style={secao}>
          <h3 style={secaoTitulo}>Módulos ativos</h3>
          <p style={{ fontSize: 12, color: '#888', marginTop: 0, marginBottom: 16 }}>
            Apenas os módulos ativados aparecem no sidebar desta empresa.
          </p>
          {TODOS_MODULOS.map(m => (
            <label key={m.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>
              <input type="checkbox" checked={modulos.includes(m.slug)} onChange={() => toggleModulo(m.slug)} style={{ width: 16, height: 16, accentColor: '#E31837' }} />
              <span style={{ fontSize: 14, color: '#333' }}>{m.label}</span>
            </label>
          ))}
        </div>

        <div style={secao}>
          <h3 style={secaoTitulo}>Revendas / Filiais</h3>
          <p style={{ fontSize: 12, color: '#888', marginTop: 0, marginBottom: 16 }}>
            Defina as revendas para diferenciar dados por filial ao importar relatórios.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input style={{ ...inp, flex: 1, marginBottom: 0 }} value={novaRevenda} onChange={e => setNovaRevenda(e.target.value)} placeholder="Nome da revenda" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), adicionarRevenda())} />
            <button onClick={adicionarRevenda} style={btnPrimario}>+ Add</button>
          </div>
          {revendas.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ flex: 1, fontSize: 14, color: '#333' }}>{r.nome}</span>
              <button onClick={() => removerRevenda(r.id)} style={{ background: 'none', border: 'none', color: '#E31837', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          ))}
          {revendas.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>Nenhuma revenda adicionada.</p>}
        </div>
      </div>

      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={salvarConfig} disabled={salvando} style={{ ...btnPrimario, padding: '11px 32px', opacity: salvando ? 0.6 : 1 }}>
          {salvando ? 'Salvando...' : 'Salvar módulos e revendas'}
        </button>
        {okConfig && <span style={{ color: '#16a34a', fontSize: 14, fontWeight: 600 }}>✓ Salvo!</span>}
      </div>

      {/* ── Usuários ── */}
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
              {NIVEIS.map(n => <option key={n.valor} value={n.valor}>{n.label}</option>)}
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
                <button onClick={() => excluirUsuario(u.uid, u.nome)} style={btnExcluir}>Excluir</button>
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
