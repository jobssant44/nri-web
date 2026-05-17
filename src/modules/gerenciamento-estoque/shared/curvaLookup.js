/**
 * Helpers compartilhados para lookup de Curva ABC por produto/mês.
 *
 * Hierarquia da fonte da verdade:
 *  1. curva_abc_mensal/{rid_or_global}_{YYYY-MM}  → curva calculada no mês
 *  2. curva_abc (último import)                    → fallback "atual"
 */

import { getDoc, getDocs } from 'firebase/firestore';
import { calcularABC } from '../../../pages/curva-abc/ImportarRelatorio';

export function monthKey(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function nowYearMonth() {
  const d = new Date();
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

/**
 * Lê curva_abc_mensal/{prefixo}_{YYYY-MM} e roda calcularABC para devolver
 * um Map { codigo: 'A'|'B'|'C' }. Retorna null se o doc do mês não existir.
 *
 * Auto-discovery: se o doc esperado `{rid || 'global'}_{YYYY-MM}` não existir
 * (caso de empresas onde a revenda foi removida mas os dados antigos
 * permanecem sob outro prefixo — ex: CBB com `rev_1778665837324_*`),
 * varre a coleção curva_abc_mensal procurando QUALQUER doc cujo ID termine
 * com `_{YYYY-MM}` e usa o primeiro encontrado.
 */
export async function carregarMapaCurvaMensal({ docRefFn, colFn, rid, ano, mes }) {
  const sufixo = monthKey(ano, mes);
  const prefixo = rid || 'global';
  let snap = await getDoc(docRefFn('curva_abc_mensal', `${prefixo}_${sufixo}`));

  // Fallback: nenhum doc no prefixo esperado → procura por sufixo de mês
  if (!snap.exists() && typeof colFn === 'function') {
    try {
      const all = await getDocs(colFn('curva_abc_mensal'));
      const candidato = all.docs.find(d => d.id.endsWith(`_${sufixo}`));
      if (candidato) {
        snap = candidato;
        console.info(`[Curva ABC] Auto-discovery do mês ${sufixo}: usando doc "${candidato.id}".`);
      }
    } catch (e) {
      console.warn('[Curva ABC] Falha no auto-discovery de prefixo:', e.message);
    }
  }

  if (!snap.exists()) return null;
  const data = snap.data();
  if (!Array.isArray(data.produtos) || data.produtos.length === 0) return {};
  const classificados = calcularABC(data.produtos, 'cxTotal');
  const mapa = {};
  classificados.forEach(p => {
    if (p.codigo != null) mapa[String(p.codigo)] = p._curva || null;
  });
  return mapa;
}

/**
 * Fallback: lê a coleção curva_abc (último mês importado, achatado).
 */
export async function carregarMapaCurvaFallback({ colRevendaFn }) {
  const snap = await getDocs(colRevendaFn('curva_abc'));
  const mapa = {};
  snap.docs.forEach(d => {
    const { codigo, curva } = d.data();
    if (codigo != null) mapa[String(codigo)] = curva || null;
  });
  return mapa;
}

/**
 * Carrega o mapa do mês com fallback automático.
 * Retorna { mapa, origem } onde origem ∈ { 'mensal' | 'fallback' | 'vazio' }.
 *
 * IMPORTANTE: passe `colFn` para habilitar o auto-discovery de prefixo
 * (caso o doc esperado não exista mas existir outro com o mesmo mês).
 */
export async function carregarMapaCurvaComFallback({ docRefFn, colFn, colRevendaFn, rid, ano, mes }) {
  const mensal = await carregarMapaCurvaMensal({ docRefFn, colFn, rid, ano, mes });
  if (mensal && Object.keys(mensal).length > 0) {
    return { mapa: mensal, origem: 'mensal' };
  }
  const fallback = await carregarMapaCurvaFallback({ colRevendaFn });
  if (Object.keys(fallback).length > 0) {
    return { mapa: fallback, origem: 'fallback' };
  }
  return { mapa: {}, origem: 'vazio' };
}

/** Curva default quando um produto não está cadastrado na Curva ABC
 *  (regra da casa: trata como C, ou seja, baixíssimo giro). */
export const CURVA_PRODUTO_PADRAO = 'C';

/** Calcula aderência ABC entre curva do produto e curva do endereço.
 *  - Produto sem curva → assume 'C' (CURVA_PRODUTO_PADRAO).
 *  - Endereço sem curva → continua indeterminado (retorna null).
 */
export function calcularAderenteABC(curvaProduto, curvaEndereco) {
  if (!curvaEndereco) return null;
  const cp = (curvaProduto || CURVA_PRODUTO_PADRAO).toString().toUpperCase();
  return cp === String(curvaEndereco).toUpperCase();
}

/** Parseia o nome do arquivo de contagem retroativa.
 *  Aceita qualquer nome que contenha um padrão "DD.MM.YYYY" — antes ou depois
 *  pode ter qualquer texto (ex: "CBB.01.05.2026", "CBB.01.05.2026.SAIDA",
 *  "contagem-CBB.01.05.2026-v2").
 *  Retorna { data: Date, ano, mes, dia, mesNum, prefixo } ou null.
 */
export function parsearDataDoNomeArquivo(fileName) {
  if (!fileName) return null;
  const limpo = fileName.replace(/\.(xlsx|xls|csv)$/i, '');
  const match = limpo.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  const [, ddStr, mmStr, yyyyStr] = match;
  const dia = parseInt(ddStr, 10);
  const mes = parseInt(mmStr, 10);
  const ano = parseInt(yyyyStr, 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(ano, mes - 1, dia);
  if (data.getDate() !== dia || data.getMonth() !== mes - 1 || data.getFullYear() !== ano) return null;
  // Prefixo = tudo antes do padrão de data (pode ser vazio)
  const prefixo = limpo.slice(0, match.index).replace(/[.\-_]$/, '');
  return { data, ano, mes, mesNum: mes, dia, prefixo };
}
