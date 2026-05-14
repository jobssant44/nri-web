// ─────────────────────────────────────────────────────────────────────────────
// STYLES BASE — Estilos inline reutilizáveis para inputs, labels e botões.
// Importe e use em conjunto com tokens (D) para manter consistência.
// ─────────────────────────────────────────────────────────────────────────────

import { D } from './tokens';

/** Label uppercase pequeno usado em filtros e KPIs */
export const sLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: D.textMuted,
  fontFamily: D.font,
};

/** Input/select padrão (filtros, formulários) */
export const sInput = {
  padding: '7px 10px',
  border: `1px solid ${D.border}`,
  borderRadius: 8,
  fontSize: 13,
  color: D.text,
  backgroundColor: D.surface,
  minWidth: 150,
  fontFamily: D.font,
  outline: 'none',
  transition: D.transition,
};

/** Botão secundário "limpar filtros" (use com className="wjs-btn-clear") */
export const sBtnClear = {
  padding: '8px 14px',
  background: 'transparent',
  border: `1px solid ${D.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: D.textSec,
  cursor: 'pointer',
  fontWeight: 500,
  transition: D.transition,
  alignSelf: 'flex-end',
  fontFamily: D.font,
};

/** Botão de navegação no header (use com className="wjs-btn-nav") */
export const sBtnNav = {
  padding: '8px 16px',
  background: 'transparent',
  border: `1px solid ${D.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: D.textSec,
  cursor: 'pointer',
  fontWeight: 500,
  transition: D.transition,
  fontFamily: D.font,
};

/** Botão primário vermelho (ação principal) */
export const sBtnPrimary = {
  padding: '9px 18px',
  background: D.red,
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  color: '#ffffff',
  cursor: 'pointer',
  fontWeight: 600,
  transition: D.transition,
  fontFamily: D.font,
};

/** Select inline pequeno (dentro de tabelas) */
export const sSelectInline = {
  padding: '4px 8px',
  border: `1px solid ${D.border}`,
  borderRadius: 6,
  fontSize: 11,
  color: D.textSec,
  cursor: 'pointer',
  minWidth: 120,
  fontFamily: D.font,
  outline: 'none',
  background: D.surface,
};

/** Célula <td> padrão de tabela (zebrada via background do <tr>) */
export const tdStyle = {
  padding: '8px 14px',
  color: D.textSec,
  borderTop: `1px solid ${D.borderLight}`,
  whiteSpace: 'nowrap',
};

/** Container card branco padrão (KPI, gráfico, filtro) */
export const cardStyle = {
  background: D.surface,
  border: `1px solid ${D.border}`,
  borderRadius: D.radius,
  padding: '22px 24px',
  boxShadow: D.shadow,
};
