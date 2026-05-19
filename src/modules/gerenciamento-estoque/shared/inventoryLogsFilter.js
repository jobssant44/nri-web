/**
 * Filtro compartilhado para inventory_logs.
 *
 * Estratégia de soft delete: linhas marcadas com `excluido: true` no Firestore
 * NUNCA aparecem em nenhuma tela da aplicação. O usuário marca via UI da
 * AdherenceABCDashboard ("Detalhe das contagens" → checkboxes → Excluir).
 *
 * Para resgatar uma linha excluída por engano, é necessário rodar um script
 * via firebase-admin SDK que faça `updateDoc(..., { excluido: false })`.
 * Não há toggle na UI por design — auditoria não pode saber que existe
 * histórico de exclusões.
 */

/**
 * Devolve true se o log foi marcado como soft-deleted.
 */
export function isLogExcluido(log) {
  return log?.excluido === true;
}

/**
 * Filtra um array de logs removendo os marcados como excluídos.
 * Use em TODA tela/módulo que lê `inventory_logs`.
 */
export function filtrarLogsAtivos(logs) {
  if (!Array.isArray(logs)) return [];
  return logs.filter(l => !isLogExcluido(l));
}
