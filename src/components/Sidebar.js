import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const GRUPOS = [
  {
    label: 'Recebimento de Mercadoria',
    icon: '📦',
    todos: true,
    itens: [
      { path: '/',           label: 'Dashboard',      icon: '📊', todos: true },
      { path: '/nris',       label: 'Consultar NRIs',  icon: '📋', todos: true },
      { path: '/nova-nri',   label: 'Nova NRI',         icon: '➕', todos: true },
      { path: '/cadastros',  label: 'Cadastros',       icon: '🗂️', supervisor: true },
      { path: '/usuarios',   label: 'Usuários',         icon: '👥', supervisor: true },
      { path: '/importar',   label: 'Importar Base',    icon: '📥', supervisor: true },
      { path: '/exportar',   label: 'Exportar CSV',     icon: '📤', supervisor: true },
    ],
  },
  {
    label: 'Reabastecimento / Ressuprimento',
    icon: '🔄',
    todos: true,
    itens: [
      { path: '/reab/dashboard',       label: 'Dashboard IV',           icon: '📊', todos: true },
      { path: '/reab/planificador',    label: 'Planificador IV',        icon: '📅', todos: true },
      { path: '/reab/vendas',          label: 'Vendas',                 icon: '📊', todos: true },
      { path: '/reab/config',          label: 'Configurar Picking',     icon: '⚙️', supervisor: true },
      { path: '/reab/lancar',          label: 'Lançar Abastecimento',   icon: '➕', todos: true },
      { path: '/reab/registro',        label: 'Registro',               icon: '📋', todos: true },
      { path: '/reab/importar-vendas', label: 'Importar 03.02.36.08',   icon: '📥', supervisor: true },
    ],
  },
  {
    label: 'Curva ABC',
    icon: '📈',
    todos: true,
    itens: [
      { path: '/curva-abc/dashboard', label: 'Dashboard Curva ABC', icon: '📊', todos: true },
      { path: '/curva-abc/importar',  label: 'Importar relatórios', icon: '📥', supervisor: true },
    ],
  },
  {
    label: 'Gerenciamento de Estoque',
    icon: '🏭',
    todos: true,
    itens: [
      { path: '/estoque/dashboard',              label: 'Dashboard',                    icon: '📊', todos: true },
      { path: '/estoque/contar',                 label: 'Registrar Contagem',           icon: '✅', todos: true },
      { path: '/estoque/gerenciar-localizacoes', label: 'Gerenciar Localizações',       icon: '📍', supervisor: true },
      { path: '/estoque/enderecamento',          label: 'Endereçamento de Produtos',    icon: '🎯', todos: true },
      { path: '/estoque/coletas-validade',       label: 'Coletas de Validade',          icon: '📊', todos: true },
    ],
  },
  {
    label: 'Mapa do Armazém',
    icon: '🗺️',
    todos: true,
    itens: [
      { path: '/armazem/layout', label: 'Layout Armazém', icon: '🏭', todos: true },
    ],
  },
  {
    label: 'Gestão de Idade',
    icon: '📅',
    todos: true,
    itens: [],
  },
  {
    label: 'Gestão de Prejuízo',
    icon: '📉',
    todos: true,
    itens: [],
  },
];

