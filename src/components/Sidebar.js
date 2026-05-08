import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Package, RefreshCw, TrendingUp, Warehouse, Map,
  Clock, TrendingDown, ClipboardList, Scale, Truck, LogOut, Pin, PinOff,
} from 'lucide-react';

const GRUPOS = [
  {
    label: 'Recebimento de Mercadoria',
    Icon: Package,
    todos: true,
    itens: [
      { path: '/',           label: 'Dashboard',            todos: true },
      { path: '/nris',       label: 'Consultar NRIs',       todos: true },
      { path: '/nova-nri',   label: 'Nova NRI',             todos: true },
      { path: '/cadastros',  label: 'Cadastros',            supervisor: true },
      { path: '/usuarios',   label: 'Usuários',             supervisor: true },
      { path: '/importar',   label: 'Importar Base',        supervisor: true },
      { path: '/exportar',   label: 'Exportar CSV',         supervisor: true },
    ],
  },
  {
    label: 'Reabastecimento / Ressuprimento',
    Icon: RefreshCw,
    todos: true,
    itens: [
      { path: '/reab/dashboard',       label: 'Dashboard IV',          todos: true },
      { path: '/reab/planificador',    label: 'Planificador IV',       todos: true },
      { path: '/reab/prepicking',      label: 'Pré-Picking',           todos: true },
      { path: '/reab/vendas',          label: 'Vendas',                todos: true },
      { path: '/reab/config',          label: 'Configurar Picking',    supervisor: true },
      { path: '/reab/lancar',          label: 'Lançar Abastecimento',  todos: true },
      { path: '/reab/registro',        label: 'Registro',              todos: true },
      { path: '/reab/importar-vendas', label: 'Importar 03.02.36.08',  supervisor: true },
    ],
  },
  {
    label: 'Curva ABC',
    Icon: TrendingUp,
    todos: true,
    itens: [
      { path: '/curva-abc/dashboard', label: 'Dashboard Curva ABC', todos: true },
      { path: '/curva-abc/importar',  label: 'Importar relatórios', supervisor: true },
    ],
  },
  {
    label: 'Gerenciamento de Estoque',
    Icon: Warehouse,
    todos: true,
    itens: [
      { path: '/estoque/dashboard',              label: 'Dashboard',                 todos: true },
      { path: '/estoque/contar',                 label: 'Registrar Contagem',        todos: true },
      { path: '/estoque/gerenciar-localizacoes', label: 'Gerenciar Localizações',    supervisor: true },
      { path: '/estoque/enderecamento',          label: 'Endereçamento de Produtos', todos: true },
      { path: '/estoque/coletas-validade',       label: 'Coletas de Validade',       todos: true },
    ],
  },
  {
    label: 'Mapa do Armazém',
    Icon: Map,
    todos: true,
    itens: [
      { path: '/armazem/layout', label: 'Layout Armazém', todos: true },
    ],
  },
  {
    label: 'Gestão de Idade',
    Icon: Clock,
    todos: true,
    itens: [],
  },
  {
    label: 'Gestão de Prejuízo',
    Icon: TrendingDown,
    todos: true,
    itens: [
      { path: '/prejuizo/wqi',       label: 'WQI',                todos: true },
      { path: '/prejuizo/troca',      label: 'Troca',              todos: true },
      { path: '/prejuizo/reposicao', label: 'Reposição',          todos: true },
      { path: '/prejuizo/importar',  label: 'Importar relatórios', supervisor: true },
      { path: '/prejuizo/cadastros', label: 'Cadastros',           supervisor: true },
    ],
  },
  {
    label: 'PAVG',
    Icon: ClipboardList,
    todos: true,
    itens: [
      { path: '/pavg/conciliacao', label: 'Conciliação',        todos: true },
      { path: '/pavg/importar',    label: 'Importar relatórios', supervisor: true },
    ],
  },
  {
    label: 'Gestão MDP',
    Icon: Truck,
    todos: true,
    itens: [
      { path: '/gestao-mpd/efc',        label: 'EFC',                todos: true },
      { path: '/gestao-mpd/efd',        label: 'EFD',                todos: true },
      { path: '/gestao-mpd/ti',         label: 'TI',                 todos: true },
      { path: '/gestao-mpd/histograma', label: 'Histograma',         todos: true },
      { path: '/gestao-mpd/importar',   label: 'Importar relatórios',supervisor: true },
    ],
  },
  {
    label: 'Conciliação de Estoque',
    Icon: Scale,
    todos: true,
    itens: [
      { path: '/conciliacao-estoque/diaria',   label: 'Conciliação Diária',  todos: true },
      { path: '/conciliacao-estoque/importar', label: 'Importar 02.05.02',   supervisor: true },
    ],
  },
];

