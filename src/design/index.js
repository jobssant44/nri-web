// ─────────────────────────────────────────────────────────────────────────────
// DESIGN SYSTEM WJS — Entry point
//
// Importe daqui em qualquer página:
//   import { D, brl, PageContainer, PageHeader, KPICardPrimary } from '../design';
//
// Ao importar este módulo, os keyframes globais e overrides do Recharts
// são automaticamente injetados no <head> (uma única vez).
// ─────────────────────────────────────────────────────────────────────────────

export { D } from './tokens';
export { brl, numFmt, intFmt } from './utils';
export {
  sLabel, sInput, sBtnClear, sBtnNav, sBtnPrimary, sSelectInline, tdStyle, cardStyle,
} from './styles';
export {
  PageContainer,
  PageHeader,
  KPICardPrimary,
  KPICardSecondary,
  ChartCard,
  FilterBar,
  FilterField,
  Chip,
  Tabela,
  TooltipBRL,
  Skeleton,
  EmptyState,
  Vazio,
  BotaoVoltar,
  BotaoNav,
  BotaoClear,
  MiniRanking,
} from './components';
