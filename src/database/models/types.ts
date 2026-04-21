/**
 * Tipos e Interfaces - Módulo de Gerenciamento de Estoque
 *
 * Define todas as estruturas de dados para o sistema WMS
 */

/**
 * Produto no catálogo
 */
export interface Product {
  /** ID único do produto no Firestore */
  id: string;

  /** Nome completo do produto */
  name: string;

  /** SKU/código do produto */
  sku: string;

  /** Curva ABC: A (alto giro), B (médio), C (baixo) */
  curve: 'A' | 'B' | 'C';

  /** Dias para considerar data crítica de vencimento (padrão: 30) */
  criticalDaysThreshold?: number;

  /** Quantidade de caixas por palete */
  cxPorPalete: number;

  /** Fator Hectolitro (opcional, pode vir de relatório 01.11) */
  fatorHL?: number;

  /** Data de criação */
  createdAt?: Date;

  /** Última atualização */
  updatedAt?: Date;
}

/**
 * Localização/Endereço no armazém
 */
export interface Location {
  /** ID único no Firestore */
  id: string;

  /** Área: EstoqueA, EstoqueB, EstoqueC, Picking, AG, Marketplace */
  areaName: 'EstoqueA' | 'EstoqueB' | 'EstoqueC' | 'Picking' | 'AG' | 'Marketplace';

  /** Rua/corredor do armazém (ex: "Corredor 1") */
  street: string;

  /** Posição da palete (ex: "P1", "P2", etc.) */
  palettePosition: string;

  /** SKU vinculado a esta localização (OBRIGATÓRIO e único) */
  assignedSkuId: string;

  /** ID do produto vinculado */
  assignedProductId?: string;

  /** Localização ativa ou inativa */
  isActive: boolean;

  /** Capacidade máxima em paletes */
  capacity?: number;

  /** Quantidade atual armazenada */
  currentQuantity?: number;

  /** Última contagem */
  lastCountedAt?: Date;

  /** Data de criação */
  createdAt?: Date;
}

/**
 * Registro de contagem de inventário
 */
export interface InventoryLog {
  /** ID único no Firestore */
  id: string;

  /** ID do produto contado */
  productId: string;

  /** SKU do produto (cópia para referência rápida) */
  productSku: string;

  /** ID da localização onde foi contado */
  locationId: string;

  /** Endereço formatado (ex: "EstoqueA > Corredor 1 > Pos. 5") */
  locationAddress: string;

  /** Quantidade contada */
  countedQuantity: number;

  /** Data de validade do produto */
  expiryDate: Date;

  /** Número de lote (opcional) */
  batchNumber?: string;

  /** SKU do produto confere com SKU da localização? */
  isProductMatchLocation: boolean;

  /** Produto está em layout correto? (A→EstoqueA, B→EstoqueB, C→EstoqueC) */
  isLayoutAdherent: boolean;

  /** Score de aderência ABC (0 ou 100) */
  adherenceScore: 0 | 100;

  /** Dias até vencimento (pode ser negativo se vencido) */
  daysUntilExpiry: number;

  /** Data é crítica? (vence em menos de threshold dias) */
  isCriticalDate: boolean;

  /** Produto vencido? */
  isExpired: boolean;

  /** Nome do conferente que fez a contagem */
  conferente: string;

  /** Observações livres */
  notes?: string;

  /** Timestamp da contagem */
  timestamp: Date;
}

/**
 * Alerta gerado durante contagem
 */
export interface CountingAlert {
  /** Tipo do alerta (PRODUCT_MISMATCH, LAYOUT_ADHERENCE, etc) */
  type: string;

  /** Mensagem para o usuário */
  message: string;

  /** Severidade: error, warning, info */
  severity: 'error' | 'warning' | 'info';

  /** Ações sugeridas (ex: ["Verificar SKU", "Realinhar localização"]) */
  suggestedActions?: string[];
}

/**
 * Resultado de uma contagem registrada
 */
export interface CountingResult {
  /** Contagem foi bem-sucedida? */
  success: boolean;

  /** ID do InventoryLog criado */
  inventoryLogId?: string;

  /** Alertas gerados */
  alerts: CountingAlert[];

  /** Resumo de aderência */
  adherenceSummary?: {
    locationAdherent: boolean;
    abcAdherent: boolean;
    expiryStatus: 'ok' | 'critical' | 'expired';
  };

  /** Mensagem de erro (se success === false) */
  errorMessage?: string;
}

/**
 * Entrada de dados para registrar contagem
 */
export interface CountingInput {
  /** ID do produto */
  productId: string;

  /** SKU do produto (para validação) */
  productSku: string;

  /** ID da localização */
  locationId: string;

  /** Quantidade contada */
  countedQuantity: number;

  /** Data de validade (Date object) */
  expiryDate: Date;

  /** Nome do conferente */
  conferente: string;

  /** Número de lote (opcional) */
  batchNumber?: string;

  /** Observações (opcional) */
  notes?: string;
}

/**
 * Erro de validação
 */
export interface ValidationError {
  /** Campo que falhou na validação */
  field: string;

  /** Mensagem do erro */
  message: string;
}

/**
 * Métricas de aderência agregadas
 */
export interface AdherenceMetrics {
  /** Total de contagens no período */
  totalCountings: number;

  /** Total de contagens aderentes */
  totalAdherent: number;

  /** Percentual de aderência (0-100) */
  adherencePercentage: number;

  /** Aderência desagregada por área */
  byArea: Record<string, AreaMetrics>;

  /** Aderência desagregada por curva ABC */
  byCurve: Record<'A' | 'B' | 'C', CurveMetrics>;

  /** Contagem de alertas de validade */
  expiryAlerts: {
    critical: number;
    expired: number;
  };

  /** Data início do período */
  periodStart: Date;

  /** Data fim do período */
  periodEnd: Date;
}

/**
 * Métricas por área (EstoqueA, EstoqueB, etc)
 */
export interface AreaMetrics {
  /** Área (ex: "EstoqueA") */
  area: string;

  /** Total de contagens */
  total: number;

  /** Contagens aderentes */
  adherent: number;

  /** Percentual de aderência */
  percentage: number;
}

/**
 * Métricas por curva ABC
 */
export interface CurveMetrics {
  /** Curva (A, B ou C) */
  curve: 'A' | 'B' | 'C';

  /** Total de contagens */
  total: number;

  /** Contagens aderentes */
  adherent: number;

  /** Percentual de aderência */
  percentage: number;
}

/**
 * Erro customizado para validações de contagem
 */
export class CountingValidationError extends Error {
  constructor(
    message: string,
    public errors: ValidationError[] = [],
    public suggestions: string[] = []
  ) {
    super(message);
    this.name = 'CountingValidationError';
  }
}

/**
 * Tipo para áreas do armazém
 */
export type AreaType = 'EstoqueA' | 'EstoqueB' | 'EstoqueC' | 'Picking' | 'AG' | 'Marketplace';

/**
 * Tipo para curvas ABC
 */
export type CurvaABC = 'A' | 'B' | 'C';
