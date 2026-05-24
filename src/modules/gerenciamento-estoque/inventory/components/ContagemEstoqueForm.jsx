/**
 * ContagemEstoqueForm — Contagem de Estoque (web).
 *
 * Fluxo:
 *  1. Operador escolhe os pré-requisitos no topo: Nº Contagem (1-5) +
 *     Armazém + Depósito. Sem isso o resto do formulário fica bloqueado.
 *  2. Para cada SKU contado, digita código + quantidades (P/L/C/U) e
 *     clica "Adicionar à fila".
 *  3. No final, clica "Registrar N contagens" pra gravar todas de uma vez
 *     em `inventory_logs`.
 *
 * Os pré-requisitos persistem entre lançamentos (operador costuma contar o
 * mesmo armazém/depósito inteiro numa mesma "contagem 1", "contagem 2", etc).
 */
import React, { useMemo, useState } from 'react';
import { addDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { useDb } from '../../../../utils/db';
import { useUser } from '../../../../context/UserContext';
import { useCatalogos } from '../../../../context/CatalogosContext';
import { QuantidadeFields } from '../../shared/QuantidadeFields';
import {
  ARMAZENS, DEPOSITOS,
  labelArmazem, labelDeposito,
  buscarProdutos,
} from '../../shared/contagemConstants';

const NUMEROS_CONTAGEM = [1, 2, 3, 4, 5];
const initialQuantidades = { palete: '', lastro: '', caixa: '', unidade: '' };

function calcularTotalCaixas(q, cxPorPlt, cxPorLastro) {
  const p = parseInt(q.palete,  10) || 0;
  const l = parseInt(q.lastro,  10) || 0;
  const c = parseInt(q.caixa,   10) || 0;
  const u = parseInt(q.unidade, 10) || 0;
  return (p * (Number(cxPorPlt) || 0)) + (l * (Number(cxPorLastro) || 0)) + c + u;
}

export function ContagemEstoqueForm({ conferente }) {
  const { col, stamp } = useDb();
  const { usuario } = useUser();
  const { produtos: produtosCtx, carregandoCatalogos } = useCatalogos();

  const baseProdutos = useMemo(() => {
    return (produtosCtx || []).map(x => ({
      codigo: String(x.codigo || x.id || ''),
      descricao: x.descricao || x.nome || '',
      paletizacao: Number(x.paletizacao) || 0,
      lastro: Number(x.lastro) || 0,
    })).filter(p => p.codigo);
  }, [produtosCtx]);

  // ─── Pré-requisitos do batch (persistem entre lançamentos) ────────────
  const [numContagem, setNumContagem] = useState('');   // '' | '1' | '2' | …
  const [armazem,     setArmazem]     = useState(null); // objeto ou null
  const [deposito,    setDeposito]    = useState(null); // objeto ou null

  // ─── Linha em edição (produto + quantidades) ──────────────────────────
  const [codigo,      setCodigo]      = useState('');
  const [descricao,   setDescricao]   = useState('');
  const [quantidades, setQuantidades] = useState({ ...initialQuantidades });
  const [sugestoes,   setSugestoes]   = useState([]);
  const [campoAtivo,  setCampoAtivo]  = useState(null); // 'codigo' | 'descricao' | null

  // ─── Fila + persistência ──────────────────────────────────────────────
  const [fila,     setFila]     = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [errs,     setErrs]     = useState({});

  // Bloqueia o resto do form até os 3 pré-reqs estarem preenchidos
  const prereqsOk = !!(numContagem && armazem && deposito);

  // Produto selecionado (match exato pelo código)
  const produtoSel = useMemo(() => {
    if (!codigo) return null;
    return baseProdutos.find(p => p.codigo === codigo.trim()) || null;
  }, [codigo, baseProdutos]);

  // ─── Autocomplete handlers ────────────────────────────────────────────
  function onChangeCodigo(v) {
    if (!prereqsOk) return;
    const t = String(v).replace(/[^0-9]/g, '');
    setCodigo(t);
    const exato = baseProdutos.find(p => p.codigo === t);
    if (exato) setDescricao(exato.descricao);
    else if (descricao && !t) setDescricao('');
    setSugestoes(t ? buscarProdutos(baseProdutos, t).filter(p => p.codigo.startsWith(t)) : []);
    setCampoAtivo('codigo');
  }
  function onChangeDescricao(v) {
    if (!prereqsOk) return;
    const t = String(v);
    setDescricao(t);
    setSugestoes(t ? buscarProdutos(baseProdutos, t).filter(p => (p.descricao || '').toLowerCase().includes(t.toLowerCase())) : []);
    setCampoAtivo('descricao');
  }
  function escolherProduto(p) {
    setCodigo(p.codigo);
    setDescricao(p.descricao);
    setSugestoes([]);
    setCampoAtivo(null);
  }

  // ─── Adicionar à fila ─────────────────────────────────────────────────
  function adicionarAfila(e) {
    e?.preventDefault?.();
    setMensagem('');
    const novosErrs = {};
    if (!codigo)         novosErrs.codigo = 'Informe o código';
    else if (!produtoSel) novosErrs.codigo = 'Código não encontrado na base';
    const total = calcularTotalCaixas(quantidades, produtoSel?.paletizacao, produtoSel?.lastro);
    if (total <= 0) novosErrs.quantidade = 'Informe pelo menos uma quantidade';
    setErrs(novosErrs);
    if (Object.keys(novosErrs).length > 0) return;

    const item = {
      productCode: produtoSel.codigo,
      productName: produtoSel.descricao,
      qtdPalete:   parseInt(quantidades.palete,  10) || 0,
      qtdLastro:   parseInt(quantidades.lastro,  10) || 0,
      qtdCaixa:    parseInt(quantidades.caixa,   10) || 0,
      qtdUnidade:  parseInt(quantidades.unidade, 10) || 0,
      cxPorPlt:    Number(produtoSel.paletizacao) || 0,
      cxPorLastro: Number(produtoSel.lastro)      || 0,
      total,
    };

    setFila(prev => [...prev, item]);
    setMensagem(`➕ ${item.productCode} (${item.total} cx) adicionado à fila`);
    // Limpa só o produto e quantidades — mantém pré-reqs (operador segue contando)
    setCodigo('');
    setDescricao('');
    setQuantidades({ ...initialQuantidades });
    setSugestoes([]);
    setCampoAtivo(null);
    setTimeout(() => setMensagem(''), 2200);
  }

  function removerDaFila(idx) {
    setFila(prev => prev.filter((_, i) => i !== idx));
  }

  // ─── Registrar fila inteira ────────────────────────────────────────────
  async function registrarTudo() {
    if (fila.length === 0) {
      setMensagem('❌ Adicione pelo menos um item à fila.');
      return;
    }
    setSalvando(true);
    setMensagem('⏳ Registrando…');
    try {
      for (const item of fila) {
        const agora = new Date();
        await addDoc(col('contagens_estoque'), {
          // Pré-requisitos do batch
          numContagem:  parseInt(numContagem, 10),
          armazem:      armazem.codigo,
          armazemNome:  armazem.nome,
          deposito:     deposito.codigo,
          depositoNome: deposito.nome,
          // Produto
          productCode: item.productCode,
          productName: item.productName,
          // Total + breakdown
          quantidade:  item.total,
          unidade:     'caixa',
          qtdPalete:   item.qtdPalete,
          qtdLastro:   item.qtdLastro,
          qtdCaixa:    item.qtdCaixa,
          qtdUnidade:  item.qtdUnidade,
          cxPorPlt:    item.cxPorPlt,
          cxPorLastro: item.cxPorLastro,
          // Auditoria
          conferente: conferente || usuario?.nome || 'Conferente',
          timestamp:  Timestamp.fromDate(agora),
          criadoEm:   serverTimestamp(),
          origem:     'manual-web-estoque',
          ...stamp(),
        });
      }
      setMensagem(`✅ ${fila.length} contagem(ns) registrada(s)!`);
      setFila([]);
      // Mantém numContagem + armazem + deposito — operador pode continuar
      setCodigo('');
      setDescricao('');
      setQuantidades({ ...initialQuantidades });
      setTimeout(() => setMensagem(''), 3500);
    } catch (err) {
      setMensagem(`❌ Erro: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  // ─── Estilos ──────────────────────────────────────────────────────────
  const cs = {
    maxWidth: '900px', margin: '20px auto', padding: '20px',
    backgroundColor: '#fff', borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };
  const group = { marginBottom: '15px' };
  const lbl   = { display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333', fontSize: '13px' };
  const inp   = {
    width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px',
    boxSizing: 'border-box', fontSize: '14px',
  };
  const select = { ...inp, backgroundColor: '#fff' };
  const inpDisabled = { ...inp, backgroundColor: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' };
  const btn = {
    padding: '12px 24px', backgroundColor: '#E31837', color: 'white',
    border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer',
    fontSize: '14px',
  };
  const btnVerde = { ...btn, backgroundColor: '#22c55e' };
  const btnDisabled = { ...btn, backgroundColor: '#cbd5e1', cursor: 'not-allowed' };

  return (
    <div style={cs}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#E31837', margin: 0 }}>Contagem de Estoque</h2>
        {fila.length > 0 && (
          <button
            type="button"
            onClick={registrarTudo}
            style={salvando ? btnDisabled : btnVerde}
            disabled={salvando}
          >
            {salvando ? 'Registrando…' : '✓ Registrar contagem'}
          </button>
        )}
      </div>

      {mensagem && (
        <div style={{
          padding: '10px', marginBottom: '12px', borderRadius: '4px',
          backgroundColor: mensagem.includes('✅') ? '#dcfce7' : mensagem.includes('⏳') ? '#dbeafe' : mensagem.includes('➕') ? '#e0f2fe' : '#fee2e2',
          color: mensagem.includes('✅') ? '#166534' : mensagem.includes('⏳') ? '#0369a1' : mensagem.includes('➕') ? '#075985' : '#991b1b',
          borderLeft: `4px solid ${mensagem.includes('✅') ? '#22c55e' : mensagem.includes('⏳') ? '#0ea5e9' : mensagem.includes('➕') ? '#0284c7' : '#ef4444'}`,
          fontSize: '13px',
        }}>{mensagem}</div>
      )}

      {carregandoCatalogos && (
        <div style={{ padding: '10px', backgroundColor: '#dbeafe', color: '#0369a1', borderRadius: '4px', fontSize: 13, marginBottom: 12 }}>
          ⏳ Carregando base de produtos…
        </div>
      )}

      <form onSubmit={adicionarAfila}>
        {/* ── Pré-requisitos: Nº Contagem + Armazém + Depósito ── */}
        <div style={{
          padding: '12px 14px',
          background: prereqsOk ? '#f0fdf4' : '#fef3c7',
          border: `1px solid ${prereqsOk ? '#86efac' : '#fcd34d'}`,
          borderRadius: 6,
          marginBottom: 18,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Nº Contagem</label>
              <select
                value={numContagem}
                onChange={e => setNumContagem(e.target.value)}
                disabled={salvando || fila.length > 0}
                style={select}
                title={fila.length > 0 ? 'Não dá pra trocar com itens na fila — registre ou limpe a fila primeiro.' : ''}
              >
                <option value="">Selecione…</option>
                {NUMEROS_CONTAGEM.map(n => (
                  <option key={n} value={String(n)}>Contagem {n}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Armazém</label>
              <select
                value={armazem?.codigo || ''}
                onChange={e => setArmazem(ARMAZENS.find(a => a.codigo === e.target.value) || null)}
                disabled={salvando || fila.length > 0}
                style={select}
              >
                <option value="">Selecione…</option>
                {ARMAZENS.map(a => (
                  <option key={a.codigo} value={a.codigo}>{labelArmazem(a)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Depósito</label>
              <select
                value={deposito?.codigo || ''}
                onChange={e => setDeposito(DEPOSITOS.find(d => d.codigo === e.target.value) || null)}
                disabled={salvando || fila.length > 0}
                style={select}
              >
                <option value="">Selecione…</option>
                {DEPOSITOS.map(d => (
                  <option key={d.codigo} value={d.codigo}>{labelDeposito(d)}</option>
                ))}
              </select>
            </div>
          </div>
          {fila.length > 0 && (
            <div style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>
              ℹ Pra trocar Nº Contagem / Armazém / Depósito, registre ou limpe a fila atual.
            </div>
          )}
        </div>

        {/* ── Produto (bloqueado até prereqs OK) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 12, opacity: prereqsOk ? 1 : 0.55 }}>
          <div style={group}>
            <label style={lbl}>Código</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                inputMode="numeric"
                placeholder={prereqsOk ? 'Ex: 1695' : 'Defina o batch primeiro'}
                value={codigo}
                onChange={e => onChangeCodigo(e.target.value)}
                onFocus={() => setCampoAtivo('codigo')}
                onBlur={() => setTimeout(() => setCampoAtivo(null), 150)}
                disabled={!prereqsOk || salvando}
                style={prereqsOk
                  ? { ...inp, borderColor: errs.codigo ? '#e31837' : '#ddd', fontFamily: 'monospace' }
                  : { ...inpDisabled, fontFamily: 'monospace' }
                }
              />
              {campoAtivo === 'codigo' && sugestoes.length > 0 && (
                <div style={dropdownStyle}>
                  {sugestoes.map((p, i) => (
                    <div key={p.codigo} onMouseDown={() => escolherProduto(p)} style={itemSugStyle(i, sugestoes.length)}>
                      <strong style={{ fontFamily: 'monospace' }}>{p.codigo}</strong> — {p.descricao}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errs.codigo && <div style={{ color: '#e31837', fontSize: 12, marginTop: 4 }}>❌ {errs.codigo}</div>}
          </div>

          <div style={group}>
            <label style={lbl}>Descrição</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={prereqsOk ? 'Digite parte do nome…' : 'Defina o batch primeiro'}
                value={descricao}
                onChange={e => onChangeDescricao(e.target.value)}
                onFocus={() => setCampoAtivo('descricao')}
                onBlur={() => setTimeout(() => setCampoAtivo(null), 150)}
                disabled={!prereqsOk || salvando}
                style={prereqsOk ? inp : inpDisabled}
              />
              {campoAtivo === 'descricao' && sugestoes.length > 0 && (
                <div style={dropdownStyle}>
                  {sugestoes.map((p, i) => (
                    <div key={p.codigo} onMouseDown={() => escolherProduto(p)} style={itemSugStyle(i, sugestoes.length)}>
                      <strong style={{ fontFamily: 'monospace' }}>{p.codigo}</strong> — {p.descricao}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Snapshot de fatores do produto ── */}
        {produtoSel && (
          <div style={{
            marginBottom: 12, padding: '8px 12px',
            background: '#f1f5f9', borderRadius: 6,
            fontSize: 12, color: '#334155',
            display: 'flex', gap: 14, flexWrap: 'wrap',
          }}>
            <span>Paletização: <strong>{produtoSel.paletizacao || '—'}</strong> cx/palete</span>
            <span>Lastro: <strong>{produtoSel.lastro || '—'}</strong> cx/lastro</span>
          </div>
        )}

        {/* ── Quantidades (bloqueadas até prereqs OK) ── */}
        <div style={{ ...group, opacity: prereqsOk ? 1 : 0.55, pointerEvents: prereqsOk ? 'auto' : 'none' }}>
          <label style={lbl}>Quantidade</label>
          <QuantidadeFields
            value={quantidades}
            onChange={setQuantidades}
            cxPorPlt={produtoSel?.paletizacao}
            cxPorLastro={produtoSel?.lastro}
            produtoOk={!!produtoSel}
          />
          {errs.quantidade && <div style={{ color: '#e31837', fontSize: 12, marginTop: 4 }}>❌ {errs.quantidade}</div>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          <button
            type="submit"
            style={prereqsOk && !salvando ? btn : btnDisabled}
            disabled={!prereqsOk || salvando || carregandoCatalogos}
          >
            ➕ Adicionar à fila
          </button>
        </div>
      </form>

      {/* ── Tabela da fila ── */}
      {fila.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ color: '#E31837', fontSize: '15px', marginBottom: '8px' }}>
            Fila ({fila.length}) — Contagem {numContagem} · {armazem?.nome} · {deposito?.nome}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#E31837', color: 'white' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Cód.</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Produto</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Breakdown</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Total cx</th>
                  <th style={{ padding: '8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {fila.map((it, idx) => {
                  const bd = [
                    it.qtdPalete  > 0 && `${it.qtdPalete}P`,
                    it.qtdLastro  > 0 && `${it.qtdLastro}L`,
                    it.qtdCaixa   > 0 && `${it.qtdCaixa}C`,
                    it.qtdUnidade > 0 && `${it.qtdUnidade}U`,
                  ].filter(Boolean).join(' · ');
                  return (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontFamily: 'monospace', fontWeight: 700 }}>{it.productCode}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{it.productName}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontFamily: 'monospace', color: '#64748b' }}>{bd}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontFamily: 'monospace', textAlign: 'right', fontWeight: 700 }}>{it.total}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                        <button onClick={() => removerDaFila(idx)} disabled={salvando} style={{
                          padding: '4px 10px', backgroundColor: '#ef4444', color: 'white',
                          border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold',
                        }}>Remover</button>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <td colSpan="3" style={{ padding: '8px', fontWeight: 700, textAlign: 'right', color: '#0f172a' }}>Total geral:</td>
                  <td style={{ padding: '8px', fontFamily: 'monospace', textAlign: 'right', fontWeight: 700, color: '#E31837', fontSize: 13 }}>
                    {fila.reduce((s, it) => s + (Number(it.total) || 0), 0)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estilos compartilhados dos dropdowns ─────────────────────────────────
const dropdownStyle = {
  position: 'absolute', top: '100%', left: 0, right: 0,
  backgroundColor: '#fff', border: '1px solid #ddd', borderTop: 'none',
  borderRadius: '0 0 4px 4px', zIndex: 10,
  maxHeight: '240px', overflowY: 'auto',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  minWidth: '320px',
};
const itemSugStyle = (i, total) => ({
  padding: '8px 10px', cursor: 'pointer', fontSize: '12px',
  borderBottom: i < total - 1 ? '1px solid #eee' : 'none',
});
