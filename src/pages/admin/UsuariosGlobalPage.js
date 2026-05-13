import { useState, useEffect } from 'react';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { NIVEIS } from './ConfigurarEmpresaPage';

export default function UsuariosGlobalPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [empresas, setEmpresas] = useState({});

  useEffect(() => {
    async function carregar() {
      const [uSnap, eSnap] = await Promise.all([
        getDocs(collection(db, 'usuarios_global')),
        getDocs(collection(db, 'empresas')),
      ]);

      // Mapa empresaId → { nome, revendas[] }
      const mapa = {};
      eSnap.docs.forEach(d => {
        const data = d.data();
        mapa[d.id] = {
          nome:     data.nome || d.id,
          revendas: data.revendas || [],
        };
      });

      setEmpresas(mapa);
      setUsuarios(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    carregar();
  }, []);

  async function excluir(uid, nome) {
    if (!window.confirm(`Excluir usuário global "${nome}"? O acesso será revogado mas a conta Firebase Auth permanece.`)) return;
    await deleteDoc(doc(db, 'usuarios_global', uid));
    setUsuarios(prev => prev.filter(u => u.id !== uid));
  }

  return (
    <div>
      <h2 style={{ color: '#333', marginBottom: 8 }}>Usuários Globais</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
        Todos os usuários registrados em todas as empresas. Para criar usuários, acesse a página de Usuários dentro de cada empresa.
      </p>

      <div style={secao}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Nome', 'E-mail', 'Nível', 'Empresa', 'Revenda', ''].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id}>
                <td style={td}>{u.nome}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>{labelNivel(u.nivel)}</td>
                <td style={td}>{empresas[u.empresaId]?.nome || u.empresaId || '—'}</td>
                <td style={td}>{resolverRevenda(empresas[u.empresaId]?.revendas, u.revendaId)}</td>
                <td style={td}>
                  <button onClick={() => excluir(u.id, u.nome)} style={btnExcluir}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {usuarios.length === 0 && <p style={{ color: '#aaa', fontSize: 13, padding: 16 }}>Nenhum usuário encontrado.</p>}
      </div>
    </div>
  );
}

// Resolve o nome legível de uma revenda a partir do array revendas da empresa
function resolverRevenda(revendas, revendaId) {
  if (!revendaId) return '—';
  if (!revendas || revendas.length === 0) return revendaId;
  const rev = revendas.find(r =>
    typeof r === 'string' ? r === revendaId : r?.id === revendaId
  );
  if (!rev) return revendaId;
  return typeof rev === 'string' ? rev : (rev.nome || rev.id || revendaId);
}

function labelNivel(nivel) {
  if (nivel === 'admin') return 'Admin';
  return NIVEIS.find(n => n.valor === nivel)?.label ?? nivel;
}

const secao  = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' };
const th     = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #f0f0f0' };
const td     = { padding: '10px 12px', fontSize: 13, color: '#333', borderBottom: '1px solid #f5f5f5' };
const btnExcluir = { padding: '5px 10px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#E31837' };
