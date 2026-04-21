/**
 * Serviço de Contagem - Orquestra validação, cálculo e registro
 *
 * Responsável por:
 * - Registrar uma contagem de inventário
 * - Aplicar todas as validações
 * - Calcular aderência e status de validade
 * - Gerar alertas
 * - Retornar resultado estruturado
 */

// Importar serviços
import * as validationService from './validationService';
import * as expiryService from './expiryService';

/**
 * Erro customizado para validações de contagem
 */
class CountingValidationError extends Error {
  constructor(errors = [], suggestions = []) {
    super('Erro na validação de contagem');
    this.name = 'CountingValidationError';
    this.errors = errors;
    this.suggestions = suggestions;
  }
}

/**
 * Função principal: registra uma contagem com validação completa
 *
 * Fluxo:
 * 1. Validação de integridade dos dados
 * 2. Carrega Product e Location do Firebase
 * 3. Valida SKU × Localização
 * 4. Calcula aderência ABC
 * 5. Calcula status de validade
 * 6. Gera alertas
 * 7. Cria documento InventoryLog
 * 8. Retorna resultado com alertas
 *
 * @param input Dados da contagem
 * @param fetchProduct Função para buscar Product no Firebase
 * @param fetchLocation Função para buscar Location no Firebase
 * @param saveInventoryLog Função para salvar no Firebase
 * @returns CountingResult com alertas e status
 * @throws CountingValidationError se validação falhar
 */
export async function registerCounting(
  input,
  fetchProduct,
  fetchLocation,
  saveInventoryLog,
) {
  // ─── Step 1: Validar integridade dos dados ───────────────────────────

  const inputErrors = validationService.validateCountingInput({
    productId: input.productId,
    locationId: input.locationId,
    countedQuantity: input.countedQuantity,
    expiryDate: input.expiryDate,
    conferente: input.conferente,
  });

  if (inputErrors.length > 0) {
    throw new CountingValidationError(
      inputErrors,
      ['Verifique os dados e tente novamente'],
    );
  }

  // ─── Step 2: Buscar Product e Location ────────────────────────────────

  const [product, location] = await Promise.all([
    fetchProduct(input.productId),
    fetchLocation(input.locationId),
  ]);

  // ─── Step 3: Validar referências ──────────────────────────────────────

  const refErrors = validationService.validateLocationProductMatch(
    product,
    location,
  );

  if (refErrors.length > 0) {
    throw new CountingValidationError(refErrors, [
      'Carregue a localização novamente',
    ]);
  }

  // ─── Step 4: Verificações de consistência ────────────────────────────

  if (validationService.validateLocationIsActive(location)) {
    throw new CountingValidationError(
      [
        {
          field: 'location',
          message: 'Localização foi desativada',
          code: 'LOCATION_INACTIVE',
        },
      ],
      ['Use outra localização'],
    );
  }

  // ─── Step 5: Calcular validações e aderência ──────────────────────────

  const isProductMatch = validationService.validateProductMatch(
    product,
    location,
  );
  const isLayoutAdherent = validationService.validateLayoutAdherence(
    product,
    location,
  );
  const isABCAdherent = validationService.calculateABCAdherence(
    isLayoutAdherent,
  );

  // ─── Step 6: Calcular status de validade ──────────────────────────────

  const daysUntilExpiry = expiryService.calculateDaysUntilExpiry(
    input.expiryDate,
  );
  const isCriticalDate = expiryService.isCriticalDate(
    daysUntilExpiry,
    product.criticalDaysThreshold,
  );
  const isExpired = expiryService.isExpired(daysUntilExpiry);

  // ─── Step 7: Gerar alertas ────────────────────────────────────────────

  const alerts: CountingAlert[] = [];

  // Alerta de produto não correspondente
  const productMatchAlert = validationService.checkProductMatchAlert(
    product,
    location,
  );
  if (productMatchAlert) alerts.push(productMatchAlert);

  // Alerta de layout não aderente
  const layoutAlert = validationService.checkLayoutAdherenceAlert(
    product,
    location,
  );
  if (layoutAlert) alerts.push(layoutAlert);

  // Alerta de capacidade
  const capacityAlert = validationService.checkLocationCapacityAlert(
    location,
  );
  if (capacityAlert) alerts.push(capacityAlert);

  // Alerta de validade
  const expiryAlert = expiryService.checkExpiryAlert(
    daysUntilExpiry,
    product.criticalDaysThreshold,
  );
  if (expiryAlert) alerts.push(expiryAlert);

  // ─── Step 8: Criar documento InventoryLog ────────────────────────────

  const now = new Date();
  const inventoryLog: InventoryLog = {
    id: '', // Será gerado pelo Firebase

    // Referências
    productId: input.productId,
    productSku: product.sku,
    locationId: input.locationId,
    locationAddress: formatLocationAddress(location),

    // Dados de contagem
    countedQuantity: input.countedQuantity,
    expiryDate: input.expiryDate,
    batchNumber: input.batchNumber,

    // Aderência
    isProductMatchLocation: isProductMatch,
    isLayoutAdherent,
    isABCAdherent: isABCAdherent === 100,
    adherenceScore: isABCAdherent,

    // Validade
    daysUntilExpiry,
    isCriticalDate,
    isExpired,

    // Rastreamento
    conferente: input.conferente,
    notes: input.notes,
    timestamp: now,
  };

  // ─── Step 9: Salvar no Firebase ────────────────────────────────────────

  const savedId = await saveInventoryLog(inventoryLog);
  inventoryLog.id = savedId;

  // ─── Step 10: Retornar resultado ──────────────────────────────────────

  return {
    success: true,
    inventoryLogId: savedId,

    alerts,

    adherenceSummary: {
      locationAdherent: isLayoutAdherent,
      abcAdherent: isABCAdherent === 100,
      expiryStatus: expiryService.getExpiryStatus(
        daysUntilExpiry,
        product.criticalDaysThreshold,
      ),
    },
  };
}

