import { Link, useLocation } from 'react-router-dom';

export default function Sidebar({ usuario, onLogout }) {
  const loc = useLocation();

  const menus = [
    { path: '/', label: '📊 Dashboard', todos: true },
    { path: '/nris', label: '📋 Consultar NRIs', todos: true },
    { path: '/nova-nri', label: '➕ Nova NRI', todos: true },
    { path: '/cadastros', label: '🗂️ Cadastros', supervisor: true },
    { path: '/usuarios', label: '👥 Usuários', supervisor: true },
    { path: '/importar', label: '📥 Importar Base', supervisor: true },
    { path: '/exportar', label: '📤 Exportar CSV', supervisor: true },
  ];

  return (
    <div style={{ width: 220, backgroundColor: '#1a1a2e', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '0' }}>
      <div style={{ padding: '24px 16px', borderBottom: '1px solid #333' }}>
        <div style={{ color: '#E31837', fontSize: 20, fontWeight: 'bold' }}>NRI Ambev</div>
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>Olá, {usuario.nome}</div>
        <div style={{ backgroundColor: usuario.nivel === 'supervisor' ? '#E31837' : '#333', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 20, display: 'inline-block', marginTop: 6 }}>
          {usuario.nivel === 'supervisor' ? '👑 Supervisor' : 'Conferente'}
        </div>
      </div>
      <nav style={{ flex: 1, padding: '16px 0' }}>
        {menus.filter(m => m.todos || (m.supervisor && usuario.nivel === 'supervisor')).map(m => (
          <Link key={m.path} to={m.path} style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '12px 16px',
              color: loc.pathname === m.path ? '#fff' : '#aaa',
              backgroundColor: loc.pathname === m.path ? '#E31837' : 'transparent',
              fontSize: 14,
              cursor: 'pointer',
              borderLeft: loc.pathname === m.path ? '4px solid #fff' : '4px solid transparent',
              transition: 'all .15s',
            }}>
              {m.label}
            </div>
          </Link>
        ))}
      </nav>
      <div style={{ padding: '16px' }}>
        <button onClick={onLogout} style={{ width: '100%', padding: '10px', backgroundColor: 'transparent', border: '1px solid #555', color: '#aaa', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Sair
        </button>
      </div>
    </div>
  );
}