// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — Sistema visual unificado WJS
// Importe `D` em qualquer página para usar as cores, sombras e tipografia
// padrão. NÃO crie tokens locais — adicione aqui se faltar algo.
// ─────────────────────────────────────────────────────────────────────────────

export const D = {
  // Superfícies
  bg:          '#f8fafc',
  surface:     '#ffffff',
  border:      '#e2e8f0',
  borderLight: '#f1f5f9',

  // Texto
  text:      '#0f172a',
  textSec:   '#475569',
  textMuted: '#94a3b8',

  // Marca — vermelho WJS
  red:       '#E31837',
  redSoft:   'rgba(227,24,55,0.07)',
  redBorder: 'rgba(227,24,55,0.18)',

  // Marca — azul WJS
  blue:       '#1D5A9E',
  blueSoft:   'rgba(29,90,158,0.07)',
  blueBorder: 'rgba(29,90,158,0.18)',

  // Semânticos
  amber:       '#b45309',
  amberSoft:   'rgba(180,83,9,0.07)',
  amberBorder: 'rgba(180,83,9,0.20)',
  green:       '#15803d',
  greenSoft:   'rgba(21,128,61,0.07)',
  greenBorder: 'rgba(21,128,61,0.20)',

  // Profundidade
  shadow:   '0 1px 2px rgba(15,23,42,0.03), 0 4px 16px rgba(15,23,42,0.04)',
  shadowMd: '0 2px 8px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.05)',
  radius:   14,

  // Tipografia
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', ui-monospace, 'Courier New', monospace",

  // Movimento
  transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
};

// ─── Injeção única de estilos globais (keyframes, hovers, Recharts outline) ──
const STYLE_TAG_ID = 'wjs-design-globals';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_TAG_ID)) {
  const st = document.createElement('style');
  st.id = STYLE_TAG_ID;
  st.textContent = `
    @keyframes wjs-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes wjs-fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .wjs-chip:hover     { opacity: 0.8; }
    .wjs-btn-clear:hover  { border-color: ${D.red}  !important; color: ${D.red}  !important; }
    .wjs-btn-voltar:hover { border-color: ${D.blue} !important; color: ${D.blue} !important; }
    .wjs-btn-nav:hover    { background: ${D.blueSoft} !important; border-color: ${D.blue} !important; color: ${D.blue} !important; }
    .recharts-wrapper,
    .recharts-wrapper svg,
    .recharts-wrapper *:focus,
    .recharts-surface { outline: none !important; }
  `;
  document.head.appendChild(st);
}
