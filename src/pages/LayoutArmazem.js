import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// ── Constantes ──────────────────────────────────────────────────────────────
const ROWS         = 180;   // 90 m ÷ 0,5 m
const COLS         = 136;   // 68 m ÷ 0,5 m
const CELL_DEFAULT = 6;     // px — zoom inicial (mostra o armazém inteiro)
const CELL_MIN     = 2;
const CELL_MAX     = 48;
const DOC_ID       = 'principal';

const COR_PALETE = { A: '#4caf50', B: '#ffc107', C: '#ef5350', '': '#90caf9' };

// ── Desenha uma célula no Canvas ─────────────────────────────────────────────
function desenharCelula(ctx, x, y, cs, cell) {
  if (cell.type === 'faixa') {
    const t = Math.max(2, Math.floor(cs / 3));
    for (let i = 0; i < cs; i += t) {
      for (let j = 0; j < cs; j += t) {
        ctx.fillStyle = ((Math.floor(i / t) + Math.floor(j / t)) % 2 === 0) ? '#E31837' : '#fff';
        ctx.fillRect(x + i, y + j, Math.min(t, cs - i), Math.min(t, cs - j));
      }
    }
    return;
  }

  let bg = '#ddd';
  if      (cell.type === 'palete')   bg = COR_PALETE[cell.curva || ''];
  else if (cell.type === 'corredor') bg = '#d4d4d4';
  else if (cell.type === 'area')     bg = cell.color || '#bbdefb';
  else if (cell.type === 'parede')   bg = '#5d4037';

  ctx.fillStyle = bg;
  ctx.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);

  if (cs >= 18 && cell.label) {
    ctx.save();
    ctx.font        = `bold ${Math.min(Math.floor(cs * 0.35), 10)}px Arial`;
    ctx.fillStyle   = cell.type === 'parede' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.65)';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.label.slice(0, 12), x + cs / 2, y + cs / 2);
    ctx.restore();
  }
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function LayoutArmazem() {
  // ---------- refs (usados diretamente nos handlers — sem stale closure) ------
  const canvasRef  = useRef(null);
  const contRef    = useRef(null);
  const cellsRef   = useRef({});           // dados das células
  const viewRef    = useRef({ cs: CELL_DEFAULT, ox: 40, oy: 40 }); // cellSize, offsetX, offsetY
  const toolRef    = useRef({ tool: 'palete', curva: 'A', label: '', color: '#bbdefb' });
  const hoverRef   = useRef(null);         // { row, col } célula sob o cursor
  const paintRef   = useRef(false);        // está pintando?
  const panRef     = useRef(null);         // { smx, smy, sox, soy } — panning ativo
  const rafRef          = useRef(null);    // requestAnimationFrame handle
  const primeiraVezRef  = useRef(true);   // auto-fit só na primeira renderização

  // ---------- state (apenas para re-renderizar a toolbar) --------------------
  const [tool,      _setTool]   = useState('palete');
  const [curva,     _setCurva]  = useState('A');
  const [areaLabel, _setLabel]  = useState('');
  const [areaColor, _setColor]  = useState('#bbdefb');
  const [csDisplay,  setCsDisplay]   = useState(CELL_DEFAULT);
  const [coordInfo,  setCoordInfo]   = useState('');
  const [cellCount,  setCellCount]   = useState(0);
  const [salvando,   setSalvando]    = useState(false);
  const [carregando, setCarregando]  = useState(true);

  // Setters que sincronizam estado React + ref ao mesmo tempo
  function setTool(v)     { _setTool(v);   toolRef.current.tool  = v; }
  function setCurva(v)    { _setCurva(v);  toolRef.current.curva = v; }
  function setAreaLabel(v){ _setLabel(v);  toolRef.current.label = v; }
  function setAreaColor(v){ _setColor(v);  toolRef.current.color = v; }

  // ---------- load / save ----------------------------------------------------
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const snap = await getDoc(doc(db, 'layout_armazem', DOC_ID));
      if (snap.exists()) {
        cellsRef.current = snap.data().cells || {};
        setCellCount(Object.keys(cellsRef.current).length);
        requestDraw();
      }
    } catch (e) { console.error(e); }
    finally { setCarregando(false); }
  }

  async function salvar() {
    setSalvando(true);
    try {
      await setDoc(doc(db, 'layout_armazem', DOC_ID), {
        rows: ROWS, cols: COLS, escala: '50cm',
        cells: cellsRef.current,
        atualizadoEm: new Date(),
      });
      setCellCount(Object.keys(cellsRef.current).length);
    } catch (e) { alert('Erro ao salvar: ' + e.message); }
    finally { setSalvando(false); }
  }

  // ---------- auto-fit: calcula o zoom para o grid caber na tela inteira ------
  function ajustarZoom() {
    const cont = contRef.current;
    if (!cont) return;
    const W  = cont.clientWidth;
    const H  = cont.clientHeight;
    if (!W || !H) return;
    const csW = (W - 40) / COLS;
    const csH = (H - 40) / ROWS;
    const cs  = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(Math.min(csW, csH))));
    viewRef.current = {
      cs,
      ox: Math.round((W - COLS * cs) / 2),
      oy: Math.round((H - ROWS * cs) / 2),
    };
    setCsDisplay(cs);
  }

  // ---------- canvas setup (resize + wheel) ----------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const cont   = contRef.current;
    if (!canvas || !cont) return;

    const ro = new ResizeObserver(() => {
      // Usa o tamanho do container (observar o canvas causaria loop)
      canvas.width  = cont.clientWidth;
      canvas.height = cont.clientHeight;
      if (primeiraVezRef.current && cont.clientWidth > 0 && cont.clientHeight > 0) {
        ajustarZoom();
        primeiraVezRef.current = false;
      }
      requestDraw();
    });
    ro.observe(cont);

    // Wheel — zoom centrado no cursor
    function onWheel(e) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v  = viewRef.current;
      const newCs = Math.max(CELL_MIN, Math.min(CELL_MAX, v.cs * (e.deltaY < 0 ? 1.15 : 0.87)));
      if (newCs === v.cs) return;
      v.ox = mx - (mx - v.ox) * (newCs / v.cs);
      v.oy = my - (my - v.oy) * (newCs / v.cs);
      v.cs = newCs;
      setCsDisplay(Math.round(newCs));
      requestDraw();
    }
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => { ro.disconnect(); canvas.removeEventListener('wheel', onWheel); };
  }, []);

  // ---------- draw -----------------------------------------------------------
  function requestDraw() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(desenhar);
  }

  function desenhar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;
    const { cs, ox, oy } = viewRef.current;
    const cells = cellsRef.current;

    ctx.clearRect(0, 0, W, H);

    // Fundo externo
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(0, 0, W, H);

    // Fundo branco do armazém
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, COLS * cs, ROWS * cs);

    // Células (só as visíveis)
    const c0 = Math.max(0, Math.floor(-ox / cs));
    const c1 = Math.min(COLS - 1, Math.ceil((W - ox) / cs));
    const r0 = Math.max(0, Math.floor(-oy / cs));
    const r1 = Math.min(ROWS - 1, Math.ceil((H - oy) / cs));

    for (const [key, cell] of Object.entries(cells)) {
      const ul = key.indexOf('_');
      const r  = parseInt(key.slice(0, ul));
      const c  = parseInt(key.slice(ul + 1));
      if (r < r0 || r > r1 || c < c0 || c > c1) continue;
      desenharCelula(ctx, ox + c * cs, oy + r * cs, cs, cell);
    }

    // Linhas de grade (só quando zoom suficiente)
    if (cs >= 5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth   = 0.5;
      for (let c = c0; c <= c1 + 1; c++) {
        const x = ox + c * cs;
        ctx.beginPath(); ctx.moveTo(x, Math.max(0, oy)); ctx.lineTo(x, Math.min(H, oy + ROWS * cs)); ctx.stroke();
      }
      for (let r = r0; r <= r1 + 1; r++) {
        const y = oy + r * cs;
        ctx.beginPath(); ctx.moveTo(Math.max(0, ox), y); ctx.lineTo(Math.min(W, ox + COLS * cs), y); ctx.stroke();
      }
    }

    // Borda do armazém
    ctx.strokeStyle = '#666';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(ox, oy, COLS * cs, ROWS * cs);

    // Highlight hover
    const h = hoverRef.current;
    if (h && h.row >= 0 && h.row < ROWS && h.col >= 0 && h.col < COLS) {
      ctx.fillStyle   = 'rgba(29,90,158,0.22)';
      ctx.strokeStyle = '#1D5A9E';
      ctx.lineWidth   = 1;
      ctx.fillRect  (ox + h.col * cs,       oy + h.row * cs,       cs, cs);
      ctx.strokeRect(ox + h.col * cs + 0.5, oy + h.row * cs + 0.5, cs - 1, cs - 1);
    }

    // Barra de escala (canto inferior esquerdo)
    const barM  = 10 * cs; // 10 células = 5 m
    const barW  = Math.min(100, Math.max(20, Math.round(barM)));
    const barX  = 14;
    const barY  = H - 22;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, 16);
    ctx.fillStyle = '#1D5A9E';
    ctx.fillRect(barX, barY, barW / 2, 12);
    ctx.fillStyle = '#E31837';
    ctx.fillRect(barX + barW / 2, barY, barW / 2, 12);
    ctx.fillStyle = '#222';
    ctx.font = '9px Arial';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('0', barX, barY - 1);
    ctx.fillText(`${(barW / cs * 0.5).toFixed(0)}m`, barX + barW, barY - 1);
  }

  // ---------- helpers --------------------------------------------------------
  function cellDoCursor(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const { cs, ox, oy } = viewRef.current;
    return {
      row: Math.floor((e.clientY - rect.top  - oy) / cs),
      col: Math.floor((e.clientX - rect.left - ox) / cs),
    };
  }

  function aplicarFerramenta(row, col) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    const key = `${row}_${col}`;
    const { tool, curva, label, color } = toolRef.current;
    const cells = cellsRef.current;

    if      (tool === 'borracha') { delete cells[key]; }
    else if (tool === 'palete')   { cells[key] = { type: 'palete',   curva }; }
    else if (tool === 'corredor') { cells[key] = { type: 'corredor' }; }
    else if (tool === 'faixa')    { cells[key] = { type: 'faixa' }; }
    else if (tool === 'parede')   { cells[key] = { type: 'parede' }; }
    else if (tool === 'area')     { cells[key] = { type: 'area', label, color }; }

    requestDraw();
  }

  // ---------- mouse handlers -------------------------------------------------
  function onMouseDown(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Pan (botão do meio ou Alt+Drag)
      const v = viewRef.current;
      panRef.current = { smx: mx, smy: my, sox: v.ox, soy: v.oy };
      e.preventDefault();
      return;
    }
    if (e.button === 0) {
      paintRef.current = true;
      const { row, col } = cellDoCursor(e);
      aplicarFerramenta(row, col);
    }
  }

  function onMouseMove(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    if (panRef.current) {
      const p  = panRef.current;
      const v  = viewRef.current;
      v.ox = p.sox + (mx - p.smx);
      v.oy = p.soy + (my - p.smy);
      requestDraw();
      return;
    }

    const { row, col } = cellDoCursor(e);
    hoverRef.current = { row, col };

    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      setCoordInfo(`L ${row + 1} · C ${col + 1}  —  ${(col * 0.5).toFixed(1)} m × ${(row * 0.5).toFixed(1)} m`);
    } else {
      setCoordInfo('');
    }

    if (paintRef.current) aplicarFerramenta(row, col);
    else requestDraw();
  }

  function onMouseUp() {
    paintRef.current = false;
    panRef.current   = null;
    setCellCount(Object.keys(cellsRef.current).length);
  }

  function onMouseLeave() {
    paintRef.current = false;
    panRef.current   = null;
    hoverRef.current = null;
    setCoordInfo('');
    requestDraw();
  }

  function centrarView() {
    ajustarZoom();
    requestDraw();
  }

  function limparTudo() {
    if (!window.confirm('Apagar todo o layout? Esta ação não pode ser desfeita.')) return;
    cellsRef.current = {};
    setCellCount(0);
    requestDraw();
  }

  // ---------- render ---------------------------------------------------------
  if (carregando) return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>⏳ Carregando layout...</div>;

  const FERRAMENTAS = [
    { id: 'palete',   label: '📦 Palete' },
    { id: 'corredor', label: '⬜ Corredor' },
    { id: 'faixa',    label: '🦓 Faixa' },
    { id: 'area',     label: '🏷️ Área' },
    { id: 'parede',   label: '🧱 Parede' },
    { id: 'borracha', label: '🧹 Borracha' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Arial, sans-serif', overflow: 'hidden' }}>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', backgroundColor: '#fff', borderBottom: '1px solid #e0e0e0', flexWrap: 'wrap', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* Título */}
        <span style={{ fontWeight: 'bold', color: '#1D5A9E', fontSize: 14, marginRight: 4 }}>🏭 Layout Armazém</span>
        <span style={{ color: '#bbb', fontSize: 10 }}>68 m × 90 m · 50 cm/célula</span>
        <div style={{ width: 1, height: 22, backgroundColor: '#e0e0e0' }} />

        {/* Ferramentas */}
        {FERRAMENTAS.map(f => (
          <button key={f.id} onClick={() => setTool(f.id)} style={{
            padding: '4px 10px', fontSize: 12, cursor: 'pointer',
            border:  `2px solid ${tool === f.id ? '#1D5A9E' : '#ddd'}`,
            borderRadius: 6,
            backgroundColor: tool === f.id ? '#e8f0ff' : '#f5f5f5',
            color:  tool === f.id ? '#1D5A9E' : '#444',
            fontWeight: tool === f.id ? 'bold' : 'normal',
          }}>
            {f.label}
          </button>
        ))}

        {/* Sub-opções: curva do palete */}
        {tool === 'palete' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
            {[['A', COR_PALETE.A], ['B', COR_PALETE.B], ['C', COR_PALETE.C], ['', COR_PALETE['']]].map(([c, cor]) => (
              <button key={c} onClick={() => setCurva(c)} style={{
                width: 28, height: 26, fontSize: 11, cursor: 'pointer',
                border: `2px solid ${curva === c ? '#333' : 'transparent'}`,
                borderRadius: 4, backgroundColor: cor,
                fontWeight: curva === c ? 'bold' : 'normal',
                color: c === 'B' ? '#333' : '#fff',
              }}>
                {c || '?'}
              </button>
            ))}
          </div>
        )}

        {/* Sub-opções: nome + cor da área */}
        {tool === 'area' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={areaLabel} onChange={e => setAreaLabel(e.target.value)}
              placeholder="Nome da área…"
              style={{ padding: '3px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 4, width: 140 }}
            />
            <input
              type="color" value={areaColor} onChange={e => setAreaColor(e.target.value)}
              style={{ width: 30, height: 26, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', padding: 2 }}
            />
          </div>
        )}

        {/* Ações à direita */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#aaa' }}>{cellCount.toLocaleString('pt-BR')} cél.</span>
          <span style={{ fontSize: 11, color: '#aaa' }}>zoom {csDisplay}px</span>
          <div style={{ width: 1, height: 22, backgroundColor: '#e0e0e0' }} />
          <button onClick={centrarView} title="Centralizar view" style={btnStyle}>🎯</button>
          <button onClick={carregar}    title="Recarregar do servidor" style={btnStyle}>🔄</button>
          <button onClick={limparTudo}  title="Apagar tudo" style={{ ...btnStyle, color: '#c00' }}>🗑️</button>
          <button onClick={salvar} disabled={salvando} style={{
            ...btnStyle,
            backgroundColor: salvando ? '#aaa' : '#1D5A9E',
            color: '#fff', border: 'none', fontWeight: 'bold', padding: '5px 16px',
            cursor: salvando ? 'not-allowed' : 'pointer',
          }}>
            {salvando ? '⏳ Salvando…' : '💾 Salvar'}
          </button>
        </div>
      </div>

      {/* ── Área do canvas ─────────────────────────────────────────────────── */}
      <div ref={contRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: tool === 'borracha' ? 'cell' : panRef.current ? 'grabbing' : 'crosshair' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onContextMenu={e => e.preventDefault()}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', userSelect: 'none', display: 'block' }}
        />

        {/* Coordenadas */}
        {coordInfo && (
          <div style={{ position: 'absolute', bottom: 10, left: 14, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', padding: '3px 9px', borderRadius: 4, fontSize: 11, pointerEvents: 'none' }}>
            {coordInfo}
          </div>
        )}

        {/* Legenda */}
        <div style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #ddd', borderRadius: 8, padding: '8px 12px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', minWidth: 140 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6, color: '#333', fontSize: 12 }}>Legenda</div>
          {[
            [COR_PALETE.A,   'Palete Curva A'],
            [COR_PALETE.B,   'Palete Curva B'],
            [COR_PALETE.C,   'Palete Curva C'],
            [COR_PALETE[''], 'Posição livre'],
            ['#d4d4d4',      'Corredor'],
            ['#5d4037',      'Parede / limite'],
          ].map(([cor, nome]) => (
            <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 13, height: 13, backgroundColor: cor, borderRadius: 2, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
              <span style={{ color: '#555' }}>{nome}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 13, height: 13, flexShrink: 0, borderRadius: 2, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
              <div style={{ background: '#E31837' }} /><div style={{ background: '#fff' }} />
              <div style={{ background: '#fff' }} /><div style={{ background: '#E31837' }} />
            </div>
            <span style={{ color: '#555' }}>Faixa pedestre</span>
          </div>
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #eee', color: '#999', lineHeight: 1.6 }}>
            🖱️ Arraste para pintar<br />
            ⚙️ Alt + Arraste = mover<br />
            🖲️ Scroll = zoom
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  padding: '5px 10px', fontSize: 12, border: '1px solid #ddd',
  borderRadius: 6, backgroundColor: '#f5f5f5', cursor: 'pointer', color: '#333',
};
