import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
  Package, RefreshCw, TrendingUp, Warehouse, Map,
  Clock, TrendingDown, ClipboardList, Scale, Truck, Timer,
  DoorOpen, ListChecks,
  LogOut, Pin, PinOff, Building2, Settings, ChevronDown,
} from 'lucide-react';
import { auth } from '../firebaseConfig';
import { useUser, NIVEIS_MULTI_EMPRESA } from '../context/UserContext';
import { NIVEIS, NIVEIS_SUPERVISOR } from '../pages/admin/ConfigurarEmpresaPage';

// All groups — each has a moduloSlug that must appear in empresa.modulos to be shown
// Groups with moduloSlug: null are always visible (admin panel, etc.)
const TODOS_GRUPOS = [
  {
    label: 'Recebimento de Mercadoria',
    Icon: Package,
    moduloSlug: 'recebimento',
    itens: [
      { path: '/recebimento/dashboard', label: 'Dashboard',            todos: true },
      { path: '/nris',                  label: 'Consultar NRIs',       todos: true },
      { path: '/nova-nri',              label: 'Nova NRI',             todos: true },
      { path: '/cadastros',             label: 'Cadastros',            supervisor: true },
      { path: '/importar',              label: 'Importar Base',        supervisor: true },
      { path: '/exportar',              label: 'Exportar CSV',         supervisor: true },
    ],
  },
  {
    label: 'Reabastecimento / Ressuprimento',
    Icon: RefreshCw,
    moduloSlug: 'reabastecimento',
    itens: [
      { path: '/reab/dashboard',       label: 'Dashboard IV',          todos: true },
      { path: '/reab/planificador',    label: 'Planificador IV',       todos: true },
      { path: '/reab/resultado',       label: 'Resultado',             todos: true },
      { path: '/reab/lancar',          label: 'Lançar Abastecimento',  todos: true },
      { path: '/reab/registro',        label: 'Registro',              todos: true },
      { path: '/reab/vendas',          label: 'Vendas',                todos: true },
      { path: '/reab/prepicking',      label: 'Pré-Picking',           todos: true },
      { path: '/reab/config',          label: 'Configurar Picking',    supervisor: true },
      { path: '/reab/importar-vendas', label: 'Importar 03.02.36.08',  supervisor: true },
    ],
  },
  {
    label: 'Curva ABC',
    Icon: TrendingUp,
    moduloSlug: 'curva-abc',
    itens: [
      { path: '/curva-abc/dashboard', label: 'Dashboard Curva ABC', todos: true },
      { path: '/curva-abc/importar',  label: 'Importar relatórios', supervisor: true },
    ],
  },
  {
    label: 'Gerenciamento de Estoque',
    Icon: Warehouse,
    moduloSlug: 'estoque',
    itens: [
      // Dashboard de Aderência ao Layout — oculto por enquanto, será reativado
      // quando a métrica de layout for implementada de fato.
      // { path: '/estoque/dashboard',              label: 'Dashboard',                 todos: true },
      { path: '/estoque/aderencia-abc',          label: 'Aderência Curva ABC',       todos: true },
      { path: '/estoque/contar',                 label: 'Registrar Contagem',        todos: true },
      { path: '/estoque/gerenciar-localizacoes', label: 'Gerenciar Localizações',    supervisor: true },
      // Coletas de Validade — oculto a pedido em 2026-05-19. Pra reativar,
      // descomente a linha abaixo e a Route correspondente em App.js.
      // { path: '/estoque/coletas-validade',       label: 'Coletas de Validade',       todos: true },
    ],
  },
  {
    label: 'Mapa do Armazém',
    Icon: Map,
    moduloSlug: 'armazem',
    itens: [
      { path: '/armazem/layout', label: 'Layout Armazém', todos: true },
    ],
  },
  {
    label: 'Gestão de Idade',
    Icon: Clock,
    moduloSlug: 'gestao-idade',
    itens: [
      { path: '/gestao-idade/fefo',             label: 'Gestão de FEFO',     todos: true },
      { path: '/gestao-idade/stock-age',        label: 'Stock Age Index',    todos: true },
      { path: '/gestao-idade/estoque-picking',  label: 'Estoque x Picking',  todos: true },
      { path: '/gestao-idade/estoque-estoque',  label: 'Estoque x Estoque',  todos: true },
      { path: '/gestao-idade/importar-pzv',     label: 'Importar PZV',       supervisor: true },
    ],
  },
  {
    label: 'Gestão de Prejuízo',
    Icon: TrendingDown,
    moduloSlug: 'prejuizo',
    itens: [
      { path: '/prejuizo/wqi',       label: 'WQI',                 todos: true },
      { path: '/prejuizo/troca',      label: 'Troca',               todos: true },
      { path: '/prejuizo/reposicao', label: 'Reposição',           todos: true },
      { path: '/prejuizo/importar',  label: 'Importar relatórios', supervisor: true },
      { path: '/prejuizo/cadastros', label: 'Cadastros',           supervisor: true },
    ],
  },
  {
    label: 'PAVG',
    Icon: ClipboardList,
    moduloSlug: 'pavg',
    itens: [
      { path: '/pavg/conciliacao', label: 'Conciliação',         todos: true },
      { path: '/pavg/importar',    label: 'Importar relatórios', supervisor: true },
    ],
  },
  {
    label: 'Gestão MDP',
    Icon: Truck,
    moduloSlug: 'mpd',
    itens: [
      { path: '/gestao-mpd/efc',        label: 'EFC',                 todos: true },
      { path: '/gestao-mpd/efd',        label: 'EFD',                 todos: true },
      { path: '/gestao-mpd/ti',         label: 'TI',                  todos: true },
      { path: '/gestao-mpd/histograma', label: 'Histograma',          todos: true },
      { path: '/gestao-mpd/importar',   label: 'Importar relatórios', supervisor: true },
      { path: '/gestao-mpd/metas',      label: 'Metas',               supervisor: true },
    ],
  },
  {
    label: 'Plano de Ação',
    Icon: ListChecks,
    moduloSlug: 'plano-acao',
    itens: [
      { path: '/plano-acao/painel', label: 'Painel',       todos: true },
      { path: '/plano-acao/novo',   label: 'Novo Plano',   todos: true },
    ],
  },
  {
    label: 'Portaria',
    Icon: DoorOpen,
    moduloSlug: 'portaria',
    itens: [
      { path: '/portaria',           label: 'Painel de Operação', todos: true },
      { path: '/portaria/dashboard', label: 'Dashboard',          todos: true },
      { path: '/portaria/registros', label: 'Registros',          todos: true },
      { path: '/portaria/cadastros', label: 'Cadastros',          supervisor: true },
    ],
  },
  {
    label: 'TMA',
    Icon: Timer,
    moduloSlug: 'tma',
    itens: [
      { path: '/tma/dashboard', label: 'Dashboard',          todos: true },
      { path: '/tma/importar',  label: 'Importar relatório', supervisor: true },
    ],
  },
  {
    label: 'Conciliação de Estoque',
    Icon: Scale,
    moduloSlug: 'conciliacao',
    itens: [
      { path: '/conciliacao-estoque/diaria',   label: 'Conciliação Diária', todos: true },
      { path: '/conciliacao-estoque/importar', label: 'Importar 02.05.02',  supervisor: true },
    ],
  },
  {
    label: 'Administração',
    Icon: Building2,
    moduloSlug: null,
    supervisorOnly: true,
    itens: [
      { path: '/admin/empresas',  label: 'Empresas',           admin: true },
      { path: '/admin/usuarios',  label: 'Todos os Usuários',  admin: true },
      { path: '/usuarios',        label: 'Usuários',           todos: true },
    ],
  },
];

