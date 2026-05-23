/**
 * Espelho da `contagemConstants.js` do app mobile (`app-nri/src/utils/`).
 * Mantém alinhada a lista de Armazéns/Depósitos/Unidades entre web e mobile
 * pra a contagem de estoque/validade do conferente bater.
 */

export const ARMAZENS = [
  { codigo: '01', nome: 'Principal' },
];

export const DEPOSITOS = [
  { codigo: '01', nome: 'Central' },
  { codigo: '02', nome: 'Varejo' },
  { codigo: '03', nome: 'Analise' },
  { codigo: '04', nome: 'Terceiro' },
  { codigo: '05', nome: 'Faltas' },
  { codigo: '06', nome: 'Devolução' },
  { codigo: '08', nome: 'Vazio' },
  { codigo: '20', nome: 'Repack' },
  { codigo: '21', nome: 'Deposito B' },
  { codigo: '22', nome: 'PNC' },
  { codigo: '23', nome: 'Deposito D' },
];

export const labelArmazem  = (a) => a?.nome ? `${a.codigo} - ${a.nome}` : (a?.codigo || '');
export const labelDeposito = (d) => d?.nome ? `${d.codigo} - ${d.nome}` : (d?.codigo || '');

/** Filtra produtos por código (startsWith) OU descrição (includes). */
export function buscarProdutos(produtos, termo, limite = 10) {
  if (!termo || !termo.trim()) return [];
  const q = termo.trim().toLowerCase();
  return produtos
    .filter(p => {
      const cod = String(p.codigo || '').toLowerCase();
      const desc = String(p.descricao || p.nome || '').toLowerCase();
      return cod.startsWith(q) || desc.includes(q);
    })
    .slice(0, limite);
}
