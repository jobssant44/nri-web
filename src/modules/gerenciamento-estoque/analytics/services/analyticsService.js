/**
 * Serviço de Analytics - Agregação de métricas para Dashboard
 *
 * Responsável por:
 * - Calcular aderência geral (%)
 * - Segmentar por área (EstoqueA, EstoqueB, etc.)
 * - Segmentar por curva (A, B, C)
 * - Resumir alertas de validade
 */

// Note: This service uses data types from database/models
// Ensure InventoryLog and AdherenceMetrics types are defined

/**
 * Calcula as métricas de aderência para um período
 *
 * @param logs Array de logs de contagem
 * @param periodStart Data inicial do período
 * @param periodEnd Data final do período
 * @returns AdherenceMetrics com agregações
 */
export function calculateAdherenceMetrics(
  logs,
  periodStart,
  periodEnd,
) {
  // Filtrar logs no período
  const logsInPeriod = logs.filter(
    (log) =>
      log.timestamp >= periodStart && log.timestamp <= periodEnd,
  );

  if (logsInPeriod.length === 0) {
    return getEmptyMetrics(periodStart, periodEnd);
  }

  // ─── Cálculo geral ──────────────────────────────────────────────────

  const totalCountings = logsInPeriod.length;
  const totalAdherent = logsInPeriod.filter((log) => log.isABCAdherent).length;
  const adherencePercentage = (totalAdherent / totalCountings) * 100;

  // ─── Agregação por área ─────────────────────────────────────────────

  const byArea = aggregateByArea(logsInPeriod);

  // ─── Agregação por curva ────────────────────────────────────────────

  const byCurve = aggregateByCurve(logsInPeriod);

  // ─── Resumo de validade ─────────────────────────────────────────────

  const expiryAlerts = summarizeExpiryAlerts(logsInPeriod);

  return {
    totalCountings,
    totalAdherent,
    adherencePercentage: Math.round(adherencePercentage * 100) / 100,

    byArea,
    byCurve,
    expiryAlerts,

    periodStart,
    periodEnd,
  };
}

/**
 * Retorna métrica vazia para período sem dados
 */
function getEmptyMetrics(
  periodStart: Date,
  periodEnd: Date,
): AdherenceMetrics {
  const emptyAreaMetric = { total: 0, adherent: 0, percentage: 0 };
  const emptyCurveMetric = { total: 0, adherent: 0, percentage: 0 };

  return {
    totalCountings: 0,
    totalAdherent: 0,
    adherencePercentage: 0,

    byArea: {
      EstoqueA: emptyAreaMetric,
      EstoqueB: emptyAreaMetric,
      EstoqueC: emptyAreaMetric,
      Picking: emptyAreaMetric,
      AG: emptyAreaMetric,
      Marketplace: emptyAreaMetric,
    },

    byCurve: {
      A: emptyCurveMetric,
      B: emptyCurveMetric,
      C: emptyCurveMetric,
    },

    expiryAlerts: { critical: 0, expired: 0 },

    periodStart,
    periodEnd,
  };
}

/**
 * Agrega logs por área
 *
 * @param logs Array de logs
 * @returns Map de AreaType → métricas
 */
export function aggregateByArea(logs: InventoryLog[]) {
  const areas: AreaType[] = [
    'EstoqueA',
    'EstoqueB',
    'EstoqueC',
    'Picking',
    'AG',
    'Marketplace',
  ];

  const result: Record<
    AreaType,
    { total: number; adherent: number; percentage: number }
  > = {
    EstoqueA: { total: 0, adherent: 0, percentage: 0 },
    EstoqueB: { total: 0, adherent: 0, percentage: 0 },
    EstoqueC: { total: 0, adherent: 0, percentage: 0 },
    Picking: { total: 0, adherent: 0, percentage: 0 },
    AG: { total: 0, adherent: 0, percentage: 0 },
    Marketplace: { total: 0, adherent: 0, percentage: 0 },
  };

  areas.forEach((area) => {
    const logsForArea = logs.filter(
      (log) => log.locationAddress.includes(area),
    );

    if (logsForArea.length === 0) {
      return; // Skip empty areas
    }

    const adherent = logsForArea.filter((log) => log.isABCAdherent).length;

    result[area] = {
      total: logsForArea.length,
      adherent,
      percentage:
        Math.round((adherent / logsForArea.length) * 100 * 100) / 100,
    };
  });

  return result;
}

