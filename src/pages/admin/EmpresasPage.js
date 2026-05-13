import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

const TODOS_MODULOS = [
  { slug: 'recebimento',    label: 'Recebimento de Mercadoria' },
  { slug: 'reabastecimento', label: 'Reabastecimento / Ressuprimento' },
  { slug: 'curva-abc',      label: 'Curva ABC' },
  { slug: 'estoque',        label: 'Gerenciamento de Estoque' },
  { slug: 'armazem',        label: 'Mapa do Armazém' },
  { slug: 'gestao-idade',   label: 'Gestão de Idade' },
  { slug: 'prejuizo',       label: 'Gestão de Prejuízo' },
  { slug: 'pavg',           label: 'PAVG' },
  { slug: 'mpd',            label: 'Gestão MDP' },
  { slug: 'tma',            label: 'TMA' },
  { slug: 'conciliacao',    label: 'Conciliação de Estoque' },
];

export default function EmpresasPage() {
  const [empresas,  setEmpresas]  = useState([]);
  const [nome,      setNome]      = useState('');
  const [salvando,  setSalvando]  = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const snap = await getDocs(collection(db, 'empresas'));
    setEmpresas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function criar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSalvando(true);
    await addDoc(collection(db, 'empresas'), {
      nome:     nome.trim(),
      modulos:  TODOS_MODULOS.map(m => m.slug),
      revendas: [],
      criadoEm: new Date().toISOString(),
    });
    setNome('');
    setSalvando(false);
    carregar();
  }

  async function excluir(id, nomeEmpresa) {
    if (!window.confirm(`Excluir a empresa "${nomeEmpresa}"? Esta ação não exclui os dados das sub-coleções.`)) return;
    await deleteDoc(doc(db, 'empresas', id));
    carregar();
  }

  return (
    <div>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Empresas</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>

        <div style={secao}>
          <h3 style={secaoTitulo}>Nova Empresa</h3>
          <form onSubmit={criar}>
            <label style={lbl}>Nome da empresa</label>
            <input style={inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: CBM Carpina" />
            <p style={{ fontSize: 12, color: '#888', margin: '8px 0 12px' }}>
              Todos os módulos serão ativados por padrão. Configure-os depois em cada empresa.
            </p>
            <button type="submit" disabled={salvando} style={{ ...btnPrimario, width: '100%', opacity: salvando ? 0.6 : 1 }}>
              {salvando ? 'Criando...' : '+ Criar Empresa'}
            </button>
          </form>
        </div>

        <div style={secao}>
          <h3 style={secaoTitulo}>Empresas cadastradas ({empresas.length})</h3>
          {empresas.map(emp => (
            <div key={emp.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#333' }}>{emp.nome}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>
                  {(emp.modulos ?? []).length} módulos · {(emp.revendas ?? []).length} revendas
                </div>
              </div>
              <Link to={`/admin/empresas/${emp.id}`} style={{ ...btnSecundario, marginRight: 8, textDecoration: 'none' }}>
                Configurar
              </Link>
              <button onClick={() => excluir(emp.id, emp.nome)} style={btnExcluir}>Excluir</button>
            </div>
          ))}
          {empresas.length === 0 && <p style={{ color: '#aaa', fontSize: 13 }}>Nenhuma empresa cadastrada.</p>}
        </div>
      </div>
    </div>
  );
}

const secao      = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#E31837', fontSize: 15, fontWeight: 'bold', marginTop: 0, marginBottom: 16 };
const lbl        = { fontSize: 13, color: '#555', display: 'block', marginBottom: 4, marginTop: 12 };
const inp        = { width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 4 };
const btnPrimario  = { padding: '9px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 };
const btnSecundario = { padding: '7px 14px', backgroundColor: '#f0f0eb', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#555', fontWeight: 500 };
const btnExcluir = { padding: '7px 14px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E31837' };
