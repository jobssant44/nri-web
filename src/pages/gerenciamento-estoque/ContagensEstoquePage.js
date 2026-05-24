/**
 * Contagens de Estoque — visualização das contagens registradas (do tipo
 * "Contagem de Estoque", origem `manual-web-estoque` ou `manual-mobile-estoque`).
 *
 * Filtro: 1 data por vez. Ao selecionar, busca todas as contagens daquele dia
 * (timestamp entre 00:00:00 e 23:59:59) e preenche a tabela.
 *
 * Coletas de Validade têm tela separada (não aparecem aqui).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import { filtrarLogsAtivos } from '../../modules/gerenciamento-estoque/shared/inventoryLogsFilter';

// Converte Firestore Timestamp / Date / string ISO → Date (ou null)
function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtHora(d) {
  if (!d) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ContagensEstoquePage() {
  const { col } = useDb();
  // Mantém o último dia consultado entre navegações (sessionStorage)
  const [dataSel, setDataSel]   = useSessionFilter('contagensEst:data', hojeISO());
  const [aba, setAba]           = useSessionFilter('contagensEst:aba', 'detalhado');
  const [numFiltro, setNumFiltro] = useSessionFilter('contagensEst:num', ''); // '' = todas
  const [busca, setBusca]       = useSessionFilter('contagensEst:busca', '');
  const [logs, setLogs]         = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro]         = useState('');

  // Carrega contagens do dia selecionado
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [dataSel]);

  async function carregar() {
    if (!dataSel) { setLogs([]); return; }
    setCarregando(true);
    setErro('');
    try {
      // Cria janela [00:00:00, 23:59:59.999] do dia no fuso local
      const [y, m, d] = dataSel.split('-').map(Number);
      const inicio = new Date(y, m - 1, d, 0, 0, 0, 0);
      const fim    = new Date(y, m - 1, d, 23, 59, 59, 999);

      // Server-side: filtra por timestamp do dia (evita ler a coleção inteira).
      // Lê de `contagens_estoque` (coleção dedicada). Coletas de validade ficam
      // em `inventory_logs` — leitura separada, sem mistura.
      const snap = await getDocs(query(
        col('contagens_estoque'),
        where('timestamp', '>=', inicio),
        where('timestamp', '<=', fim),
        orderBy('timestamp', 'desc'),
        limit(2000),
      ));

      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Mantém soft delete (campo `excluido: true`) caso seja adotado aqui também.
      setLogs(filtrarLogsAtivos(todos));
    } catch (e) {
      console.error('Erro ao carregar contagens:', e);
      setErro(`Erro ao carregar: ${e.message}`);
      setLogs([]);
    } finally {
      setCarregando(false);
    }
  }

  // Aplica os filtros client-side: Nº Contagem + busca por código/descrição.
  const logsFiltrados = useMemo(() => {
    let r = logs;
    if (numFiltro) {
      const n = parseInt(numFiltro, 10);
      r = r.filter(l => Number(l.numContagem) === n);
    }
    if (busca?.trim()) {
      const q = busca.trim().toLowerCase();
      r = r.filter(l =>
        String(l.productCode || '').toLowerCase().includes(q) ||
        String(l.productName || '').toLowerCase().includes(q)
      );
    }
    return r;
  }, [logs, numFiltro, busca]);

  // Consolidado por produto: 1 linha por código, com soma e contagem de lançamentos.
  // Útil quando o mesmo SKU foi contado em ruas/depósitos diferentes — o saldo
  // verdadeiro é a soma de todas as ocorrências.
  const logsConsolidados = useMemo(() => {
    const mapa = new Map(); // productCode -> { productCode, productName, totalCx, lancamentos }
    for (const l of logsFiltrados) {
      const cod = String(l.productCode || '').trim();
      if (!cod) continue;
      const atual = mapa.get(cod) || {
        productCode: cod,
        productName: l.productName || '',
        totalCx: 0,
        lancamentos: 0,
      };
      atual.totalCx += Number(l.quantidade) || 0;
      atual.lancamentos += 1;
      // Mantém o nome do produto mais recente (já que o ORDER BY traz desc)
      if (!atual.productName) atual.productName = l.productName || '';
      mapa.set(cod, atual);
    }
    return Array.from(mapa.values()).sort((a, b) => b.totalCx - a.totalCx);
  }, [logsFiltrados]);

  // ─── Exportar CSV ─────────────────────────────────────────────────────
  // Formato AMBEV: armazem(2);deposito(2);produto(7);qtdInteira(7);qtdAvulsa(2)
  //   Ex: 01;01;0000982;0000010;08
  //
  // Consolidamos por (armazem + deposito + productCode) — se o mesmo SKU foi
  // contado em ruas diferentes do mesmo depósito, soma. Se foi em depósitos
  // diferentes, são linhas separadas.
  //
  // Quantidade inteira = caixas inteiras (palete×paletização + lastro×lastro + caixa).
  // Quantidade avulsa  = unidades soltas (qtdUnidade).
  function exportarCSV() {
    if (logsFiltrados.length === 0) {
      setErro('Nada pra exportar — ajuste os filtros.');
      setTimeout(() => setErro(''), 3000);
      return;
    }

    // Agrupa por (armazem|deposito|productCode)
    const mapa = new Map();
    for (const l of logsFiltrados) {
      const arm = String(l.armazem  || '').trim();
      const dep = String(l.deposito || '').trim();
      const cod = String(l.productCode || '').trim();
      if (!arm || !dep || !cod) continue;
      const chave = `${arm}|${dep}|${cod}`;

      const inteira = (Number(l.qtdPalete) || 0) * (Number(l.cxPorPlt)    || 0)
                    + (Number(l.qtdLastro) || 0) * (Number(l.cxPorLastro) || 0)
                    + (Number(l.qtdCaixa)  || 0);
      const avulsa  = Number(l.qtdUnidade) || 0;

      const atual = mapa.get(chave) || { armazem: arm, deposito: dep, productCode: cod, inteira: 0, avulsa: 0 };
      atual.inteira += inteira;
      atual.avulsa  += avulsa;
      mapa.set(chave, atual);
    }

    const pad = (v, n) => String(v).padStart(n, '0');
    // Envolve cada linha em aspas duplas: Excel/Sheets lê como uma única
    // string na coluna A (não divide nem converte zeros à esquerda), e
    // parsers CSV padrão (que o site destino usa) desempolam corretamente.
    const linhas = Array.from(mapa.values()).map(r => {
      const conteudoLinha = [
        pad(r.armazem, 2),
        pad(r.deposito, 2),
        pad(r.productCode, 7),
        pad(r.inteira, 7),
        pad(r.avulsa, 2),
      ].join(';');
      return `"${conteudoLinha}"`;
    });

    const conteudo = linhas.join('\r\n') + '\r\n';
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    const sufixoNum = numFiltro ? `_contagem${numFiltro}` : '';
    const nomeArquivo = `contagens_${dataSel}${sufixoNum}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Estilos ──────────────────────────────────────────────────────────
  const cs = {
    container: { maxWidth: '1300px', margin: '0 auto', padding: '20px' },
    header:    { color: '#E31837', marginBottom: '16px' },
    filtro: {
      display: 'flex', gap: '12px', alignItems: 'flex-end',
      backgroundColor: '#fff', padding: '14px 18px',
      borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      marginBottom: '16px', flexWrap: 'wrap',
    },
    label: {
      display: 'block', fontSize: '11px', fontWeight: 700,
      color: '#475569', letterSpacing: '0.5px',
      textTransform: 'uppercase', marginBottom: '4px',
    },
    dateInput: {
      padding: '9px 12px', border: '1px solid #cbd5e1',
      borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit',
    },
    btn: {
      padding: '9px 18px', backgroundColor: '#E31837', color: '#fff',
      border: 'none', borderRadius: '6px', cursor: 'pointer',
      fontSize: '13px', fontWeight: 700,
    },
    resumoBar: {
      display: 'flex', gap: '20px', flexWrap: 'wrap',
      padding: '12px 18px', backgroundColor: '#f1f5f9',
      borderRadius: '8px', marginBottom: '12px',
      fontSize: '13px', color: '#334155',
    },
    badge: (cor) => ({
      padding: '3px 10px', borderRadius: '12px',
      fontSize: '11px', fontWeight: 700,
      backgroundColor: cor === 'web' ? '#dbeafe' : '#fef3c7',
      color: cor === 'web' ? '#1e40af' : '#92400e',
    }),
    tabelaWrap: { backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
    tabsBar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
      paddingRight: '12px',
    },
    searchInput: {
      padding: '7px 12px', border: '1px solid #cbd5e1',
      borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit',
      width: '280px', backgroundColor: '#fff',
    },
    tabBtn: (ativo) => ({
      padding: '11px 22px',
      backgroundColor: ativo ? '#fff' : 'transparent',
      color: ativo ? '#E31837' : '#64748b',
      border: 'none',
      borderBottom: ativo ? '2px solid #E31837' : '2px solid transparent',
      fontSize: '13px',
      fontWeight: ativo ? 700 : 500,
      cursor: 'pointer',
      transition: '0.15s',
    }),
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
    th: { padding: '10px 12px', textAlign: 'left', backgroundColor: '#0f172a', color: '#fff', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' },
    td: { padding: '9px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', color: '#475569' },
    tdMono: { fontFamily: 'monospace' },
    vazio: { padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' },
  };

  return (
    <div style={cs.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ ...cs.header, margin: 0 }}>Contagens de Estoque</h1>
        <button
          onClick={exportarCSV}
          disabled={carregando || logsFiltrados.length === 0}
          style={{
            ...cs.btn,
            backgroundColor: '#0f766e',
            opacity: (carregando || logsFiltrados.length === 0) ? 0.5 : 1,
            cursor: (carregando || logsFiltrados.length === 0) ? 'not-allowed' : 'pointer',
          }}
        >
          ⬇ Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div style={cs.filtro}>
        <div>
          <label style={cs.label}>Data</label>
          <input
            type="date"
            value={dataSel}
            onChange={e => setDataSel(e.target.value)}
            max={hojeISO()}
            style={cs.dateInput}
          />
        </div>
        <div>
          <label style={cs.label}>Nº Contagem</label>
          <select
            value={numFiltro}
            onChange={e => setNumFiltro(e.target.value)}
            style={cs.dateInput}
          >
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map(n => (
              <option key={n} value={String(n)}>Contagem {n}</option>
            ))}
          </select>
        </div>
        <button onClick={carregar} disabled={carregando} style={{ ...cs.btn, opacity: carregando ? 0.6 : 1 }}>
          {carregando ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {erro && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fee2e2', color: '#991b1b', borderLeft: '4px solid #ef4444', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>
          {erro}
        </div>
      )}

      {/* Tabela com sub-abas */}
      <div style={cs.tabelaWrap}>
        <div style={cs.tabsBar}>
          <div style={{ display: 'flex' }}>
            <button style={cs.tabBtn(aba === 'detalhado')} onClick={() => setAba('detalhado')}>
              Detalhado
            </button>
            <button style={cs.tabBtn(aba === 'consolidado')} onClick={() => setAba('consolidado')}>
              Consolidado
            </button>
          </div>
          <input
            type="search"
            placeholder="Buscar por código ou descrição…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={cs.searchInput}
          />
        </div>
        {carregando ? (
          <div style={cs.vazio}>Carregando contagens do dia…</div>
        ) : logsFiltrados.length === 0 ? (
          <div style={cs.vazio}>
            Nenhuma contagem encontrada para <strong>{dataSel}</strong>
            {numFiltro ? <> · Contagem <strong>{numFiltro}</strong></> : null}.
          </div>
        ) : aba === 'consolidado' ? (
          <table style={cs.table}>
            <thead>
              <tr>
                <th style={cs.th}>Código</th>
                <th style={cs.th}>Produto</th>
                <th style={{ ...cs.th, textAlign: 'right' }}>Lançamentos</th>
                <th style={{ ...cs.th, textAlign: 'right' }}>Total cx</th>
              </tr>
            </thead>
            <tbody>
              {logsConsolidados.map((c, idx) => (
                <tr key={c.productCode} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                  <td style={{ ...cs.td, ...cs.tdMono, fontWeight: 700 }}>{c.productCode}</td>
                  <td style={cs.td}>{c.productName}</td>
                  <td style={{ ...cs.td, ...cs.tdMono, textAlign: 'right', color: c.lancamentos > 1 ? '#E31837' : '#475569', fontWeight: c.lancamentos > 1 ? 700 : 500 }}>
                    {c.lancamentos}
                  </td>
                  <td style={{ ...cs.td, ...cs.tdMono, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                    {Number(c.totalCx || 0).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={cs.table}>
            <thead>
              <tr>
                <th style={cs.th}>Nº</th>
                <th style={cs.th}>Hora</th>
                <th style={cs.th}>Armazém</th>
                <th style={cs.th}>Depósito</th>
                <th style={cs.th}>Código</th>
                <th style={cs.th}>Produto</th>
                <th style={cs.th}>Contagem (P·L·C·U)</th>
                <th style={{ ...cs.th, textAlign: 'right' }}>Total cx</th>
                <th style={cs.th}>Conferente</th>
                <th style={cs.th}>Origem</th>
              </tr>
            </thead>
            <tbody>
              {logsFiltrados.map((l, idx) => {
                const dt = tsToDate(l.timestamp);
                const breakdown = [
                  l.qtdPalete  > 0 && `${l.qtdPalete}P`,
                  l.qtdLastro  > 0 && `${l.qtdLastro}L`,
                  l.qtdCaixa   > 0 && `${l.qtdCaixa}C`,
                  l.qtdUnidade > 0 && `${l.qtdUnidade}U`,
                ].filter(Boolean).join(' · ');
                const isWeb = l.origem === 'manual-web-estoque';
                return (
                  <tr key={l.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ ...cs.td, ...cs.tdMono, textAlign: 'center', fontWeight: 700 }}>
                      {l.numContagem ? `#${l.numContagem}` : '—'}
                    </td>
                    <td style={{ ...cs.td, ...cs.tdMono }}>{fmtHora(dt)}</td>
                    <td style={cs.td}>{l.armazemNome || l.armazem || '—'}</td>
                    <td style={cs.td}>{l.depositoNome || l.deposito || '—'}</td>
                    <td style={{ ...cs.td, ...cs.tdMono, fontWeight: 700 }}>{l.productCode}</td>
                    <td style={cs.td}>{l.productName}</td>
                    <td style={{ ...cs.td, ...cs.tdMono, color: '#64748b' }}>{breakdown || '—'}</td>
                    <td style={{ ...cs.td, ...cs.tdMono, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                      {Number(l.quantidade || 0).toLocaleString('pt-BR')}
                    </td>
                    <td style={cs.td}>{l.conferente || '—'}</td>
                    <td style={cs.td}>
                      <span style={cs.badge(isWeb ? 'web' : 'mobile')}>
                        {isWeb ? 'Web' : 'Mobile'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
