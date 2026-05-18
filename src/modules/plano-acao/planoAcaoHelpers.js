/**
 * Helpers do módulo Plano de Ação.
 *
 * Gera ações concretas a partir de contagens não-aderentes da Curva ABC.
 * Cada ação carrega o texto humano + os campos brutos (código, rua, curvas),
 * pra UI poder filtrar/agregar e o usuário ter contexto completo.
 *
 * Regras de redação:
 *   1. Cada CÓDIGO aparece uma única vez no texto (mesmo que tenha sido contado
 *      em várias ruas) — a tabela de detalhe ainda mostra todas as ocorrências.
 *   2. Os endereços "contados em" também são deduplicados.
 *   3. Ruas destino recomendadas:
 *      - Preferência: ruas da curva/área destino que NÃO tiveram contagem na
 *        data (= candidatas a "vazias").
 *      - Fallback: se não houver vazias, ranqueia as ruas da mesma curva/área
 *        por SOMA de caixas contadas (asc) e pega top `ceil(codigos/3)`,
 *        mínimo 3. O texto fica idêntico — operador não vê diferença.
 *   4. Produtos contados no PICKING (endereço começa com 'P') só podem ir pra
 *      outras ruas de PICKING da mesma curva. Se não houver NENHUMA rua P de
 *      destino disponível (nem vazia, nem no ranking), o item é IGNORADO
 *      silenciosamente — não vira ação e não aparece em nenhum lugar da UI.
 *   5. Endereços M* (Marketplace) NUNCA são sugeridos como destino, mesmo que
 *      estejam vazios. Origens M continuam valendo — só a recomendação muda.
 *   6. Limite de 250 caracteres por ação (limite do sistema externo). Se
 *      ultrapassar, dividimos em ações sequenciais cobrindo todos os produtos.
 */
import { CURVA_PRODUTO_PADRAO } from '../gerenciamento-estoque/shared/curvaLookup';

// ─── Configuração de quebra ────────────────────────────────────────────────
const LIMITE_CHARS_ACAO = 250;
const MARGEM_SEGURANCA  = 20;  // espaço pra arredondar / pontuação extra
const ALVO_CHARS        = LIMITE_CHARS_ACAO - MARGEM_SEGURANCA; // 230

