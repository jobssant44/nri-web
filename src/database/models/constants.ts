/**
 * Constantes e Funções Auxiliares - Módulo de Gerenciamento de Estoque
 */

import type { AreaType, CurvaABC } from './types';

// ========== ÁREAS DO ARMAZÉM ==========

export const AREA_TYPES: Record<AreaType, {
  label: string;
  icon: string;
  description: string;
  expectedCurve?: CurvaABC;
}> = {
  EstoqueA: {
    label: 'Estoque A',
    icon: '📦📦',
    description: 'Armazenamento de produtos Curva A (alto giro)',
    expectedCurve: 'A'
  },
  EstoqueB: {
    label: 'Estoque B',
    icon: '📦📦',
    description: 'Armazenamento de produtos Curva B (médio giro)',
    expectedCurve: 'B'
  },
  EstoqueC: {
    label: 'Estoque C',
    icon: '📦📦',
    description: 'Armazenamento de produtos Curva C (baixo giro)',
    expectedCurve: 'C'
  },
  Picking: {
    label: 'Picking',
    icon: '📦',
    description: 'Área de preparação para expedição (transitória)'
  },
  AG: {
    label: 'AG (Armazém Geral)',
    icon: '🏭',
    description: 'Armazém geral ou overflow (transitório)'
  },
  Marketplace: {
    label: 'Marketplace',
    icon: '🛒',
    description: 'Produtos para marketplace (transitório)'
  }
};

// ========== CURVA ABC ==========

export const CURVE_TYPES: Record<CurvaABC, {
  label: string;
  color: string;
  description: string;
  icon: string;
}> = {
  A: {
    label: 'Curva A (Alto Giro)',
    color: '#22c55e',
    description: 'Produtos de alto giro, acumulam até 80% do faturamento',
    icon: '⚡'
  },
  B: {
    label: 'Curva B (Médio Giro)',
    color: '#f59e0b',
    description: 'Produtos de médio giro, acumulam de 80% a 95%',
    icon: '📊'
  },
  C: {
    label: 'Curva C (Baixo Giro)',
    color: '#ef4444',
    description: 'Produtos de baixo giro, acumulam de 95% a 100%',
    icon: '🐢'
  }
};

// ========== MAPEAMENTO ABC x LAYOUT ==========

export const ABC_LAYOUT_MAPPING: Record<CurvaABC, AreaType> = {
  A: 'EstoqueA',
  B: 'EstoqueB',
  C: 'EstoqueC'
};

/**
 * Verifica se um produto está no layout correto
 * A → EstoqueA, B → EstoqueB, C → EstoqueC
 * Picking, AG, Marketplace são transitórios (sem penalidade)
 */
export function isLayoutAdherent(curve: CurvaABC, area: AreaType): boolean {
  // Áreas transitórias sempre aderentes
  if (['Picking', 'AG', 'Marketplace'].includes(area)) {
    return true;
  }

  // Verifica mapeamento ABC
  return ABC_LAYOUT_MAPPING[curve] === area;
}

// ========== TIPOS DE ALERTA ==========

export const ALERT_TYPES = {
  PRODUCT_MISMATCH: {
    message: '❌ Produto não cadastrado ou SKU não confere com localização',
    severity: 'error' as const,
    actions: ['Verificar código do produto', 'Confirmar localização', 'Consultar supervisor']
  },
  LAYOUT_ADHERENCE: {
    message: '⚠️ Produto fora do layout correto (A→Estoque A, B→Estoque B, C→Estoque C)',
    severity: 'warning' as const,
    actions: ['Realinhar para localização correta', 'Consultar supervisor']
  },
  EXPIRY_CRITICAL: {
    message: '🔴 Produto vence em período crítico (menos de 30 dias)',
    severity: 'warning' as const,
    actions: ['Priorizar saída', 'Verificar data com NF', 'Informar ao supervisor']
  },
  EXPIRY_EXPIRED: {
    message: '🔴 Produto VENCIDO - Deve ser segregado imediatamente',
    severity: 'error' as const,
    actions: ['Segregar imediatamente', 'Avisar supervisor', 'Documentar descarte']
  },
  LOCATION_CAPACITY: {
    message: '⚠️ Localização acima da capacidade',
    severity: 'warning' as const,
    actions: ['Liberar espaço', 'Usar outra localização', 'Consultar supervisor']
  }
};

