/**
 * Serviço de Validação - Regras de Negócio para WMS
 *
 * Responsável por:
 * - Validar correspondência entre Produto e Localização
 * - Calcular aderência de layout (Curva ABC)
 * - Detectar divergências e gerar alertas
 */

// Business constants for validation
const ABC_LAYOUT_MAPPING = {
  A: 'EstoqueA',
  B: 'EstoqueB',
  C: 'EstoqueC',
};

const ALERT_TYPES = {
  PRODUCT_MISMATCH: {
    message: 'Produto não cadastrado para este espaço',
    severity: 'error',
    actions: ['Corrigir', 'Continuar'],
  },
};

// Helper function to check if location is appropriate for product curve
const checkLayoutRule = (curve, areaName) => {
  if (['Picking', 'AG', 'Marketplace'].includes(areaName)) {
    return true; // Transitional areas are always acceptable
  }
  return ABC_LAYOUT_MAPPING[curve] === areaName;
};

/**
 * Valida se o produto contado corresponde ao SKU esperado na localização
 *
 * @param product Produto que foi contado
 * @param location Localização onde foi contado
 * @returns true se o SKU corresponde
 */
export function validateProductMatch(
  product,
  location,
) {
  return product.sku === location.assignedSkuId;
}

/**
 * Gera alerta se o produto não corresponde à localização
 *
 * @param product Produto que foi contado
 * @param location Localização onde foi contado
 * @returns CountingAlert ou null se OK
 */
export function checkProductMatchAlert(
  product,
  location,
) {
  if (validateProductMatch(product, location)) {
    return null;
  }

  return {
    type: 'PRODUCT_MISMATCH',
    message: `❌ ${ALERT_TYPES.PRODUCT_MISMATCH.message}`,
    severity: ALERT_TYPES.PRODUCT_MISMATCH.severity,
    suggestedActions: ALERT_TYPES.PRODUCT_MISMATCH.actions,
  };
}

/**
 * Valida aderência de layout: Produto com Curva X deve estar em EstoqueX
 *
 * Hierarquia:
 * - Curva A → EstoqueA (✅ aderente)
 * - Curva B → EstoqueB (✅ aderente)
 * - Curva C → EstoqueC (✅ aderente)
 * - Qualquer curva em Picking/AG/Marketplace (✅ transitório, sem penalidade)
 * - Curva X em EstoqueY (X ≠ Y) (❌ não aderente)
 *
 * @param product Produto que foi contado
 * @param location Localização onde foi contado
 * @returns true se a localização é apropriada para a curva
 */
export function validateLayoutAdherence(
  product,
  location,
) {
  return checkLayoutRule(product.curve, location.areaName);
}

/**
 * Gera alerta se o layout não é aderente
 *
 * @param product Produto
 * @param location Localização
 * @returns CountingAlert ou null se OK
 */
export function checkLayoutAdherenceAlert(
  product,
  location,
) {
  if (validateLayoutAdherence(product, location)) {
    return null;
  }

  const correctArea = ABC_LAYOUT_MAPPING[product.curve];
  return {
    type: 'LOCATION_MISMATCH',
    message: `⚠️ Produto Curva ${product.curve} deveria estar em ${correctArea}, mas está em ${location.areaName}`,
    severity: 'warning',
    suggestedActions: [
      `Reposicionar para ${correctArea}`,
      'Aceitar divergência',
      'Cancelar contagem',
    ],
  };
}

/**
 * Calcula aderência ABC: 100 se layout aderente, 0 caso contrário
 *
 * @param isLayoutAdherent Se a localização é apropriada para a curva
 * @returns 0 ou 100
 */
export function calculateABCAdherence(isLayoutAdherent) {
  return isLayoutAdherent ? 100 : 0;
}

/**
 * Validação completa de divergências de SKU
 *
 * @param product Produto contado
 * @param location Localização
 * @returns Array de validações (campos que falharam)
 */
