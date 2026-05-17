/**
 * Mapa do Armazém — Visualizador da imagem do layout.
 *
 * A imagem é hardcoded em `src/assets/layout-armazem.{png|jpg|webp}`.
 * Pra trocar: substitua o arquivo no repo e faça commit + deploy.
 *
 * Funcionalidades:
 *  - Zoom (roda do mouse + botões)
 *  - Pan (arrastar com o mouse)
 *  - Ajustar à tela
 *  - Baixar
 */
import { useState, useRef } from 'react';
// Imagem do layout do armazém. Pra trocar, substitua o arquivo
// em src/assets/layout-armazem.jpg (mesmo nome e extensão).
import layoutSrc from '../assets/layout-armazem.jpg';

export default function LayoutArmazem() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef(null);

  function onWheel(e) {
    if (!layoutSrc) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom(z => Math.max(0.2, Math.min(8, z * (1 + delta))));
  }
  function onMouseDown(e) {
    if (!layoutSrc) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onMouseMove(e) {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  }
  function onMouseUp() { setDragging(false); }
  function fitToScreen() { setZoom(1); setPan({ x: 0, y: 0 }); }
  function zoomIn()  { setZoom(z => Math.min(8, z * 1.25)); }
  function zoomOut() { setZoom(z => Math.max(0.2, z / 1.25)); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ color: '#E31837', margin: 0, fontSize: 22 }}>🗺️ Mapa do Armazém</h1>

        {layoutSrc && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={zoomOut} style={btnSec} title="Diminuir zoom">−</button>
            <span style={{ fontSize: 12, color: '#666', fontFamily: 'monospace', minWidth: 50, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={zoomIn} style={btnSec} title="Aumentar zoom">+</button>
            <button onClick={fitToScreen} style={btnSec}>↺ Ajustar</button>
            <a href={layoutSrc} target="_blank" rel="noreferrer" style={{ ...btnSec, textDecoration: 'none', display: 'inline-block' }}>
              ⤓ Abrir em nova aba
            </a>
          </div>
        )}
      </div>

      {!layoutSrc ? (
        <div style={{
          padding: 60, textAlign: 'center', backgroundColor: '#fff',
          borderRadius: 12, border: '2px dashed #ddd',
        }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🗺️</div>
          <p style={{ color: '#333', fontWeight: 700, marginBottom: 6 }}>Layout ainda não foi adicionado</p>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
            Adicione o arquivo da imagem em <strong style={{ fontFamily: 'monospace' }}>src/assets/layout-armazem.png</strong> e faça commit + deploy.
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            flex: 1,
            minHeight: 500,
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 8,
            overflow: 'hidden',
            position: 'relative',
            cursor: dragging ? 'grabbing' : 'grab',
            backgroundImage: 'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          }}
        >
          <img
            src={layoutSrc}
            alt="Layout do armazém"
            draggable={false}
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
              transformOrigin: 'center center',
              maxWidth: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
              transition: dragging ? 'none' : 'transform 0.05s linear',
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            }}
          />
          <div style={{
            position: 'absolute', bottom: 12, left: 12,
            padding: '6px 10px', borderRadius: 6,
            background: 'rgba(15, 23, 42, 0.85)', color: '#cbd5e1',
            fontSize: 11, fontFamily: 'monospace',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            🖱️ Arraste para mover · Roda do mouse para zoom
          </div>
        </div>
      )}
    </div>
  );
}

const btnSec = {
  padding: '6px 12px', backgroundColor: '#fff', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
};