// ========== CONSTANTES DE NEGÓCIO ==========

export const DEFAULT_CRITICAL_THRESHOLD_DAYS = 30;
export const DEFAULT_PALETE_CAPACITY = 2; // 2 paletes por posição
export const PRE_BLOQUEIO_DAYS = 45; // Pré-bloqueio = validade - 45 dias
export const BLOQUEIO_DAYS = 30; // Bloqueio = validade - 30 dias

// ========== FUNÇÕES AUXILIARES ==========

/**
 * Formata um endereço de localização
 * @example formatLocationAddress(loc) => "EstoqueA > Corredor 1 > Pos. 5"
 */
export function formatLocationAddress(area: AreaType, street: string, position: string): string {
  const areaLabel = AREA_TYPES[area].label;
  return `${areaLabel} > ${street} > ${position}`;
}

/**
 * Retorna ícone da área
 */
export function getAreaIcon(area: AreaType): string {
  return AREA_TYPES[area].icon;
}

/**
 * Retorna cor da curva ABC
 */
export function getCurveColor(curve: CurvaABC): string {
  return CURVE_TYPES[curve].color;
}

/**
 * Retorna cor para status de aderência
 */
export function getAdherenceColor(isAdherent: boolean): string {
  return isAdherent ? '#22c55e' : '#ef4444'; // Verde ou vermelho
}

/**
 * Retorna cor para status de validade
 */
export function getExpiryColor(daysUntilExpiry: number): string {
  if (daysUntilExpiry < 0) return '#000000'; // Preto = vencido
  if (daysUntilExpiry <= DEFAULT_CRITICAL_THRESHOLD_DAYS) return '#ef4444'; // Vermelho = crítico
  return '#22c55e'; // Verde = OK
}

/**
 * Formata data no padrão brasileiro DD/MM/YYYY
 */
export function formatDateBR(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Calcula dias até vencimento
 * Usa Math.floor para arredondar para baixo
 */
export function calculateDaysUntilExpiry(expiryDate: Date, referenceDate?: Date): number {
  const ref = referenceDate || new Date();
  const diff = new Date(expiryDate).getTime() - ref.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ========== MENSAGENS PADRÃO ==========

export const MESSAGES = {
  // Sucesso
  SUCCESS_COUNTING_REGISTERED: '✅ Contagem registrada com sucesso',
  SUCCESS_COUNTING_WITH_WARNINGS: '⚠️ Contagem registrada com avisos. Revise as informações.',
  SUCCESS_LOCATION_CREATED: '✅ Localização criada com sucesso',
  SUCCESS_PRODUCT_IMPORTED: '✅ Produtos importados com sucesso',

  // Erros
  ERROR_PRODUCT_NOT_FOUND: '❌ Produto não encontrado no catálogo',
  ERROR_LOCATION_NOT_FOUND: '❌ Localização não encontrada',
  ERROR_SKU_MISMATCH: '❌ SKU do produto não confere com o esperado',
  ERROR_INVALID_DATE: '❌ Data inválida ou em formato incorreto',
  ERROR_QUANTITY_INVALID: '❌ Quantidade deve ser um número positivo',
  ERROR_LOCATION_INACTIVE: '❌ Localização inativa. Não é possível contar.',

  // Avisos
  WARNING_CRITICAL_DATE: '⚠️ Produto próximo ao vencimento',
  WARNING_EXPIRED: '⚠️ Produto vencido. Acionar supervisor.',
  WARNING_LAYOUT_MISMATCH: '⚠️ Produto fora do layout correto'
};
