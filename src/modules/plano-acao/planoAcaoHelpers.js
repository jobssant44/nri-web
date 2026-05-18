/**
 * Helpers do módulo Plano de Ação.
 *
 * Gera ações concretas a partir de contagens não-aderentes da Curva ABC.
 * Cada ação carrega o texto humano + os campos brutos (código, rua, curvas),
 * pra UI poder filtrar/agregar e o usuário ter contexto completo.
 */
import { CURVA_PRODUTO_PADRAO } from '../gerenciamento-estoque/shared/curvaLookup';

// ─── Templates de redação consolidada ──────────────────────────────────────
// O plano vira UMA ação por contagem com texto introdutório + lista de itens.
// 5 variações de introdução pra não ficar monótono entre planos.
const TEMPLATES_INTRO = [
  'Movimentar os {qtd} produtos abaixo para ruas condizentes com a Curva ABC de cada um.',
  'Realocar os {qtd} produtos listados a seguir, ajustando-os à classificação ABC.',
  'Transferir os {qtd} itens abaixo para ruas adequadas conforme suas Curvas ABC.',
  'Ajustar a posição dos {qtd} produtos a seguir, conforme a Curva ABC de cada SKU.',
  'Reposicionar os {qtd} produtos da lista abaixo conforme a classificação ABC.',
];

function preencherTemplate(template, dados) {
  return template.replace(/\{(\w+)\}/g, (_, chave) => dados[chave] ?? '—');
}

function sortearTemplate() {
  return TEMPLATES_INTRO[Math.floor(Math.random() * TEMPLATES_INTRO.length)];
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
 * Recebe os inventory_logs de UMA data de contagem e devolve UMA ação
 * consolidada com a lista de itens não-aderentes (excluindo PNC).
 *
 * @param {Array}  logs        - inventory_logs da contagem
 * @param {Object} produtosMap - { codigo: descricao } pra enriquecer o texto
 * @returns {Array} array com 0 ou 1 ação (0 = nada a fazer; 1 = ação consolidada)
 */
export function gerarAcoesDaContagem(logs, produtosMap = {}) {
  const itens = [];

  logs.forEach(log => {
    if (isPNC(log)) return;
    const curvaProd = curvaEfetiva(log);
    const curvaEnd  = log.enderecoCurva;
    if (!curvaEnd) return;
    if (curvaProd === curvaEnd) return;

    const codigo = String(log.productCode || '').trim();
    const nome   = produtosMap[codigo] || log.productName || '';
    const ruaAtual = log.endereco || '—';

    itens.push({
      produtoCodigo: codigo,
      produtoNome:   nome,
      ruaAtual,
      curvaEnderecoAtual: curvaEnd,
      curvaProduto: curvaProd,
    });
  });

  if (itens.length === 0) return [];

  // Texto introdutório aleatório (5 variações) + qtd
  const intro = preencherTemplate(sortearTemplate(), { qtd: itens.length });

  return [{
    id: `acao_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    texto: intro,
    itens,
    totalItens: itens.length,
    status: 'pendente', // pendente | concluida | ineficaz
    observacao: '',
    executadoEm: null,
    executadoPor: null,
  }];
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
