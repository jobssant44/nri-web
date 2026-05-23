import React, { useState, useEffect, useMemo } from 'react';
import {
  getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp,
  query, where,
} from 'firebase/firestore';
import { useDb } from '../../../../utils/db';
import { useCatalogos } from '../../../../context/CatalogosContext';
import { monthKey, nowYearMonth } from '../../shared/curvaLookup';

const CURVAS = ['', 'A', 'B', 'C'];

export function EditarLocalizacao() {
  const { col, docRef, db, stamp } = useDb();
  const { locations: locationsCtx, obterLocationsMensal } = useCatalogos();

  const { ano: anoAtual, mes: mesAtual } = nowYearMonth();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(mesAtual);

  const [enderecos, setEnderecos] = useState([]); // locations (base)
  const [mensais, setMensais] = useState({});     // { endereco: { curva, produtoCodigo, ... } }
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [salvandoBatch, setSalvandoBatch] = useState(false);

  // Edição inline
  const [editandoEnd, setEditandoEnd] = useState(null);
  const [editData, setEditData] = useState(null);

  const chave = monthKey(ano, mes);

  // ─── Estilos ──────────────────────────────────────────────────────────
  const containerStyle = {
    maxWidth: '1100px', margin: '20px auto', padding: '20px',
    backgroundColor: '#fff', borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };
  const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '13px' };
  const thStyle = { backgroundColor: '#E31837', color: 'white', padding: '10px', textAlign: 'left', fontWeight: 'bold' };
  const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #ddd' };
  const inputStyle = { padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' };
  const buttonStyle = {
    padding: '6px 12px', border: 'none', borderRadius: '4px',
    cursor: 'pointer', marginRight: '6px', fontSize: '12px', fontWeight: 'bold',
  };

  // ─── Carregar locations + mensal do mês selecionado ───────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [ano, mes, locationsCtx]);

  async function carregar() {
    setLoading(true);
    setMessage('');
    try {
      // locations vem do Context (cache em memória); locations_mensal cacheado por chaveMes
      const docsMensal = await obterLocationsMensal(chave);

      const listaEnderecos = (locationsCtx || []).map(data => {
        const enderecoStr = data.endereco
          || (data.area != null ? `${data.area}-${data.street}-${data.palettePosition}` : data.id);
        return {
          id: data.id || enderecoStr,
          endereco: enderecoStr,
          isActive: data.isActive !== false,
        };
      }).sort((a, b) => a.endereco.localeCompare(b.endereco, 'pt-BR', { numeric: true }));

      const mapMensal = {};
      docsMensal.forEach(data => {
        if (data.endereco) mapMensal[data.endereco] = data;
      });

      setEnderecos(listaEnderecos);
      setMensais(mapMensal);
    } catch (e) {
      setMessage(`❌ Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (!q) return enderecos;
    return enderecos.filter(e => {
      const m = mensais[e.endereco];
      const hay = [
        e.endereco,
        m?.curva,
        m?.produtoCodigo,
        m?.produtoNome,
      ].filter(Boolean).join(' ').toUpperCase();
      return hay.includes(q);
    });
  }, [busca, enderecos, mensais]);

  const stats = useMemo(() => {
    let comCurva = 0, semCurva = 0;
    enderecos.forEach(e => {
      const m = mensais[e.endereco];
      if (m?.curva) comCurva++;
      else semCurva++;
    });
    return { comCurva, semCurva, total: enderecos.length };
  }, [enderecos, mensais]);

  // ─── Iniciar / cancelar edição ─────────────────────────────────────────
  function iniciarEdicao(end) {
    const m = mensais[end] || {};
    setEditandoEnd(end);
    setEditData({
      curva: m.curva || '',
      produtoCodigo: m.produtoCodigo || '',
      produtoNome: m.produtoNome || '',
    });
  }

  function cancelarEdicao() {
    setEditandoEnd(null);
    setEditData(null);
  }

  // ─── Salvar edição ─────────────────────────────────────────────────────
  async function salvarEdicao(end) {
    if (!editData) return;
    const curva = (editData.curva || '').trim().toUpperCase();
    if (curva && !['A', 'B', 'C'].includes(curva)) {
      alert('Curva deve ser A, B ou C (ou vazio para limpar).');
      return;
    }

    try {
      const docId = `${chave}_${end}`;
      const payload = {
        ano, mes, chaveMes: chave,
        endereco: end,
        curva: curva || null,
        produtoCodigo: editData.produtoCodigo.trim() || null,
        produtoNome: editData.produtoNome.trim() || null,
        origem: 'manual',
        atualizadoEm: serverTimestamp(),
        ...stamp(),
      };
      await setDoc(docRef('locations_mensal', docId), payload, { merge: true });

      // Refresca o mapa local
      setMensais(prev => ({ ...prev, [end]: { id: docId, ...payload } }));
      setMessage(`✅ ${end} atualizado para ${chave}`);
      cancelarEdicao();
      setTimeout(() => setMessage(''), 2500);
    } catch (e) {
      setMessage(`❌ Erro ao salvar: ${e.message}`);
    }
  }

  // ─── Toggle ativo (sobre o doc base) ───────────────────────────────────
  async function toggleAtivo(end, atualAtivo) {
    try {
      await setDoc(docRef('locations', end), { isActive: !atualAtivo }, { merge: true });
      setEnderecos(prev => prev.map(e => e.endereco === end ? { ...e, isActive: !atualAtivo } : e));
    } catch (e) {
      setMessage(`❌ ${e.message}`);
    }
  }

  // ─── Excluir endereço (base + todos os meses) ─────────────────────────
  async function excluirEndereco(end) {
    if (!window.confirm(`Excluir o endereço ${end}? Todos os registros mensais dele também serão removidos.`)) return;
    try {
      const snapMensal = await getDocs(query(col('locations_mensal'), where('endereco', '==', end)));
      const batch = writeBatch(db);
      snapMensal.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await deleteDoc(docRef('locations', end));
      setEnderecos(prev => prev.filter(e => e.endereco !== end));
      setMensais(prev => { const n = { ...prev }; delete n[end]; return n; });
      setMessage(`✅ ${end} excluído.`);
      setTimeout(() => setMessage(''), 2500);
    } catch (e) {
      setMessage(`❌ ${e.message}`);
    }
  }

  // ─── Copiar do mês anterior ───────────────────────────────────────────
  async function copiarDoMesAnterior() {
    const ms = (mes === 1) ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
    const chaveAnt = monthKey(ms.ano, ms.mes);
    if (!window.confirm(`Copiar todos os endereços do mês ${chaveAnt} para ${chave}? Registros já existentes em ${chave} NÃO serão sobrescritos.`)) return;

    setSalvandoBatch(true);
    setMessage('⏳ Copiando do mês anterior...');
    try {
      const snapAnt = await getDocs(query(col('locations_mensal'), where('chaveMes', '==', chaveAnt)));
      if (snapAnt.empty) {
        setMessage(`⚠️ Não há registros em ${chaveAnt} para copiar.`);
        return;
      }

      const jaTem = new Set(Object.keys(mensais));
      const aCopiar = snapAnt.docs
        .map(d => d.data())
        .filter(d => d.endereco && !jaTem.has(d.endereco));

      if (aCopiar.length === 0) {
        setMessage(`✅ Todos os endereços de ${chaveAnt} já existem em ${chave}.`);
        return;
      }

      const CHUNK = 400;
      let total = 0;
      const novosMapa = {};
      for (let i = 0; i < aCopiar.length; i += CHUNK) {
        const batch = writeBatch(db);
        aCopiar.slice(i, i + CHUNK).forEach(src => {
          const id = `${chave}_${src.endereco}`;
          const payload = {
            ano, mes, chaveMes: chave,
            endereco: src.endereco,
            curva: src.curva || null,
            produtoCodigo: src.produtoCodigo || null,
            produtoNome: src.produtoNome || null,
            origem: 'copia',
            atualizadoEm: serverTimestamp(),
            ...stamp(),
          };
          batch.set(docRef('locations_mensal', id), payload);
          novosMapa[src.endereco] = { id, ...payload };
        });
        await batch.commit();
        total += Math.min(CHUNK, aCopiar.length - i);
      }
      setMensais(prev => ({ ...prev, ...novosMapa }));
      setMessage(`✅ ${total} endereço(s) copiado(s) de ${chaveAnt} para ${chave}.`);
      setTimeout(() => setMessage(''), 4000);
    } catch (e) {
      setMessage(`❌ Erro: ${e.message}`);
    } finally {
      setSalvandoBatch(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '6px' }}>📋 Editar Endereços</h2>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
        Cada endereço pode ter curva/produto diferentes por mês. Use o filtro abaixo para mudar o mês de referência.
      </p>

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center',
        marginBottom: '15px', padding: '12px', background: '#f8fafc', borderRadius: '8px',
      }}>
        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>Mês:</label>
        <select value={mes} onChange={e => setMes(parseInt(e.target.value, 10))} style={inputStyle}>
          {MESES_LABEL.map((lbl, i) => <option key={i + 1} value={i + 1}>{lbl}</option>)}
        </select>
        <input type="number" min="2020" max="2099" value={ano}
          onChange={e => setAno(parseInt(e.target.value, 10) || anoAtual)}
          style={{ ...inputStyle, width: '90px' }} />

        <input
          type="text"
          placeholder="🔍 Buscar (endereço, curva, código, produto)"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 240px' }}
        />

        <button
          onClick={copiarDoMesAnterior}
          disabled={salvandoBatch || loading}
          style={{ ...buttonStyle, backgroundColor: '#1D5A9E', color: 'white' }}
          title="Cria registros do mês anterior para todos os endereços que ainda não têm dado neste mês"
        >
          📋 Copiar do mês anterior
        </button>

        <button onClick={carregar} disabled={loading} style={{ ...buttonStyle, backgroundColor: '#6b7280', color: 'white' }}>
          🔄 Recarregar
        </button>
      </div>

      <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
        Mostrando <strong>{filtrados.length}</strong> de <strong>{stats.total}</strong> endereços · <span style={{ color: '#166534' }}>{stats.comCurva} com curva</span> em <strong>{chave}</strong> · <span style={{ color: '#991b1b' }}>{stats.semCurva} sem curva</span>
      </div>

      {message && (
        <div style={{
          padding: '10px', marginBottom: '12px', borderRadius: '4px',
          backgroundColor: message.includes('✅') ? '#dcfce7' : message.includes('⏳') ? '#dbeafe' : message.includes('⚠️') ? '#fef3c7' : '#fee2e2',
          color: message.includes('✅') ? '#166534' : message.includes('⏳') ? '#0369a1' : message.includes('⚠️') ? '#92400e' : '#991b1b',
          borderLeft: `4px solid ${message.includes('✅') ? '#22c55e' : message.includes('⏳') ? '#0ea5e9' : message.includes('⚠️') ? '#f59e0b' : '#ef4444'}`,
          fontSize: '13px',
        }}>{message}</div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>⏳ Carregando...</div>
      ) : enderecos.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          📭 Nenhum endereço cadastrado. Vá à aba "Cadastrar" ou "Importar".
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Endereço</th>
                <th style={thStyle}>Curva ({chave})</th>
                <th style={thStyle}>Cód. Produto</th>
                <th style={thStyle}>Produto</th>
                <th style={thStyle}>Ativo</th>
                <th style={thStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e, idx) => {
                const m = mensais[e.endereco];
                const emEdicao = editandoEnd === e.endereco;
                return (
                  <tr key={e.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                    <td style={{ ...tdStyle, fontWeight: 'bold' }}>{e.endereco}</td>
                    <td style={tdStyle}>
                      {emEdicao ? (
                        <select value={editData.curva} onChange={ev => setEditData({ ...editData, curva: ev.target.value })} style={{ ...inputStyle, width: '70px' }}>
                          {CURVAS.map(c => <option key={c} value={c}>{c || '—'}</option>)}
                        </select>
                      ) : m?.curva ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: '10px',
                          backgroundColor: m.curva === 'A' ? '#dcfce7' : m.curva === 'B' ? '#fef3c7' : '#fee2e2',
                          color: m.curva === 'A' ? '#166534' : m.curva === 'B' ? '#92400e' : '#991b1b',
                          fontWeight: 'bold',
                        }}>{m.curva}</span>
                      ) : <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {emEdicao ? (
                        <input value={editData.produtoCodigo} onChange={ev => setEditData({ ...editData, produtoCodigo: ev.target.value })} style={{ ...inputStyle, width: '90px' }} />
                      ) : (m?.produtoCodigo || <span style={{ color: '#999' }}>—</span>)}
                    </td>
                    <td style={tdStyle}>
                      {emEdicao ? (
                        <input value={editData.produtoNome} onChange={ev => setEditData({ ...editData, produtoNome: ev.target.value })} style={{ ...inputStyle, width: '100%' }} />
                      ) : (m?.produtoNome || <span style={{ color: '#999' }}>—</span>)}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => toggleAtivo(e.endereco, e.isActive)} style={{
                        padding: '3px 9px', fontSize: 10.5, fontWeight: 700,
                        background: e.isActive ? '#dcfce7' : '#f1f5f9',
                        color: e.isActive ? '#166534' : '#666',
                        border: `1px solid ${e.isActive ? '#86efac' : '#e2e8f0'}`,
                        borderRadius: 6, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase',
                      }}>{e.isActive ? 'Ativo' : 'Inativo'}</button>
                    </td>
                    <td style={tdStyle}>
                      {emEdicao ? (
                        <>
                          <button onClick={() => salvarEdicao(e.endereco)} style={{ ...buttonStyle, backgroundColor: '#22c55e', color: 'white' }}>✅ Salvar</button>
                          <button onClick={cancelarEdicao} style={{ ...buttonStyle, backgroundColor: '#6b7280', color: 'white' }}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => iniciarEdicao(e.endereco)} style={{ ...buttonStyle, backgroundColor: '#1D5A9E', color: 'white' }}>✏️ Editar</button>
                          <button onClick={() => excluirEndereco(e.endereco)} style={{ ...buttonStyle, backgroundColor: '#ef4444', color: 'white' }}>🗑️</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
