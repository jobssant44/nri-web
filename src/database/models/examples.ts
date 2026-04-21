/**
 * Exemplos de Dados - Módulo de Gerenciamento de Estoque
 */

import type { Product, Location, InventoryLog, CountingAlert, AdherenceMetrics } from './types';

// EXEMPLOS DE PRODUTOS
export const EXAMPLE_PRODUCTS: Product[] = [
  {
    id: 'prod_001',
    name: 'Cerveja Brahma 600ml',
    sku: 'SKU_BRAHMA_600',
    curve: 'A',
    cxPorPalete: 12,
    criticalDaysThreshold: 30,
    createdAt: new Date('2026-01-15')
  },
  {
    id: 'prod_002',
    name: 'Cerveja Skol 350ml',
    sku: 'SKU_SKOL_350',
    curve: 'A',
    cxPorPalete: 20,
    criticalDaysThreshold: 30,
    createdAt: new Date('2026-01-15')
  },
  {
    id: 'prod_003',
    name: 'Chopp Ambev 15L',
    sku: 'SKU_CHOPP_15',
    curve: 'B',
    cxPorPalete: 8,
    criticalDaysThreshold: 15,
    createdAt: new Date('2026-01-20')
  },
  {
    id: 'prod_004',
    name: 'Refrigerante Guarana 2L',
    sku: 'SKU_GUARANA_2L',
    curve: 'C',
    cxPorPalete: 6,
    criticalDaysThreshold: 60,
    createdAt: new Date('2026-02-01')
  }
];

// EXEMPLOS DE LOCALIZACOES
export const EXAMPLE_LOCATIONS: Location[] = [
  {
    id: 'loc_001',
    areaName: 'EstoqueA',
    street: 'Corredor 1',
    palettePosition: 'P1',
    assignedSkuId: 'SKU_BRAHMA_600',
    assignedProductId: 'prod_001',
    isActive: true,
    capacity: 2,
    currentQuantity: 2,
    lastCountedAt: new Date('2026-04-15'),
    createdAt: new Date('2026-01-10')
  },
  {
    id: 'loc_002',
    areaName: 'EstoqueA',
    street: 'Corredor 1',
    palettePosition: 'P2',
    assignedSkuId: 'SKU_SKOL_350',
    assignedProductId: 'prod_002',
    isActive: true,
    capacity: 2,
    currentQuantity: 1,
    lastCountedAt: new Date('2026-04-14'),
    createdAt: new Date('2026-01-10')
  },
  {
    id: 'loc_003',
    areaName: 'EstoqueB',
    street: 'Corredor 2',
    palettePosition: 'P1',
    assignedSkuId: 'SKU_CHOPP_15',
    assignedProductId: 'prod_003',
    isActive: true,
    capacity: 1,
    currentQuantity: 1,
    lastCountedAt: new Date('2026-04-10'),
    createdAt: new Date('2026-01-20')
  },
  {
    id: 'loc_004',
    areaName: 'EstoqueC',
    street: 'Corredor 3',
    palettePosition: 'P1',
    assignedSkuId: 'SKU_GUARANA_2L',
    assignedProductId: 'prod_004',
    isActive: true,
    capacity: 2,
    currentQuantity: 0,
    createdAt: new Date('2026-02-01')
  }
];

// EXEMPLOS DE CONTAGENS
export const EXAMPLE_INVENTORY_LOGS: InventoryLog[] = [
  {
    id: 'log_001',
    productId: 'prod_001',
    productSku: 'SKU_BRAHMA_600',
    locationId: 'loc_001',
    locationAddress: 'EstoqueA > Corredor 1 > P1',
    countedQuantity: 24,
    expiryDate: new Date('2026-06-30'),
    batchNumber: 'LOTE_2026_001',
    isProductMatchLocation: true,
    isLayoutAdherent: true,
    adherenceScore: 100,
    daysUntilExpiry: 70,
    isCriticalDate: false,
    isExpired: false,
    conferente: 'Joao Silva',
    timestamp: new Date('2026-04-15T09:30:00')
  },
  {
    id: 'log_002',
    productId: 'prod_003',
    productSku: 'SKU_CHOPP_15',
    locationId: 'loc_003',
    locationAddress: 'EstoqueB > Corredor 2 > P1',
    countedQuantity: 8,
    expiryDate: new Date('2026-05-20'),
    isProductMatchLocation: true,
    isLayoutAdherent: true,
    adherenceScore: 100,
    daysUntilExpiry: 29,
    isCriticalDate: true,
    isExpired: false,
    conferente: 'Maria Santos',
    notes: 'Produto critico. Priorizar saida.',
    timestamp: new Date('2026-04-14T14:15:00')
  }
];

// EXEMPLOS DE ALERTAS
export const EXAMPLE_ALERTS: CountingAlert[] = [
  {
    type: 'EXPIRY_CRITICAL',
    message: 'Chopp Ambev vence em 29 dias. Priorizar expedicao.',
    severity: 'warning',
    suggestedActions: ['Priorizar saida', 'Verificar data com NF']
  },
  {
    type: 'EXPIRY_EXPIRED',
    message: 'Produto VENCIDO. Segregar imediatamente.',
    severity: 'error',
    suggestedActions: ['Segregar imediatamente', 'Avisar supervisor']
  }
];

// EXEMPLO DE METRICAS AGREGADAS
export const EXAMPLE_METRICS: AdherenceMetrics = {
  totalCountings: 250,
  totalAdherent: 240,
  adherencePercentage: 96,
  byArea: {
    EstoqueA: { area: 'EstoqueA', total: 100, adherent: 100, percentage: 100 },
    EstoqueB: { area: 'EstoqueB', total: 100, adherent: 90, percentage: 90 },
    EstoqueC: { area: 'EstoqueC', total: 30, adherent: 30, percentage: 100 }
  },
  byCurve: {
    A: { curve: 'A', total: 100, adherent: 100, percentage: 100 },
    B: { curve: 'B', total: 100, adherent: 90, percentage: 90 },
    C: { curve: 'C', total: 50, adherent: 50, percentage: 100 }
  },
  expiryAlerts: { critical: 5, expired: 2 },
  periodStart: new Date('2026-04-01'),
  periodEnd: new Date('2026-04-30')
};

export default {
  EXAMPLE_PRODUCTS,
  EXAMPLE_LOCATIONS,
  EXAMPLE_INVENTORY_LOGS,
  EXAMPLE_ALERTS,
  EXAMPLE_METRICS
};