/**
 * Agrega logs por curva ABC (A, B, C)
 *
 * Nota: A curva é identificada pelo padrão do SKU ou metadados do log
 * Para esta implementação, usamos heurística baseada na localização
 *
 * @param logs Array de logs
 * @returns Map de CurvaABC → métricas
 */
export function aggregateByCurve(logs: InventoryLog[]) {
  const curves: CurvaABC[] = ['A', 'B', 'C'];

  const result: Record<
    CurvaABC,
    { total: number; adherent: number; percentage: number }
  > = {
    A: { total: 0, adherent: 0, percentage: 0 },
    B: { total: 0, adherent: 0, percentage: 0 },
    C: { total: 0, adherent: 0, percentage: 0 },
  };

  // Agrupar por curva inferida da localização
  // EstoqueA → Curva A, EstoqueB → Curva B, EstoqueC → Curva C
  curves.forEach((curve) => {
    const area = `Estoque${curve}`;
    const logsForCurve = logs.filter((log) =>
      log.locationAddress.includes(area),
    );

    // Também incluir logs da curva em Picking/AG (transitório)
    // Se desejado, descomentar:
    // const logsPickingForCurve = logs.filter(
    //   (log) => log.productSku.includes(curve) && log.locationAddress.includes('Picking')
    // );
    // logsForCurve.push(...logsPickingForCurve);

    if (logsForCurve.length === 0) {
      return;
    }

    const adherent = logsForCurve.filter((log) => log.isABCAdherent).length;

    result[curve] = {
      total: logsForCurve.length,
      adherent,
      percentage:
        Math.round((adherent / logsForCurve.length) * 100 * 100) / 100,
    };
  });

  return result;
}

/**
 * Resume alertas de validade
 *
 * @param logs Array de logs
 * @returns Objeto com contagem de critical e expired
 */
export function summarizeExpiryAlerts(logs: InventoryLog[]) {
  return {
    critical: logs.filter((log) => log.isCriticalDate && !log.isExpired)
      .length,
    expired: logs.filter((log) => log.isExpired).length,
  };
}

/**
 * Calcula tendência de aderência entre dois períodos
 *
 * @param metricsCurrentPeriod Métricas do período atual
 * @param metricsPreviousPeriod Métricas do período anterior
 * @returns Objeto com tendência (positiva, neutra, negativa) e % de mudança
 */
export function calculateAdherenceTrend(
  metricsCurrentPeriod,
  metricsPreviousPeriod,
) {
  const current = metricsCurrentPeriod.adherencePercentage;
  const previous = metricsPreviousPeriod.adherencePercentage;
  const change = current - previous;
  const changePercent = ((change / previous) * 100).toFixed(1);

  return {
    current,
    previous,
    change: Math.round(change * 100) / 100,
    changePercent: parseFloat(changePercent),

    trend:
      change > 0.5
        ? 'improving'
        : change < -0.5
          ? 'declining'
          : 'stable',

    message: (() => {
      if (change > 0.5) {
        return `📈 Aderência melhorou ${change.toFixed(1)}% (${changePercent}% de crescimento)`;
      } else if (change < -0.5) {
        return `📉 Aderência piorou ${Math.abs(change).toFixed(1)}% (${Math.abs(parseFloat(changePercent))}% de queda)`;
      } else {
        return `➡️ Aderência mantida em ${current.toFixed(1)}%`;
      }
    })(),
  };
}

/**
 * Identifica áreas com pior desempenho
 *
 * Útil para alucar atenção gerencial
 *
 * @param metrics Métricas de aderência
 * @param topN Quantas piores áreas retornar (padrão: 3)
 * @returns Array de áreas ordenado por pior desempenho
 */
export function identifyLowPerformingAreas(
  metrics,
  topN: number = 3,
) {
  return Object.entries(metrics.byArea)
    .filter(([_, data]) => data.total > 0) // Apenas áreas com dados
    .sort((a, b) => a[1].percentage - b[1].percentage)
    .slice(0, topN)
    .map(([area, data]) => ({
      area: area,
      percentage: data.percentage,
      total: data.total,
      adherent: data.adherent,
      nonAdherent: data.total - data.adherent,
    }));
}

