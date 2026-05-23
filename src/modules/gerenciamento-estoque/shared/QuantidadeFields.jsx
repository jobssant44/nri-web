import React, { useMemo } from 'react';

/**
 * 4 campos numéricos (Palete · Lastro · Caixa · Unidade) com consolidação
 * automática pro total em caixas. Usado pela Coleta de Validade e pela
 * Contagem de Estoque.
 *
 * Comportamento UX:
 *  - Cada campo seleciona todo o conteúdo ao receber foco, pra que digitar
 *    substitua o valor anterior (ex: campo já mostra "0", clica e digita
 *    "2", vira "2" diretamente sem precisar apagar).
 *  - Apenas dígitos são aceitos.
 *
 * Fórmula:
 *   total = (paletes × cxPorPlt) + (lastros × cxPorLastro) + caixas + unidades
 *
 *   onde cxPorPlt vem de produto.paletizacao (coluna V do 01.11)
 *   e   cxPorLastro vem de produto.lastro    (coluna X do 01.11)
 *
 * Props:
 *   value         { palete, lastro, caixa, unidade } — strings (vazio permitido)
 *   onChange      (novo) => void — recebe o objeto completo
 *   cxPorPlt      number | null  — paletização do produto selecionado
 *   cxPorLastro   number | null  — lastro do produto selecionado
 *   produtoOk     boolean        — se há produto válido selecionado (pra mostrar/esconder o total)
 */
export function QuantidadeFields({ value, onChange, cxPorPlt, cxPorLastro, produtoOk = true }) {
  const v = value || {};
  const palete  = v.palete  ?? '';
  const lastro  = v.lastro  ?? '';
  const caixa   = v.caixa   ?? '';
  const unidade = v.unidade ?? '';

  const nPlt = parseInt(palete, 10)  || 0;
  const nLas = parseInt(lastro, 10)  || 0;
  const nCx  = parseInt(caixa, 10)   || 0;
  const nUn  = parseInt(unidade, 10) || 0;

  const subPalete = nPlt * (Number(cxPorPlt) || 0);
  const subLastro = nLas * (Number(cxPorLastro) || 0);
  const total = useMemo(
    () => subPalete + subLastro + nCx + nUn,
    [subPalete, subLastro, nCx, nUn]
  );

  function set(campo, valorBruto) {
    const apenasDigitos = String(valorBruto).replace(/\D/g, '');
    onChange({ ...v, [campo]: apenasDigitos });
  }

  const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
  };
  const fieldWrap = { display: 'flex', flexDirection: 'column' };
  const label = {
    fontSize: '11px', fontWeight: 700, color: '#475569',
    letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px',
  };
  const input = {
    width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px',
    boxSizing: 'border-box', fontSize: '14px', textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  };
  const resumo = {
    marginTop: '10px',
    padding: '10px 14px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#0f172a',
  };
  function Campo({ titulo, campo, valor }) {
    return (
      <div style={fieldWrap}>
        <span style={label}>{titulo}</span>
        <input
          type="text"
          inputMode="numeric"
          value={valor}
          onChange={e => set(campo, e.target.value)}
          onFocus={e => e.target.select()}
          placeholder="0"
          style={input}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={grid}>
        <Campo titulo="Palete"  campo="palete"  valor={palete}  />
        <Campo titulo="Lastro"  campo="lastro"  valor={lastro}  />
        <Campo titulo="Caixa"   campo="caixa"   valor={caixa}   />
        <Campo titulo="Unidade" campo="unidade" valor={unidade} />
      </div>

      {produtoOk && (
        <div style={resumo}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Total: <span style={{ color: '#E31837', fontSize: '15px' }}>{total}</span> caixa(s)
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
            {nPlt > 0 && `${nPlt}×${cxPorPlt || 0}=${subPalete}`}
            {nPlt > 0 && (nLas > 0 || nCx > 0 || nUn > 0) && ' + '}
            {nLas > 0 && `${nLas}×${cxPorLastro || 0}=${subLastro}`}
            {nLas > 0 && (nCx > 0 || nUn > 0) && ' + '}
            {nCx > 0 && `${nCx} cx`}
            {nCx > 0 && nUn > 0 && ' + '}
            {nUn > 0 && `${nUn} un`}
          </div>
        </div>
      )}
    </div>
  );
}
