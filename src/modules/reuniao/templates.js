/**
 * Templates premium da Reunião — paleta "Grafite + Vermelho WJS".
 *
 * Cada função recebe `pptx` e os dados, e adiciona um slide formatado.
 *
 * Filosofia visual:
 *   - Fundo grafite escuro (#1A1A1F) — profissional, foco no conteúdo
 *   - Acentos em vermelho WJS (#E31837) com variações (gradient para magenta)
 *   - Dourado/âmbar (#F59E0B) pra metas e indicadores positivos
 *   - Tipografia: Inter (fallback Segoe UI, Calibri)
 *   - Cards translúcidos com sombra colorida (efeito glow simulado)
 *   - Whitespace generoso
 *
 * Layout: assume `LAYOUT_WIDE` (13.333 × 7.5 in).
 */

// ─── Paleta ──────────────────────────────────────────────────────────────────
export const CORES = {
  // Fundos
  bgGrafite:    '1A1A1F',   // fundo principal dos slides
  bgGrafiteAlt: '232328',   // tom secundário (cards)
  bgGrafiteSub: '14141A',   // tom mais escuro (sub-blocos)

  // Marca
  red:        'E31837',     // vermelho WJS
  redDark:    '8B0F23',     // vermelho mais escuro pra gradients
  redGlow:    'FF1744',     // vermelho mais vivo pra acentos
  magenta:    'C2185B',     // pra gradient com vermelho

  // Status / variações
  amber:      'F59E0B',     // dourado/âmbar (metas)
  amberDark:  '92400E',
  green:      '10B981',     // verde (positivo)
  greenDark:  '047857',
  blue:       '3B82F6',     // azul (info)
  blueDark:   '1E40AF',
  cyan:       '06B6D4',
  purple:     'A855F7',

  // Textos
  white:      'FFFFFF',
  text:       'F8FAFC',     // texto claro principal (sobre fundo escuro)
  textSec:    'CBD5E1',     // texto secundário
  textMuted:  '64748B',     // texto muted
  border:     '2E2E36',     // bordas sutis sobre fundo escuro
  borderLight:'2A2A30',

  // Compatibilidade com nomes antigos (alguns módulos importam estes)
  redSoft:    'FEE2E2',
  blueSoft:   'DBEAFE',
  amberSoft:  'FEF3C7',
  greenSoft:  'DCFCE7',
  bg:         '1A1A1F',
  surface:    '232328',
};

const FONTE      = 'Inter';        // fallback automático pro Office: Segoe UI, Calibri
const FONTE_MONO = 'JetBrains Mono';

