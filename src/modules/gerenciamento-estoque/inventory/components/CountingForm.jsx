/**
 * CountingForm — Registrar contagem (versão 2)
 *
 * - Endereço: dropdown searchable carregado de `locations` (ativos)
 * - Código ↔ Descrição: bidirecional contra a base `produtos`
 * - Quantidade: toggle Palete | Lastro | Caixa | Unidade + campo numérico
 * - Validade: DD/MM/AAAA
 *
 * Ao registrar, busca:
 *   - curva do endereço em locations_mensal/{YYYY-MM_endereco}
 *   - curva do produto em curva_abc_mensal (com fallback p/ curva_abc)
 * e grava no inventory_log o snapshot completo (enderecoCurva, productCurva, aderenteABC).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { getDocs, addDoc, query, where, Timestamp } from 'firebase/firestore';
import { useDb } from '../../../../utils/db';
import { useCatalogos } from '../../../../context/CatalogosContext';
import {
  monthKey, nowYearMonth,
  carregarMapaCurvaComFallback, calcularAderenteABC,
} from '../../shared/curvaLookup';

const UNIDADES = [
  { key: 'palete',  label: 'Palete'  },
  { key: 'lastro',  label: 'Lastro'  },
  { key: 'caixa',   label: 'Caixa'   },
  { key: 'unidade', label: 'Unidade' },
];

const initialForm = {
  endereco: '',
  productCode: '',
  productName: '',
  quantidade: '',
  unidade: 'caixa',
  expiryDate: '',
};

export function CountingForm({ conferente, onSuccess, onError }) {
  const { col, docRef, colRevenda, rid, stamp } = useDb();
  // produtos e locations vêm do Context (cacheados em memória);
  // locations_mensal carregado sob demanda via obterLocationsMensal.
  const { produtos: produtosCtx, locations: locationsCtx, obterLocationsMensal } = useCatalogos();
  const { ano, mes } = nowYearMonth();
  const chave = monthKey(ano, mes);

  const [form, setForm] = useState(initialForm);
  const [enderecos, setEnderecos] = useState([]);       // [{ endereco, isActive }]
  const [mensaisDoMes, setMensaisDoMes] = useState({}); // { endereco: {curva, produtoCodigo, produtoNome} }
  const [produtos, setProdutos] = useState([]);         // base de produtos
  const [curvaMap, setCurvaMap] = useState({});         // codigo -> curva
  const [curvaOrigem, setCurvaOrigem] = useState('vazio');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fila, setFila] = useState([]);
  const [message, setMessage] = useState('');
  const [errs, setErrs] = useState({});
  const [sugestoesNome, setSugestoesNome] = useState([]);
  const [mostrarSug, setMostrarSug] = useState(false);
  // Para o combobox de endereço (filtra à medida que digita)
  const [enderecoBusca, setEnderecoBusca] = useState('');
  const [mostrarSugEnd, setMostrarSugEnd] = useState(false);
  // Para o autocomplete de código
  const [sugestoesCodigo, setSugestoesCodigo] = useState([]);
  const [mostrarSugCod, setMostrarSugCod] = useState(false);

  // ─── Estilos ──────────────────────────────────────────────────────────
  const cs = {
    maxWidth: '760px', margin: '20px auto', padding: '20px',
    backgroundColor: '#fff', borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };
  const group = { marginBottom: '15px' };
  const lbl = { display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333', fontSize: '13px' };
  const inp = {
    width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px',
    boxSizing: 'border-box', fontSize: '14px',
  };
  const btn = {
    padding: '10px 20px', backgroundColor: '#E31837', color: 'white',
    border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginRight: '10px',
  };

  // ─── Carregar dados ────────────────────────────────────────────────────
  // Dispara quando muda mês/revenda OU quando o Context termina de carregar
  // produtos/locations (vêm null no primeiro render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [ano, mes, rid, produtosCtx, locationsCtx]);

  async function carregar() {
    setLoading(true);
    try {
      // locations e produtos vêm do CatalogosContext (cache em memória).
      // locations_mensal busca via Context (cache por chaveMes).
      const docsMensal = await obterLocationsMensal(chave);

      const listaEnd = (locationsCtx || []).map(data => {
        const endStr = data.endereco
          || (data.area != null ? `${data.area}-${data.street}-${data.palettePosition}` : data.id);
        return { endereco: endStr, isActive: data.isActive !== false };
      })
        .filter(e => e.isActive)
        .sort((a, b) => a.endereco.localeCompare(b.endereco, 'pt-BR', { numeric: true }));

      const mapMensal = {};
      docsMensal.forEach(data => {
        if (data.endereco) mapMensal[data.endereco] = data;
      });

      setEnderecos(listaEnd);
      setMensaisDoMes(mapMensal);
      // Produtos do Context — campo `descricao` (formato 01.11) com fallback pra `nome`.
      setProdutos((produtosCtx || []).map(x => ({
        codigo: String(x.codigo || x.id || ''),
        nome: x.descricao || x.nome || '',
      })).filter(p => p.codigo));

      const { mapa, origem } = await carregarMapaCurvaComFallback({
        docRefFn: docRef, colFn: col, colRevendaFn: colRevenda, rid, ano, mes,
      });
      setCurvaMap(mapa);
      setCurvaOrigem(origem);
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
      setMessage(`❌ Erro ao carregar dados: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ─── Lookup de produto ─────────────────────────────────────────────────
  function acharProdutoPorCodigo(codigo) {
    if (!codigo) return null;
    return produtos.find(p => p.codigo === String(codigo).trim());
  }
  function sugestoesPorNome(texto) {
    if (!texto?.trim()) return [];
    const q = texto.toLowerCase();
    return produtos
      .filter(p => p.nome && p.nome.toLowerCase().includes(q))
      .slice(0, 10);
  }
  function sugestoesPorCodigo(texto) {
    if (!texto?.trim()) return [];
    const q = String(texto).trim();
    // Mostra os códigos que começam ou contêm o que está sendo digitado
    return produtos
      .filter(p => p.codigo && p.codigo.includes(q))
      .slice(0, 10);
  }
  function sugestoesPorEndereco(texto) {
    const q = (texto || '').trim().toUpperCase();
    const base = enderecos;
    if (!q) return base.slice(0, 30);
    return base.filter(e => e.endereco.includes(q)).slice(0, 30);
  }

  // ─── Auto-formato de data ──────────────────────────────────────────────
  function formatarData(valor) {
    const n = valor.replace(/\D/g, '');
    if (n.length === 0) return '';
    if (n.length <= 2) return n;
    if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
    return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4, 8)}`;
  }
  function parseData(s) {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
    if (isNaN(d.getTime())) return null;
    return d;
  }

  // ─── Validar formulário ───────────────────────────────────────────────
  function validar() {
    const e = {};
    if (!form.endereco) e.endereco = 'Selecione um endereço';
    if (!form.productCode.trim()) {
      e.productCode = 'Código é obrigatório';
    } else {
      const p = acharProdutoPorCodigo(form.productCode);
      if (!p) e.productCode = 'Código não encontrado na base';
      else if (form.productName && form.productName !== p.nome) {
        e.productName = 'Nome não corresponde ao código';
      }
    }
    const qt = parseFloat(String(form.quantidade).replace(',', '.'));
    if (!form.quantidade || isNaN(qt) || qt <= 0) e.quantidade = 'Quantidade deve ser maior que zero';
    if (!form.expiryDate) e.expiryDate = 'Validade é obrigatória';
    else if (!parseData(form.expiryDate)) e.expiryDate = 'Data inválida (DD/MM/AAAA)';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  // ─── Adicionar à fila ──────────────────────────────────────────────────
  function adicionar(e) {
    e.preventDefault();
    setMessage('');
    if (!validar()) return;

    const prod = acharProdutoPorCodigo(form.productCode);
    const dadosMensal = mensaisDoMes[form.endereco];

    const item = {
      endereco: form.endereco,
      enderecoCurva: dadosMensal?.curva || null,
      produtoEsperadoCodigo: dadosMensal?.produtoCodigo || null,
      productCode: form.productCode.trim(),
      productName: prod?.nome || form.productName.trim(),
      productCurva: curvaMap[form.productCode.trim()] || null,
      curvaOrigem,
      quantidade: parseFloat(String(form.quantidade).replace(',', '.')),
      unidade: form.unidade,
      expiryDate: form.expiryDate,
    };

    setFila(prev => [...prev, item]);
    setMessage(`✅ ${item.productCode} (${item.quantidade} ${item.unidade}) adicionado à fila`);
    setForm(f => ({ ...initialForm, endereco: f.endereco })); // mantém endereço
    setSugestoesNome([]); setMostrarSug(false);
    setTimeout(() => setMessage(''), 2200);
  }

  function removerDaFila(idx) {
    setFila(prev => prev.filter((_, i) => i !== idx));
  }

  // ─── Salvar fila no Firebase ──────────────────────────────────────────
  async function registrarTudo() {
    if (fila.length === 0) {
      setMessage('❌ Adicione pelo menos um item.');
      return;
    }
    setSubmitting(true);
    setMessage('⏳ Registrando...');
    try {
      for (const item of fila) {
        const validade = parseData(item.expiryDate);
        const aderenteABC = calcularAderenteABC(item.productCurva, item.enderecoCurva);
        await addDoc(col('inventory_logs'), {
          // Endereço + chaves de tempo
          endereco: item.endereco,
          ano, mes, chaveMes: chave,
          // Produto
          productCode: item.productCode,
          productName: item.productName,
          // Quantidade
          quantidade: item.quantidade,
          unidade: item.unidade,
          // Validade
          expiryDate: validade ? Timestamp.fromDate(validade) : null,
          // Snapshots para cálculo histórico
          enderecoCurva: item.enderecoCurva,
          productCurva: item.productCurva,
          curvaOrigem: item.curvaOrigem,
          aderenteABC,
          produtoEsperadoCodigo: item.produtoEsperadoCodigo,
          // Layout adherence (futuro) — comparamos quando habilitar
          aderenteLayout: item.produtoEsperadoCodigo
            ? String(item.produtoEsperadoCodigo) === String(item.productCode)
            : null,
          // Auditoria
          conferente: conferente || 'Conferente',
          timestamp: new Date(),
          origem: 'manual',
          ...stamp(),
        });
      }
      setMessage(`✅ ${fila.length} contagem(ns) registrada(s)!`);
      setFila([]);
      setForm(initialForm);
      setEnderecoBusca('');
      onSuccess?.({ count: fila.length });
      setTimeout(() => setMessage(''), 3500);
    } catch (e) {
      setMessage(`❌ Erro: ${e.message}`);
      onError?.(e);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Derivados ────────────────────────────────────────────────────────
  const enderecoSelInfo = useMemo(() => {
    if (!form.endereco) return null;
    return mensaisDoMes[form.endereco] || null;
  }, [form.endereco, mensaisDoMes]);

  const aderenciaPreview = useMemo(() => {
    if (!form.productCode || !form.endereco) return null;
    const curvaProd = curvaMap[form.productCode.trim()];
    const curvaEnd = enderecoSelInfo?.curva;
    if (!curvaProd || !curvaEnd) return null;
    return curvaProd === curvaEnd ? 'aderente' : 'nao-aderente';
  }, [form.productCode, form.endereco, curvaMap, enderecoSelInfo]);

  return (
    <div style={cs}>
      <h2 style={{ color: '#E31837', marginBottom: '15px' }}>Registrar Contagem</h2>

      {message && (
        <div style={{
          padding: '10px', marginBottom: '12px', borderRadius: '4px',
          backgroundColor: message.includes('✅') ? '#dcfce7' : message.includes('⏳') ? '#dbeafe' : '#fee2e2',
          color: message.includes('✅') ? '#166534' : message.includes('⏳') ? '#0369a1' : '#991b1b',
          borderLeft: `4px solid ${message.includes('✅') ? '#22c55e' : message.includes('⏳') ? '#0ea5e9' : '#ef4444'}`,
          fontSize: '13px',
        }}>{message}</div>
      )}

      <form onSubmit={adicionar}>
        {/* Endereço — combobox: digita pra filtrar, clica pra selecionar */}
        <div style={group}>
          <label style={lbl}>Endereço</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Digite parte do endereço (ex: A-1)"
              value={enderecoBusca}
              onChange={(e) => {
                const txt = e.target.value.toUpperCase();
                setEnderecoBusca(txt);
                // Se o usuário apagou tudo ou o texto não bate exato com a seleção,
                // limpa o endereço escolhido — assim o usuário tem que escolher de novo
                if (txt !== form.endereco) setForm(prev => ({ ...prev, endereco: '' }));
                setMostrarSugEnd(true);
              }}
              onFocus={() => setMostrarSugEnd(true)}
              onBlur={() => setTimeout(() => setMostrarSugEnd(false), 150)}
              disabled={loading || submitting}
              style={{ ...inp, borderColor: errs.endereco ? '#e31837' : '#ddd', fontFamily: 'monospace', textTransform: 'uppercase' }}
            />
            {mostrarSugEnd && (() => {
              const lista = sugestoesPorEndereco(enderecoBusca);
              if (lista.length === 0) return null;
              return (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  backgroundColor: '#fff', border: '1px solid #ddd', borderTop: 'none',
                  borderRadius: '0 0 4px 4px', zIndex: 10,
                  maxHeight: '240px', overflowY: 'auto',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}>
                  {lista.map((e, idx) => {
                    const m = mensaisDoMes[e.endereco];
                    return (
                      <div
                        key={e.endereco}
                        onMouseDown={() => {
                          setForm(prev => ({ ...prev, endereco: e.endereco }));
                          setEnderecoBusca(e.endereco);
                          setMostrarSugEnd(false);
                        }}
                        style={{
                          padding: '8px 10px', cursor: 'pointer', fontSize: '13px',
                          borderBottom: idx < lista.length - 1 ? '1px solid #eee' : 'none',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                        onMouseEnter={(ev) => ev.currentTarget.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={(ev) => ev.currentTarget.style.backgroundColor = '#fff'}
                      >
                        <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{e.endereco}</span>
                        {m?.curva ? (
                          <span style={{
                            padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                            backgroundColor: m.curva === 'A' ? '#dcfce7' : m.curva === 'B' ? '#fef3c7' : '#fee2e2',
                            color: m.curva === 'A' ? '#166534' : m.curva === 'B' ? '#92400e' : '#991b1b',
                          }}>Curva {m.curva}</span>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#999', fontStyle: 'italic' }}>sem curva</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          {form.endereco && enderecoSelInfo && (
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              {enderecoSelInfo.curva ? `Curva do endereço: ${enderecoSelInfo.curva}` : `Sem curva definida no mês atual`}
              {enderecoSelInfo.produtoCodigo && (
                <> · Produto previsto: <strong>{enderecoSelInfo.produtoCodigo}</strong>{enderecoSelInfo.produtoNome ? ` — ${enderecoSelInfo.produtoNome}` : ''}</>
              )}
            </div>
          )}
          {errs.endereco && <div style={{ color: '#e31837', fontSize: 12, marginTop: 4 }}>❌ {errs.endereco}</div>}
        </div>

        {/* Código + Descrição bidirecionais */}
        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 12 }}>
          <div style={group}>
            <label style={lbl}>Código</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Ex: 1695"
                value={form.productCode}
                onChange={(e) => {
                  const codigo = e.target.value;
                  const pe = acharProdutoPorCodigo(codigo);
                  setForm(prev => ({
                    ...prev,
                    productCode: codigo,
                    // Se bate exato → preenche descrição. Senão, mantém o que tinha.
                    productName: pe ? pe.nome : (codigo ? prev.productName : ''),
                  }));
                  const sug = sugestoesPorCodigo(codigo);
                  setSugestoesCodigo(sug); setMostrarSugCod(sug.length > 0);
                }}
                onFocus={() => {
                  if (form.productCode) {
                    const sug = sugestoesPorCodigo(form.productCode);
                    setSugestoesCodigo(sug); setMostrarSugCod(sug.length > 0);
                  }
                }}
                onBlur={() => setTimeout(() => setMostrarSugCod(false), 150)}
                disabled={submitting}
                style={{ ...inp, borderColor: errs.productCode ? '#e31837' : '#ddd', fontFamily: 'monospace' }}
              />
              {mostrarSugCod && sugestoesCodigo.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  backgroundColor: '#fff', border: '1px solid #ddd', borderTop: 'none',
                  borderRadius: '0 0 4px 4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)', minWidth: '320px',
                }}>
                  {sugestoesCodigo.map((p, idx) => (
                    <div
                      key={idx}
                      onMouseDown={() => {
                        setForm(prev => ({ ...prev, productCode: p.codigo, productName: p.nome }));
                        setMostrarSugCod(false);
                      }}
                      style={{
                        padding: '8px 10px', cursor: 'pointer', fontSize: '12px',
                        borderBottom: idx < sugestoesCodigo.length - 1 ? '1px solid #eee' : 'none',
                      }}
                      onMouseEnter={(ev) => ev.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={(ev) => ev.currentTarget.style.backgroundColor = '#fff'}
                    >
                      <strong style={{ fontFamily: 'monospace' }}>{p.codigo}</strong> — {p.nome}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errs.productCode && <div style={{ color: '#e31837', fontSize: 12, marginTop: 4 }}>❌ {errs.productCode}</div>}
          </div>

          <div style={group}>
            <label style={lbl}>Descrição</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Digite para buscar..."
                value={form.productName}
                onChange={(e) => {
                  const nome = e.target.value;
                  setForm(prev => ({ ...prev, productName: nome }));
                  const sug = sugestoesPorNome(nome);
                  setSugestoesNome(sug); setMostrarSug(sug.length > 0);
                }}
                onFocus={() => {
                  if (form.productName) {
                    const sug = sugestoesPorNome(form.productName);
                    setSugestoesNome(sug); setMostrarSug(sug.length > 0);
                  }
                }}
                onBlur={() => setTimeout(() => setMostrarSug(false), 150)}
                disabled={submitting}
                style={{ ...inp, borderColor: errs.productName ? '#e31837' : '#ddd' }}
              />
              {mostrarSug && sugestoesNome.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  backgroundColor: '#fff', border: '1px solid #ddd', borderTop: 'none',
                  borderRadius: '0 0 4px 4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}>
                  {sugestoesNome.map((p, idx) => (
                    <div
                      key={idx}
                      onMouseDown={() => {
                        setForm(prev => ({ ...prev, productCode: p.codigo, productName: p.nome }));
                        setMostrarSug(false);
                      }}
                      style={{
                        padding: '8px 10px', cursor: 'pointer', fontSize: '12px',
                        borderBottom: idx < sugestoesNome.length - 1 ? '1px solid #eee' : 'none',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      <strong>{p.codigo}</strong> — {p.nome}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errs.productName && <div style={{ color: '#e31837', fontSize: 12, marginTop: 4 }}>❌ {errs.productName}</div>}
          </div>
        </div>

        {/* Aderência preview */}
        {aderenciaPreview && (
          <div style={{
            padding: '8px 12px', borderRadius: '4px', marginBottom: '12px', fontSize: '12px',
            backgroundColor: aderenciaPreview === 'aderente' ? '#dcfce7' : '#fee2e2',
            color: aderenciaPreview === 'aderente' ? '#166534' : '#991b1b',
            borderLeft: `4px solid ${aderenciaPreview === 'aderente' ? '#22c55e' : '#ef4444'}`,
          }}>
            {aderenciaPreview === 'aderente'
              ? `Aderente: produto Curva ${curvaMap[form.productCode.trim()]} no endereço Curva ${enderecoSelInfo?.curva}`
              : `Não aderente: produto Curva ${curvaMap[form.productCode.trim()]} em endereço Curva ${enderecoSelInfo?.curva}`}
          </div>
        )}

        {/* Quantidade — toggle de unidade + número */}
        <div style={group}>
          <label style={lbl}>Quantidade</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {UNIDADES.map(u => {
              const sel = form.unidade === u.key;
              return (
                <button
                  key={u.key}
                  type="button"
                  onClick={() => setForm({ ...form, unidade: u.key })}
                  disabled={submitting}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: sel ? '#E31837' : '#f8fafc',
                    color: sel ? '#fff' : '#475569',
                    border: `1px solid ${sel ? '#E31837' : '#e2e8f0'}`,
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: sel ? 700 : 500,
                    cursor: 'pointer',
                    transition: '0.15s',
                  }}
                >{u.label}</button>
              );
            })}
          </div>
          <input
            type="text"
            inputMode="decimal"
            placeholder={`Quantidade em ${form.unidade}(s)`}
            value={form.quantidade}
            onChange={(e) => setForm({ ...form, quantidade: e.target.value.replace(/[^0-9.,]/g, '') })}
            disabled={submitting}
            style={{
              ...inp,
              borderColor: errs.quantidade ? '#e31837' : '#ddd',
              fontSize: '22px',
              fontWeight: 'bold',
              textAlign: 'center',
              fontFamily: 'monospace',
            }}
          />
          {errs.quantidade && <div style={{ color: '#e31837', fontSize: 12, marginTop: 4 }}>❌ {errs.quantidade}</div>}
        </div>

        {/* Validade */}
        <div style={group}>
          <label style={lbl}>Data de Validade</label>
          <input
            type="text"
            placeholder="DD/MM/AAAA"
            maxLength="10"
            value={form.expiryDate}
            onChange={(e) => setForm({ ...form, expiryDate: formatarData(e.target.value) })}
            disabled={submitting}
            style={{ ...inp, borderColor: errs.expiryDate ? '#e31837' : '#ddd', fontFamily: 'monospace' }}
          />
          {errs.expiryDate && <div style={{ color: '#e31837', fontSize: 12, marginTop: 4 }}>❌ {errs.expiryDate}</div>}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="submit" style={btn} disabled={loading || submitting}>
            Adicionar à fila
          </button>
          {fila.length > 0 && (
            <button
              type="button"
              onClick={registrarTudo}
              style={{ ...btn, backgroundColor: '#22c55e' }}
              disabled={submitting}
            >
              Registrar {fila.length} contagem(ns)
            </button>
          )}
        </div>
      </form>

      {/* Tabela de fila */}
      {fila.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <h3 style={{ color: '#E31837', fontSize: '15px', marginBottom: '8px' }}>Fila ({fila.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#E31837', color: 'white' }}>
                  <th style={{ padding: '8px' }}>Endereço</th>
                  <th style={{ padding: '8px' }}>Cód.</th>
                  <th style={{ padding: '8px' }}>Produto</th>
                  <th style={{ padding: '8px' }}>Qtde</th>
                  <th style={{ padding: '8px' }}>Validade</th>
                  <th style={{ padding: '8px' }}>Ader. ABC</th>
                  <th style={{ padding: '8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {fila.map((it, idx) => {
                  const ader = calcularAderenteABC(it.productCurva, it.enderecoCurva);
                  return (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{it.endereco}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontFamily: 'monospace' }}>{it.productCode}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{it.productName}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontFamily: 'monospace' }}>{it.quantidade} {it.unidade}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontFamily: 'monospace' }}>{it.expiryDate}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                        {ader == null
                          ? <span style={{ color: '#92400e' }}>—</span>
                          : ader
                            ? <span style={{ color: '#166534', fontWeight: 'bold' }}>✅</span>
                            : <span style={{ color: '#991b1b', fontWeight: 'bold' }}>❌</span>}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                        <button onClick={() => removerDaFila(idx)} style={{
                          padding: '4px 10px', backgroundColor: '#ef4444', color: 'white',
                          border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold',
                        }}>Remover</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
