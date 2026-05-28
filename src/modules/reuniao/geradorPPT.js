/**
 * Orquestrador da geração do PowerPoint da Reunião.
 *
 * Recebe a lista de módulos a incluir + quais blocos de cada módulo + período +
 * deps de DB. Cria a instância PptxGenJS, adiciona capa principal + sumário,
 * e itera pelos módulos chamando os blocos selecionados.
 *
 * Cada módulo expõe:
 *   { key, label, cor, buscarDados(opts, onProgress) → dados,
 *     blocos: { blocoKey: { label, padrao, exportar(pptx, dados) } } }
 *
 * O orquestrador chama `buscarDados()` UMA vez por módulo (mesmo que o user
 * selecione 5 blocos) — eficiente em quota Firestore.
 */
import PptxGenJS from 'pptxgenjs';
import {
  adicionarCapaPrincipal,
  adicionarSumario,
  formatarPeriodoBR,
  dataHoraAtualBR,
} from './templates';
import { wqiModulo }       from './modulos/wqi';
import { trocaModulo }     from './modulos/troca';
import { reposicaoModulo } from './modulos/reposicao';
import { fefoModulo }      from './modulos/fefo';
import { curvaABCModulo }  from './modulos/curva_abc';
import { reabModulo }      from './modulos/reab';
import { tmaModulo }       from './modulos/tma';
import { mpdModulo }       from './modulos/mpd';

// Registry de todos os módulos disponíveis pra reunião.
// Pra desabilitar um módulo (ex.: empresa não usa), basta setar `disponivel: false`.
export const MODULOS_DISPONIVEIS = [
  { ...wqiModulo,       disponivel: true },
  { ...trocaModulo,     disponivel: true },
  { ...reposicaoModulo, disponivel: true },
  { ...fefoModulo,      disponivel: true },
  { ...curvaABCModulo,  disponivel: true },
  { ...reabModulo,      disponivel: true },
  { ...tmaModulo,       disponivel: true },
  { ...mpdModulo,       disponivel: true },
];

/**
 * Helper: retorna os blocos default de um módulo (todos com `padrao: true`).
 */
export function blocosDefault(modulo) {
  return Object.entries(modulo.blocos || {})
    .filter(([, b]) => b.padrao)
    .map(([k]) => k);
}

/**
 * Gera o .pptx e força download.
 *
 * @param {Object} params
 * @param {Object} params.selecao - { [moduloKey]: string[] } — pra cada módulo, lista de blocoKeys ativos
 * @param {string} params.dataInicio - ISO 'YYYY-MM-DD'
 * @param {string} params.dataFim    - ISO 'YYYY-MM-DD'
 * @param {Object} params.deps       - { col, colRevenda, docRef, rid } do useDb()
 * @param {string} [params.empresa]
 * @param {Function} [params.onProgress] - Callback (msg: string) => void
 * @returns {Promise<{ nomeArquivo, qtdSlides }>}
 */
export async function gerarReuniaoPPT({
  selecao,
  dataInicio,
  dataFim,
  deps,
  empresa,
  onProgress,
}) {
  const log = msg => onProgress && onProgress(msg);

  if (!dataInicio || !dataFim) throw new Error('Defina o período (data De e Até).');

  // Filtra módulos com pelo menos 1 bloco selecionado e que estão disponíveis
  const ativos = MODULOS_DISPONIVEIS.filter(m => {
    if (!m.disponivel) return false;
    const blocos = selecao?.[m.key];
    return Array.isArray(blocos) && blocos.length > 0;
  });

  if (!ativos.length) throw new Error('Selecione ao menos um bloco em algum módulo.');

  log('Inicializando apresentação…');
  const pptx = new PptxGenJS();
  pptx.layout  = 'LAYOUT_WIDE';   // 13.333 x 7.5 in (widescreen 16:9)
  pptx.title   = 'Reunião Operacional WJS';
  pptx.author  = 'WJS';
  pptx.company = empresa || 'WJS';
  pptx.subject = `Reunião · ${formatarPeriodoBR(dataInicio, dataFim)}`;

  const periodo = formatarPeriodoBR(dataInicio, dataFim);
  const agora   = dataHoraAtualBR();

  // Capa principal
  adicionarCapaPrincipal(pptx, {
    titulo: 'WJS',
    periodo,
    empresa: empresa || 'WJS',
    gerador: agora,
  });

  // Sumário (lista de módulos com qtd de blocos)
  const itensSumario = ativos.map(m => {
    const qtd = selecao[m.key].length;
    return `${m.label}  (${qtd} slide${qtd === 1 ? '' : 's'})`;
  });
  adicionarSumario(pptx, { itens: itensSumario });

  // Cada módulo
  let totalSlides = 2; // capa + sumário
  for (const mod of ativos) {
    const blocosSelecionados = selecao[mod.key];
    log(`${mod.label} — preparando…`);
    try {
      // 1 round-trip de Firestore por módulo (não por bloco)
      const dados = await mod.buscarDados({ ...deps, dataInicio, dataFim }, onProgress);
      // Itera pelos blocos NA ORDEM declarada pelo módulo (não na ordem da seleção)
      for (const [blocoKey, bloco] of Object.entries(mod.blocos)) {
        if (!blocosSelecionados.includes(blocoKey)) continue;
        log(`${mod.label} — ${bloco.label}`);
        await bloco.exportar(pptx, dados);
        totalSlides++;
      }
    } catch (e) {
      console.error(`Erro no módulo ${mod.key}:`, e);
      throw new Error(`Falha ao gerar módulo ${mod.label}: ${e.message}`);
    }
  }

  log('Gerando arquivo .pptx…');
  const nomeArquivo = montarNomeArquivo({ dataInicio, dataFim, empresa });
  await pptx.writeFile({ fileName: nomeArquivo });

  log('Pronto!');
  return { nomeArquivo, qtdSlides: totalSlides };
}

function montarNomeArquivo({ dataInicio, dataFim, empresa }) {
  const ini  = (dataInicio || '').replace(/-/g, '');
  const fim  = (dataFim    || '').replace(/-/g, '');
  const slug = (empresa || 'WJS').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `Reuniao_${slug}_${ini}_a_${fim}.pptx`;
}
