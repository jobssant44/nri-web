/**
 * Helpers de leitura de preços (coleção `precos_produtos`).
 *
 * Formato (11/07/26): cada produto tem DOIS preços — por caixa e por unidade.
 * O preço aplicado depende da UNIDADE da linha do relatório (03.02.37, col Q):
 *   - "cx" / "caixa"    → precoCaixa
 *   - "un" / "unidade"  → precoUnidade
 *   - qualquer outro / em branco / preço da unidade ausente → fallback
 *     (mantém o valor que já veio do próprio relatório)
 *
 * Uso esperado:
 *   1. carregarPrecosMap({ col }) 1× no mount (ou via cache).
 *   2. Cálculo por linha do 03.02.37: aplicarPrecoCadastrado(linha, map, parseNum).
 *   3. Preço avulso (ex.: FEFO, sempre em caixa): getPrecoProduto(cod, map, 'caixa').
 */
import { getDocs } from 'firebase/firestore';

/**
 * Normaliza a unidade da linha do relatório → 'caixa' | 'unidade' | null.
 * Só reconhece cx/caixa e un/unidade (case-insensitive). Qualquer outra coisa
 * (ou em branco) vira null → cai no fallback (valor do relatório).
 */
export function normalizarUnidade(u) {
  const s = String(u ?? '').trim().toLowerCase();
  if (s === 'cx' || s === 'caixa')   return 'caixa';
  if (s === 'un' || s === 'unidade') return 'unidade';
  return null;
}

/**
 * Retorna mapa { codigo: { precoCaixa, precoUnidade, descricao } } pra todos os
 * produtos com preço cadastrado. Fonte: coleção `precos_produtos`.
 *
 * @param {Function} col — helper do useDb()
 * @returns {Promise<Object>} mapa codigo → { precoCaixa, precoUnidade, descricao }
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
        precoCaixa:   data.precoCaixa   != null ? Number(data.precoCaixa)   : null,
        precoUnidade: data.precoUnidade != null ? Number(data.precoUnidade) : null,
        descricao:    data.descricao ?? '',
      };
    });
  } catch (e) {
    console.warn('[precos] erro ao carregar:', e?.message || e);
  }
  return map;
}

/**
 * Preço de um registro { precoCaixa, precoUnidade } pra uma unidade normalizada
 * ('caixa' | 'unidade'). Retorna o preço aplicável ou null (unidade não
 * reconhecida ou preço daquela unidade em branco → fallback).
 */
function precoDaUnidade(reg, unidadeNorm) {
  if (!reg || !unidadeNorm) return null;
  const p = unidadeNorm === 'caixa' ? reg.precoCaixa : reg.precoUnidade;
  return (p != null && Number.isFinite(p)) ? p : null;
}

/**
 * Retorna o preço efetivo do produto pra uma unidade (default 'caixa').
 * Aceita a unidade normalizada ('caixa'/'unidade') ou o valor bruto do relatório
 * ('cx'/'Un'). Retorna null se não houver preço aplicável.
 *
 * @param {String} codigo
 * @param {Object} precosMap  — mapa de carregarPrecosMap
 * @param {String} [unidade='caixa']
 * @returns {Number|null}
 */
export function getPrecoProduto(codigo, precosMap, unidade = 'caixa') {
  if (!codigo || !precosMap) return null;
  const reg = precosMap[String(codigo).trim()];
  if (!reg) return null;
  const norm = (unidade === 'caixa' || unidade === 'unidade') ? unidade : normalizarUnidade(unidade);
  return precoDaUnidade(reg, norm);
}

/**
 * Sobrescreve `linha.valor` com `qtde × preço cadastrado` quando o produto
 * existe em `precos_produtos` E há preço pra unidade daquela linha. Senão,
 * mantém o `linha.valor` que já veio do relatório (03.02.37) como fallback.
 *
 * A unidade vem de `linha.unidade` (coluna Q do 03.02.37): "cx"→precoCaixa,
 * "Un"→precoUnidade. Regra confirmada pelo user (11/07/26): unidade não
 * reconhecida OU preço daquela unidade em branco → usa o valor do relatório.
 *
 * Marca a linha com `_temPrecoCadastrado: true`, `_unidadePreco` e guarda o
 * valor original em `_valorOriginal`. O `linha.valor` passa a ser o recalculado,
 * então o resto do código (parseNum(l.valor) em KPIs/gráficos) segue igual.
 *
 * @param {Object}   linha       — linha do relatorio_030237.linhas[]
 * @param {Object}   precosMap   — mapa carregado por carregarPrecosMap
 * @param {Function} parseNumFn  — função parseNum local da página (formato BR)
 * @returns {Object} a mesma linha (fallback) ou cópia com valor recalculado
 */
export function aplicarPrecoCadastrado(linha, precosMap, parseNumFn) {
  if (!linha || !precosMap) return linha;
  const codigo = linha.produto || linha.codProduto;
  if (!codigo) return linha;
  const reg = precosMap[String(codigo).trim()];
  if (!reg) return linha;                                   // produto sem preço cadastrado
  const unidadeNorm = normalizarUnidade(linha.unidade);
  const precoUnit = precoDaUnidade(reg, unidadeNorm);
  if (precoUnit == null) return linha;                      // unidade desconhecida ou preço em branco → valor do relatório
  const qtde = parseNumFn(linha.qtde);
  if (!Number.isFinite(qtde) || qtde <= 0) return linha;    // sem qtde válida, mantém original
  return {
    ...linha,
    _valorOriginal:      linha.valor,
    _temPrecoCadastrado: true,
    _unidadePreco:       unidadeNorm,
    valor:               qtde * precoUnit,
  };
}
