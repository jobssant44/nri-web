import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import {
  Package, RefreshCw, TrendingUp, Warehouse, Map,
  Clock, TrendingDown, ClipboardList, Scale, Truck, Timer,
} from 'lucide-react';
import { D } from '../design';

// ─── Mapa de módulos ──────────────────────────────────────────────────────────
const MODULOS_INFO = {
  recebimento:    { label: 'Recebimento de Mercadoria',        Icon: Package,       path: '/recebimento/dashboard', desc: 'NRIs, etiquetas e conferência de notas fiscais' },
  reabastecimento:{ label: 'Reabastecimento / Ressuprimento',  Icon: RefreshCw,     path: '/reab/dashboard',        desc: 'Planificador IV, índice de vendas e picking' },
  'curva-abc':    { label: 'Curva ABC',                        Icon: TrendingUp,    path: '/curva-abc/dashboard',   desc: 'Classificação Pareto e análise de produtos' },
  estoque:        { label: 'Gerenciamento de Estoque',         Icon: Warehouse,     path: '/estoque/dashboard',     desc: 'Contagem, endereçamento e coletas de validade' },
  armazem:        { label: 'Mapa do Armazém',                  Icon: Map,           path: '/armazem/layout',        desc: 'Visualização interativa do layout' },
  'gestao-idade': { label: 'Gestão de Idade',                  Icon: Clock,         path: '/home',                  desc: 'Em breve' },
  prejuizo:       { label: 'Gestão de Prejuízo',               Icon: TrendingDown,  path: '/prejuizo/wqi',          desc: 'WQI, trocas, reposição e refugo de fábrica' },
  pavg:           { label: 'PAVG',                             Icon: ClipboardList, path: '/pavg/conciliacao',      desc: 'Conciliação de relatórios PAVG' },
  mpd:            { label: 'Gestão MDP',                       Icon: Truck,         path: '/gestao-mpd/efc',        desc: 'EFC, EFD, TI e histograma de rotas' },
  tma:            { label: 'TMA',                              Icon: Timer,         path: '/tma/dashboard',         desc: 'Tempo médio de atendimento por operação' },
  conciliacao:    { label: 'Conciliação de Estoque',           Icon: Scale,         path: '/conciliacao-estoque/diaria', desc: 'Conciliação diária 02.05.02' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function saudacao(hora) {
  const h = hora.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function labelNivel(nivel) {
  const MAP = {
    admin: 'Administrador', diretor: 'Diretor', gerente: 'Gerente',
    coordenador: 'Coordenador', supervisor: 'Supervisor', analista: 'Analista',
    conferente: 'Conferente', operador: 'Operador', ajudante: 'Ajudante',
  };
  return MAP[nivel] || nivel || 'Usuário';
}

// ─── Hook: relógio vivo ───────────────────────────────────────────────────────
function useRelogio() {
  const [hora, setHora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = String(hora.getHours()).padStart(2, '0');
  const mm = String(hora.getMinutes()).padStart(2, '0');
  const ss = String(hora.getSeconds()).padStart(2, '0');
  const data = hora.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  return { hora, horaStr: `${hh}:${mm}:${ss}`, dataStr: data };
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { usuario, empresaSelecionada, empresa, revendaSelecionada } = useUser();
  const { hora, horaStr, dataStr } = useRelogio();

  const empAtual      = empresaSelecionada || empresa;
  const modulos       = empAtual?.modulos || [];
  const modulosAtivos = modulos.map(slug => MODULOS_INFO[slug]).filter(Boolean);
  const primeiroNome  = usuario?.nome?.split(' ')[0] || 'Usuário';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', fontFamily: D.font }}>

      {/* ── Hero (mantido como assinatura visual da Home) ──────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0c0c0c 0%, #161616 55%, #1a0a0e 100%)',
        borderRadius: 16,
        padding: '36px 40px',
        marginBottom: 28,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        animation: 'wjs-fadeUp 0.3s ease both',
      }}>
        {/* Círculos decorativos */}
        <div style={{ position: 'absolute', right: -40, top: -40, width: 240, height: 240, borderRadius: '50%', background: 'rgba(227,24,55,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 90, bottom: -60, width: 160, height: 160, borderRadius: '50%', background: 'rgba(227,24,55,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: -30, bottom: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.015)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          {/* Saudação */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: D.red, letterSpacing: 2, textTransform: 'uppercase' }}>
                {empAtual?.nome || 'WJS'}
              </div>
              {revendaSelecionada && (
                <>
                  <div style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: '#3a3a3a' }} />
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#3a3a3a', letterSpacing: 1 }}>
                    {revendaSelecionada}
                  </div>
                </>
              )}
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -1, lineHeight: 1.15, fontFamily: D.font }}>
              {saudacao(hora)}, {primeiroNome}
            </h1>
            <div style={{ fontSize: 13, color: '#555', marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 9px', borderRadius: 5, backgroundColor: 'rgba(227,24,55,0.18)', color: D.red, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5 }}>
                {labelNivel(usuario?.nivel)}
              </span>
              <span style={{ color: '#3a3a3a' }}>Warehouse Job System</span>
            </div>
          </div>

          {/* Relógio */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: 38, fontWeight: 800, color: '#d8d8d8',
              letterSpacing: 4, fontFamily: D.mono, lineHeight: 1,
            }}>
              {horaStr}
            </div>
            <div style={{ fontSize: 11.5, color: '#444', marginTop: 8, textTransform: 'capitalize', letterSpacing: 0.3, fontFamily: D.font }}>
              {dataStr}
            </div>
          </div>
        </div>

        {/* Barra de progresso do dia */}
        {(() => {
          const pct = Math.min(100, Math.round(((hora.getHours() * 60 + hora.getMinutes()) / (24 * 60)) * 100));
          return (
            <div style={{ position: 'relative', marginTop: 24 }}>
              <div style={{ height: 2, backgroundColor: '#1e1e1e', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${D.red}, #ff6b6b)`, borderRadius: 2, transition: 'width 1s linear' }} />
              </div>
              <div style={{ position: 'absolute', right: 0, top: 6, fontSize: 9, color: '#2a2a2a', letterSpacing: 1, fontFamily: D.mono }}>
                {pct}% do dia
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Cards de módulos ──────────────────────────────────────── */}
      <div style={{ animation: 'wjs-fadeUp 0.4s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font }}>
            {modulosAtivos.length} módulo{modulosAtivos.length !== 1 ? 's' : ''} ativo{modulosAtivos.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 12 }}>
          {modulosAtivos.map(mod => {
            const Icon = mod.Icon;
            return (
              <Link key={mod.path + mod.label} to={mod.path} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: D.surface,
                    border: `1px solid ${D.border}`,
                    borderRadius: D.radius,
                    padding: '18px 20px',
                    cursor: 'pointer',
                    boxShadow: D.shadow,
                    transition: D.transition,
                    height: '100%',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = D.red;
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(227,24,55,0.10)';
                    e.currentTarget.style.transform = 'translateY(-3px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = D.border;
                    e.currentTarget.style.boxShadow = D.shadow;
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    backgroundColor: D.redSoft, border: `1px solid ${D.redBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 13,
                  }}>
                    <Icon size={18} color={D.red} strokeWidth={1.75} />
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: D.text, marginBottom: 5, lineHeight: 1.3, fontFamily: D.font }}>
                    {mod.label}
                  </div>
                  <div style={{ fontSize: 11, color: D.textMuted, lineHeight: 1.45, fontFamily: D.font }}>
                    {mod.desc}
                  </div>
                </div>
              </Link>
            );
          })}

          {modulosAtivos.length === 0 && (
            <div style={{
              gridColumn: '1/-1', padding: '48px 24px', textAlign: 'center',
              background: D.surface, borderRadius: D.radius,
              border: `1px dashed ${D.border}`,
            }}>
              <div style={{ fontSize: 13, color: D.textMuted, lineHeight: 1.6, fontFamily: D.font }}>
                Nenhum módulo ativo para esta empresa.<br />
                Configure os módulos em <strong>Administração → Empresas</strong>.
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