// ─── Design tokens ────────────────────────────────────────────────
const C = {
  bg:          '#0c0c0c',
  border:      '#1e1e1e',
  red:         '#E31837',
  redDim:      'rgba(227,24,55,0.10)',
  redBorder:   'rgba(227,24,55,0.35)',
  textPrimary: '#e8e8e8',
  textSec:     '#4a4a4a',
  textMuted:   '#252525',
  hover:       'rgba(255,255,255,0.04)',
};

export default function Sidebar({ usuario, onLogout, fixado, onToggleFixado }) {
  const loc = useLocation();

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
  const largura   = expandido ? 240 : 56;

  function toggleGrupo(idx) {
    setAbertos(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <div
      onMouseEnter={() => !fixado && setHovering(true)}
      onMouseLeave={() => !fixado && setHovering(false)}
      style={{
        position:        'fixed',
        left:            0,
        top:             0,
        width:           largura,
        height:          '100vh',
        backgroundColor: C.bg,
        display:         'flex',
        flexDirection:   'column',
        borderRight:     `1px solid ${C.border}`,
        zIndex:          100,
        transition:      'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow:        'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        padding:      expandido ? '22px 18px 18px' : '18px 0',
        borderBottom: `1px solid ${C.border}`,
        transition:   'padding 0.22s ease',
        flexShrink:   0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Logo */}
          <div style={{
            fontSize:   expandido ? 24 : 18,
            fontWeight: 800,
            color:      C.red,
            letterSpacing: -0.5,
            lineHeight: 1,
            width:      expandido ? 'auto' : '100%',
            textAlign:  expandido ? 'left' : 'center',
            fontFamily: "'Bricolage Grotesque', sans-serif",
            transition: 'font-size 0.22s ease',
          }}>
            WJS
          </div>

          {/* Pin */}
          {expandido && (
            <button
              onClick={onToggleFixado}
              title={fixado ? 'Desafixar sidebar' : 'Fixar sidebar'}
              style={{
                background:   'none',
                border:       `1px solid ${fixado ? C.redBorder : C.border}`,
                borderRadius: 4,
                cursor:       'pointer',
                width:        26,
                height:       26,
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                color:        fixado ? C.red : C.textSec,
                transition:   'all 0.15s',
                flexShrink:   0,
              }}
            >
              {fixado ? <Pin size={12} /> : <PinOff size={12} />}
            </button>
          )}
        </div>

        {expandido && (
          <>
            <div style={{
              fontSize:      8,
              fontWeight:    600,
              color:         C.textSec,
              letterSpacing: 2.5,
              marginTop:     4,
              textTransform: 'uppercase',
            }}>
              Warehouse Jobson Station
            </div>

            {/* User badge */}
            <div style={{
              marginTop:       14,
              padding:         '8px 10px',
              borderRadius:    5,
              backgroundColor: usuario.nivel === 'supervisor'
                ? 'rgba(227,24,55,0.07)'
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${usuario.nivel === 'supervisor' ? C.redBorder : C.border}`,
            }}>
              <div style={{
                fontSize:      9,
                fontWeight:    700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color:         usuario.nivel === 'supervisor' ? C.red : C.textSec,
                marginBottom:  3,
              }}>
                {usuario.nivel === 'supervisor' ? 'Supervisor' : 'Conferente'}
              </div>
              <div style={{ fontSize: 13, color: C.textPrimary, fontWeight: 500 }}>
                {usuario.nome}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav style={{
        flex:        1,
        padding:     '10px 0',
        overflowY:   'auto',
        overflowX:   'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: '#2a2a2a transparent',
      }}>
        {GRUPOS.map((grupo, idx) => {
          const visivel = grupo.todos || (grupo.supervisor && usuario.nivel === 'supervisor');
          if (!visivel) return null;

          const itensFiltrados = grupo.itens.filter(
            m => m.todos || (m.supervisor && usuario.nivel === 'supervisor')
          );
          const estaAberto = !!abertos[idx];
          const temAtivo   = itensFiltrados.some(m => loc.pathname === m.path);
          const GrupoIcon  = grupo.Icon;

          return (
            <div key={idx}>
              {/* Group header */}
              <div
                onClick={() => toggleGrupo(idx)}
                title={!expandido ? grupo.label : undefined}
                style={{
                  display:        'flex',
                  justifyContent: expandido ? 'space-between' : 'center',
                  alignItems:     'center',
                  padding:        expandido ? '9px 14px' : '10px 0',
                  cursor:         'pointer',
                  borderLeft:     temAtivo ? `2px solid ${C.red}` : '2px solid transparent',
                  backgroundColor: temAtivo ? C.redDim : 'transparent',
                  transition:     'all 0.12s',
                  userSelect:     'none',
                }}
                onMouseEnter={e => {
                  if (!temAtivo) e.currentTarget.style.backgroundColor = C.hover;
                }}
                onMouseLeave={e => {
                  if (!temAtivo) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    display:    'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width:      expandido ? 'auto' : '100%',
                    flexShrink: 0,
                    color:      temAtivo ? C.red : estaAberto ? C.textPrimary : C.textSec,
                    transition: 'color 0.12s',
                  }}>
                    <GrupoIcon size={expandido ? 14 : 18} strokeWidth={1.75} />
                  </span>
                  {expandido && (
                    <span style={{
                      fontSize:   12,
                      fontWeight: temAtivo || estaAberto ? 600 : 400,
                      color:      temAtivo ? '#fff' : estaAberto ? C.textPrimary : C.textSec,
                      whiteSpace: 'nowrap',
                      transition: 'color 0.12s',
                    }}>
                      {grupo.label}
                    </span>
                  )}
                </div>

                {expandido && (
                  <span style={{
                    fontSize:   7,
                    color:      estaAberto ? C.textSec : C.textMuted,
                    transition: 'transform 0.2s',
                    transform:  estaAberto ? 'rotate(0deg)' : 'rotate(-90deg)',
                    flexShrink: 0,
                  }}>
                    ▼
                  </span>
                )}
              </div>

              {/* Sub-items */}
              {expandido && estaAberto && itensFiltrados.length > 0 && (
                <div style={{ paddingBottom: 2 }}>
                  {itensFiltrados.map(m => {
                    const ativo = loc.pathname === m.path;
                    return (
                      <Link key={m.path} to={m.path} style={{ textDecoration: 'none', display: 'block' }}>
                        <div
                          style={{
                            padding:         '7px 14px 7px 36px',
                            display:         'flex',
                            alignItems:      'center',
                            gap:             8,
                            borderLeft:      ativo ? `2px solid ${C.red}` : '2px solid transparent',
                            backgroundColor: ativo ? C.redDim : 'transparent',
                            transition:      'all 0.12s',
                            cursor:          'pointer',
                          }}
                          onMouseEnter={e => {
                            if (!ativo) e.currentTarget.style.backgroundColor = C.hover;
                          }}
                          onMouseLeave={e => {
                            if (!ativo) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span style={{ fontSize: 5, color: ativo ? C.red : C.textMuted }}>●</span>
                          <span style={{
                            fontSize:   11.5,
                            color:      ativo ? '#fff' : C.textSec,
                            fontWeight: ativo ? 600 : 400,
                            whiteSpace: 'nowrap',
                            transition: 'color 0.12s',
                          }}>
                            {m.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {expandido && estaAberto && itensFiltrados.length === 0 && (
                <div style={{
                  padding:    '6px 14px 6px 36px',
                  fontSize:   11,
                  color:      C.textMuted,
                  fontStyle:  'italic',
                  letterSpacing: 0.3,
                }}>
                  Em breve
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div style={{
        padding:     expandido ? '12px 14px' : '10px 8px',
        borderTop:   `1px solid ${C.border}`,
        flexShrink:  0,
      }}>
        <button
          onClick={onLogout}
          title={!expandido ? 'Sair' : undefined}
          style={{
            width:           '100%',
            padding:         expandido ? '8px 12px' : '8px 0',
            backgroundColor: 'transparent',
            border:          `1px solid ${C.border}`,
            color:           C.textSec,
            borderRadius:    4,
            cursor:          'pointer',
            fontSize:        expandido ? 11.5 : 15,
            fontWeight:      500,
            fontFamily:      'inherit',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             6,
            letterSpacing:   expandido ? 0.5 : 0,
            transition:      'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor       = C.red;
            e.currentTarget.style.color             = C.red;
            e.currentTarget.style.backgroundColor   = 'rgba(227,24,55,0.06)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor       = C.border;
            e.currentTarget.style.color             = C.textSec;
            e.currentTarget.style.backgroundColor   = 'transparent';
          }}
        >
          {expandido ? (
            <><LogOut size={13} /> Sair</>
          ) : (
            <LogOut size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
