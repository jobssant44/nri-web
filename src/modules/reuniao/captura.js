/**
 * Captura de componente React → PNG (dataURL), pra "printar" a cara do app
 * dentro dos slides da Reunião.
 *
 * Fluxo: monta o elemento num container FORA da tela (largura fixa em px),
 * espera o Recharts medir/desenhar, e rasteriza com html-to-image.
 *
 * CUIDADOS (do mapeamento + revisão adversarial):
 *   - O container externo (`host`) fica off-screen (position:fixed; left:-99999px),
 *     mas quem é rasterizado é o `inner` (position:static). Capturar o próprio
 *     `host` copiaria o left:-99999px pro clone do html-to-image e o PNG sairia
 *     EM BRANCO (arte fora do <foreignObject>).
 *   - Largura concreta em px no `inner` — sem isso o ResponsiveContainer do
 *     Recharts renderiza 0×0 (gráfico em branco).
 *   - O componente capturado DEVE usar isAnimationActive={false} nos gráficos.
 *   - O gate de layout tem fallback por timeout: requestAnimationFrame é PAUSADO
 *     em aba de segundo plano e travaria a espera sem o Promise.race.
 */
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toPng } from 'html-to-image';

/**
 * @param {React.ReactElement} elemento  — o componente do slide já com props
 * @param {Object} [opts]
 * @param {number} [opts.largura=1280]   — largura de render em px (define a escala)
 * @param {number} [opts.pixelRatio=2]   — nitidez (2 = retina; bom pra projetor)
 * @param {number} [opts.espera=500]     — ms extra após o render pro Recharts desenhar
 * @param {string} [opts.fundo='#ffffff']
 * @returns {Promise<{ dataUrl: string, largura: number, altura: number }>}
 */
export async function capturarParaPNG(elemento, {
  largura = 1280,
  pixelRatio = 2,
  espera = 500,
  fundo = '#ffffff',
} = {}) {
  // host: fica FORA da tela — mas NÃO é o nó rasterizado.
  const host = document.createElement('div');
  host.style.cssText =
    `position:fixed; left:-99999px; top:0; width:${largura}px; ` +
    `background:${fundo}; z-index:-1; pointer-events:none;`;
  // inner: posição estática, sem offset — é ESTE que o html-to-image captura.
  const inner = document.createElement('div');
  inner.style.cssText = `position:static; width:${largura}px; background:${fundo};`;
  host.appendChild(inner);
  document.body.appendChild(host);

  const root = createRoot(inner);
  try {
    // Commit síncrono do render inicial (fora do ciclo de render do app → sem warning).
    flushSync(() => root.render(elemento));

    // Gate de layout: 2 frames, com fallback por timeout (rAF é pausado em aba oculta).
    const doisFrames = new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.race([doisFrames, new Promise(r => setTimeout(r, 120))]);
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch { /* fontes de sistema — ignora */ }
    }
    await new Promise(r => setTimeout(r, espera));

    const altura = inner.scrollHeight || Math.round((largura * 9) / 16);
    const dataUrl = await toPng(inner, {
      pixelRatio,
      backgroundColor: fundo,
      width: largura,
      height: altura,
    });
    return { dataUrl, largura, altura };
  } finally {
    // Desmonta no próximo tick pra não conflitar com o render atual.
    setTimeout(() => { try { root.unmount(); } catch { /* */ } host.remove(); }, 0);
  }
}