/**
 * Calcula score de saúde geral do armazém (0-100)
 *
 * Fórmula:
 * - Aderência ABC: peso 50%
 * - Ausência de vencidos: peso 30%
 * - Ausência de críticos: peso 20%
 *
 * @param metrics Métricas de aderência
 * @param totalLogs Total de logs no período (para cálculo de % críticos)
 * @returns Score 0-100
 */
export function calculateWarehouseHealthScore(
  metrics,
  totalLogs: number = metrics.totalCountings,
): number {
  const adherenceScore = (metrics.adherencePercentage / 100) * 50;

  const expiredPercentage = (metrics.expiryAlerts.expired / totalLogs) * 100;
  const criticalPercentage =
    (metrics.expiryAlerts.critical / totalLogs) * 100;

  const noExpiredScore = Math.max(0, 30 - expiredPercentage * 3);
  const noCriticalScore = Math.max(0, 20 - criticalPercentage * 1);

  return Math.round(adherenceScore + noExpiredScore + noCriticalScore);
}

/**
 * Gera recomendações baseadas em métricas
 *
 * @param metrics Métricas de aderência
 * @returns Array de recomendações em português
 */
export function generateRecommendations(
  metrics,
): string[] {
  const recommendations: string[] = [];

  // Aderência baixa
  if (metrics.adherencePercentage < 80) {
    const lowAreas = identifyLowPerformingAreas(metrics, 2);
    recommendations.push(
      `⚠️ Aderência baixa (${metrics.adherencePercentage.toFixed(1)}%). Áreas críticas: ${lowAreas.map((a) => a.area).join(', ')}`,
    );
  }

  // Produtos vencidos
  if (metrics.expiryAlerts.expired > 0) {
    recommendations.push(
      `🚫 ${metrics.expiryAlerts.expired} produto(s) vencido(s) — Segregar imediatamente`,
    );
  }

  // Produtos em data crítica
  if (metrics.expiryAlerts.critical > 0) {
    recommendations.push(
      `🔴 ${metrics.expiryAlerts.critical} produto(s) em data crítica — Priorizar saída`,
    );
  }

  // Sucesso
  if (recommendations.length === 0) {
    recommendations.push('✅ Operações dentro dos padrões esperados');
  }

  return recommendations;
}

/**
 * Exporta dados de aderência para formato CSV
 *
 * @param metrics Métricas de aderência
 * @returns String com conteúdo CSV
 */
export function exportMetricsToCSV(metrics) {
  const lines: string[] = [];

  // Cabeçalho
  lines.push('Relatório de Aderência de Estoque');
  lines.push(
    `Período: ${metrics.periodStart.toLocaleDateString('pt-BR')} a ${metrics.periodEnd.toLocaleDateString('pt-BR')}`,
  );
  lines.push('');

  // Resumo geral
  lines.push('RESUMO GERAL');
  lines.push(`Total de Contagens,${metrics.totalCountings}`);
  lines.push(`Contagens Aderentes,${metrics.totalAdherent}`);
  lines.push(`Aderência %,${metrics.adherencePercentage.toFixed(2)}`);
  lines.push('');

  // Por área
  lines.push('ADERÊNCIA POR ÁREA');
  lines.push('Área,Total,Aderentes,Percentual');
  Object.entries(metrics.byArea).forEach(([area, data]) => {
    if (data.total > 0) {
      lines.push(
        `${area},${data.total},${data.adherent},${data.percentage.toFixed(2)}%`,
      );
    }
  });
  lines.push('');

  // Por curva
  lines.push('ADERÊNCIA POR CURVA');
  lines.push('Curva,Total,Aderentes,Percentual');
  Object.entries(metrics.byCurve).forEach(([curve, data]) => {
    if (data.total > 0) {
      lines.push(
        `${curve},${data.total},${data.adherent},${data.percentage.toFixed(2)}%`,
      );
    }
  });
  lines.push('');

  // Alertas
  lines.push('ALERTAS DE VALIDADE');
  lines.push(`Produtos em Data Crítica,${metrics.expiryAlerts.critical}`);
  lines.push(`Produtos Vencidos,${metrics.expiryAlerts.expired}`);

  return lines.join('\n');
}