// ─── Templates de redação ──────────────────────────────────────────────────
// Variações pra não ficar monótono entre planos. Todas usam o mesmo esqueleto.
const TEMPLATES_INTRO = [
  'Transferir {codigos} (contados em {ruasAtuais}) para ruas {ruasDestino} conforme layout ABC.',
  'Movimentar {codigos} (contados em {ruasAtuais}) para ruas {ruasDestino} conforme layout ABC.',
  'Realocar {codigos} (contados em {ruasAtuais}) para ruas {ruasDestino} conforme layout ABC.',
  'Reposicionar {codigos} (contados em {ruasAtuais}) para ruas {ruasDestino} conforme layout ABC.',
  'Ajustar {codigos} (contados em {ruasAtuais}) para ruas {ruasDestino} conforme layout ABC.',
  'Mover {codigos} (contados em {ruasAtuais}) para ruas {ruasDestino} conforme layout ABC.',
  'Reorganizar {codigos} (contados em {ruasAtuais}) nas ruas {ruasDestino} conforme layout ABC.',
  'Redistribuir {codigos} (contados em {ruasAtuais}) nas ruas {ruasDestino} conforme layout ABC.',
  'Recolocar {codigos} (contados em {ruasAtuais}) nas ruas {ruasDestino} conforme layout ABC.',
  'Deslocar {codigos} (contados em {ruasAtuais}) para ruas {ruasDestino} conforme layout ABC.',
  'Reordenar {codigos} (contados em {ruasAtuais}) nas ruas {ruasDestino} conforme layout ABC.',
  'Trocar de posição {codigos} (contados em {ruasAtuais}) realocando para {ruasDestino} conforme layout ABC.',
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

// ─── Área do endereço (PICKING vs ESTOQUE) ────────────────────────────────
// Convenção: endereço que começa com 'P' (ex: P77, P84) é PICKING. Qualquer
// outro prefixo (A, B, C, etc.) é considerado ESTOQUE. Produtos não trocam
// entre áreas — quem está no Picking continua no Picking.
const AREA_PICKING = 'P';
const AREA_ESTOQUE = 'E';

export function areaDoEndereco(endereco) {
  const primeira = String(endereco || '').trim().toUpperCase().charAt(0);
  return primeira === 'P' ? AREA_PICKING : AREA_ESTOQUE;
}

function chaveGrupo(curva, area) {
  return `${curva}_${area}`;
}

// Endereços com esses prefixos NUNCA são sugeridos como destino, mesmo que
// estejam vazios ou pouco ocupados. (M = Marketplace, transitional.)
// Origens com esses prefixos continuam valendo — se um produto está em M e
// não é aderente, ainda viramos uma ação, só o destino é noutro lugar.
const PREFIXOS_PROIBIDOS_DESTINO = ['M'];

function ehDestinoProibido(endereco) {
  const primeira = String(endereco || '').trim().toUpperCase().charAt(0);
  return PREFIXOS_PROIBIDOS_DESTINO.includes(primeira);
}

// ─── Cálculo das ruas disponíveis (vazias) por grupo ──────────────────────
/**
 * A partir dos docs de `locations_mensal` (já filtrados pelo mês da contagem)
 * e do conjunto de endereços que tiveram contagem na data, devolve um mapa
 *
 *     { 'A_E': [...ruas vazias do Estoque curva A...],
 *       'A_P': [...ruas vazias do Picking curva A...],
 *       'B_E': [...], 'C_E': [...], 'C_P': [...] }
 *
 * "Vaga" = endereço cadastrado no layout do mês que NÃO aparece em nenhum log
 * da data (= heurística: não foi contado, logo provavelmente não tem nada).
 */
export function calcularRuasDisponiveisPorGrupo(locationsMensal = [], enderecosContados = new Set()) {
  const contadosUpper = new Set(
    Array.from(enderecosContados).map(e => String(e || '').trim().toUpperCase()).filter(Boolean)
  );

  const map = {};
  locationsMensal.forEach(loc => {
    const curva = String(loc.curva || '').trim().toUpperCase();
    const end   = String(loc.endereco || '').trim().toUpperCase();
    if (!curva || !end) return;
    if (contadosUpper.has(end)) return;    // tem contagem registrada → não está vazio
    if (ehDestinoProibido(end)) return;    // prefixos M etc. nunca são destino

    const area  = areaDoEndereco(end);
    const chave = chaveGrupo(curva, area);
    if (!map[chave]) map[chave] = new Set();
    map[chave].add(end);
  });

  const out = {};
  Object.keys(map).forEach(chave => {
    out[chave] = Array.from(map[chave])
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  });
  return out;
}

// ─── Ranking de ocupação por grupo (fallback) ─────────────────────────────
/**
 * Soma a `quantidade` dos logs por endereço e devolve um mapa
 *
 *     { 'A_E': [{ endereco, caixas }, ...] // ordenadas por caixas asc,
 *       'C_P': [...], ... }
 *
 * Cobre apenas endereços que aparecem no layout do mês (`locations_mensal`).
 * Endereços com contagens mas sem cadastro são ignorados (não dá pra
 * recomendar uma rua que nem está no layout).
 *
 * Premissa: hoje todos os lançamentos são em CAIXAS, então `log.quantidade`
 * pode ser somado direto sem conversão de unidade.
 */
export function calcularRankingOcupacaoPorGrupo(logs = [], locationsMensal = []) {
  // 1. Soma quantidade por endereço (em caixas)
  const caixasPorRua = {};
  logs.forEach(log => {
    const end = String(log.endereco || '').trim().toUpperCase();
    if (!end) return;
    const qtd = parseFloat(log.quantidade) || 0;
    caixasPorRua[end] = (caixasPorRua[end] || 0) + qtd;
  });

  // 2. Anexa ocupação a cada endereço do layout, agrupado por (curva, área).
  //    Endereços M (Marketplace) e outros prefixos proibidos como destino
  //    são ignorados — não podem entrar nem no ranking de fallback.
  const grupos = {};
  locationsMensal.forEach(loc => {
    const curva = String(loc.curva || '').trim().toUpperCase();
    const end   = String(loc.endereco || '').trim().toUpperCase();
    if (!curva || !end) return;
    if (ehDestinoProibido(end)) return;
    const area  = areaDoEndereco(end);
    const chave = chaveGrupo(curva, area);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push({
      endereco: end,
      caixas: caixasPorRua[end] || 0,
    });
  });

  // 3. Ordena cada grupo por caixas asc (e endereço asc como desempate)
  const out = {};
  Object.keys(grupos).forEach(chave => {
    out[chave] = grupos[chave]
      .sort((a, b) =>
        (a.caixas - b.caixas) ||
        a.endereco.localeCompare(b.endereco, 'pt-BR', { numeric: true })
      );
  });
  return out;
}

/** Quantas ruas recomendar no fallback, dado o nº de códigos únicos. */
function qtdRuasFallback(qtdCodigosUnicos) {
  return Math.max(3, Math.ceil(qtdCodigosUnicos / 3));
}

// ─── Geração das ações ─────────────────────────────────────────────────────
/**
 * Recebe os inventory_logs de UMA data de contagem e devolve uma OU MAIS ações.
 *
 *  - Agrupa os itens não-aderentes (excluindo PNC) por (curva destino, área).
 *  - Para cada grupo, lista as ruas vazias daquela curva+área como destino.
 *  - Códigos e endereços de origem são deduplicados no texto.
 *  - Se o texto estourar 250 chars, quebra em ações sequenciais.
 *
 * @param {Array}  logs            - inventory_logs da contagem (todos, não só não-aderentes)
 * @param {Object} produtosMap     - { codigo: descricao } para a UI
 * @param {Array}  locationsMensal - docs de locations_mensal do mês da contagem
 * @returns {Array} array com 0..N ações
 */
export function gerarAcoesDaContagem(logs, produtosMap = {}, locationsMensal = []) {
  // 1. Coleta itens não-aderentes
  const itens = [];
  logs.forEach(log => {
    if (isPNC(log)) return;
    const curvaProd = curvaEfetiva(log);
    const curvaEnd  = log.enderecoCurva;
    if (!curvaEnd) return;
    if (curvaProd === curvaEnd) return;

    const codigo   = String(log.productCode || '').trim();
    const nome     = produtosMap[codigo] || log.productName || '';
    const ruaAtual = log.endereco || '—';

    itens.push({
      produtoCodigo: codigo,
      produtoNome:   nome,
      ruaAtual,
      curvaEnderecoAtual: curvaEnd,
      curvaProduto: curvaProd,
      areaAtual: areaDoEndereco(ruaAtual),
    });
  });

  if (itens.length === 0) return [];

  // 2. Endereços contados na data inteira (pra filtrar ruas "vazias")
  //    Aqui usamos TODOS os logs (aderentes + não-aderentes), porque qualquer
  //    rua com produto contado não está disponível.
  const enderecosContados = new Set(
    logs.map(l => String(l.endereco || '').trim().toUpperCase()).filter(Boolean)
  );

  // 3. Mapa de ruas vazias por grupo (preferência) e ranking de ocupação (fallback)
  const ruasVaziasPorGrupo   = calcularRuasDisponiveisPorGrupo(locationsMensal, enderecosContados);
  const rankingOcupPorGrupo  = calcularRankingOcupacaoPorGrupo(logs, locationsMensal);

  // 4. Agrupa itens por (curva destino, área destino).
  //    A área destino é a MESMA da área de origem (Picking continua em Picking,
  //    Estoque continua em Estoque).
  const grupos = {};
  itens.forEach(it => {
    const curvaDestino = it.curvaProduto || CURVA_PRODUTO_PADRAO;
    const areaDestino  = it.areaAtual;
    const chave = chaveGrupo(curvaDestino, areaDestino);
    if (!grupos[chave]) {
      grupos[chave] = { curvaDestino, areaDestino, itens: [] };
    }
    grupos[chave].itens.push(it);
  });

  // 5. Para cada grupo, escolhe ruas destino + gera 1+ ações respeitando 250 chars
  const templateBase = sortearTemplate();
  const acoes = [];

  Object.keys(grupos).sort().forEach(chave => {
    const grupo = grupos[chave];

    // Tenta ruas vazias primeiro
    let ruasDestino = ruasVaziasPorGrupo[chave] || [];

    // Fallback: ranking das menos ocupadas
    if (ruasDestino.length === 0) {
      const codigosUnicosNoGrupo = new Set(grupo.itens.map(i => i.produtoCodigo)).size;
      const qtdDesejada = qtdRuasFallback(codigosUnicosNoGrupo);
      const ranking = rankingOcupPorGrupo[chave] || [];
      ruasDestino = ranking.slice(0, qtdDesejada).map(r => r.endereco);
    }

    // Regra do Picking: se mesmo no fallback não houver destino, ignora o grupo
    // silenciosamente — produto Picking não vaza pra Estoque, então é melhor
    // omitir do plano do que gerar ação sem para onde apontar.
    if (ruasDestino.length === 0 && grupo.areaDestino === AREA_PICKING) {
      return;
    }

    const fragmentos = quebrarItensPorLimite(grupo.itens, templateBase, ruasDestino);

    fragmentos.forEach(frag => {
      acoes.push({
        id: `acao_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        texto: frag.texto,
        itens: frag.itens,
        totalItens: frag.itens.length,
        curvaDestino: grupo.curvaDestino,
        areaDestino:  grupo.areaDestino,
        ruasDisponiveis: ruasDestino,
        totalRuasDisponiveis: ruasDestino.length,
        status: 'pendente',
        observacao: '',
        executadoEm: null,
        executadoPor: null,
      });
    });
  });

  return acoes;
}

// ─── Quebra de fragmentos respeitando ALVO_CHARS ──────────────────────────
function listarUnicos(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

/**
 * Monta a string "ruasDestino" pra caber em `espacoMax` chars.
 * - Se a lista inteira couber: lista tudo.
 * - Senão: lista as primeiras que couberem e adiciona "(+ N disponíveis)".
 * - Se a lista estiver vazia: devolve placeholder "(sem ruas vazias)".
 */
function montarRuasDestino(ruasDisp, espacoMax) {
  if (!ruasDisp || ruasDisp.length === 0) return '(sem ruas vazias no layout do mês)';

  const tudo = ruasDisp.join(', ');
  if (tudo.length <= espacoMax) return tudo;

  let acumulado = '';
  for (let i = 0; i < ruasDisp.length; i++) {
    const proxima = acumulado ? `${acumulado}, ${ruasDisp[i]}` : ruasDisp[i];
    const restantesSeFechar = ruasDisp.length - i - 1;
    const sufixo = restantesSeFechar > 0 ? ` (+ ${restantesSeFechar} disponíveis)` : '';
    if ((proxima + sufixo).length > espacoMax) {
      if (acumulado === '') {
        // Nem 1 rua coube: devolve a primeira com sufixo (estoura, mas é o melhor possível)
        return `${ruasDisp[0]} (+ ${ruasDisp.length - 1} disponíveis)`;
      }
      const restantes = ruasDisp.length - i;
      return `${acumulado} (+ ${restantes} disponíveis)`;
    }
    acumulado = proxima;
  }
  return acumulado;
}

function quebrarItensPorLimite(itens, template, ruasDisp) {
  function montarTexto(buffer) {
    const codigosUnicos    = listarUnicos(buffer.map(i => i.produtoCodigo));
    const ruasAtuaisUnicas = listarUnicos(buffer.map(i => i.ruaAtual));
    const codigos    = codigosUnicos.join(', ');
    const ruasAtuais = ruasAtuaisUnicas.join(', ');

    // Calcula o espaço livre pro campo {ruasDestino}: monta o template com
    // um placeholder e mede o tamanho da "casca" (tudo menos o campo).
    const PLACEHOLDER = '__RUAS__';
    const comPlaceholder = preencherTemplate(template, {
      codigos, ruasAtuais, ruasDestino: PLACEHOLDER,
    });
    const tamanhoSemRuas = comPlaceholder.length - PLACEHOLDER.length;
    const espacoLivre    = Math.max(20, ALVO_CHARS - tamanhoSemRuas);

    const ruasDestino = montarRuasDestino(ruasDisp, espacoLivre);

    return preencherTemplate(template, { codigos, ruasAtuais, ruasDestino });
  }

  const fragmentos = [];
  let buffer = [];

  for (let i = 0; i < itens.length; i++) {
    const tentativa = [...buffer, itens[i]];
    const textoTentativa = montarTexto(tentativa);

    if (textoTentativa.length > ALVO_CHARS && buffer.length > 0) {
      fragmentos.push({ itens: buffer.slice(), texto: montarTexto(buffer) });
      buffer = [itens[i]];
    } else {
      buffer.push(itens[i]);
    }
  }
  if (buffer.length > 0) {
    fragmentos.push({ itens: buffer.slice(), texto: montarTexto(buffer) });
  }
  return fragmentos;
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
