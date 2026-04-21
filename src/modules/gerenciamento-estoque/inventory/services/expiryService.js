/**
 * Serviço de Gestão de Validade - Cálculos de Data Crítica
 *
 * Responsável por:
 * - Calcular dias até vencimento
 * - Determinar se está em período crítico
 * - Gerar alertas de vencimento
 */

// Constantes de validade
const DEFAULT_CRITICAL_THRESHOLD_DAYS = 30;

const ALERT_TYPES = {
  EXPIRY_CRITICAL: {
    message: 'Produto em data crítica de vencimento',
    severity: 'warning',
    actions: ['Priorizar saída', 'Próximo endereço'],
  },
  EXPIRY_EXPIRED: {
    message: 'Produto vencido',
    severity: 'error',
    actions: ['Segregar imediatamente', 'Descartar'],
  },
};

/**
 * Calcula os dias restantes até a data de validade
 *
 * @param expiryDate Data de validade
 * @param referenceDate Data de referência (padrão: hoje)
 * @returns Número de dias (positivo = vence no futuro, negativo = vencido)
 *
 * @example
 * calculateDaysUntilExpiry(new Date('2025-12-31')) → 255
 * calculateDaysUntilExpiry(new Date('2025-03-15')) → -36 (venceu)
 */
export function calculateDaysUntilExpiry(
  expiryDate,
  referenceDate = new Date(),
) {
  // Limpa o horário para calcular apenas dias
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  // Diferença em milissegundos, convertida para dias
  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Determina se o produto está em data crítica
 *
 * Data crítica = dias até vencer ≤ limiar crítico
 * Exemplo: Se limiar = 30 dias e produto vence em 25 dias → crítico
 *
 * @param daysUntilExpiry Dias até vencimento (de calculateDaysUntilExpiry)
 * @param criticalThreshold Limiar crítico em dias (padrão: 30)
 * @returns true se está em período crítico
 */
export function isCriticalDate(
  daysUntilExpiry,
  criticalThreshold: number = DEFAULT_CRITICAL_THRESHOLD_DAYS,
) {
  return daysUntilExpiry >= 0 && daysUntilExpiry <= criticalThreshold;
}

/**
 * Determina se o produto está vencido
 *
 * @param daysUntilExpiry Dias até vencimento (de calculateDaysUntilExpiry)
 * @returns true se venceu (dias < 0)
 */
export function isExpired(daysUntilExpiry) {
  return daysUntilExpiry < 0;
}

/**
 * Calcula o status de validade de forma resumida
 *
 * @param daysUntilExpiry Dias até vencimento
 * @param criticalThreshold Limiar crítico
 * @returns 'ok' | 'critical' | 'expired'
 */
export function getExpiryStatus(
  daysUntilExpiry,
  criticalThreshold: number = DEFAULT_CRITICAL_THRESHOLD_DAYS,
): 'ok' | 'critical' | 'expired' {
  if (isExpired(daysUntilExpiry)) return 'expired';
  if (isCriticalDate(daysUntilExpiry, criticalThreshold)) return 'critical';
  return 'ok';
}

/**
 * Formata a data de validade de forma legível em português
 *
 * @param expiryDate Data de validade
 * @returns String formatada "DD/MM/YYYY"
 */
export function formatExpiryDate(expiryDate: Date) {
  return expiryDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Gera mensagem descritiva sobre validade
 *
 * @param daysUntilExpiry Dias até vencimento
 * @param criticalThreshold Limiar crítico
 * @returns String descritiva
 *
 * @example
 * getExpiryMessage(255) → "Vence em 255 dias"
 * getExpiryMessage(25) → "⚠️ Vence em 25 dias (CRÍTICO)"
 * getExpiryMessage(-5) → "🚫 Vencido há 5 dias"
 */
export function getExpiryMessage(
  daysUntilExpiry,
  criticalThreshold: number = DEFAULT_CRITICAL_THRESHOLD_DAYS,
) {
  if (isExpired(daysUntilExpiry)) {
    const daysPast = Math.abs(daysUntilExpiry);
    return `🚫 Vencido há ${daysPast} dia${daysPast > 1 ? 's' : ''}`;
  }

  if (isCriticalDate(daysUntilExpiry, criticalThreshold)) {
    return `🔴 Vence em ${daysUntilExpiry} dia${daysUntilExpiry > 1 ? 's' : ''} (CRÍTICO)`;
  }

  return `✅ Vence em ${daysUntilExpiry} dias`;
}

/**
 * Gera alerta de data crítica
 *
 * @param daysUntilExpiry Dias até vencimento
 * @param criticalThreshold Limiar crítico
 * @returns CountingAlert ou null se OK
 */
export function checkExpiryAlert(
  daysUntilExpiry,
  criticalThreshold: number = DEFAULT_CRITICAL_THRESHOLD_DAYS,
): CountingAlert | null {
  if (isExpired(daysUntilExpiry)) {
    const daysPast = Math.abs(daysUntilExpiry);
    return {
      type: 'EXPIRED',
      message: `🚫 ${ALERT_TYPES.EXPIRED.message} — Vencido há ${daysPast} dia${daysPast > 1 ? 's' : ''}`,
      severity: ALERT_TYPES.EXPIRED.severity,
      suggestedActions: ALERT_TYPES.EXPIRED.actions,
    };
  }

  if (isCriticalDate(daysUntilExpiry, criticalThreshold)) {
    return {
      type: 'EXPIRY_CRITICAL',
      message: `🔴 ${ALERT_TYPES.EXPIRY_CRITICAL.message} — Vence em ${daysUntilExpiry} dia${daysUntilExpiry > 1 ? 's' : ''}`,
      severity: ALERT_TYPES.EXPIRY_CRITICAL.severity,
      suggestedActions: ALERT_TYPES.EXPIRY_CRITICAL.actions,
    };
  }

  return null;
}

/**
 * Calcula a cor para exibição visual de urgência de validade
 *
 * @param daysUntilExpiry Dias até vencimento
 * @param criticalThreshold Limiar crítico
 * @returns Cor em hex para usar em UI
 *
 * @example
 * getExpiryColor(255) → '#22c55e' (verde)
 * getExpiryColor(25) → '#f59e0b' (âmbar)
 * getExpiryColor(-5) → '#ef4444' (vermelho)
 */
export function getExpiryColor(
  daysUntilExpiry,
  criticalThreshold: number = DEFAULT_CRITICAL_THRESHOLD_DAYS,
) {
  if (isExpired(daysUntilExpiry)) return '#ef4444'; // Vermelho
  if (isCriticalDate(daysUntilExpiry, criticalThreshold)) return '#f59e0b'; // Âmbar
  return '#22c55e'; // Verde
}

/**
 * Ordena um array de produtos por urgência de vencimento
 *
 * Útil para exibir produtos mais críticos primeiro no dashboard
 *
 * @param items Array de itens com daysUntilExpiry
 * @returns Array ordenado (vencidos primeiro, depois críticos, depois OK)
 */
export function sortByExpiryUrgency(
  items,
  criticalThreshold,
) {
  return [...items].sort((a, b) => {
    // Vencidos (negativo) primeiro
    if (a.daysUntilExpiry < 0 && b.daysUntilExpiry >= 0) return -1;
    if (a.daysUntilExpiry >= 0 && b.daysUntilExpiry < 0) return 1;

    // Entre vencidos, mais vencido primeiro
    if (a.daysUntilExpiry < 0 && b.daysUntilExpiry < 0) {
      return a.daysUntilExpiry - b.daysUntilExpiry;
    }

    // Críticos (0 até limiar) segundo
    const aIsCritical = isCriticalDate(a.daysUntilExpiry, criticalThreshold);
    const bIsCritical = isCriticalDate(b.daysUntilExpiry, criticalThreshold);

    if (aIsCritical && !bIsCritical) return -1;
    if (!aIsCritical && bIsCritical) return 1;

    // Entre críticos, mais próximo do vencimento primeiro
    if (aIsCritical && bIsCritical) {
      return a.daysUntilExpiry - b.daysUntilExpiry;
    }

    // OK (resto), ordem natural
    return b.daysUntilExpiry - a.daysUntilExpiry;
  });
}

/**
 * Calcula estatísticas de validade para um lote de contagens
 *
 * Útil para dashboard com resumo de alertas
 *
 * @param logs Array de logs de contagem
 * @param criticalThreshold Limiar crítico
 * @returns Objeto com contagens de status
 */
export function summarizeExpiryStats(
  logs: Array<{ daysUntilExpiry: number }>,
  criticalThreshold: number = DEFAULT_CRITICAL_THRESHOLD_DAYS,
) {
  return {
    total: logs.length,
    ok: logs.filter(
      (l) =>
        l.daysUntilExpiry > criticalThreshold || l.daysUntilExpiry < 0,
    ).length,
    critical: logs.filter(
      (l) => isCriticalDate(l.daysUntilExpiry, criticalThreshold),
    ).length,
    expired: logs.filter((l) => isExpired(l.daysUntilExpiry)).length,

    // Percentuais
    get percentageOk() {
      return ((this.ok / this.total) * 100).toFixed(1) + '%';
    },
    get percentageCritical() {
      return ((this.critical / this.total) * 100).toFixed(1) + '%';
    },
    get percentageExpired() {
      return ((this.expired / this.total) * 100).toFixed(1) + '%';
    },
  };
}
