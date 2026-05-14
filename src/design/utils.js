// ─────────────────────────────────────────────────────────────────────────────
// FORMATADORES — Funções de formatação BR usadas pelo design system
// ─────────────────────────────────────────────────────────────────────────────

/** Formata número como moeda BRL: 1234.56 → "R$ 1.234,56" */
export const brl = v => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(v);

/** Formata número decimal BR: 1234.567 → "1.234,57" (até 2 casas) */
export const numFmt = v => new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
}).format(v);

/** Formata número inteiro BR: 1234.5 → "1.234" */
export const intFmt = v => new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
}).format(v);
