/**
 * Helpers do módulo Plano de Ação.
 *
 * Gera ações concretas a partir de contagens não-aderentes da Curva ABC.
 * Cada ação carrega o texto humano + os campos brutos (código, rua, curvas),
 * pra UI poder filtrar/agregar e o usuário ter contexto completo.
 */
import { CURVA_PRODUTO_PADRAO } from '../gerenciamento-estoque/shared/curvaLookup';

// ─── Templates de redação ──────────────────────────────────────────────────
// 5 variações pra não ficar monótono. O placeholder usa {chaves}.
const TEMPLATES_ABC = [
  'Movimentar o produto {codigo} - {nome} que foi contado na rua {ruaAtual} (Curva {curvaEnd}) para uma rua de Curva {curvaProd}, conforme a classificação do produto.',
  'Realocar o produto {codigo} - {nome} da rua {ruaAtual} para uma área de Curva {curvaProd}. Atualmente ele está em rua de Curva {curvaEnd}, fora do layout.',
  'Transferir o item {codigo} ({nome}), que se encontra na rua {ruaAtual}, para uma rua condizente com sua Curva {curvaProd}.',
  'Ajustar a posição do produto {codigo} - {nome}: hoje armazenado em rua de Curva {curvaEnd} ({ruaAtual}), deveria estar em rua de Curva {curvaProd}.',
  'Reposicionar {codigo} - {nome} para uma rua de Curva {curvaProd}. Localização atual ({ruaAtual}) está classificada como Curva {curvaEnd}.',
];

function preencherTemplate(template, dados) {
  return template.replace(/\{(\w+)\}/g, (_, chave) => dados[chave] ?? '—');
}

function sortear(arr, indicePref) {
  if (indicePref != null && arr[indicePref]) return arr[indicePref];
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Identificação de PNC ──────────────────────────────────────────────────
// Mesmo critério usado no Dashboard de Aderência ABC.
export function isPNC(log) {
  if (log.localArquivo === 'PNC') return true;
  const end = String(log.endereco || '').trim().toUpperCase();
  return end.startsWith('PN');
}

export function curvaEfetiva(log) {
  return log.productCurva || CURVA_PRODUTO_PADRAO;
}

/**
 * Recebe os inventory_logs de UMA data de contagem e devolve as ações
 * que devem entrar no plano (apenas dos logs não-aderentes, excluindo PNC).
 *
 * @param {Array}  logs        - inventory_logs da contagem
 * @param {Object} produtosMap - { codigo: descricao } pra enriquecer o texto
 * @returns {Array} ações prontas: { texto, produtoCodigo, produtoNome,
 *                                   ruaAtual, curvaEnderecoAtual, curvaProduto,
 *                                   status, observacao, criadoEm }
 */
export function gerarAcoesDaContagem(logs, produtosMap = {}) {
  const acoes = [];
  // Reset do índice de template em cada contagem pra ciclar uniformemente
  let indiceTemplate = 0;

  logs.forEach(log => {
    if (isPNC(log)) return;
    const curvaProd = curvaEfetiva(log);
    const curvaEnd  = log.enderecoCurva;
    if (!curvaEnd) return;                       // sem curva do endereço → indeterminado, não age
    if (curvaProd === curvaEnd) return;          // aderente, sem ação

    const codigo = String(log.productCode || '').trim();
    const nome   = produtosMap[codigo] || log.productName || '';
    const ruaAtual = log.endereco || '—';

    // Cicla os 5 templates pra dar variedade dentro do mesmo plano
    const template = sortear(TEMPLATES_ABC, indiceTemplate % TEMPLATES_ABC.length);
    indiceTemplate++;

    const texto = preencherTemplate(template, {
      codigo,
      nome: nome || '(sem descrição)',
      ruaAtual,
      curvaEnd,
      curvaProd,
    });

    acoes.push({
      id: `acao_${codigo}_${ruaAtual}_${Math.random().toString(36).slice(2, 8)}`,
      texto,
      produtoCodigo: codigo,
      produtoNome:   nome,
      ruaAtual,
      curvaEnderecoAtual: curvaEnd,
      curvaProduto: curvaProd,
      status: 'pendente', // pendente | concluida | ineficaz
      observacao: '',
      executadoEm: null,
      executadoPor: null,
    });
  });

  return acoes;
}

/** Agrega status do plano a partir do array de ações. */
export function calcularStatusPlano(acoes) {
  const total       = acoes.length;
  const concluidas  = acoes.filter(a => a.status === 'concluida').length;
  const ineficazes  = acoes.filter(a => a.status === 'ineficaz').length;
  const pendentes   = total - concluidas - ineficazes;
  const status = pendentes > 0 ? 'aberto' : 'concluido';
  const percConcluidas = total > 0 ? Math.round((concluidas / total) * 100) : 0;
  return { total, concluidas, ineficazes, pendentes, status, percConcluidas };
}

/** Formata date BR. */
export function fmtData(d) {
  if (!d) return '—';
  if (d.toDate) d = d.toDate();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function fmtDataHora(d) {
  if (!d) return '—';
  if (d.toDate) d = d.toDate();
  return `${fmtData(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
