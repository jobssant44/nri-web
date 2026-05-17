/**
 * Histórico de Importações de Contagem
 *
 * Lista todos os batches (uploads de arquivo) gravados em `import_batches`,
 * com ações de exclusão em massa. Excluir um batch apaga:
 *   1. Todos os inventory_logs com aquele batchId
 *   2. O próprio doc do batch
 *
 * Acesso de exclusão: somente supervisor (NIVEIS_SUPERVISOR).
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  getDocs, query, where, writeBatch, orderBy,
} from 'firebase/firestore';
import { useDb } from '../../../../utils/db';
import { useUser } from '../../../../context/UserContext';
import { NIVEIS_SUPERVISOR } from '../../../../pages/admin/ConfigurarEmpresaPage';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}
function fmtData(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function fmtDataHora(d) {
  if (!d) return '—';
  return `${fmtData(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function HistoricoImportacoes({ onChange }) {
  const { col, docRef, db } = useDb();
  const { usuario } = useUser();
  const isSupervisor = NIVEIS_SUPERVISOR.includes(usuario?.nivel);

  const [batches, setBatches] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [excluindo, setExcluindo] = useState(false);
  const [message, setMessage] = useState('');
  const [busca, setBusca] = useState('');

  // ─── Estilos ──────────────────────────────────────────────────────────
  const containerStyle = {
    maxWidth: '1100px', margin: '20px auto', padding: '20px',
    backgroundColor: '#fff', borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };
  const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '13px' };
  const thStyle = { backgroundColor: '#E31837', color: 'white', padding: '10px', textAlign: 'left', fontWeight: 'bold' };
  const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #ddd' };
  const inputStyle = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' };

  // ─── Carregar batches ─────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    setMessage('');
    try {
      // Tenta ordenado por importadoEm desc; se faltar índice, faz fallback sem orderBy
      let snap;
      try {
        snap = await getDocs(query(col('import_batches'), orderBy('importadoEm', 'desc')));
      } catch {
        snap = await getDocs(col('import_batches'));
      }
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (tsToDate(b.importadoEm)?.getTime() || 0) - (tsToDate(a.importadoEm)?.getTime() || 0));
      setBatches(lista);
      setSelecionados(new Set());
    } catch (e) {
      setMessage(`❌ Erro ao carregar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(b => {
      const hay = [
        b.arquivo,
        b.importadoPor?.nome,
        fmtData(tsToDate(b.dataContagem)),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [batches, busca]);

  function toggleUm(id) {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleTodos() {
    if (selecionados.size === filtrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(filtrados.map(b => b.id)));
    }
  }

  // ─── Excluir batches selecionados ─────────────────────────────────────
  async function excluirSelecionados() {
    if (!isSupervisor) return;
    if (selecionados.size === 0) return;
    const lista = batches.filter(b => selecionados.has(b.id));
    const totalLinhas = lista.reduce((s, b) => s + (b.totalImportadas || 0), 0);
    const msg = lista.length === 1
      ? `Excluir a importação "${lista[0].arquivo || lista[0].id}" (${totalLinhas} contagens)? Esta ação não pode ser desfeita.`
      : `Excluir ${lista.length} importações (${totalLinhas} contagens no total)? Esta ação não pode ser desfeita.`;
    if (!window.confirm(msg)) return;

    setExcluindo(true);
    setMessage('⏳ Excluindo...');
    try {
      let totalApagados = 0;
      for (const b of lista) {
        // 1) Apaga todos os logs com batchId = b.id (em chunks de 450)
        const snapLogs = await getDocs(query(col('inventory_logs'), where('batchId', '==', b.id)));
        const CHUNK = 450;
        for (let i = 0; i < snapLogs.docs.length; i += CHUNK) {
          const wb = writeBatch(db);
          snapLogs.docs.slice(i, i + CHUNK).forEach(d => wb.delete(d.ref));
          await wb.commit();
          totalApagados += Math.min(CHUNK, snapLogs.docs.length - i);
        }
        // 2) Apaga o próprio doc do batch
        const wb2 = writeBatch(db);
        wb2.delete(docRef('import_batches', b.id));
        await wb2.commit();
      }
      setMessage(`✅ ${lista.length} importação(ões) excluída(s) (${totalApagados} contagens removidas).`);
      onChange?.();
      await carregar();
    } catch (e) {
      setMessage(`❌ Erro ao excluir: ${e.message}`);
    } finally {
      setExcluindo(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  const todosMarcados = filtrados.length > 0 && selecionados.size === filtrados.length;

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '6px' }}>Histórico de Importações</h2>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
        Cada importação de arquivo aparece como uma linha. Você pode selecionar e excluir importações inteiras — todas as contagens originadas naquele upload serão removidas.
      </p>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Buscar por arquivo, conferente ou data da contagem..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ ...inputStyle, minWidth: '320px', flex: '1 1 320px' }}
        />
        <button
          onClick={carregar}
          disabled={loading || excluindo}
          style={{
            padding: '8px 14px', backgroundColor: '#1D5A9E', color: 'white',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
          }}
        >
          Atualizar
        </button>
        {isSupervisor && (
          <button
            onClick={excluirSelecionados}
            disabled={excluindo || selecionados.size === 0}
            style={{
              padding: '8px 14px',
              backgroundColor: selecionados.size === 0 ? '#fca5a5' : '#ef4444',
              color: 'white', border: 'none', borderRadius: '4px',
              cursor: selecionados.size === 0 ? 'not-allowed' : 'pointer',
              fontSize: '12px', fontWeight: 'bold',
              opacity: selecionados.size === 0 ? 0.6 : 1,
            }}
          >
            {excluindo ? '⏳ Excluindo...' : `Excluir selecionadas (${selecionados.size})`}
          </button>
        )}
      </div>

      {message && (
        <div style={{
          padding: '10px 12px', marginBottom: '12px', borderRadius: '4px',
          backgroundColor: message.includes('✅') ? '#dcfce7' : message.includes('⏳') ? '#dbeafe' : '#fee2e2',
          color: message.includes('✅') ? '#166534' : message.includes('⏳') ? '#0369a1' : '#991b1b',
          borderLeft: `4px solid ${message.includes('✅') ? '#22c55e' : message.includes('⏳') ? '#0ea5e9' : '#ef4444'}`,
          fontSize: '13px',
        }}>{message}</div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>⏳ Carregando...</div>
      ) : batches.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          Nenhuma importação registrada ainda. Use a aba "Importar retroativa" para subir um arquivo.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>
                  {isSupervisor && (
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={toggleTodos}
                      style={{ cursor: 'pointer', width: 14, height: 14 }}
                    />
                  )}
                </th>
                <th style={thStyle}>Arquivo</th>
                <th style={thStyle}>Data da contagem</th>
                <th style={thStyle}>Importado em</th>
                <th style={thStyle}>Por</th>
                <th style={thStyle}>Linhas</th>
                <th style={thStyle}>Ignoradas</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((b, idx) => {
                const marcado = selecionados.has(b.id);
                return (
                  <tr
                    key={b.id}
                    style={{
                      backgroundColor: marcado ? '#fef2f2' : (idx % 2 === 0 ? '#fff' : '#f9f9f9'),
                      cursor: isSupervisor ? 'pointer' : 'default',
                    }}
                    onClick={() => isSupervisor && toggleUm(b.id)}
                  >
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {isSupervisor && (
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => toggleUm(b.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer', width: 14, height: 14 }}
                        />
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>{b.arquivo || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{fmtData(tsToDate(b.dataContagem))}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{fmtDataHora(tsToDate(b.importadoEm))}</td>
                    <td style={tdStyle}>{b.importadoPor?.nome || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold', color: '#166534' }}>{b.totalImportadas ?? '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', color: b.totalIgnoradas > 0 ? '#92400e' : '#999' }}>
                      {b.totalIgnoradas || 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isSupervisor && batches.length > 0 && (
        <div style={{ marginTop: '12px', fontSize: '11px', color: '#92400e', fontStyle: 'italic' }}>
          Você está visualizando o histórico. A exclusão é restrita a supervisores.
        </div>
      )}
    </div>
  );
}
