/**
 * Gerador do Manual PDF do módulo Reabastecimento / Ressuprimento.
 *
 * Saída: docs/Manual-Reabastecimento-Ressuprimento.pdf
 * Como rodar: node docs/gerar-manual.js
 *
 * Versão "esqueleto" — placeholders [PRINT] serão substituídos pelos
 * screenshots reais amanhã quando a quota Firestore resetar.
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
    Author:   'WJS NRI',
    Subject:  'Guia operacional do módulo Reab',
    Keywords: 'reabastecimento, ressuprimento, picking, IV, WJS, NRI',
  },
  bufferPages: true,
});
doc.pipe(fs.createWriteStream(outPath));

// ─── Helpers de layout ──────────────────────────────────────────────────────
let secaoAtual = '';
function setSecao(nome) { secaoAtual = nome; }

function tituloCapa(texto) {
  doc.fontSize(28).fillColor(DARK).font('Helvetica-Bold').text(texto, { align: 'center' });
}
function subtituloCapa(texto) {
  doc.fontSize(14).fillColor(MUTED).font('Helvetica').text(texto, { align: 'center' });
}

function tituloCapitulo(numero, texto) {
  doc.moveDown(0.5);
  // Faixa vermelha esquerda + número grande
  const y = doc.y;
  doc.rect(MARGIN, y, 4, 36).fill(RED);
  doc.fillColor(RED).fontSize(11).font('Helvetica-Bold')
    .text(`CAPÍTULO ${numero}`, MARGIN + 14, y + 2);
  doc.fillColor(DARK).fontSize(22).font('Helvetica-Bold')
    .text(texto, MARGIN + 14, y + 14);
  doc.moveDown(1.4);
}

function tituloSecao(texto) {
  doc.moveDown(0.8);
  doc.fillColor(DARK).fontSize(15).font('Helvetica-Bold')
    .text(texto, MARGIN, doc.y, { width: CONTENT_W });
  doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + 40, doc.y + 2).lineWidth(2).strokeColor(RED).stroke();
  doc.moveDown(0.5);
}

function tituloSubSecao(texto) {
  doc.moveDown(0.5);
  doc.fillColor(BLUE).fontSize(12).font('Helvetica-Bold')
    .text(texto, MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.3);
}

function paragrafo(texto) {
  doc.fillColor(TEXT).fontSize(10.5).font('Helvetica')
    .text(texto, MARGIN, doc.y, { width: CONTENT_W, align: 'justify', lineGap: 2 });
  doc.moveDown(0.5);
}

function bullet(texto) {
  const x = MARGIN + 12;
  const y = doc.y;
  doc.fillColor(RED).fontSize(10.5).font('Helvetica-Bold').text('•', MARGIN, y);
  doc.fillColor(TEXT).fontSize(10.5).font('Helvetica')
    .text(texto, x, y, { width: CONTENT_W - 12, align: 'left', lineGap: 2 });
  doc.moveDown(0.25);
}

function passo(num, texto) {
  const y = doc.y;
  // Círculo numerado
  doc.circle(MARGIN + 8, y + 7, 9).fill(BLUE);
  doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold')
    .text(String(num), MARGIN, y + 3, { width: 16, align: 'center' });
  doc.fillColor(TEXT).fontSize(10.5).font('Helvetica')
    .text(texto, MARGIN + 24, y, { width: CONTENT_W - 24, align: 'left', lineGap: 2 });
  doc.moveDown(0.5);
}

function destaque(label, texto, cor = SOFT_BLUE, corLabel = BLUE) {
  const y0 = doc.y;
  const padding = 10;
  // mede a altura aproximada do texto pra desenhar fundo certo
  const heightTexto = doc.heightOfString(texto, { width: CONTENT_W - padding * 2 - 50, lineGap: 2 });
  const altura = Math.max(36, heightTexto + padding * 2);
  doc.rect(MARGIN, y0, CONTENT_W, altura).fill(cor);
  doc.fillColor(corLabel).fontSize(9).font('Helvetica-Bold')
    .text(label.toUpperCase(), MARGIN + padding, y0 + padding, { width: 50 });
  doc.fillColor(TEXT).fontSize(10).font('Helvetica')
    .text(texto, MARGIN + padding + 50, y0 + padding, { width: CONTENT_W - padding * 2 - 50, lineGap: 2 });
  doc.y = y0 + altura + 8;
}

function placeholderPrint(legenda) {
  const y0 = doc.y;
  const altura = 160;
  doc.rect(MARGIN, y0, CONTENT_W, altura)
    .fillAndStroke(SOFT_BG, LIGHT);
  // Ícone de imagem fake (retângulo + linhas)
  const cx = MARGIN + CONTENT_W / 2;
  const cy = y0 + altura / 2 - 14;
  doc.fillColor(LIGHT).fontSize(28).font('Helvetica-Bold').text('🖼', cx - 12, cy - 12);
  doc.fillColor(MUTED).fontSize(10).font('Helvetica-Bold')
    .text('[ SCREENSHOT — a inserir ]', MARGIN, cy + 22, { width: CONTENT_W, align: 'center' });
  doc.fillColor(LIGHT).fontSize(9).font('Helvetica-Oblique')
    .text(legenda, MARGIN + 20, cy + 38, { width: CONTENT_W - 40, align: 'center' });
  doc.y = y0 + altura + 10;
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

function novaPagina(nomeSecao) {
  doc.addPage();
  if (nomeSecao) setSecao(nomeSecao);
}

// ─── Cabeçalho e rodapé (aplicados depois) ─────────────────────────────────
function aplicarCabecalhoRodape() {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    // Pula capa e sumário (páginas 0 e 1)
    if (i < 2) continue;

    // Cabeçalho
    doc.save();
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold')
      .text('MANUAL — REABASTECIMENTO / RESSUPRIMENTO', MARGIN, 24, {
        width: CONTENT_W, align: 'left',
      });
    doc.moveTo(MARGIN, 40).lineTo(PAGE_W - MARGIN, 40).lineWidth(0.5).strokeColor(LIGHT).stroke();

    // Rodapé
    doc.fillColor(MUTED).fontSize(8).font('Helvetica')
      .text(`WJS NRI · v1.0 · ${new Date().toLocaleDateString('pt-BR')}`,
        MARGIN, PAGE_H - 34, { width: CONTENT_W / 2, align: 'left' });
    doc.text(`Página ${i + 1 - 2} de ${total - 2}`,
      MARGIN + CONTENT_W / 2, PAGE_H - 34, { width: CONTENT_W / 2, align: 'right' });
    doc.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEÚDO
// ─────────────────────────────────────────────────────────────────────────────

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CAPA                                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
doc.rect(0, 0, PAGE_W, 180).fill(RED);
doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold')
  .text('WJS · NRI', MARGIN, 60, { align: 'right', width: CONTENT_W });
doc.fontSize(11).font('Helvetica').fillColor('#fff')
  .text('Sistema de Gestão de Armazém', MARGIN, 80, { align: 'right', width: CONTENT_W });

doc.y = 280;
tituloCapa('Manual do Módulo');
doc.moveDown(0.3);
doc.fontSize(36).fillColor(RED).font('Helvetica-Bold')
  .text('Reabastecimento /', { align: 'center' });
doc.fontSize(36).fillColor(RED).font('Helvetica-Bold')
  .text('Ressuprimento', { align: 'center' });
doc.moveDown(1.5);
subtituloCapa('Guia operacional para conferentes e supervisores');
doc.moveDown(4);
doc.fontSize(10).fillColor(MUTED).font('Helvetica')
  .text(`Versão 1.0   ·   ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SUMÁRIO                                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
novaPagina();
doc.fillColor(DARK).fontSize(22).font('Helvetica-Bold').text('Sumário');
doc.moveDown(1);

const sumario = [
  ['1', 'Visão geral do módulo', '3'],
  ['2', 'Conceitos fundamentais', '4'],
  ['',  '  2.1 Reabastecimento vs Ressuprimento', '4'],
  ['',  '  2.2 Quem faz o quê', '5'],
  ['',  '  2.3 Picking, Estoque e Capacidade', '6'],
  ['3', 'Fluxo diário do conferente', '7'],
  ['',  '  3.1 Lançar Reabastecimento da manhã', '7'],
  ['',  '  3.2 Lançar Ressuprimento noturno', '9'],
  ['',  '  3.3 Consultar e ajustar o Registro', '10'],
  ['4', 'Fluxo do supervisor', '11'],
  ['',  '  4.1 Cadastrar produtos no Picking', '11'],
  ['',  '  4.2 Importar Relatório de Vendas', '13'],
  ['',  '  4.3 Consultar Vendas', '15'],
  ['',  '  4.4 Dashboard IV: como ler', '16'],
  ['',  '  4.5 Planificador IV: como ler', '18'],
  ['5', 'Regras automáticas do sistema', '20'],
  ['6', 'Solução de problemas', '21'],
  ['',  'Glossário', '22'],
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

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CAPÍTULO 1 — VISÃO GERAL                                                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
novaPagina('1 — Visão geral');
tituloCapitulo('1', 'Visão geral do módulo');

paragrafo(
  'O módulo Reabastecimento / Ressuprimento (Reab) controla o abastecimento do Picking — '
  + 'a área do armazém onde os pedidos são separados. Cada produto tem uma quantidade fixa '
  + 'de posições de palete no Picking; quando essas posições esvaziam, é necessário trazer '
  + 'mais paletes do Estoque pra repor.'
);
paragrafo(
  'O sistema acompanha tudo isso em dois indicadores principais: o REABASTECIMENTO '
  + '(reposição programada da manhã, após a entrega da véspera) e o RESSUPRIMENTO '
  + '(reposição emergencial da noite, quando o Picking acaba antes do esperado). '
  + 'Todo ressuprimento é considerado uma falha operacional.'
);

tituloSecao('Pra que serve');
bullet('Garantir que o Picking nunca fique vazio durante a separação dos pedidos.');
bullet('Medir a saúde da operação: quanto está sendo reabastecido vs ressuprido por dia.');
bullet('Apontar produtos sub-dimensionados (poucas posições de Picking pro giro real).');
bullet('Planejar o reabastecimento do mês inteiro com base nas vendas dos dias anteriores.');
bullet('Manter o histórico auditável de toda movimentação por conferente, data e quantidade.');

tituloSecao('Quem participa');
destaque('Op. Empilhadeira',
  'Movimenta fisicamente os paletes do Estoque pro Picking. Não usa o sistema.',
  SOFT_AMBER, '#92400e');
destaque('Conferente',
  'Lança no sistema cada reabastecimento e cada ressuprimento que aconteceu, '
  + 'informando produto, quantidade de paletes e horário.',
  SOFT_BLUE, BLUE);
destaque('Supervisor',
  'Cadastra os produtos do Picking, importa os relatórios de vendas, configura as '
  + 'regras (paletes mistos, sinergias) e analisa os dashboards.',
  SOFT_RED, RED);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CAPÍTULO 2 — CONCEITOS FUNDAMENTAIS                                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
novaPagina('2 — Conceitos fundamentais');
tituloCapitulo('2', 'Conceitos fundamentais');

tituloSecao('2.1  Reabastecimento vs Ressuprimento');

paragrafo(
  'A diferença é simples mas crucial: o reabastecimento é planejado, o ressuprimento é '
  + 'emergencial. O sistema trata os dois como movimentações distintas porque elas dizem '
  + 'coisas diferentes sobre a operação.'
);

tabela(
  ['', 'Reabastecimento 🌅', 'Ressuprimento 🌙'],
  [
    ['Quando', 'Manhã (07h às 21h59)', 'Noite (22h às 06h59)'],
    ['Por quê', 'Reposição planejada após a entrega da véspera', 'Picking esvaziou antes do esperado'],
    ['Status', 'Esperado, faz parte da rotina', 'Falha operacional — sempre vermelho 🚨'],
    ['Cor', 'Azul', 'Vermelho'],
    ['Referência de venda', 'Vendas do dia anterior (D-1)', 'Vendas do próprio dia (D+0)'],
  ],
  [80, 220, 175]
);

destaque('Atenção',
  'O sistema detecta o tipo AUTOMATICAMENTE pelo horário do lançamento. Se você lançar '
  + 'às 02h, o sistema marca como ressuprimento (mesmo que o conferente discorde). Se for '
  + 'um caso especial, o supervisor pode editar depois na tela de Registro.',
  SOFT_AMBER, '#92400e');

novaPagina('2 — Conceitos fundamentais');
tituloSecao('2.2  Quem faz o quê');

paragrafo(
  'O ciclo completo envolve três papéis diferentes. Esse fluxo precisa ser claro porque '
  + 'quem move os paletes (operador) NÃO é quem lança no sistema (conferente).'
);

placeholderPrint('Fluxograma: pedido vira venda → Picking esvazia → operador empilhadeira move palete → conferente lança no sistema');

tituloSubSecao('Operador de empilhadeira');
bullet('Recebe o aviso (verbal ou no rádio) de que um produto está acabando no Picking.');
bullet('Vai até o Estoque, pega o palete certo e leva para a posição correspondente do Picking.');
bullet('Avisa o conferente: "movimentei tanto palete de tal produto, tal horário".');
bullet('NÃO entra no sistema. NÃO precisa de login.');

tituloSubSecao('Conferente');
bullet('Recebe a informação do operador e abre a tela Lançar Abastecimento (Reab → Lançar).');
bullet('Seleciona o produto (pode buscar por código ou nome), informa a quantidade de paletes.');
bullet('O sistema escolhe automaticamente entre Reab ou Ressp pelo horário.');
bullet('Confirma. O lançamento aparece na lista da direita imediatamente.');

tituloSubSecao('Supervisor');
bullet('Configura quais produtos têm Picking e quantas posições de palete cada um ocupa.');
bullet('Importa o relatório de vendas (03.02.36.08) sempre que necessário.');
bullet('Analisa o Dashboard pra identificar produtos sub-dimensionados ou ociosos.');
bullet('Pode editar/excluir lançamentos errados na tela de Registro (acesso protegido).');

novaPagina('2 — Conceitos fundamentais');
tituloSecao('2.3  Picking, Estoque e Capacidade');

paragrafo(
  'O Picking é a área onde os pedidos são separados. Tem espaço limitado: cada produto '
  + 'ocupa um número fixo de posições de palete. Quando o produto vende, esses paletes '
  + 'esvaziam e precisam ser repostos vindos do Estoque (área grande, longe da separação).'
);

tituloSubSecao('Conceitos numéricos');
destaque('Espaços palete',
  'Quantidade de posições que um produto ocupa no Picking. Ex: produto X tem 6 espaços '
  + '= cabem 6 paletes no Picking ao mesmo tempo.',
  SOFT_BG, DARK);
destaque('Cx por palete',
  'Quantas caixas tem em um palete cheio daquele produto. Vem do Catálogo (relatório 01.11).',
  SOFT_BG, DARK);
destaque('Capacidade Picking',
  'Espaços × Cx por palete. É o total de caixas que cabem no Picking. '
  + 'Se vender mais que isso num dia → ressuprimento certo.',
  SOFT_BG, DARK);

placeholderPrint('Exemplo: produto SKOL LATA 350ml com 6 espaços × 120 cx/palete = 720 cx de capacidade Picking');

destaque('Sub-dimensionado',
  'Quando a venda média do produto é maior que a capacidade do Picking. '
  + 'O sistema acende um alerta no Dashboard pra você aumentar os espaços.',
  SOFT_RED, RED);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CAPÍTULO 3 — FLUXO DIÁRIO DO CONFERENTE                                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
novaPagina('3 — Fluxo do conferente');
tituloCapitulo('3', 'Fluxo diário do conferente');

paragrafo(
  'Esta é a parte do sistema usada todos os dias, durante o turno. O conferente é quem '
  + 'mantém o registro vivo: cada palete que o operador move precisa virar uma linha no '
  + 'sistema. Essa seção mostra os 3 passos da rotina.'
);

tituloSecao('3.1  Lançar Reabastecimento da manhã');

paragrafo(
  'Logo após a entrega da véspera (geralmente entre 06h e 09h), o operador de empilhadeira '
  + 'começa a repor o Picking. Pra cada palete que ele move, você lança no sistema.'
);

placeholderPrint('Tela Lançar Abastecimento (/reab/lancar) — formulário esquerdo e lista de hoje à direita');

tituloSubSecao('Passo a passo');
passo(1, 'No menu lateral, abra "Reab → Lançar Abastecimento" (ou acesse /reab/lancar).');
passo(2, 'Comece digitando o código do produto ou parte do nome. O sistema sugere conforme você digita.');
passo(3, 'Selecione o produto na lista de sugestões.');
passo(4, 'No campo "Tipo", o sistema já marca 🌅 REABASTECIMENTO (porque é manhã).');
passo(5, 'Informe a quantidade de paletes que o operador moveu (campo "Quantidade de Paletes").');
passo(6, 'Clique em "✅ Confirmar Lançamento".');
passo(7, 'O lançamento aparece imediatamente na lista "Lançamentos de Hoje" à direita.');

destaque('Dica',
  'Se o operador moveu paletes de vários produtos seguidos, faça um lançamento por produto. '
  + 'Não some quantidades de produtos diferentes.',
  SOFT_BLUE, BLUE);

novaPagina('3 — Fluxo do conferente');
tituloSubSecao('Validações automáticas');
bullet('Produto obrigatório: se você não selecionar, aparece "Selecione um produto".');
bullet('Quantidade mínima: 1 palete. O campo não aceita 0 ou negativo.');
bullet('Tipo automático: das 22h às 06h59, vira RESSUPRIMENTO sozinho. Das 07h às 21h59, REABASTECIMENTO.');
bullet('Conferente registrado: o sistema grava AUTOMATICAMENTE o seu nome no lançamento.');
bullet('Horário do servidor: o "criado em" é a hora exata do clique, não do horário no relógio físico.');

tituloSubSecao('O que aparece em cada cartão da direita');
bullet('Nome do produto (em destaque).');
bullet('Código.');
bullet('Quantidade de paletes.');
bullet('Tipo (badge azul para Reab, vermelho para Ressp).');
bullet('Conferente que lançou.');
bullet('Faixa colorida à esquerda do cartão (azul ou vermelho) pra identificar o tipo de longe.');

destaque('E se eu errar?',
  'Não tem como editar pela tela Lançar. Vá em Reab → Registro Operacional e ajuste lá '
  + '(ou peça pro supervisor — só ele pode editar/excluir).',
  SOFT_AMBER, '#92400e');

novaPagina('3 — Fluxo do conferente');
tituloSecao('3.2  Lançar Ressuprimento noturno');

paragrafo(
  'Ressuprimento é a reposição de emergência: o Picking esvaziou antes da hora e o operador '
  + 'precisou ir buscar palete às pressas. Acontece de noite (22h às 06h59) ou na virada '
  + 'do turno. SEMPRE é considerado uma falha operacional — significa que o reabastecimento '
  + 'da manhã foi subestimado, ou o Picking está sub-dimensionado.'
);

placeholderPrint('Lançamento de ressuprimento — note o tipo automaticamente em vermelho');

tituloSubSecao('Passo a passo');
passo(1, 'Mesma tela: "Reab → Lançar Abastecimento".');
passo(2, 'Digite o código ou nome do produto.');
passo(3, 'Se o horário for entre 22h e 06h59, o sistema marca 🌙 RESSUPRIMENTO sozinho.');
passo(4, 'Informe a quantidade de paletes.');
passo(5, 'Clique em "✅ Confirmar Lançamento".');

destaque('Regra do dia operacional',
  'Lançamentos feitos entre 00h00 e 06h59 são CONTABILIZADOS NO DIA ANTERIOR. '
  + 'Ex: ressuprimento às 04h30 do dia 15 → entra no dia 14 no relatório. Isso garante '
  + 'que toda a "rodada de operação" do dia X fique junto.',
  SOFT_AMBER, '#92400e');

tituloSubSecao('Por que sempre é vermelho?');
paragrafo(
  'Todo ressuprimento sinaliza que o Picking acabou e a operação parou (mesmo que por '
  + '5 minutos). Isso atrasa a separação de pedidos e estressa o time. O Dashboard usa '
  + 'a quantidade de ressuprimentos como indicador da saúde do mês.'
);

novaPagina('3 — Fluxo do conferente');
tituloSecao('3.3  Consultar e ajustar o Registro');

paragrafo(
  'A tela "Reab → Registro Operacional" mostra TODO o histórico de lançamentos com filtros. '
  + 'É onde você consulta o que foi feito num dia, busca um produto específico, ou ajusta '
  + 'um lançamento errado (essa edição é só pra supervisor).'
);

placeholderPrint('Tela Registro Operacional (/reab/registro) com filtros no topo e tabela de histórico');

tituloSubSecao('Filtros disponíveis');
bullet('Busca por código ou nome do produto.');
bullet('Tipo: Todos / Apenas Reabastecimentos / Apenas Ressuprimentos.');
bullet('Data Início (DD/MM/AAAA).');
bullet('Data Fim (DD/MM/AAAA).');
bullet('Botão ✕ Limpar Filtros (no canto direito).');

tituloSubSecao('O que aparece na tabela');
bullet('Data e hora do lançamento.');
bullet('Produto (nome + código).');
bullet('Tipo (badge azul ou vermelho).');
bullet('Quantidade de paletes.');
bullet('Conferente que lançou.');

tituloSubSecao('Rodapé da tabela');
paragrafo(
  'O rodapé mostra um resumo do que está filtrado no momento: '
  + 'quantidade de registros encontrados, total de paletes reabastecidos (azul) e '
  + 'total de paletes ressupridos (vermelho).'
);

destaque('Apenas supervisor',
  'Editar a data de um lançamento, excluir registros e usar a importação CSV retroativa '
  + 'são funções protegidas. O conferente vê a tabela, mas não consegue mexer.',
  SOFT_RED, RED);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CAPÍTULO 4 — FLUXO DO SUPERVISOR                                         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
novaPagina('4 — Fluxo do supervisor');
tituloCapitulo('4', 'Fluxo do supervisor');

paragrafo(
  'O supervisor não lança movimentação no dia a dia — isso é função do conferente. '
  + 'O papel do supervisor é manter os cadastros corretos, importar os dados de venda '
  + 'e usar os dashboards pra entender se a operação está saudável.'
);

tituloSecao('4.1  Cadastrar produtos no Picking');

paragrafo(
  'A tela "Reab → Configurar Picking" é onde você define QUAIS produtos têm Picking e '
  + 'QUANTAS posições de palete cada um ocupa. Sem esse cadastro, o produto não entra em '
  + 'nenhum cálculo de reabastecimento.'
);

placeholderPrint('Tela Configurar Picking (/reab/config) com tabela de produtos cadastrados e seletor de mês');

tituloSubSecao('Cadastro é MENSAL');
paragrafo(
  'Cada mês tem o seu próprio cadastro. Isso permite mudar a configuração de um mês pro '
  + 'outro sem afetar o histórico. Ex: aumentou os espaços de SKOL em junho? O dashboard '
  + 'de maio continua mostrando a config de maio.'
);

tituloSubSecao('Cadastrar produto manualmente');
passo(1, 'Selecione o mês de referência (canto superior).');
passo(2, 'Clique em "+ Adicionar Produto".');
passo(3, 'Digite o código (ou nome — busca automática).');
passo(4, 'Selecione o produto da lista de sugestões.');
passo(5, 'Informe a quantidade de "Espaços Palete" (mínimo 1).');
passo(6, 'O campo "CX/PLT" vem preenchido automaticamente do catálogo (01.11). Edite se necessário.');
passo(7, 'Confirme. O produto aparece na tabela com a "Capacidade Picking" calculada.');

novaPagina('4 — Fluxo do supervisor');
tituloSubSecao('Cadastrar via importação (CSV ou Excel)');

paragrafo('Pra cadastrar muitos produtos de uma vez, use a importação de arquivo.');

destaque('Formato esperado',
  'Coluna A = Mês (texto YYYY-MM), B = Código, C = Nome, D = Espaços Palete. '
  + 'A primeira linha é cabeçalho.',
  SOFT_BG, DARK);

passo(1, 'Clique em "📥 Importar" (canto superior direito).');
passo(2, 'Selecione o arquivo .xlsx ou .csv no formato acima.');
passo(3, 'O sistema processa e mostra: "X mês(es) importado(s): [lista]".');
passo(4, 'Se algum produto não tiver "Espaços Palete" preenchido (coluna D vazia), aparece como UNDEFINED — você edita um por um depois.');

tituloSubSecao('Editar ou excluir');
bullet('Clique no ícone ✏️ na linha do produto pra editar (inline).');
bullet('Clique em ✕ pra excluir aquele cadastro do mês selecionado.');
bullet('Use os filtros (busca por código/nome) e a ordenação por coluna (clique no cabeçalho) pra encontrar rápido.');

destaque('Cuidado',
  'Excluir um cadastro de Picking não apaga os lançamentos históricos daquele produto. '
  + 'Só significa que ele não aparece mais nos cálculos do mês selecionado.',
  SOFT_AMBER, '#92400e');

novaPagina('4 — Fluxo do supervisor');
tituloSecao('4.2  Importar Relatório de Vendas');

paragrafo(
  'O relatório de vendas (03.02.36.08, exportado do sistema corporativo) é a base de tudo. '
  + 'Sem ele, o Planificador não tem como calcular "quanto deveria ter sido reabastecido" '
  + 'em cada dia. A importação separa as vendas em três grupos:'
);

bullet('PICKING: vendas dos produtos que estão cadastrados na Configuração de Picking.');
bullet('PRÉ-PICKING: vendas de produtos que NÃO estão cadastrados (mas existem no catálogo).');
bullet('AVULSAS: vendas marcadas como avulsas (coluna AB do relatório).');

placeholderPrint('Tela Importar Vendas (/reab/importar-vendas) — botão de seleção + área de preview');

tituloSubSecao('Passo a passo');
passo(1, 'Acesse "Reab → Importar Vendas" (ou /reab/importar-vendas).');
passo(2, 'Clique em "📂 Selecionar Arquivo" e escolha o .xlsx exportado.');
passo(3, 'Aguarde o processamento. Aparece um resumo: "✅ Picking: X linhas · Y produtos · Z dias".');
passo(4, 'Confira se o período está correto (data início até data fim no box azul).');
passo(5, 'Clique em "💾 Salvar Relatório".');
passo(6, 'O sistema salva e invalida os caches — o Planificador, Dashboard e VendasPage vão refletir os dados novos no próximo carregamento.');

novaPagina('4 — Fluxo do supervisor');
tituloSubSecao('Regras de parsing automáticas');

paragrafo(
  'A importação tem várias regras técnicas que rodam sem você ver. Entender elas evita '
  + 'surpresas:'
);

bullet('Coluna B (Data): aceita formato Excel serial, ISO ou MM/DD/AAAA. Quando ambíguo (ex: 03/04), assume MM/DD (padrão americano do relatório).');
bullet('Coluna T (Código): código do produto.');
bullet('Coluna AA (Qtd caixas): quantidade vendida.');
bullet('Coluna AB (Avulsas): se marcado como avulsa, vai pra coleção separada.');
bullet('Coluna AC (Palete Fechado): apenas "Não" entra no Picking. "Sim" é palete fechado, vai pra Estoque (ignorado aqui).');

destaque('Apagar tudo',
  'No final da tela tem uma "zona de perigo" com "🗑️ Apagar todos os relatórios". '
  + 'Use SÓ se precisar reimportar do zero. Pede confirmação dupla.',
  SOFT_RED, RED);

tituloSubSecao('Quando reimportar');
bullet('Quando você baixou um novo período do sistema corporativo.');
bullet('Quando descobriu que importou o relatório errado.');
bullet('Quando o relatório original foi corrigido (alguma venda errada foi ajustada).');

novaPagina('4 — Fluxo do supervisor');
tituloSecao('4.3  Consultar Vendas');

paragrafo(
  'A tela "Reab → Vendas" mostra todas as vendas importadas em formato de tabela cruzada: '
  + 'produtos nas linhas, dias nas colunas. É a forma mais rápida de ver "quanto vendeu '
  + 'cada coisa em cada dia do mês".'
);

placeholderPrint('Tela Vendas (/reab/vendas) — pivot produto × dia, com busca e seletor de mês');

tituloSubSecao('Como usar');
passo(1, 'Selecione o ano e o mês no topo.');
passo(2, 'Use o campo de busca pra filtrar por código ou nome.');
passo(3, 'A tabela mostra a quantidade vendida em cada dia (ou "—" se não vendeu).');
passo(4, 'O rodapé indica o período coberto (DD até DD), quantos dias e quantos produtos.');

destaque('Cache local',
  'A tela usa cache pra ser rápida. Se você acabou de importar um relatório novo e não '
  + 'vê os dados, clique em "🔄 Atualizar" pra forçar nova leitura do banco.',
  SOFT_BLUE, BLUE);

novaPagina('4 — Fluxo do supervisor');
tituloSecao('4.4  Dashboard IV — como ler');

paragrafo(
  'O Dashboard IV é o painel gerencial do módulo. É onde o supervisor passa o olho '
  + 'pra entender se o mês está saudável, quais produtos estão dando trabalho e onde '
  + 'precisa ajustar a configuração do Picking.'
);

placeholderPrint('Dashboard IV (/reab/dashboard) — KPIs no topo, gráfico de evolução, ranking de produtos');

tituloSubSecao('Bloco 1 — KPIs do mês');
bullet('Total de paletes REABASTECIDOS no mês (azul).');
bullet('Total de paletes RESSUPRIDOS no mês (vermelho).');
bullet('Quantidade de produtos que precisaram de pelo menos 1 ressuprimento.');

tituloSubSecao('Bloco 2 — Gráfico de evolução');
paragrafo(
  'Barra dupla pros últimos 6 meses: azul para reab, vermelho para ressp. Ajuda a ver '
  + 'tendências (ex: ressuprimento subindo mês a mês? algo está degradando).'
);

tituloSubSecao('Bloco 3 — Ranking de produtos');
bullet('Cada linha = um produto com algum movimento no mês.');
bullet('Total de movimentos = soma de reab + ressp em paletes.');
bullet('Espaço Ideal = quantidade de espaços que o produto DEVERIA ter (calculado pelo pico de vendas).');
bullet('Sub-dimensionados = produtos onde "Espaço Ideal > Espaço Atual" (precisam de mais Picking).');
bullet('Clique no cabeçalho de qualquer coluna pra ordenar.');

novaPagina('4 — Fluxo do supervisor');
tituloSubSecao('Bloco 4 — Rebalanceamento');
paragrafo(
  'Esta seção mostra o "déficit" e "superávit" total de espaços. Se você somou todos os '
  + 'produtos sub-dimensionados, quantos espaços precisaria abrir? E quantos sobram em '
  + 'produtos super-dimensionados? Use isso pra realocar Picking entre produtos sem '
  + 'precisar aumentar a área total.'
);

placeholderPrint('Bloco de Rebalanceamento — mostrando déficit (vermelho) vs superávit (verde) de espaços');

tituloSubSecao('Painel de regras (somente supervisor)');
paragrafo(
  'No canto, o ícone ⚙️ abre um modal com 5 parâmetros que controlam como o sistema '
  + 'calcula sinergias e ociosidades (paletes mistos, tetos, dias de cobertura). '
  + 'Mexer aqui só se entender o que está fazendo — afeta TODOS os cálculos do dashboard.'
);

destaque('Cores das células do mapa',
  'No mapa de calor: cinzento claro = 0 movimentos · azul progressivo = reabs · '
  + 'vermelho escuro = ressuprimento ≥ 3. Quanto mais escuro, mais grave.',
  SOFT_BG, DARK);

novaPagina('4 — Fluxo do supervisor');
tituloSecao('4.5  Planificador IV — como ler');

paragrafo(
  'O Planificador é uma tabela mensal cruzada: cada linha é um produto, cada coluna é '
  + 'um dia. Mostra o que foi PLANEJADO (quanto deveria ter sido reabastecido com base '
  + 'nas vendas do dia anterior) e o que foi REAL (lançamento do conferente).'
);

placeholderPrint('Planificador IV (/reab/planificador) — pivot produto × dia com Plan / Real / GAP');

tituloSubSecao('Dois modos');
bullet('PLANEJADO: cada célula mostra "Plan | Real | GAP" (planejado, realizado, diferença).');
bullet('REAL: cada célula mostra apenas o que foi ressuprido.');

tituloSubSecao('Regras de cálculo do Planejado');
bullet('Domingo: "—" (não há operação).');
bullet('Segunda-feira: vendas do SÁBADO (pula o domingo, vai pro D-2).');
bullet('Terça a Sábado: vendas do DIA ANTERIOR (D-1).');
bullet('Dias futuros: 0.');
bullet('Quando o relatório de vendas não tem aquela data: "—" (dado ausente, não é zero).');

destaque('Por que D-1?',
  'O reabastecimento da manhã do dia X repõe o que foi vendido no dia X-1. Por isso o '
  + 'planejado de hoje olha pras vendas de ontem.',
  SOFT_BLUE, BLUE);

novaPagina('4 — Fluxo do supervisor');
tituloSubSecao('Cores das células');
bullet('Cinza claro: domingo (sem operação) ou dia sem dados.');
bullet('Azul: só houve reabastecimento (cor mais escura = mais paletes).');
bullet('Vermelho/rosa: só houve ressuprimento (escala por intensidade).');
bullet('Laranja: dia teve REAB e RESSP. Indica que mesmo após reabastecer, faltou.');

tituloSubSecao('Saldo simulado de Picking');
paragrafo(
  'O Planificador roda uma simulação no background: começa com o Picking cheio (capacidade '
  + 'do produto), subtrai as vendas do dia, soma os reabs, e se o saldo ficar negativo, '
  + 'sinaliza um ressuprimento automático. Isso ajuda a prever ressuprimentos antes deles '
  + 'acontecerem.'
);

tituloSubSecao('Exportar CSV');
paragrafo(
  'O botão de exportar na parte de cima gera um CSV com a tabela completa, útil pra '
  + 'analisar em Excel ou compartilhar com outras áreas.'
);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CAPÍTULO 5 — REGRAS AUTOMÁTICAS                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
novaPagina('5 — Regras automáticas');
tituloCapitulo('5', 'Regras automáticas do sistema');

paragrafo(
  'Esta seção lista o que o sistema decide automaticamente, sem você ver. Conhecer essas '
  + 'regras evita confusão na hora de interpretar os números.'
);

tituloSecao('Dia operacional');
destaque('Regra',
  'Lançamentos feitos entre 00h00 e 06h59 são gravados no DIA ANTERIOR. '
  + 'Ex: ressuprimento às 04h30 do dia 15 → entra no dia 14.',
  SOFT_BG, DARK);
paragrafo(
  'Motivo: a "rodada de operação" de um dia geralmente termina de madrugada do dia seguinte. '
  + 'Agrupar tudo no mesmo dia operacional facilita a análise.'
);

tituloSecao('Reabastecimento vs Ressuprimento');
destaque('Regra',
  'Hora < 07:00 ou ≥ 22:00 → RESSUPRIMENTO. Caso contrário → REABASTECIMENTO. '
  + 'Decidido sozinho na hora do lançamento.',
  SOFT_BG, DARK);

tituloSecao('Vendas de referência');
destaque('Regra',
  'Reabastecimento usa vendas do dia ANTERIOR (D-1). Ressuprimento usa vendas do '
  + 'PRÓPRIO dia (D+0). Segunda-feira pula domingo e olha pro sábado.',
  SOFT_BG, DARK);

tituloSecao('Status de aderência');
tabela(
  ['Status', 'Quando', 'Cor'],
  [
    ['✅ OK',          'Reab entre 80% e 120% do esperado', 'Verde'],
    ['⚠️ Acima',       'Reab > 120% do esperado',          'Amarelo'],
    ['⬇️ Abaixo',      'Reab < 80% do esperado',           'Cinza/Laranja'],
    ['🚨 Falha',       'Qualquer ressuprimento',           'Vermelho'],
  ],
  [85, 290, 100]
);

novaPagina('5 — Regras automáticas');
tituloSecao('Simulação de saldo de Picking');
paragrafo(
  'O Planificador roda uma simulação dia-a-dia: começa com o Picking cheio (capacidade '
  + 'do produto = espaços × cx/palete), desconta as vendas do dia, soma os reabastecimentos, '
  + 'e se o saldo ficar negativo, marca como ressuprimento automático esperado.'
);

tituloSecao('Auto-detecção do conferente');
paragrafo(
  'Quando você lança, o sistema grava AUTOMATICAMENTE o seu nome no campo "conferente". '
  + 'Não precisa preencher manualmente. Esse nome aparece no histórico do Registro.'
);

tituloSecao('Caches locais');
paragrafo(
  'Várias telas (Vendas, Planificador, Dashboard) usam cache em memória pra serem rápidas. '
  + 'Quando você importa um relatório novo, esses caches são invalidados automaticamente — '
  + 'mas se algo parecer desatualizado, clique no botão "🔄 Atualizar" da tela em questão.'
);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CAPÍTULO 6 — SOLUÇÃO DE PROBLEMAS                                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
novaPagina('6 — Solução de problemas');
tituloCapitulo('6', 'Solução de problemas');

paragrafo(
  'Mensagens e situações comuns, com o que fazer em cada uma.'
);

tabela(
  ['Situação', 'O que fazer'],
  [
    ['"Selecione um produto"',
     'Você clicou em Confirmar sem escolher o produto da lista de sugestões. Digite e clique numa das opções.'],
    ['"Informe a quantidade"',
     'Campo de paletes vazio ou 0. Digite um número ≥ 1.'],
    ['Lançamento não aparece na lista de hoje',
     'A lista mostra apenas o dia operacional corrente. Se você lançou depois das 22h pro dia anterior, abra "Registro" pra ver.'],
    ['"Nenhum produto configurado"',
     'Você abriu a Configuração de Picking num mês sem cadastro. Selecione outro mês ou cadastre.'],
    ['Dashboard vazio',
     'Não há lançamentos no mês selecionado, ou os filtros estão zerando tudo. Confira o seletor mês/ano.'],
    ['Planificador sem dados',
     'O relatório de vendas daquele mês não foi importado, ou a configuração de Picking está vazia.'],
    ['Vendas desatualizadas',
     'Clique em "🔄 Atualizar" na tela de Vendas pra forçar leitura do banco.'],
    ['"⚠️ Nenhuma linha válida"',
     'Na importação de vendas: verifique se a coluna AC tem "Não" (palete fechado = ignorado).'],
    ['Tipo errado (reab × ressp)',
     'O sistema decide pelo horário. Se você lançou no horário errado, peça pro supervisor editar no Registro.'],
    ['Conferente errado',
     'O sistema usa o LOGIN ativo. Saia e entre com o usuário correto antes de lançar.'],
  ],
  [180, 295]
);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  GLOSSÁRIO                                                                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
novaPagina('Glossário');
tituloCapitulo('—', 'Glossário');

const termos = [
  ['Reabastecimento',  'Reposição PLANEJADA do Picking, geralmente de manhã. Tipo "Reab" no sistema.'],
  ['Ressuprimento',    'Reposição EMERGENCIAL do Picking, geralmente de madrugada. Tipo "Ressp" no sistema. Sempre é uma falha operacional.'],
  ['Picking',          'Área do armazém onde os pedidos são SEPARADOS. Tem espaço limitado por produto.'],
  ['Estoque',          'Área grande do armazém, onde os paletes ficam guardados. Origem dos reabs.'],
  ['Espaço Palete',    'Quantidade de posições de palete que um produto OCUPA no Picking.'],
  ['Cx/Plt',           'Quantas caixas tem em UM palete cheio daquele produto. Vem do relatório 01.11.'],
  ['Capacidade Picking', 'Total de caixas que cabem no Picking pro produto. = Espaços × Cx/Plt.'],
  ['Sub-dimensionado', 'Produto onde a venda média > capacidade Picking. Precisa de mais espaços.'],
  ['IV (Índice de Vendas)', 'Indicador da saúde do reabastecimento — quanto está sendo reabastecido vs ressuprido.'],
  ['D-1 / D+0',        'D-1 = dia anterior · D+0 = mesmo dia. Reab usa D-1, Ressp usa D+0.'],
  ['Dia Operacional',  'Período de operação que inclui a madrugada. Lançamento de 00h-06h59 entra no dia anterior.'],
  ['Conferente',       'Quem LANÇA no sistema. Não é quem move o palete.'],
  ['Op. Empilhadeira', 'Quem MOVE o palete fisicamente. Não usa sistema.'],
  ['Supervisor',       'Cadastra, importa, analisa. Tem permissão pra editar/excluir.'],
  ['03.02.36.08',      'Relatório de vendas exportado do sistema corporativo (Excel). Base do Planificador.'],
  ['01.11',            'Catálogo de produtos com paletização. Importado em Configurações.'],
  ['Plan / Real / GAP', 'No Planificador: planejado pelo sistema · realizado pelo conferente · diferença.'],
];

termos.forEach(([termo, desc]) => {
  const y0 = doc.y;
  doc.fillColor(RED).fontSize(10.5).font('Helvetica-Bold').text(termo, MARGIN, y0, { width: 145 });
  doc.fillColor(TEXT).fontSize(10).font('Helvetica')
    .text(desc, MARGIN + 150, y0, { width: CONTENT_W - 150, lineGap: 1 });
  doc.moveDown(0.6);
});

// ─── Aplica cabeçalho/rodapé em todas as páginas e finaliza ────────────────
aplicarCabecalhoRodape();
doc.end();

console.log(`✅ Manual gerado: ${outPath}`);