// ═════════════════════════════════════════════════════════════════════════════
// CAPA PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
export function adicionarCapaPrincipal(pptx, { titulo, periodo, empresa }) {
  const slide = pptx.addSlide();
  slide.background = { color: CORES.bgGrafite };

  // ── Elementos decorativos (círculos abstratos no canto direito) ──
  // Círculo grande translúcido vermelho
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 9.0, y: -1.5, w: 6.5, h: 6.5,
    fill: { color: CORES.red, transparency: 88 },
    line: { type: 'none' },
  });
  // Círculo menor magenta
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 10.5, y: 3.0, w: 3.5, h: 3.5,
    fill: { color: CORES.magenta, transparency: 82 },
    line: { type: 'none' },
  });
  // Círculo pequeno âmbar
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 8.5, y: 5.5, w: 2.0, h: 2.0,
    fill: { color: CORES.amber, transparency: 90 },
    line: { type: 'none' },
  });

  // ── Faixa vermelha à esquerda (marca) ──
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.15, h: 7.5,
    fill: { color: CORES.red }, line: { type: 'none' },
  });

  // ── Kicker (nome do encontro por extenso) ──
  slide.addText('— REUNIÃO DE PLANEJAMENTO SEMANAL', {
    x: 0.7, y: 2.4, w: 11, h: 0.5,
    fontFace: FONTE, fontSize: 13, color: CORES.red,
    bold: true, charSpacing: 6,
  });

  // ── Título grande ──
  slide.addText(titulo || 'WJS', {
    x: 0.7, y: 2.9, w: 9, h: 1.6,
    fontFace: FONTE, fontSize: 80, color: CORES.text,
    bold: true,
  });

  // ── Linha decorativa horizontal ──
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7, y: 4.8, w: 1.5, h: 0.05,
    fill: { color: CORES.red }, line: { type: 'none' },
  });

  // ── Período ──
  slide.addText(periodo, {
    x: 0.7, y: 5.0, w: 9, h: 0.5,
    fontFace: FONTE, fontSize: 22, color: CORES.text,
    bold: false,
  });

  // ── Empresa ──
  slide.addText(empresa || 'WJS', {
    x: 0.7, y: 5.6, w: 9, h: 0.5,
    fontFace: FONTE, fontSize: 16, color: CORES.textSec,
  });

  // ── Rodapé: responsável (canto inferior esquerdo) ──
  slide.addText('Sup. Jobson Rafaell', {
    x: 0.7, y: 6.8, w: 6, h: 0.4,
    fontFace: FONTE, fontSize: 12, color: CORES.textSec,
  });

  // ── Marca discreta no canto inferior direito ──
  slide.addText('WJS - Warehouse Job System', {
    x: 6.5, y: 6.9, w: 6.4, h: 0.35,
    fontFace: FONTE, fontSize: 11, color: CORES.textMuted,
    align: 'right',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SUMÁRIO
// ═════════════════════════════════════════════════════════════════════════════
export function adicionarSumario(pptx, { itens }) {
  const slide = pptx.addSlide();
  slide.background = { color: CORES.bgGrafite };
  adicionarHeaderSlide(pptx, slide);

  slide.addText('Indicadores', {
    x: 0.7, y: 0.55, w: 12, h: 0.7,
    fontFace: FONTE, fontSize: 38, color: CORES.text, bold: true,
  });

  // Distribui em colunas se tiver muitos itens
  const total = itens.length;
  const colunas = total > 5 ? 2 : 1;
  const porColuna = Math.ceil(total / colunas);
  const colW = colunas === 1 ? 11.5 : 5.7;
  const startY = 2.4;
  const itemH  = 0.7;

  itens.forEach((item, i) => {
    const col = Math.floor(i / porColuna);
    const row = i % porColuna;
    const x   = 0.7 + col * (colW + 0.3);
    const y   = startY + row * itemH;

    // Número grande
    slide.addText(String(i + 1).padStart(2, '0'), {
      x, y, w: 0.7, h: itemH,
      fontFace: FONTE_MONO, fontSize: 22, color: CORES.red,
      bold: true, valign: 'middle',
    });
    // Linha vertical decorativa
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.7, y: y + 0.1, w: 0.04, h: itemH - 0.2,
      fill: { color: CORES.red, transparency: 50 }, line: { type: 'none' },
    });
    // Label do módulo
    slide.addText(item, {
      x: x + 0.85, y, w: colW - 0.85, h: itemH,
      fontFace: FONTE, fontSize: 16, color: CORES.text, valign: 'middle',
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// HEADER DOS SLIDES DE MÓDULO (linha fina vermelha em cima + título à esquerda)
// ═════════════════════════════════════════════════════════════════════════════
function adicionarHeaderSlide(pptx, slide) {
  // Linha vermelha fina no topo (full width)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.06,
    fill: { color: CORES.red }, line: { type: 'none' },
  });
  // Linha sub-fina sob a vermelha (borda)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0.06, w: 13.333, h: 0.015,
    fill: { color: CORES.redDark }, line: { type: 'none' },
  });
}

function adicionarHeaderModulo(pptx, slide, { modulo, subtitulo, periodo }) {
  adicionarHeaderSlide(pptx, slide);

  // Nome do módulo + subtítulo
  slide.addText([
    { text: modulo, options: { color: CORES.text, bold: true } },
    { text: '  ',   options: {} },
    { text: subtitulo, options: { color: CORES.textSec, bold: false } },
  ], {
    x: 0.5, y: 0.55, w: 9, h: 0.55,
    fontFace: FONTE, fontSize: 22,
  });
  // Período à direita
  if (periodo) {
    slide.addText(periodo, {
      x: 9.5, y: 0.65, w: 3.5, h: 0.5,
      fontFace: FONTE_MONO, fontSize: 11, color: CORES.textSec,
      align: 'right',
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE DE KPIs
// ═════════════════════════════════════════════════════════════════════════════
export function adicionarKPIs(pptx, { modulo, subtitulo = 'Resumo Executivo', periodo, kpis }) {
  const slide = pptx.addSlide();
  slide.background = { color: CORES.bgGrafite };
  adicionarHeaderModulo(pptx, slide, { modulo, subtitulo, periodo });

  // Distribui os cards horizontalmente
  const total  = kpis.length;
  const gap    = 0.2;
  const startX = 0.5;
  const totalW = 12.3;
  const cardW  = (totalW - gap * (total - 1)) / total;
  const cardH  = 3.4;
  const cardY  = 2.2;

  kpis.forEach((kpi, i) => {
    const x   = startX + i * (cardW + gap);
    const cor = kpi.cor || CORES.red;

    // Sombra suave atrás do card (efeito glow)
    slide.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.04, y: cardY + 0.06, w: cardW, h: cardH,
      fill: { color: cor, transparency: 92 },
      line: { type: 'none' },
      rectRadius: 0.12,
    });
    // Card principal (cinza grafite levemente mais claro)
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: cardY, w: cardW, h: cardH,
      fill: { color: CORES.bgGrafiteAlt },
      line: { color: CORES.border, width: 1 },
      rectRadius: 0.12,
    });
    // Faixa colorida superior do card (4px)
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.1, y: cardY + 0.1, w: cardW - 0.2, h: 0.06,
      fill: { color: cor }, line: { type: 'none' },
    });
    // Label (uppercase)
    slide.addText(kpi.label, {
      x: x + 0.3, y: cardY + 0.35, w: cardW - 0.4, h: 0.4,
      fontFace: FONTE, fontSize: 10, color: CORES.textMuted,
      bold: true, charSpacing: 3,
    });
    // Valor (auto-shrink conforme tamanho)
    const valorStr  = String(kpi.valor || '—');
    const valorSize = valorStr.length > 12 ? 24 : valorStr.length > 9 ? 28 : 34;
    slide.addText(valorStr, {
      x: x + 0.3, y: cardY + 1.15, w: cardW - 0.4, h: 1.4,
      fontFace: FONTE_MONO, fontSize: valorSize, color: cor,
      bold: true, valign: 'middle',
    });
    // Sub opcional
    if (kpi.sub) {
      slide.addText(kpi.sub, {
        x: x + 0.3, y: cardY + 2.7, w: cardW - 0.4, h: 0.5,
        fontFace: FONTE, fontSize: 10, color: CORES.textSec,
      });
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE COM 1 GRÁFICO (solo)
// ═════════════════════════════════════════════════════════════════════════════
export function adicionarSlideGraficoBarras(pptx, { modulo, subtitulo, periodo, dados, corBarra = CORES.red, tipoBarra = 'barH' }) {
  const slide = pptx.addSlide();
  slide.background = { color: CORES.bgGrafite };
  adicionarHeaderModulo(pptx, slide, { modulo, subtitulo, periodo });
  desenharBlocoGrafico(pptx, slide, {
    tipo: tipoBarra,
    dados,
    corBarra,
    x: 0.4, y: 1.5, w: 12.55, h: 5.7,
  });
}

export function adicionarSlideGraficoLinha(pptx, { modulo, subtitulo, periodo, series, cores = [CORES.cyan, CORES.red] }) {
  const slide = pptx.addSlide();
  slide.background = { color: CORES.bgGrafite };
  adicionarHeaderModulo(pptx, slide, { modulo, subtitulo, periodo });
  desenharBlocoGrafico(pptx, slide, {
    tipo: 'line',
    series,
    cores,
    x: 0.4, y: 1.5, w: 12.55, h: 5.7,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE DE IMAGEM (print da tela do app — "híbrido")
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Adiciona 1 slide contendo uma imagem (PNG dataURL) que "printa" a cara do app.
 * A imagem é encaixada em 13.333×7.5in preservando a proporção (aspect-fit),
 * centralizada, com fundo claro igual ao do app (evita moldura escura ao redor).
 *
 * @param {PptxGenJS} pptx
 * @param {Object} params
 * @param {string} params.dataUrl - 'data:image/png;base64,...'
 * @param {number} params.imgW    - largura da imagem em px
 * @param {number} params.imgH    - altura da imagem em px
 * @param {string} [params.fundo] - cor de fundo do slide (hex sem #). Padrão: F8FAFC (D.bg)
 */
export function adicionarSlideImagem(pptx, { dataUrl, imgW, imgH, fundo = 'F8FAFC' }) {
  const slide = pptx.addSlide();
  slide.background = { color: fundo };

  const SLIDE_W = 13.333, SLIDE_H = 7.5, MARGEM = 0.12;
  const dispW = SLIDE_W - MARGEM * 2;
  const dispH = SLIDE_H - MARGEM * 2;
  const aspImg  = (imgW && imgH) ? imgW / imgH : dispW / dispH;
  const aspDisp = dispW / dispH;

  let w, h;
  if (aspImg > aspDisp) { w = dispW; h = dispW / aspImg; }   // limitado pela largura
  else                  { h = dispH; w = dispH * aspImg; }   // limitado pela altura
  const x = (SLIDE_W - w) / 2;
  const y = (SLIDE_H - h) / 2;

  slide.addImage({ data: dataUrl, x, y, w, h });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE "SPLIT" (2 gráficos lado a lado — usado se quiser layouts compostos)
// ═════════════════════════════════════════════════════════════════════════════
export function adicionarSlideSplit(pptx, { modulo, subtitulo, periodo, esquerda, direita }) {
  const slide = pptx.addSlide();
  slide.background = { color: CORES.bgGrafite };
  adicionarHeaderModulo(pptx, slide, { modulo, subtitulo, periodo });
  desenharBlocoGrafico(pptx, slide, { ...esquerda, x: 0.4, y: 1.5, w: 6.3, h: 5.7 });
  desenharBlocoGrafico(pptx, slide, { ...direita,  x: 6.7, y: 1.5, w: 6.3, h: 5.7 });
}

// ─── Desenho de bloco de gráfico (com card de fundo sutil) ──────────────────
function desenharBlocoGrafico(pptx, slide, { tipo, titulo, dados, series, cores, corBarra, x, y, w, h }) {
  // Card de fundo (mais escuro que o slide pra criar profundidade)
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: CORES.bgGrafiteAlt },
    line: { color: CORES.border, width: 1 },
    rectRadius: 0.12,
  });

  if (titulo) {
    slide.addText(titulo, {
      x: x + 0.3, y: y + 0.15, w: w - 0.6, h: 0.4,
      fontFace: FONTE, fontSize: 13, color: CORES.text, bold: true,
    });
  }

  const padTop  = titulo ? 0.6 : 0.25;
  const chartY  = y + padTop;
  const chartH  = h - padTop - 0.2;
  const chartX  = x + 0.2;
  const chartW  = w - 0.4;

  const vazio = tipo === 'line'
    ? (!series || series.length === 0 || series.every(s => !s.dados || s.dados.length === 0))
    : (!dados || dados.length === 0);

  if (vazio) {
    slide.addText('Sem dados pra este período.', {
      x, y: chartY + chartH / 2 - 0.15, w, h: 0.4,
      fontFace: FONTE, fontSize: 13, color: CORES.textMuted,
      align: 'center', italic: true,
    });
    return;
  }

  if (tipo === 'bar' || tipo === 'barH') {
    const chartData = [{
      name: titulo || 'Valor',
      labels: dados.map(d => String(d.name)),
      values: dados.map(d => Number(d.value) || 0),
    }];
    slide.addChart(pptx.ChartType.bar, chartData, {
      x: chartX, y: chartY, w: chartW, h: chartH,
      barDir: tipo === 'barH' ? 'bar' : 'col',
      chartColors: [corBarra || CORES.red],
      showLegend: false,
      showValue: true,
      dataLabelFontFace: FONTE,
      dataLabelFontSize: 9,
      dataLabelColor: CORES.text,
      catAxisLabelFontFace: FONTE,
      catAxisLabelFontSize: 9,
      catAxisLabelColor: CORES.textSec,
      valAxisLabelFontFace: FONTE_MONO,
      valAxisLabelFontSize: 8,
      valAxisLabelColor: CORES.textMuted,
      valAxisLabelFormatCode: tipo === 'barH' || /R\$/.test(titulo || '') ? 'R$ #,##0' : '#,##0',
      barGapWidthPct: 60,
      catGridLine: { style: 'none' },
      valGridLine: { color: CORES.border, style: 'solid', size: 0.5 },
      catAxisLineColor: CORES.border,
      valAxisLineColor: CORES.border,
      plotArea: { fill: { type: 'none' } },
      chartArea: { fill: { type: 'none' } },
    });
  } else if (tipo === 'line') {
    const labels = series[0].dados.map(d => String(d.x));
    const chartData = series.map(s => ({
      name: s.name,
      labels,
      values: s.dados.map(d => (d.y == null ? null : Number(d.y))),
    }));
    slide.addChart(pptx.ChartType.line, chartData, {
      x: chartX, y: chartY, w: chartW, h: chartH,
      chartColors: cores || [CORES.cyan, CORES.red],
      lineDataSymbol: 'circle',
      lineDataSymbolSize: 6,
      lineSize: 2.5,
      showLegend: series.length > 1,
      legendPos: 'b',
      legendFontFace: FONTE,
      legendFontSize: 10,
      legendColor: CORES.textSec,
      catAxisLabelFontFace: FONTE,
      catAxisLabelFontSize: 9,
      catAxisLabelColor: CORES.textSec,
      valAxisLabelFontFace: FONTE_MONO,
      valAxisLabelFontSize: 8,
      valAxisLabelColor: CORES.textMuted,
      valAxisLabelFormatCode: 'R$ #,##0',
      catGridLine: { style: 'none' },
      valGridLine: { color: CORES.border, style: 'solid', size: 0.5 },
      catAxisLineColor: CORES.border,
      valAxisLineColor: CORES.border,
      plotArea: { fill: { type: 'none' } },
      chartArea: { fill: { type: 'none' } },
    });
  }
}

// ─── Helpers de formatação ────────────────────────────────────────────────────
export function formatarPeriodoBR(dataInicioISO, dataFimISO) {
  const fmt = iso => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  return `${fmt(dataInicioISO)} → ${fmt(dataFimISO)}`;
}

export function dataHoraAtualBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
