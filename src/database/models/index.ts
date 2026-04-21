/**
 * Index centralizado para tipos e constantes do módulo WMS
 */

// Exportar tipos
export type {
  Product,
  Location,
  InventoryLog,
  CountingAlert,
  CountingResult,
  CountingInput,
  ValidationError,
  AdherenceMetrics,
  AreaMetrics,
  CurveMetrics,
  AreaType,
  CurvaABC
} from './types';

// Exportar classes
export { CountingValidationError } from './types';

// Exportar constantes
export {
  AREA_TYPES,
  CURVE_TYPES,
  ABC_LAYOUT_MAPPING,
  ALERT_TYPES,
  DEFAULT_CRITICAL_THRESHOLD_DAYS,
  DEFAULT_PALETE_CAPACITY,
  PRE_BLOQUEIO_DAYS,
  BLOQUEIO_DAYS,
  MESSAGES,
  isLayoutAdherent,
  formatLocationAddress,
  getAreaIcon,
  getCurveColor,
  getAdherenceColor,
  getExpiryColor,
  formatDateBR,
  calculateDaysUntilExpiry
} from './constants';

// Exportar exemplos
export {
  EXAMPLE_PRODUCTS,
  EXAMPLE_LOCATIONS,
  EXAMPLE_INVENTORY_LOGS,
  EXAMPLE_ALERTS,
  EXAMPLE_METRICS,
  TEST_SCENARIOS
} from './examples';