export function validateLocationProductMatch(
  product,
  location,
) {
  const errors = [];

  if (!product) {
    errors.push({
      field: 'product',
      message: 'Produto não encontrado',
      code: 'PRODUCT_NOT_FOUND',
    });
  }

  if (!location) {
    errors.push({
      field: 'location',
      message: 'Localização não encontrada',
      code: 'LOCATION_NOT_FOUND',
    });
  }

  if (product && location && product.sku !== location.assignedSkuId) {
    errors.push({
      field: 'sku_match',
      message: `SKU divergência: esperado ${location.assignedSkuId}, encontrado ${product.sku}`,
      code: 'SKU_MISMATCH',
    });
  }

  return errors;
}

/**
 * Valida se a localização está ativa (não foi desativada)
 *
 * @param location Localização
 * @returns true se está ativa
 */
export function validateLocationIsActive(location) {
  return location.isActive === true;
}

/**
 * Valida se a localização não está em sobre-capacidade
 *
 * @param location Localização
 * @returns true se não superou capacidade
 */
export function validateLocationCapacity(location) {
  if (!location.capacity) return true; // Sem limite
  return (location.currentQuantity ?? 0) < location.capacity;
}

/**
 * Gera alerta se a localização não tem capacidade
 *
 * @param location Localização
 * @returns CountingAlert ou null
 */
export function checkLocationCapacityAlert(
  location,
) {
  if (validateLocationCapacity(location)) {
    return null;
  }

  return {
    type: 'LOCATION_MISMATCH',
    message: `⚠️ Localização em sobre-capacidade: ${location.currentQuantity}/${location.capacity} paletes`,
    severity: 'warning',
    suggestedActions: [
      'Usar outra posição',
      'Aceitar e registrar sobre-capacidade',
    ],
  };
}

/**
 * Valida quantidade contada
 *
 * @param countedQuantity Quantidade contada
 * @returns true se válido
 */
export function validateCountedQuantity(countedQuantity) {
  return countedQuantity > 0 && Number.isInteger(countedQuantity);
}

/**
 * Valida data de validade
 *
 * @param expiryDate Data de validade
 * @returns true se é uma data válida no futuro ou passado (aceitamos vencidos)
 */
export function validateExpiryDate(expiryDate: Date) {
  if (!expiryDate || !(expiryDate instanceof Date)) return false;
  return !isNaN(expiryDate.getTime());
}

/**
 * Validação de integridade dos dados de entrada
 *
 * @param input Dados da contagem
 * @returns Array de erros de validação
 */
export function validateCountingInput(input: {
  productId: string;
  locationId: string;
  countedQuantity: number;
  expiryDate: Date;
  conferente: string;
}) {
  const errors = [];

  if (!input.productId?.trim()) {
    errors.push({
      field: 'productId',
      message: 'Produto é obrigatório',
      code: 'PRODUCT_ID_REQUIRED',
    });
  }

  if (!input.locationId?.trim()) {
    errors.push({
      field: 'locationId',
      message: 'Localização é obrigatória',
      code: 'LOCATION_ID_REQUIRED',
    });
  }

  if (!validateCountedQuantity(input.countedQuantity)) {
    errors.push({
      field: 'countedQuantity',
      message: 'Quantidade deve ser um número inteiro positivo',
      code: 'INVALID_QUANTITY',
    });
  }

  if (!validateExpiryDate(input.expiryDate)) {
    errors.push({
      field: 'expiryDate',
      message: 'Data de validade inválida',
      code: 'INVALID_EXPIRY_DATE',
    });
  }

  if (!input.conferente?.trim()) {
    errors.push({
      field: 'conferente',
      message: 'Conferente é obrigatório',
      code: 'CONFERENTE_REQUIRED',
    });
  }

  return errors;
}

/**
 * Resume o status de validação da contagem
 *
 * @param isProductMatch SKU corresponde?
 * @param isLayoutAdherent Layout está correto?
 * @param isExpired Produto está vencido?
 * @returns Objeto com status resumido
 */
export function summarizeValidationStatus(
  isProductMatch,
  isLayoutAdherent,
  isExpired,
) {
  return {
    hasErrors: !isProductMatch || isExpired,
    hasWarnings: !isLayoutAdherent,
    productValid: isProductMatch,
    locationValid: isLayoutAdherent,
    notExpired: !isExpired,

    // Classificação geral
    status: (() => {
      if (!isProductMatch || isExpired) return 'error';
      if (!isLayoutAdherent) return 'warning';
      return 'success';
    })(),
  };
}
