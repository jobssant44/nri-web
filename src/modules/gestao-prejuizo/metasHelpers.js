/**
 * Helper compartilhado pra ler metas (R$/HL) cadastradas em
 * Gestão de Prejuízo → Cadastros.
 *
 * As metas ficam em coleções multi-tenant nested:
 *   /empresas/{empresaId}/prejuizo_meta_wqi/{rid}        — { valor }
 *   /empresas/{empresaId}/prejuizo_meta_troca/{rid}      — { valor }
 *   /empresas/{empresaId}/prejuizo_meta_reposicao/{rid}  — { valor }
 *
 * `{rid}` é o ID da revenda atual (ou 'global' se não houver revenda
 * selecionada). Padrão idêntico ao usado em `CadastrosPrejuizoPage`.
 *
 * Cada página (WQI, Troca, Reposição) lê o seu próprio coeficiente; se o
 * documento não existir, cai pro fallback histórico (compatível com o que
 * estava hardcoded antes deste cadastro).
 */
import { getDoc } from 'firebase/firestore';

// Defaults históricos (valores antigos hardcoded no código).
// Usados quando o admin ainda não cadastrou a meta no /cadastros.
export const META_PADRAO = {
  wqi:       0.50,  // R$ 0,50 por HL
  troca:     0.20,  // R$ 0,20 por HL
  reposicao: 0.20,  // R$ 0,20 por HL (mesma da Troca, ajustável via cadastro)
};

const COLECAO_POR_TIPO = {
  wqi:       'prejuizo_meta_wqi',
  troca:     'prejuizo_meta_troca',
  reposicao: 'prejuizo_meta_reposicao',
};

/**
 * Lê a meta de um dos 3 tipos. Aceita o `docRef` do useDb() pra ficar
 * compatível com multi-tenancy (rota /empresas/{id}/...).
 *
 * @param {('wqi'|'troca'|'reposicao')} tipo
 * @param {(colecao: string, docId: string) => DocumentReference} docRef
 * @param {string} rid ID da revenda (use o `rid` do useDb()). Fallback 'global'.
 * @returns {Promise<number>} valor em R$/HL
 */
export async function carregarMeta(tipo, docRef, rid) {
  const colecao = COLECAO_POR_TIPO[tipo];
  if (!colecao) throw new Error(`Tipo de meta inválido: ${tipo}`);
  const docId = rid || 'global';
  try {
    const snap = await getDoc(docRef(colecao, docId));
    if (snap.exists()) {
      const v = parseFloat(snap.data().valor);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch {
    // Silencia erro de leitura — cai no padrão.
  }
  return META_PADRAO[tipo];
}
