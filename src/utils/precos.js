/**
 * Helpers de leitura de preços (coleção `precos_produtos`).
 *
 * Regra (definida em 02/06/26):
 *   Sempre prioriza Preço 01. Se vazio/null, usa Preço 02. Se ambos
 *   vazios, retorna null (preço indisponível).
 *
 * Uso esperado:
 *   1. Telas que precisam de preço chamam `carregarPrecosMap({ col })` 1× no
 *      mount (ou usam Context com cache).
 *   2. Pra cada produto exibido: `getPrecoProduto(codigo, precosMap)`.
 *   3. Pra cálculos monetários: multiplica preço × quantidade.
 */
import { getDocs } from 'firebase/firestore';

/**
 * Retorna mapa { codigo: { preco01, preco02 } } pra todos os produtos com
 * preço cadastrado. Fonte: coleção `precos_produtos`.
 *
 * @param {Function} col — helper do useDb()
 * @returns {Promise<Object>} mapa codigo → { preco01, preco02 }
 */
export async function carregarPrecosMap({ col }) {
  const map = {};
  try {
    const snap = await getDocs(col('precos_produtos'));
    snap.docs.forEach(d => {
      const data = d.data();
      const codigo = String(data.codigo ?? d.id).trim();
      if (!codigo) return;
      map[codigo] = {
        preco01: data.preco01 != null ? Number(data.preco01) : null,
        preco02: data.preco02 != null ? Number(data.preco02) : null,
      };
    });
  } catch (e) {
    console.warn('[precos] erro ao carregar:', e?.message || e);
  }
  return map;
}

/**
 * Retorna o preço efetivo do produto seguindo a regra:
 *   - preco01 se existir
 *   - senão preco02 se existir
 *   - senão null
 *
 * @param {String} codigo     — código do produto
 * @param {Object} precosMap  — mapa retornado por carregarPrecosMap
 * @returns {Number|null}
 */
export function getPrecoProduto(codigo, precosMap) {
  if (!codigo || !precosMap) return null;
  const reg = precosMap[String(codigo).trim()];
  if (!reg) return null;
  if (reg.preco01 != null && Number.isFinite(reg.preco01)) return reg.preco01;
  if (reg.preco02 != null && Number.isFinite(reg.preco02)) return reg.preco02;
  return null;
}

/**
 * Variante que retorna { valor, origem } — útil quando você quer mostrar
 * pro usuário de onde veio o preço (Preço 01 ou Preço 02).
 *
 * @returns {{ valor: Number|null, origem: '01'|'02'|null }}
 */
export function getPrecoProdutoDetalhado(codigo, precosMap) {
  if (!codigo || !precosMap) return { valor: null, origem: null };
  const reg = precosMap[String(codigo).trim()];
  if (!reg) return { valor: null, origem: null };
  if (reg.preco01 != null && Number.isFinite(reg.preco01)) return { valor: reg.preco01, origem: '01' };
  if (reg.preco02 != null && Number.isFinite(reg.preco02)) return { valor: reg.preco02, origem: '02' };
  return { valor: null, origem: null };
}