export default function Sidebar({ usuario, onLogout, fixado, onToggleFixado }) {
  const loc = useLocation();

  // Inicializa abrindo apenas o grupo que contém a rota ativa
  const [abertos, setAbertos] = useState(() => {
    const inicial = {};
    GRUPOS.forEach((grupo, idx) => {
      if (grupo.itens.some(m => loc.pathname === m.path)) {
        inicial[idx] = true;
      }
    });
    return inicial;
  });

  const [hovering, setHovering] = useState(false);

  const expandido = fixado || hovering;
  const largura = expandido ? 240 : 56;

  function toggleGrupo(idx) {
    setAbertos(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <div
      onMouseEnter={() => !fixado && setHovering(true)}
      onMouseLeave={() => !fixado && setHovering(false)}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: largura,
        height: '100vh',
        backgroundColor: '#1a1a2e',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #262640',
        zIndex: 100,
        transition: 'width 0.25s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: expandido ? '28px 20px 24px 20px' : '16px 8px', borderBottom: '1px solid #262640', transition: 'padding 0.25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#E31837', letterSpacing: -1 }}>
            {expandido ? 'WJS' : '≡'}
          </div>
          {/* Botão fixar */}
          <button
            onClick={onToggleFixado}
            title={fixado ? 'Desafixar sidebar' : 'Fixar sidebar'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              color: fixado ? '#E31837' : '#555',
              padding: '2px 4px',
              lineHeight: 1,
              transition: 'color 0.2s',
            }}
          >
            {fixado ? '📌' : '📍'}
          </button>
        </div>

        {expandido && (
          <>
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500, marginBottom: 16, letterSpacing: 0.3 }}>
              WAREHOUSE JOBSON STATION
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              backgroundColor: usuario.nivel === 'supervisor' ? 'rgba(227,24,55,0.1)' : 'rgba(100,100,120,0.1)',
              borderRadius: 6,
            }}>
              <span style={{ fontSize: 11, color: usuario.nivel === 'supervisor' ? '#E31837' : '#999', fontWeight: 600 }}>
                {usuario.nivel === 'supervisor' ? '👑 Supervisor' : '👤 Conferente'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>{usuario.nome}</div>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '16px 0', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
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
                title={!expandido ? grupo.label : undefined}
                style={{
                  display: 'flex',
                  justifyContent: expandido ? 'space-between' : 'center',
                  alignItems: 'center',
                  padding: expandido ? '12px 16px' : '12px 0',
                  cursor: 'pointer',
                  backgroundColor: temAtivo ? 'rgba(227,24,55,0.05)' : 'transparent',
                  borderLeft: temAtivo ? '3px solid #E31837' : '3px solid transparent',
                  userSelect: 'none',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  color: temAtivo || estaAberto ? '#fff' : '#888',
                  fontSize: expandido ? 13 : 18,
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span>{grupo.icon}</span>
                  {expandido && <span>{grupo.label}</span>}
                </span>
                {expandido && (
                  <span style={{ color: '#555', fontSize: 10, transition: 'transform 0.2s', transform: estaAberto ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                    ▼
                  </span>
                )}
              </div>

              {expandido && estaAberto && itensFiltrados.length > 0 && (
                <div>
                  {itensFiltrados.map(m => (
                    <Link key={m.path} to={m.path} style={{ textDecoration: 'none' }}>
                      <div style={{
                        padding: '10px 16px 10px 28px',
                        color: loc.pathname === m.path ? '#fff' : '#888',
                        backgroundColor: loc.pathname === m.path ? 'rgba(227,24,55,0.2)' : 'transparent',
                        fontSize: 13,
                        cursor: 'pointer',
                        borderLeft: loc.pathname === m.path ? '3px solid #E31837' : '3px solid transparent',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{ fontSize: 12 }}>{m.icon}</span>
                        <span>{m.label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {expandido && estaAberto && itensFiltrados.length === 0 && (
                <div style={{ padding: '10px 28px', fontSize: 12, color: '#555', fontStyle: 'italic' }}>
                  Em breve...
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: expandido ? '16px' : '8px', borderTop: '1px solid #262640' }}>
        <button
          onClick={onLogout}
          title={!expandido ? 'Sair' : undefined}
          style={{
            width: '100%',
            padding: expandido ? '10px' : '10px 0',
            backgroundColor: 'transparent',
            border: '1px solid #444',
            color: '#aaa',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: expandido ? 13 : 16,
            fontWeight: 500,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#E31837'; e.currentTarget.style.color = '#E31837'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#aaa'; }}
        >
          {expandido ? 'Sair' : '🚪'}
        </button>
      </div>
    </div>
  );
}