/**
 * Função auxiliar: formata endereço em formato legível
 *
 * @param location Localização
 * @returns String formatada "EstoqueA > Rua 01 > Pos. 001"
 */
export function formatLocationAddress(location) {
  return `${location.areaName} > Rua ${location.street} > Pos. ${location.palettePosition}`;
}

/**
 * Retorna mensagem de sucesso amigável ao usuário
 *
 * @param result Resultado da contagem
 * @returns String com feedback
 */
export function getSuccessMessage(result) {
  if (result.alerts.length === 0) {
    return '✅ Contagem registrada com sucesso Sem alertas.';
  }

  const errorCount = result.alerts.filter((a) => a.severity === 'error').length;
  const warningCount = result.alerts.filter(
    (a) => a.severity === 'warning',
  ).length;

  if (errorCount > 0) {
    return `⚠️ Contagem registrada com ${errorCount} erro(s) — Revisão necessária`;
  }

  if (warningCount > 0) {
    return `✅ Contagem registrada com ${warningCount} aviso(s) — Verifique`;
  }

  return '✅ Contagem registrada com sucesso';
}

/**
 * Retorna instruções para o conferente baseado nos alertas
 *
 * @param result Resultado da contagem
 * @returns Array de instruções
 */
export function getNextActions(result): string[] {
  const actions: string[] = [];

  if (result.alerts.length === 0) {
    return ['Operação concluída'];
  }

  // Erros devem ser resolvidos
  const errors = result.alerts.filter((a) => a.severity === 'error');
  if (errors.length > 0) {
    actions.push('❌ Erros detectados — Contate o supervisor');
    return actions;
  }

  // Avisos podem ter ações sugeridas
  result.alerts.forEach((alert) => {
    if (alert.suggestedActions) {
      actions.push(...alert.suggestedActions);
    }
  });

  // Se não houver ações sugeridas, adicionar ação padrão
  if (actions.length === 0) {
    actions.push('Próximo endereço');
  }

  return actions;
}

/**
 * Calcula estatísticas rápidas de uma contagem para exibição
 *
 * @param result Resultado da contagem
 * @returns Objeto com estatísticas
 */
export function getCountingSummary(result) {
  const errorCount = result.alerts.filter((a) => a.severity === 'error').length;
  const warningCount = result.alerts.filter(
    (a) => a.severity === 'warning',
  ).length;

  return {
    isValid: result.success && errorCount === 0,
    errorCount,
    warningCount,
    alertCount: result.alerts.length,

    adherenceScore: result.adherenceSummary.abcAdherent ? 100 : 0,

    // Status visual
    status: (() => {
      if (errorCount > 0) return 'error';
      if (warningCount > 0) return 'warning';
      return 'success';
    })(),
  };
}
