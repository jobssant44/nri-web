/**
 * Gerador do Manual PDF do módulo Reabastecimento / Ressuprimento.
 *
 * Saída: docs/Manual-Reabastecimento-Ressuprimento.pdf
 * Como rodar: node docs/gerar-manual.js
 *
 * Notas:
 *  - Todos os emojis fora do Latin-1 foram removidos (Helvetica padrão do
 *    pdfkit não suporta — virariam caractere lixo no PDF). Usamos cor +
 *    negrito + rótulos textuais ([ATENÇÃO], [DICA]) pra dar destaque visual.
 *  - Sem placeholders de print — o manual se sustenta com texto e tabelas.
 *  - Conteúdo enxuto, focado em operação (conferente/gestor).
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Tema ───────────────────────────────────────────────────────────────────
const RED        = '#E31837';   // brand WJS
const BLUE       = '#1D5A9E';   // azul WJS / reab
const DARK       = '#0f172a';
const TEXT       = '#1f2937';
const MUTED      = '#6b7280';
const LIGHT      = '#94a3b8';
const SOFT_RED   = '#fee2e2';
const SOFT_BLUE  = '#dbeafe';
const SOFT_AMBER = '#fef3c7';
const SOFT_GREEN = '#dcfce7';
const SOFT_BG    = '#f8fafc';

const PAGE_W   = 595.28;  // A4 em pontos
const PAGE_H   = 841.89;
const MARGIN   = 60;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// ─── Inicialização ─────────────────────────────────────────────────────────
const outPath = path.join(__dirname, 'Manual-Reabastecimento-Ressuprimento.pdf');
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: MARGIN, bottom: MARGIN + 30, left: MARGIN, right: MARGIN },
  info: {
    Title:    'Manual — Reabastecimento / Ressuprimento',
    Author:   'WJS',
    Subject:  'Guia operacional do módulo Reab',
    Keywords: 'reabastecimento, ressuprimento, picking, IV, WJS',
  },
  bufferPages: true,
});
doc.pipe(fs.createWriteStream(outPath));

// ─── Helpers de layout ──────────────────────────────────────────────────────
function tituloCapitulo(numero, texto) {
  doc.moveDown(0.3);
  const y = doc.y;
  doc.rect(MARGIN, y, 4, 40).fill(RED);
  doc.fillColor(RED).fontSize(11).font('Helvetica-Bold')
    .text(`CAPÍTULO ${numero}`, MARGIN + 14, y + 2);
  doc.fillColor(DARK).fontSize(20).font('Helvetica-Bold')
    .text(texto, MARGIN + 14, y + 16, { width: CONTENT_W - 14 });
  doc.moveDown(1.2);
}

function tituloSecao(texto) {
  doc.moveDown(0.6);
  const y = doc.y;
  doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
    .text(texto, MARGIN, y, { width: CONTENT_W });
  doc.moveTo(MARGIN, doc.y + 1).lineTo(MARGIN + 40, doc.y + 1).lineWidth(2).strokeColor(RED).stroke();
  doc.moveDown(0.4);
}

function paragrafo(texto) {
  doc.fillColor(TEXT).fontSize(10.5).font('Helvetica')
    .text(texto, MARGIN, doc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
  doc.moveDown(0.4);
}

function bullet(texto) {
  const x = MARGIN + 14;
  const y = doc.y;
  doc.fillColor(RED).fontSize(11).font('Helvetica-Bold').text('•', MARGIN + 2, y);
  doc.fillColor(TEXT).fontSize(10.5).font('Helvetica')
    .text(texto, x, y, { width: CONTENT_W - 14, align: 'left', lineGap: 2 });
  doc.moveDown(0.2);
}

function passo(num, texto) {
  const y = doc.y;
  doc.circle(MARGIN + 8, y + 7, 9).fill(BLUE);
  doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold')
    .text(String(num), MARGIN, y + 3, { width: 16, align: 'center' });
  doc.fillColor(TEXT).fontSize(10.5).font('Helvetica')
    .text(texto, MARGIN + 24, y, { width: CONTENT_W - 24, align: 'left', lineGap: 2 });
  doc.moveDown(0.4);
}

function destaque(label, texto, cor = SOFT_BLUE, corLabel = BLUE) {
  const y0 = doc.y;
  const padding = 10;
  const labelW = 80;
  const heightTexto = doc.heightOfString(texto, { width: CONTENT_W - padding * 2 - labelW, lineGap: 2 });
  const altura = Math.max(36, heightTexto + padding * 2);
  doc.rect(MARGIN, y0, CONTENT_W, altura).fill(cor);
  doc.fillColor(corLabel).fontSize(9).font('Helvetica-Bold')
    .text(label.toUpperCase(), MARGIN + padding, y0 + padding, { width: labelW });
  doc.fillColor(TEXT).fontSize(10).font('Helvetica')
    .text(texto, MARGIN + padding + labelW, y0 + padding, { width: CONTENT_W - padding * 2 - labelW, lineGap: 2 });
  doc.y = y0 + altura + 8;
}

function tabela(headers, rows, colWidths) {
  const colW = colWidths || headers.map(() => CONTENT_W / headers.length);
  const rowH = 22;
  let y = doc.y;
  // header
  let x = MARGIN;
  doc.rect(MARGIN, y, CONTENT_W, rowH).fill(DARK);
  headers.forEach((h, i) => {
    doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold')
      .text(h, x + 6, y + 6, { width: colW[i] - 12 });
    x += colW[i];
  });
  y += rowH;
  // rows
  rows.forEach((row, idx) => {
    const altura = Math.max(rowH, ...row.map((c, i) =>
      doc.heightOfString(c, { width: colW[i] - 12, lineGap: 1 }) + 8
    ));
    doc.rect(MARGIN, y, CONTENT_W, altura).fill(idx % 2 ? SOFT_BG : '#fff');
    x = MARGIN;
    row.forEach((cell, i) => {
      doc.fillColor(TEXT).fontSize(9.5).font('Helvetica')
        .text(cell, x + 6, y + 4, { width: colW[i] - 12, lineGap: 1 });
      x += colW[i];
    });
    y += altura;
  });
  doc.y = y + 8;
}

function novaPagina() {
  doc.addPage();
}

// ─── Cabeçalho e rodapé (desenhados no evento `pageAdded`) ──────────────────
// Estratégia: em vez de pós-processar (switchToPage + text), desenhamos
// header/footer NO MOMENTO em que cada página é criada. Isso evita o bug do
// `LineWrapper.wrap` criar páginas extras durante o pós-processamento.
// Usamos `pageBuffer` pra contar a página atual; cabeçalho/rodapé não
// aparecem na capa nem no sumário (controlado pelo flag `aplicarHF`).
let aplicarHF = false;
let desenhandoHF = false;
let paginaConteudo = 0;
const dataHoje = new Date().toLocaleDateString('pt-BR');

doc.on('pageAdded', () => {
  if (!aplicarHF || desenhandoHF) return;
  desenhandoHF = true;
  paginaConteudo += 1;
  // Preserva posição original do cursor; o pdfkit usa essa pra continuar
  // wrap de texto que disparou esta página. Mexer aqui rompia o wrap e
  // gerava páginas extras (35 em vez de 13).
  const xOriginal = doc.x;
  const yOriginal = doc.y;
  try {
    doc.save();
    // Cabeçalho — width 9999 + lineBreak:false + height pequeno
    // pra forçar pdfkit a não wrappar nem criar página extra.
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold')
      .text('MANUAL — REABASTECIMENTO / RESSUPRIMENTO', MARGIN, 24, {
        lineBreak: false, height: 12,
      });
    doc.moveTo(MARGIN, 40).lineTo(PAGE_W - MARGIN, 40).lineWidth(0.5).strokeColor(LIGHT).stroke();

    // Rodapé
    doc.fillColor(MUTED).fontSize(8).font('Helvetica')
      .text(`WJS  ·  v1.0  ·  ${dataHoje}`,
        MARGIN, PAGE_H - 34, { lineBreak: false, height: 12 });
    doc.text(`Página ${paginaConteudo}`,
      PAGE_W - MARGIN - 80, PAGE_H - 34, { lineBreak: false, height: 12, width: 80, align: 'right' });
    doc.restore();
  } finally {
    // Restaura cursor exatamente como estava — crucial pro wrap interno
    doc.x = xOriginal;
    doc.y = yOriginal;
    desenhandoHF = false;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CAPA
// ─────────────────────────────────────────────────────────────────────────────
doc.rect(0, 0, PAGE_W, 180).fill(RED);
doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold')
  .text('WJS', MARGIN, 60, { align: 'right', width: CONTENT_W });
doc.fontSize(11).font('Helvetica').fillColor('#fff')
  .text('Sistema de Gestão de Armazém', MARGIN, 80, { align: 'right', width: CONTENT_W });

doc.y = 280;
doc.fontSize(28).fillColor(DARK).font('Helvetica-Bold').text('Manual do Módulo', { align: 'center' });
doc.moveDown(0.3);
doc.fontSize(36).fillColor(RED).font('Helvetica-Bold').text('Reabastecimento /', { align: 'center' });
doc.fontSize(36).fillColor(RED).font('Helvetica-Bold').text('Ressuprimento', { align: 'center' });
doc.moveDown(1.5);
doc.fontSize(14).fillColor(MUTED).font('Helvetica')
  .text('Guia operacional para conferentes e gestores', { align: 'center' });
doc.moveDown(4);
doc.fontSize(10).fillColor(MUTED).font('Helvetica')
  .text(`Versão 1.0   ·   ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });

// ─────────────────────────────────────────────────────────────────────────────
// SUMÁRIO
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
doc.fillColor(DARK).fontSize(22).font('Helvetica-Bold').text('Sumário');
doc.moveDown(1);

const sumario = [
  ['1', 'Visão geral do módulo', '3'],
  ['2', 'Conceitos fundamentais', '4'],
  ['',  '  2.1 Reabastecimento × Ressuprimento', '4'],
  ['',  '  2.2 Quem faz o quê', '4'],
  ['',  '  2.3 Por que isso importa', '5'],
  ['3', 'Lançar Reabastecimento', '6'],
  ['4', 'Lançar Ressuprimento', '8'],
  ['5', 'Consultar Registro', '9'],
  ['6', 'Consultar Vendas', '10'],
  ['7', 'Dashboard IV — como ler', '11'],
  ['8', 'Planificador IV — como ler', '13'],
  ['9', 'Regras automáticas do sistema', '15'],
  ['',  'Glossário', '16'],
];

sumario.forEach(([num, texto, pg]) => {
  const isCap = !!num;
  const y = doc.y;
  if (isCap) {
    doc.fillColor(RED).fontSize(13).font('Helvetica-Bold').text(num, MARGIN, y, { width: 30 });
    doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold').text(texto, MARGIN + 30, y, { width: CONTENT_W - 70 });
  } else {
    doc.fillColor(TEXT).fontSize(10.5).font('Helvetica').text(texto, MARGIN + 16, y, { width: CONTENT_W - 70 });
  }
  doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(pg, MARGIN + CONTENT_W - 30, y, { width: 30, align: 'right' });
  doc.moveDown(isCap ? 0.4 : 0.3);
});

// A partir daqui, todas as páginas novas terão cabeçalho e rodapé automáticos.
aplicarHF = true;

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 1 — VISÃO GERAL
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('1', 'Visão geral do módulo');

paragrafo(
  'O módulo de Reabastecimento / Ressuprimento acompanha a movimentação diária ' +
  'de paletes entre o estoque e a área de picking, garantindo que os produtos ' +
  'com maior giro estejam sempre disponíveis para separação de pedidos.'
);

tituloSecao('O que o sistema permite');
bullet('Lançar o reabastecimento da manhã, com os paletes que o operador de empilhadeira transferiu para o picking.');
bullet('Lançar o ressuprimento durante o turno noturno, quando algum produto acabou no picking.');
bullet('Consultar o histórico de movimentações por dia, por produto ou por conferente.');
bullet('Acompanhar dashboards e o planificador mensal para ver a operação no mês.');

doc.moveDown(0.4);
destaque(
  'Quem usa',
  'Conferentes responsáveis por lançar reabastecimento e ressuprimento, e gestores ' +
  'que acompanham a operação pelos painéis.',
  SOFT_BLUE, BLUE
);

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 2 — CONCEITOS FUNDAMENTAIS
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('2', 'Conceitos fundamentais');

tituloSecao('2.1  Reabastecimento × Ressuprimento');
paragrafo(
  'Os dois movimentos são parecidos — em ambos é levado paletes do estoque para o ' +
  'picking, mas acontecem em momentos diferentes e por motivos diferentes.'
);

tabela(
  ['', 'Reabastecimento', 'Ressuprimento'],
  [
    ['Quando',        'De manhã, planejado',                'De noite, emergência'],
    ['Por quê',       'Repor o estoque do dia',             'Picking acabou no meio do carregamento'],
    ['Quem registra', 'Conferente do turno da manhã',       'Conferente do turno da noite'],
  ],
  [110, 195, 170]
);

tituloSecao('2.2  Quem faz o quê');

tabela(
  ['Função', 'Responsabilidade'],
  [
    ['Operador de empilhadeira / Ajudante', 'Movimenta fisicamente os paletes do estoque para o picking'],
    ['Conferente',                          'Registra no sistema o que foi movimentado'],
  ],
  [200, 275]
);

destaque(
  'Atenção',
  'O conferente NÃO move palete. O conferente lança no sistema o que o operador de ' +
  'empilhadeira / ajudante já fez. Assim que a movimentação ocorre fisicamente, o ' +
  'conferente abre o sistema e registra.',
  SOFT_AMBER, '#b45309'
);

tituloSecao('2.3  Por que isso importa');
paragrafo('Cada lançamento alimenta os painéis (Dashboard, Planificador, Vendas) e permite enxergar:');
bullet('Se a operação está estável ou se algum produto está pedindo mais ressuprimento que o normal.');
bullet('Quais SKUs precisam de mais espaço no picking.');
bullet('Quais conferentes estão lançando regularmente.');

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 3 — LANÇAR REABASTECIMENTO
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('3', 'Lançar Reabastecimento');

tituloSecao('3.1  Quando lançar');
paragrafo('Sempre que um operador de empilhadeira terminar de repor paletes no picking pela manhã.');

tituloSecao('3.2  Passo a passo');
passo(1, 'No menu lateral, clique em Reabastecimento / Ressuprimento > Lançar Abastecimento.');
passo(2, 'Preencha o Código do Produto (ou digite o nome — o sistema busca automaticamente).');
passo(3, 'Selecione Reabastecimento (o sistema já marca automaticamente quando o horário é entre 7h e 22h).');
passo(4, 'Informe a Quantidade de Paletes repostos.');
passo(5, 'Clique em Confirmar Lançamento.');

doc.moveDown(0.4);
destaque(
  'Dica',
  'Se o produto for novo no sistema, peça antes ao supervisor para incluí-lo na configuração de picking.',
  SOFT_GREEN, '#166534'
);

tituloSecao('3.3  Confirmação');
paragrafo('Após salvar, o lançamento aparece imediatamente na lista "Lançamentos de Hoje", à direita da tela, com:');
bullet('Código e nome do produto');
bullet('Quantidade de paletes');
bullet('Seu nome (conferente que registrou)');
bullet('Tag azul indicando que foi um reabastecimento');

tituloSecao('3.4  Erros comuns');
tabela(
  ['Mensagem', 'O que fazer'],
  [
    ['"Selecione um produto"', 'Você esqueceu de informar o código ou nome. Preencha o campo.'],
    ['"Informe a quantidade"', 'Quantidade vazia ou zero. Digite um número maior que zero.'],
  ],
  [180, 295]
);

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 4 — LANÇAR RESSUPRIMENTO
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('4', 'Lançar Ressuprimento');

tituloSecao('4.1  Quando lançar');
paragrafo(
  'Sempre que durante a noite (a partir das 22h) o picking de algum produto acabar ' +
  'e for necessária uma reposição emergencial para terminar o carregamento.'
);

tituloSecao('4.2  Passo a passo');
paragrafo(
  'O fluxo é igual ao do reabastecimento, com uma única diferença: você seleciona ' +
  'Ressuprimento no lugar de Reabastecimento.'
);

passo(1, 'Abra Reabastecimento / Ressuprimento > Lançar Abastecimento.');
passo(2, 'Preencha código do produto.');
passo(3, 'Selecione Ressuprimento (o sistema já marca automaticamente entre 22h e 7h).');
passo(4, 'Informe a quantidade de paletes.');
passo(5, 'Confirme.');

tituloSecao('4.3  Atenção ao horário');
paragrafo(
  'Se o lançamento for feito entre 00h e 7h, o sistema entende que se trata da operação ' +
  'da noite anterior e ajusta a data automaticamente. Não é preciso mudar nada — basta ' +
  'lançar com o turno em que aconteceu fisicamente.'
);

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 5 — CONSULTAR REGISTRO
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('5', 'Consultar Registro');

paragrafo(
  'A tela Registro mostra a lista completa de tudo o que foi lançado, com filtros ' +
  'para encontrar lançamentos específicos.'
);

tituloSecao('5.1  Como acessar');
paragrafo('Menu lateral > Reabastecimento / Ressuprimento > Registro.');

tituloSecao('5.2  O que aparece na tela');
paragrafo('Uma tabela com:');
bullet('Data e Hora do lançamento');
bullet('Produto (nome e código)');
bullet('Tipo (Reabastecimento azul ou Ressuprimento vermelho)');
bullet('Quantidade de Paletes');
bullet('Conferente que lançou');

paragrafo(
  'No final da tabela aparece um resumo: total de paletes reabastecidos (azul) e ' +
  'ressupridos (vermelho) no período filtrado.'
);

tituloSecao('5.3  Filtros disponíveis');
tabela(
  ['Filtro', 'Pra que serve'],
  [
    ['Busca',             'Digite código ou nome do produto'],
    ['Tipo',              'Mostra só Reab, só Ressp, ou os dois'],
    ['Data Início / Fim', 'Período da consulta (DD/MM/AAAA)'],
  ],
  [140, 335]
);

paragrafo('Use o botão Limpar filtros pra voltar à visão completa.');

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 6 — CONSULTAR VENDAS
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('6', 'Consultar Vendas');

paragrafo(
  'A tela Vendas mostra quantas caixas de cada produto foram vendidas em cada dia ' +
  'do mês selecionado. É a base usada pelo sistema para calcular o reabastecimento ' +
  'esperado do dia seguinte.'
);

tituloSecao('6.1  Como acessar');
paragrafo('Menu lateral > Reabastecimento / Ressuprimento > Vendas.');

tituloSecao('6.2  O que aparece na tela');
paragrafo('Uma tabela com:');
bullet('Código do produto (em vermelho)');
bullet('Descrição');
bullet('Uma coluna para cada dia do mês com a quantidade vendida em caixas');
bullet('Células com travessão (—) indicam dias sem venda');

paragrafo('No rodapé aparece o período e quantos produtos têm dados no mês.');

tituloSecao('6.3  Filtros');
tabela(
  ['Filtro',     'Pra que serve'],
  [
    ['Ano / Mês', 'Período da consulta'],
    ['Buscar',    'Digite código ou descrição'],
    ['Atualizar', 'Força nova leitura (use se acabou de importar relatório novo)'],
  ],
  [140, 335]
);

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 7 — DASHBOARD IV
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('7', 'Dashboard IV — como ler');

paragrafo('A tela Dashboard IV é o painel gerencial do módulo, com indicadores do mês selecionado.');

tituloSecao('7.1  Como acessar');
paragrafo('Menu lateral > Reabastecimento / Ressuprimento > Dashboard.');

tituloSecao('7.2  Os 3 cards principais (topo)');
tabela(
  ['Card', 'O que mostra'],
  [
    ['Paletes Reabastecidos', 'Total de paletes movidos para o picking no mês (azul)'],
    ['Paletes Ressupridos',   'Total de paletes em ressuprimento de emergência (vermelho)'],
    ['Produtos com Ressup',   'Quantos SKUs diferentes precisaram de ressuprimento'],
  ],
  [170, 305]
);

tituloSecao('7.3  Gráfico de evolução');
paragrafo(
  'Mostra a comparação reabastecimento × ressuprimento ao longo dos últimos meses, ' +
  'em barras lado a lado:'
);
bullet('Azul = reabastecimentos');
bullet('Vermelho = ressuprimentos');
paragrafo(
  'Ajuda a identificar tendências: se o ressuprimento está crescendo, algum produto ' +
  'pode estar pedindo mais espaço no picking.'
);

tituloSecao('7.4  Ranking de produtos');
paragrafo('Tabela com os produtos ordenados por quantidade total de movimentações. Colunas:');
tabela(
  ['Coluna', 'O que significa'],
  [
    ['Código / Produto', 'SKU e descrição'],
    ['Total Movimentos', 'Soma de reab + ressup no mês'],
    ['Espaço Ideal',     'Quantos espaços de picking o produto deveria ter, com base nas vendas'],
    ['Subdimensionados', 'Quantos SKUs estão com espaço menor do que o ideal'],
  ],
  [150, 325]
);

paragrafo('Clique em qualquer coluna do cabeçalho para ordenar (ascendente ou descendente).');

tituloSecao('7.5  Filtros');
paragrafo('No topo da tela: seletor de Ano e Mês. Toda a página recalcula automaticamente.');

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 8 — PLANIFICADOR IV
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('8', 'Planificador IV — como ler');

paragrafo('A tela Planificador IV é uma visão mensal completa: cada produto × cada dia do mês.');

tituloSecao('8.1  Como acessar');
paragrafo('Menu lateral > Reabastecimento / Ressuprimento > Planificador.');

tituloSecao('8.2  Estrutura da tabela');
bullet('Linhas: cada produto do picking');
bullet('Colunas: cada dia do mês selecionado');
bullet('Coluna Total (à direita): soma do mês daquele produto');
bullet('Cabeçalho do dia: dia + abreviação (ex: 15-Seg)');
bullet('Domingos: aparecem como DOM em cinza (sem operação)');
bullet('Dias futuros: aparecem como 0 (ainda não passaram)');

tituloSecao('8.3  Os 3 valores em cada célula (modo Reabastecimento)');
tabela(
  ['Sigla', 'Significado'],
  [
    ['P  (Planejado)', 'Quantidade de paletes que o sistema calculou que deveria ser reabastecida no dia, com base nas vendas'],
    ['R  (Realizado)', 'Quantidade de paletes que o conferente registrou no sistema (lançamento real)'],
    ['G  (GAP)',       'A diferença: G = R - P'],
  ],
  [110, 365]
);

destaque(
  'Importante',
  'Na prática a operação está bem ajustada, então R aparece quase sempre igual a P e ' +
  'G = 0. Conceitualmente, porém, são 3 medidas independentes: P é o cálculo do sistema, ' +
  'R é o que o conferente lançou, e G é a diferença entre os dois. Quando G é diferente ' +
  'de zero, indica desvio entre planejado e realizado naquele dia.',
  SOFT_RED, RED
);

novaPagina();

tituloSecao('8.4  Modo Ressuprimento');
paragrafo(
  'Quando você alterna para o modo Ressuprimento, a tabela mostra apenas um número por ' +
  'célula: a quantidade de paletes ressupridos naquele dia. Células com travessão (—) ' +
  'significam que não houve ressuprimento.'
);

tituloSecao('8.5  Filtros');
tabela(
  ['Filtro',     'Pra que serve'],
  [
    ['Ano / Mês', 'Período exibido'],
    ['Modo',      'Alterna entre Reabastecimento e Ressuprimento'],
    ['Busca',     'Filtra produto por código ou nome'],
  ],
  [140, 335]
);

tituloSecao('8.6  Como interpretar a leitura');
bullet('Várias células com R = P todo dia útil — operação alinhada com o planejado.');
bullet('Coluna Total alta no Ressuprimento — produto pedindo mais espaço no picking.');
bullet('Linha quase vazia em Ressuprimento — produto estável, sem emergências.');

// ─────────────────────────────────────────────────────────────────────────────
// CAPÍTULO 9 — REGRAS AUTOMÁTICAS
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('9', 'Regras automáticas do sistema');

paragrafo(
  'O sistema aplica algumas regras automaticamente para que o conferente não precise ' +
  'se preocupar com cálculos. Conhecê-las ajuda a entender de onde vêm os números.'
);

tituloSecao('9.1  Dia operacional');
paragrafo(
  'Se o lançamento é feito antes das 7h da manhã, o sistema considera que ainda é o ' +
  'dia operacional anterior. Exemplo: às 3h da manhã do dia 16, o sistema registra como ' +
  'dia 15.'
);
paragrafo(
  'Por quê? Porque o turno noturno atravessa a meia-noite e o conferente está fechando ' +
  'a operação do dia que passou.'
);

tituloSecao('9.2  Reabastecimento usa vendas do dia anterior (D-1)');
paragrafo(
  'Quando o sistema calcula o reabastecimento planejado para o dia X, ele usa as vendas ' +
  'do dia X-1. A lógica é: o que vendeu ontem precisa ser reposto hoje pela manhã.'
);

tituloSecao('9.3  Segunda-feira pula domingo');
paragrafo(
  'Como não há operação no domingo, na segunda-feira o sistema usa as vendas de sábado ' +
  '(e não as do domingo). Assim, segunda repõe o que vendeu sábado.'
);

tituloSecao('9.4  Detecção automática de Reab × Ressup');
paragrafo('Ao abrir a tela de Lançar Abastecimento, o sistema já sugere o tipo correto baseado no horário:');
tabela(
  ['Horário',   'Sugestão automática'],
  [
    ['7h – 22h', 'Reabastecimento'],
    ['22h – 7h', 'Ressuprimento'],
  ],
  [140, 335]
);
paragrafo('O conferente pode trocar manualmente se necessário, mas o padrão acelera o lançamento.');

tituloSecao('9.5  Atualização instantânea');
paragrafo(
  'Cada lançamento atualiza os dashboards e o planificador em tempo real — não é ' +
  'preciso "salvar e atualizar" depois.'
);

// ─────────────────────────────────────────────────────────────────────────────
// GLOSSÁRIO
// ─────────────────────────────────────────────────────────────────────────────
novaPagina();
tituloCapitulo('—', 'Glossário');

const termos = [
  ['Reabastecimento',          'Reposição planejada de paletes no picking, feita pela manhã.'],
  ['Ressuprimento',            'Reposição emergencial à noite, quando o picking acaba durante o carregamento.'],
  ['Picking',                  'Área do armazém onde os pedidos são separados.'],
  ['SKU',                      'Código único de um produto.'],
  ['Conferente',               'Quem registra no sistema as movimentações.'],
  ['Operador de empilhadeira', 'Quem move fisicamente os paletes.'],
  ['P  (Planejado)',           'Quantidade calculada pelo sistema com base nas vendas.'],
  ['R  (Realizado)',           'Quantidade registrada pelo conferente.'],
  ['G  (GAP)',                 'Diferença entre Realizado e Planejado: G = R - P.'],
  ['D-1',                      '"Dia anterior". O reab planejado de hoje usa as vendas de ontem.'],
  ['Dia operacional',          'O dia real da operação. Antes das 7h, é o dia anterior.'],
  ['IV',                       'Índice de Vendas — base de cálculo do reabastecimento.'],
  ['Caixas / Paletes',         'Unidades de medida. 1 palete = N caixas (varia por SKU).'],
];

termos.forEach(([termo, desc]) => {
  const y0 = doc.y;
  doc.fillColor(RED).fontSize(10.5).font('Helvetica-Bold').text(termo, MARGIN, y0, { width: 165 });
  doc.fillColor(TEXT).fontSize(10).font('Helvetica')
    .text(desc, MARGIN + 170, y0, { width: CONTENT_W - 170, lineGap: 1 });
  doc.moveDown(0.6);
});

// ─── Finaliza ──────────────────────────────────────────────────────────────
// Cabeçalho/rodapé já foram desenhados no evento pageAdded.
doc.end();

console.log(`Manual gerado: ${outPath}`);
