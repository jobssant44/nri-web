import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const GRUPOS = [
  {
    label: '📦 Recebimento de Mercadoria',
    todos: true,
    itens: [
      { path: '/',           label: '📊 Dashboard',      todos: true },
      { path: '/nris',       label: '📋 Consultar NRIs',  todos: true },
      { path: '/nova-nri',   label: '➕ Nova NRI',         todos: true },
      { path: '/cadastros',  label: '🗂️ Cadastros',       supervisor: true },
      { path: '/usuarios',   label: '👥 Usuários',         supervisor: true },
      { path: '/importar',   label: '📥 Importar Base',    supervisor: true },
      { path: '/exportar',   label: '📤 Exportar CSV',     supervisor: true },
    ],
  },
  {
    label: '🔄 Reabastecimento / Ressuprimento',
    todos: true,
    itens: [],
  },
  {
    label: '📅 Gestão de Idade',
    todos: true,
    itens: [],
  },
  {
    label: '📉 Gestão de Prejuízo',
    todos: true,
    itens: [],
  },
];

export default function Sidebar({ usuario, onLogout }) {
  const loc = useLocation();
  const [abertos, setAbertos] = useState({ 0: true });

  function toggleGrupo(idx) {
    setAbertos(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <div style={{ width: 240, backgroundColor: '#1a1a2e', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 16px', borderBottom: '1px solid #2a2a3e' }}>
        <div style={{ color: '#E31837', fontSize: 20, fontWeight: 'bold' }}>NRI Ambev</div>
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>Olá, {usuario.nome}</div>
        <div style={{ backgroundColor: usuario.nivel === 'supervisor' ? '#E31837' : '#333', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 20, display: 'inline-block', marginTop: 6 }}>
          {usuario.nivel === 'supervisor' ? '👑 Supervisor' : 'Conferente'}
        </div>
      </div>

      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {GRUPOS.map((grupo, idx) => {
          const visivel = grupo.todos || (grupo.supervisor && usuario.nivel === 'supervisor');
          if (!visivel) return null;

          const itensFiltrados = grupo.itens.filter(m => m.todos || (m.supervisor && usuario.nivel === 'supervisor'));
          const estaAberto = !!abertos[idx];
          const temAtivo = itensFiltrados.some(m => loc.pathname === m.path);

          return (
            <div key={idx}>
              <div
                onClick={() => toggleGrupo(idx)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  backgroundColor: temAtivo && !estaAberto ? '#2a1a1e' : 'transparent',
                  borderLeft: temAtivo && !estaAberto ? '4px solid #E31837' : '4px solid transparent',
                  userSelect: 'none',
                }}
              >
                <span style={{ color: temAtivo || estaAberto ? '#fff' : '#aaa', fontSize: 13, fontWeight: '600' }}>
                  {grupo.label}
                </span>
                <span style={{ color: '#666', fontSize: 11, marginLeft: 8 }}>
                  {estaAberto ? '▲' : '▼'}
                </span>
              </div>

              {estaAberto && itensFiltrados.length > 0 && (
                <div style={{ backgroundColor: '#12121f' }}>
                  {itensFiltrados.map(m => (
                    <Link key={m.path} to={m.path} style={{ textDecoration: 'none' }}>
                      <div style={{
                        padding: '10px 16px 10px 28px',
                        color: loc.pathname === m.path ? '#fff' : '#888',
                        backgroundColor: loc.pathname === m.path ? '#E31837' : 'transparent',
                        fontSize: 13,
                        cursor: 'pointer',
                        borderLeft: loc.pathname === m.path ? '4px solid #fff' : '4px solid transparent',
                        transition: 'all .15s',
                      }}>
                        {m.label}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {estaAberto && itensFiltrados.length === 0 && (
                <div style={{ backgroundColor: '#12121f', padding: '10px 28px' }}>
                  <span style={{ color: '#555', fontSize: 12, fontStyle: 'italic' }}>Em breve...</span>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{ padding: '16px' }}>
        <button onClick={onLogout} style={{ width: '100%', padding: '10px', backgroundColor: 'transparent', border: '1px solid #555', color: '#aaa', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Sair
        </button>
      </div>
    </div>
  );
}