// ─── Design tokens ────────────────────────────────────────────
const C = {
  bg:          '#0c0c0c',
  border:      '#1e1e1e',
  borderSel:   '#2a2a2a',
  red:         '#E31837',
  redDim:      'rgba(227,24,55,0.10)',
  redBorder:   'rgba(227,24,55,0.35)',
  textPrimary: '#e8e8e8',
  textSec:     '#a0a0a0',   // ↑ mais claro — itens não-ativos agora bem legíveis
  textMuted:   '#3a3a3a',   // ↑ levemente mais claro
  hover:       'rgba(255,255,255,0.06)',  // ↑ hover um pouco mais nítido
  inputBg:     '#141414',
  inputText:   '#c0c0c0',
  // Continuidade com o fundo das páginas (D.bg / D.text do design system)
  pageBg:      '#f8fafc',
  pageText:    '#0f172a',
};

export default function Sidebar({ fixado, onToggleFixado }) {
  const {
    usuario, empresa,
    todasEmpresas,
    empresaSelecionada, setEmpresaSelecionada,
    revendaSelecionada, setRevendaSelecionada,
    revendasVisiveis,
  } = useUser();
  const loc = useLocation();

  const modulos      = (empresaSelecionada || empresa)?.modulos ?? [];
  const isAdmin      = usuario?.nivel === 'admin';
  const isSupervisor = NIVEIS_SUPERVISOR.includes(usuario?.nivel);
  const podeMultiEmpresa = NIVEIS_MULTI_EMPRESA.includes(usuario?.nivel);

  const gruposVisiveis = TODOS_GRUPOS.filter(g => {
    if (g.supervisorOnly) return isSupervisor;
    if (g.moduloSlug === null) return true;
    return modulos.includes(g.moduloSlug);
  });

  const [abertos, setAbertos] = useState(() => {
    const inicial = {};
    gruposVisiveis.forEach((grupo, idx) => {
      if (grupo.itens.some(m => loc.pathname === m.path)) {
        inicial[idx] = true;
      }
    });
    return inicial;
  });

  const [hovering, setHovering] = useState(false);
  const expandido = fixado || hovering;
  const largura   = expandido ? 240 : 56;

  // Revendas disponíveis para exibir no selector
  const revendasParaSelector = revendasVisiveis.filter(Boolean);
  const mostrarSelectorRevenda = isSupervisor && revendasParaSelector.length > 1;
  const mostrarSelectorEmpresa = podeMultiEmpresa && todasEmpresas.length > 1;

  function toggleGrupo(idx) {
    setAbertos(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  async function sair() {
    await signOut(auth);
  }

  function handleEmpresaChange(e) {
    const emp = todasEmpresas.find(x => x.id === e.target.value);
    if (emp) setEmpresaSelecionada(emp);
  }

  function handleRevendaChange(e) {
    setRevendaSelecionada(e.target.value);
  }

  const revendaLabel = (r) => typeof r === 'string' ? r : (r?.nome || r?.id || String(r));
  const revendaValue = (r) => typeof r === 'string' ? r : (r?.id || r?.nome || String(r));

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
      {/* ── Header — WJS clicável leva para /home ──────────────── */}
      <div style={{ padding: expandido ? '22px 18px 18px' : '18px 0', borderBottom: `1px solid ${C.border}`, transition: 'padding 0.22s ease', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link
            to="/home"
            title="Ir para Home"
            style={{ textDecoration: 'none', width: expandido ? 'auto' : '100%', textAlign: expandido ? 'left' : 'center' }}
          >
            <div
              style={{ fontSize: expandido ? 24 : 18, fontWeight: 800, color: C.red, letterSpacing: -0.5, lineHeight: 1, fontFamily: "'Bricolage Grotesque', sans-serif", transition: 'font-size 0.22s ease' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              WJS
            </div>
          </Link>
          {expandido && (
            <button onClick={onToggleFixado} title={fixado ? 'Desafixar sidebar' : 'Fixar sidebar'}
              style={{ background: 'none', border: `1px solid ${fixado ? C.redBorder : C.border}`, borderRadius: 4, cursor: 'pointer', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: fixado ? C.red : C.textSec, transition: 'all 0.15s', flexShrink: 0 }}>
              {fixado ? <Pin size={12} /> : <PinOff size={12} />}
            </button>
          )}
        </div>

        {expandido && (
          <div style={{ fontSize: 8, fontWeight: 600, color: C.textSec, letterSpacing: 2.5, marginTop: 4, textTransform: 'uppercase' }}>
            Warehouse Job System
          </div>
        )}
      </div>

      {/* ── Seletores de Empresa / Revenda ─────────────────────── */}
      {expandido && (mostrarSelectorEmpresa || mostrarSelectorRevenda) && (
        <div style={{ padding: '10px 14px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Selector de Empresa */}
          {mostrarSelectorEmpresa && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}>
                Empresa
              </div>
              <div style={{ position: 'relative' }}>
                <select
                  value={empresaSelecionada?.id || ''}
                  onChange={handleEmpresaChange}
                  style={{
                    width: '100%',
                    appearance: 'none',
                    backgroundColor: C.inputBg,
                    color: C.inputText,
                    border: `1px solid ${C.borderSel}`,
                    borderRadius: 6,
                    padding: '6px 28px 6px 10px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                >
                  {todasEmpresas.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nome || emp.id}</option>
                  ))}
                </select>
                <ChevronDown size={11} color={C.textSec} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
            </div>
          )}

          {/* Selector de Revenda */}
          {mostrarSelectorRevenda && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}>
                Revenda
              </div>
              <div style={{ position: 'relative' }}>
                <select
                  value={revendaSelecionada}
                  onChange={handleRevendaChange}
                  style={{
                    width: '100%',
                    appearance: 'none',
                    backgroundColor: C.inputBg,
                    color: C.inputText,
                    border: `1px solid ${C.borderSel}`,
                    borderRadius: 6,
                    padding: '6px 28px 6px 10px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                >
                  <option value="">Todas as revendas</option>
                  {revendasParaSelector.map(r => (
                    <option key={revendaValue(r)} value={revendaValue(r)}>
                      {revendaLabel(r)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={11} color={C.textSec} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent' }}>
        {gruposVisiveis.map((grupo, idx) => {
          const itensFiltrados = grupo.itens.filter(m =>
            m.admin ? isAdmin : (m.todos || (m.supervisor && isSupervisor))
          );
          const estaAberto = !!abertos[idx];
          const temAtivo   = itensFiltrados.some(m => loc.pathname === m.path);
          const GrupoIcon  = grupo.Icon;

          return (
            <div key={idx}>
              <div onClick={() => toggleGrupo(idx)} title={!expandido ? grupo.label : undefined}
                style={{ display: 'flex', justifyContent: expandido ? 'space-between' : 'center', alignItems: 'center', padding: expandido ? '9px 14px' : '10px 0', cursor: 'pointer', borderLeft: temAtivo ? `2px solid ${C.red}` : '2px solid transparent', backgroundColor: temAtivo ? C.redDim : 'transparent', transition: 'all 0.12s', userSelect: 'none' }}
                onMouseEnter={e => { if (!temAtivo) e.currentTarget.style.backgroundColor = C.hover; }}
                onMouseLeave={e => { if (!temAtivo) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: expandido ? 'auto' : '100%', flexShrink: 0, color: temAtivo ? C.red : estaAberto ? C.textPrimary : C.textSec, transition: 'color 0.12s' }}>
                    <GrupoIcon size={expandido ? 14 : 18} strokeWidth={1.75} />
                  </span>
                  {expandido && (
                    <span style={{ fontSize: 12, fontWeight: temAtivo || estaAberto ? 600 : 400, color: temAtivo ? '#fff' : estaAberto ? C.textPrimary : C.textSec, whiteSpace: 'nowrap', transition: 'color 0.12s' }}>
                      {grupo.label}
                    </span>
                  )}
                </div>
                {expandido && (
                  <span style={{ fontSize: 7, color: estaAberto ? C.textSec : C.textMuted, transition: 'transform 0.2s', transform: estaAberto ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0 }}>▼</span>
                )}
              </div>

              {expandido && estaAberto && itensFiltrados.length > 0 && (
                <div style={{ paddingBottom: 2 }}>
                  {itensFiltrados.map(m => {
                    const ativo = loc.pathname === m.path;
                    return (
                      <Link key={m.path} to={m.path} style={{ textDecoration: 'none', display: 'block' }}>
                        <div style={{
                          padding: '7px 14px 7px 36px',
                          display: 'flex', alignItems: 'center', gap: 8,
                          borderLeft: ativo ? `2px solid ${C.red}` : '2px solid transparent',
                          backgroundColor: ativo ? C.pageBg : 'transparent',
                          transition: 'all 0.12s',
                          cursor: 'pointer',
                          // Estende o background até a borda direita da sidebar, criando a
                          // sensação de continuidade com o conteúdo da página.
                          marginRight: ativo ? -1 : 0,
                        }}
                          onMouseEnter={e => { if (!ativo) e.currentTarget.style.backgroundColor = C.hover; }}
                          onMouseLeave={e => { if (!ativo) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <span style={{ fontSize: 5, color: ativo ? C.red : C.textMuted }}>●</span>
                          <span style={{
                            fontSize: 11.5,
                            color: ativo ? C.pageText : C.textSec,
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
                <div style={{ padding: '6px 14px 6px 36px', fontSize: 11, color: C.textMuted, fontStyle: 'italic', letterSpacing: 0.3 }}>Em breve</div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div style={{ padding: expandido ? '12px 14px' : '10px 8px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        {isSupervisor && (
          <Link to="/configuracoes" title="Configurações" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: expandido ? '6px 4px' : '6px 0', justifyContent: expandido ? 'flex-start' : 'center', marginBottom: 10, color: loc.pathname === '/configuracoes' ? C.red : C.textSec, transition: 'color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = C.red; }}
            onMouseLeave={e => { e.currentTarget.style.color = loc.pathname === '/configuracoes' ? C.red : C.textSec; }}
          >
            <Settings size={13} strokeWidth={1.75} />
            {expandido && <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.3 }}>Configurações</span>}
          </Link>
        )}

        {/* Bloco de usuário */}
        {expandido && (
          <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 5, backgroundColor: isAdmin ? 'rgba(227,24,55,0.12)' : isSupervisor ? 'rgba(227,24,55,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSupervisor || isAdmin ? C.redBorder : C.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: isSupervisor || isAdmin ? C.red : C.textSec, marginBottom: 3 }}>
              {labelNivel(usuario?.nivel)}
            </div>
            <div style={{ fontSize: 13, color: C.textPrimary, fontWeight: 500 }}>{usuario?.nome}</div>
            {/* Mostra empresa selecionada (pode ser diferente da própria) */}
            {(empresaSelecionada || empresa) && (
              <div style={{ fontSize: 10, color: C.textSec, marginTop: 2 }}>
                {(empresaSelecionada || empresa).nome}
                {revendaSelecionada && (
                  <span style={{ color: '#3a3a3a' }}> · {revendaSelecionada}</span>
                )}
              </div>
            )}
          </div>
        )}

        <button onClick={sair} title={!expandido ? 'Sair' : undefined}
          style={{ width: '100%', padding: expandido ? '8px 12px' : '8px 0', backgroundColor: 'transparent', border: `1px solid ${C.border}`, color: C.textSec, borderRadius: 4, cursor: 'pointer', fontSize: expandido ? 11.5 : 15, fontWeight: 500, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: expandido ? 0.5 : 0, transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; e.currentTarget.style.backgroundColor = 'rgba(227,24,55,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSec; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          {expandido ? <><LogOut size={13} /> Sair</> : <LogOut size={16} />}
        </button>
      </div>
    </div>
  );
}

function labelNivel(nivel) {
  if (nivel === 'admin') return 'Admin';
  return NIVEIS.find(n => n.valor === nivel)?.label ?? 'Usuário';
}
