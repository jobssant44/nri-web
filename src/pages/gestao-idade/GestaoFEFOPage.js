import React, { useState, useEffect, useMemo } from 'react';
import { useDb } from '../../utils/db';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import {
  D, PageContainer, PageHeader, EmptyState, FilterBar, FilterField,
  BotaoClear, sInput, tdStyle,
} from '../../design';
import { GestaoIdadeTabs } from '../../modules/gestao-idade/GestaoIdadeTabs';
import {
  avaliarPalete, fmtData, fmtNum, fmtPct, tsToDate, resolverPZV, PZV_PADRAO_DIAS,
  carregarLogsContagem, carregarProdutosMap, carregarPZVMap, carregarVendaMediaMap,
  COR,
} from '../../modules/gestao-idade/gestaoIdadeHelpers';
import { carregarMapaCurvaComFallback } from '../../modules/gerenciamento-estoque/shared/curvaLookup';

// Converte string "YYYY-MM-DD" (input type=date) → Date local
function parseISODate(s) {
  if (!s) return undefined;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

// Definição das colunas da tabela com chave de ordenação
const COLUNAS = [
  { key: 'productCode',  label: 'Item' },
  { key: 'local',        label: 'Local' },
  { key: 'rua',          label: 'Rua' },
  { key: 'descricao',    label: 'Descrição' },
  { key: 'quantidadeCx', label: 'Quant.' },
  { key: 'hectoTotal',   label: 'Hecto' },
  { key: 'curva',        label: 'Curva' },
  { key: 'vencimento',   label: 'Vencimento' },
  { key: 'prazo',        label: 'Prazo' },
  { key: 'status',       label: 'Status' },
  { key: 'vendaMediaCxDia', label: 'Venda Média' },
  { key: 'quantPerda',   label: 'Quant. Perda' },
  { key: 'hectoPerda',   label: 'Hecto Perda' },
  { key: 'situacao',     label: 'Situação' },
  { key: 'pzvDias',      label: 'PZV' },
  { key: 'pctShelfLife', label: '% Shelf Life' },
];

export default function GestaoFEFOPage() {
  const { col, docRef, colRevenda, rid } = useDb();

  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contagens, setContagens] = useState([]); // datas únicas de contagem
  const [resumo, setResumo] = useState({ pzv: 0, venda: 0 });

  // Filtros
  const [dataContagemSel, setDataContagemSel] = useSessionFilter('fefo:data', '');
  const [filtroBusca, setFiltroBusca] = useSessionFilter('fefo:busca', '');
  const [filtroLocal, setFiltroLocal] = useSessionFilter('fefo:local', 'Todos');
  const [filtroCurva, setFiltroCurva] = useSessionFilter('fefo:curva', 'Todas');
  const [filtroEmbalagem, setFiltroEmbalagem] = useSessionFilter('fefo:emb', 'Todas');
  const [filtroStatus, setFiltroStatus] = useSessionFilter('fefo:status', 'Todos');
  const [filtroShelfLife60, setFiltroShelfLife60] = useSessionFilter('fefo:sl60', false);
  const [sortKey, setSortKey] = useSessionFilter('fefo:sortKey', 'prazo');
  const [sortDir, setSortDir] = useSessionFilter('fefo:sortDir', 'asc');
  // Janela da Venda Média (default: últimos 30 dias)
  const [vendaInicio, setVendaInicio] = useSessionFilter('fefo:vmInicio', '');
  const [vendaFim,    setVendaFim]    = useSessionFilter('fefo:vmFim',    '');

  // Recarrega quando muda a janela da Venda Média (recalcula vendaMap + cobertura)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [vendaInicio, vendaFim]);

  async function carregar() {
    setLoading(true);
    try {
      const hoje = new Date();
      const [logs, produtosMap, pzvMap, vendaMap, curvaInfo] = await Promise.all([
        carregarLogsContagem({ col }),
        carregarProdutosMap({ col }),
        carregarPZVMap({ col }),
        carregarVendaMediaMap({
          col,
          docRef,
          dataInicio: vendaInicio ? parseISODate(vendaInicio) : undefined,
          dataFim:    vendaFim    ? parseISODate(vendaFim)    : undefined,
          diasJanela: 30,
        }),
        // Curva ABC ATUAL (não o snapshot do log) — regra do user em 2026-05-24.
        // Mensal do mês corrente com fallback pra curva_abc achatada (último import).
        carregarMapaCurvaComFallback({
          docRefFn: docRef, colFn: col, colRevendaFn: colRevenda, rid,
          ano: hoje.getFullYear(), mes: hoje.getMonth() + 1,
        }),
      ]);
      const curvaAtualMap = curvaInfo?.mapa || {};

      // Datas distintas de contagem (yyyy-mm-dd)
      const setDatas = new Set();
      logs.forEach(l => {
        const d = tsToDate(l.timestamp);
        if (d) setDatas.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      });
      const datasArr = Array.from(setDatas).sort().reverse();
      setContagens(datasArr);
      if (!dataContagemSel && datasArr.length > 0) {
        setDataContagemSel(datasArr[0]);
      }

      // Avalia cada palete (e anota timestamp para filtros)
      const linhasAvaliadas = logs.map(log => {
        const cod = String(log.productCode || '').trim();
        const produto = produtosMap[cod];
        const pzv = resolverPZV(cod, pzvMap, produto);
        const vMedia = vendaMap[cod] || 0;
        const a = avaliarPalete({
          log,
          dataReferencia: tsToDate(log.timestamp) || new Date(),
          produto,
          pzvDias: pzv,
          vendaMediaCxDia: vMedia,
          // Usa curva ABC ATUAL (regra do user). Se o produto não está na
          // curva atual, cai no snapshot do log como fallback.
          curvaProduto: curvaAtualMap[String(log.productCode || '').trim()] || log.productCurva,
        });
        a._ts = tsToDate(log.timestamp);
        return a;
      });

      setLinhas(linhasAvaliadas);
      setResumo({
        pzv: Object.keys(pzvMap).length,
        venda: Object.values(vendaMap).filter(v => v > 0).length,
      });
    } finally {
      setLoading(false);
    }
  }

  const filtradas = useMemo(() => {
    const q = filtroBusca.trim().toLowerCase();
    const filtradas_ = linhas.filter(l => {
      if (dataContagemSel && l._ts) {
        const k = `${l._ts.getFullYear()}-${String(l._ts.getMonth()+1).padStart(2,'0')}-${String(l._ts.getDate()).padStart(2,'0')}`;
        if (k !== dataContagemSel) return false;
      }
      if (q) {
        const hay = `${l.productCode} ${l.descricao} ${l.endereco || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filtroLocal !== 'Todos' && l.local !== filtroLocal) return false;
      if (filtroCurva !== 'Todas' && l.curva !== filtroCurva) return false;
      if (filtroEmbalagem !== 'Todas' && l.embalagem !== filtroEmbalagem) return false;
      if (filtroStatus === 'Vencido'  && l.status !== 'vencido')  return false;
      if (filtroStatus === 'Segregar' && l.status !== 'segregar') return false;
      if (filtroStatus === 'Atenção' && l.status !== 'atencao') return false;
      if (filtroStatus === 'OK' && l.status !== 'ok') return false;
      if (filtroShelfLife60 && (l.pctShelfLife == null || l.pctShelfLife >= 60)) return false;
      return true;
    });

    // Ordenação
    if (!sortKey) return filtradas_;
    // Ordem semântica de status/situação (mais grave primeiro quando asc)
    const ordemStatus  = { vencido: 0, segregar: 1, atencao: 2, ok: 3, 'sem-vencimento': 4 };
    const ordemSituacao = { alto: 0, critico: 1, medio: 2, baixo: 3 };
    return [...filtradas_].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (sortKey === 'status')   { va = ordemStatus[va]  ?? 99; vb = ordemStatus[vb]  ?? 99; }
      if (sortKey === 'situacao') { va = ordemSituacao[va] ?? 99; vb = ordemSituacao[vb] ?? 99; }
      // null/undefined sempre por último
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      // Dates
      if (va instanceof Date && vb instanceof Date) {
        const d = va.getTime() - vb.getTime();
        return sortDir === 'asc' ? d : -d;
      }
      // Numbers
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      // Strings
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      const cmp = sa.localeCompare(sb, 'pt-BR', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [linhas, dataContagemSel, filtroBusca, filtroLocal, filtroCurva, filtroEmbalagem, filtroStatus, filtroShelfLife60, sortKey, sortDir]);

  function alternarSort(key) {
    if (sortKey === key) {
      // mesma coluna: asc → desc → none
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(''); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const embalagens = useMemo(() => {
    const set = new Set(linhas.map(l => l.embalagem).filter(Boolean));
    return Array.from(set).sort();
  }, [linhas]);

  function limpar() {
    setFiltroBusca(''); setFiltroLocal('Todos'); setFiltroCurva('Todas');
    setFiltroEmbalagem('Todas'); setFiltroStatus('Todos'); setFiltroShelfLife60(false);
  }

  function corStatus(situacao) {
    return COR[situacao] || D.textMuted;
  }

  function corShelfLife(pct) {
    if (pct == null) return D.textMuted;
    if (pct < 30) return D.red;
    if (pct < 60) return D.amber;
    return D.green;
  }

  return (
    <PageContainer maxWidth={1500}>
      <PageHeader
        kicker="Gestão de Idade"
        titulo="Gestão de FEFO"
        sub="Planificador de vencimento/shelf life — produtos contados, status de segregação e estimativa de perda."
      />

      <GestaoIdadeTabs />

      {/* Avisos de dados faltando */}
      {(resumo.pzv === 0 || resumo.venda === 0) && (
        <div style={{
          padding: '10px 14px', marginBottom: '14px', borderRadius: 8,
          backgroundColor: D.amberSoft, border: `1px solid ${D.amberBorder}`,
          color: D.amber, fontSize: 12.5, fontFamily: D.font,
        }}>
          ℹ️ Avisos:
          {resumo.pzv === 0 && <> nenhum PZV específico cadastrado — usando padrão de <strong>{PZV_PADRAO_DIAS} dias</strong> para todos os produtos (importe em "Importar PZV" para refinar). </>}
          {resumo.venda === 0 && <> nenhuma venda média disponível (importe relatório 03.02.36.08 em Reabastecimento). Cobertura e Perda ficarão zeradas.</>}
        </div>
      )}

      <FilterBar>
        <FilterField label="Data da Contagem">
          <select style={sInput} value={dataContagemSel} onChange={e => setDataContagemSel(e.target.value)}>
            <option value="">Todas</option>
            {contagens.map(d => {
              const [y, m, dia] = d.split('-');
              return <option key={d} value={d}>{`${dia}/${m}/${y}`}</option>;
            })}
          </select>
        </FilterField>
        <FilterField label="Local">
          <select style={sInput} value={filtroLocal} onChange={e => setFiltroLocal(e.target.value)}>
            <option>Todos</option>
            <option>Estoque</option>
            <option>Picking</option>
            <option>PNC</option>
          </select>
        </FilterField>
        <FilterField label="Curva ABC">
          <select style={sInput} value={filtroCurva} onChange={e => setFiltroCurva(e.target.value)}>
            <option>Todas</option><option>A</option><option>B</option><option>C</option>
          </select>
        </FilterField>
        <FilterField label="Embalagem">
          <select style={sInput} value={filtroEmbalagem} onChange={e => setFiltroEmbalagem(e.target.value)}>
            <option>Todas</option>
            {embalagens.map(e => <option key={e}>{e}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select style={sInput} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option>Todos</option>
            <option>Vencido</option>
            <option>Segregar</option>
            <option>Atenção</option>
            <option>OK</option>
          </select>
        </FilterField>
        <FilterField label="Busca">
          <input style={{ ...sInput, minWidth: 200 }} placeholder="Código ou descrição"
            value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} />
        </FilterField>
        <FilterField label="Shelf Life < 60%">
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: D.textSec, cursor: 'pointer', height: '32px' }}>
            <input type="checkbox" checked={filtroShelfLife60} onChange={e => setFiltroShelfLife60(e.target.checked)} />
            Apenas
          </label>
        </FilterField>
        <FilterField label="Venda média de">
          <input type="date" style={sInput} value={vendaInicio} onChange={e => setVendaInicio(e.target.value)} />
        </FilterField>
        <FilterField label="até">
          <input type="date" style={sInput} value={vendaFim} onChange={e => setVendaFim(e.target.value)} />
        </FilterField>
        <BotaoClear onClick={limpar} />
      </FilterBar>

      <div style={{ fontSize: 12, color: D.textMuted, marginBottom: 12 }}>
        Mostrando <strong>{filtradas.length}</strong> de {linhas.length} contagens.
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: D.textMuted }}>Carregando...</div>
      ) : linhas.length === 0 ? (
        <EmptyState titulo="Sem contagens" descricao="Registre ou importe contagens no módulo Gerenciamento de Estoque." />
      ) : (
        <div style={{
          background: D.surface, border: `1px solid ${D.border}`,
          borderRadius: D.radius, overflow: 'hidden', boxShadow: D.shadow,
          overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font, minWidth: 1300 }}>
            <thead>
              <tr>
                {COLUNAS.map(c => {
                  const ativo = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={() => alternarSort(c.key)}
                      title="Clique para ordenar"
                      style={{
                        background: D.text, color: '#fff', padding: '8px 10px',
                        textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11,
                        cursor: 'pointer', userSelect: 'none',
                        position: 'relative',
                      }}
                    >
                      <span>{c.label}</span>
                      <span style={{
                        marginLeft: 6, fontSize: 10,
                        opacity: ativo ? 1 : 0.35,
                        color: ativo ? '#fff' : '#cbd5e1',
                      }}>
                        {ativo ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l, i) => (
                <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                  <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{l.productCode}</td>
                  <td style={tdStyle}>{l.local || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono }}>{l.rua || '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.descricao}>{l.descricao}</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{fmtNum(l.quantidadeCx, 0)}</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{fmtNum(l.hectoTotal, 2)}</td>
                  <td style={tdStyle}>
                    {l.curva ? (
                      <span style={{
                        padding: '2px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                        backgroundColor: l.curva === 'A' ? D.greenSoft : l.curva === 'B' ? D.amberSoft : D.redSoft,
                        color: l.curva === 'A' ? D.green : l.curva === 'B' ? D.amber : D.red,
                      }}>{l.curva}</span>
                    ) : '—'}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: D.mono }}>{fmtData(l.vencimento)}</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>
                    {l.prazo != null ? `${l.prazo}d` : '—'}
                  </td>
                  <td style={tdStyle}>
                    {l.status === 'vencido' && (
                      <span style={{ padding: '3px 9px', borderRadius: 6, backgroundColor: COR.vencido, color: '#fff', fontSize: 10.5, fontWeight: 700 }}>Vencido</span>
                    )}
                    {l.status === 'segregar' && (
                      <span style={{ padding: '3px 9px', borderRadius: 6, backgroundColor: COR.segregar, color: '#fff', fontSize: 10.5, fontWeight: 700 }}>Segregar</span>
                    )}
                    {l.status === 'atencao' && (
                      <span style={{ padding: '3px 9px', borderRadius: 6, backgroundColor: COR.atencao, color: '#fff', fontSize: 10.5, fontWeight: 700 }}>Atenção</span>
                    )}
                    {l.status === 'ok' && (
                      <span style={{ padding: '3px 9px', borderRadius: 6, backgroundColor: COR.ok, color: '#fff', fontSize: 10.5, fontWeight: 700 }}>OK</span>
                    )}
                    {l.status === 'sem-vencimento' && (
                      <span style={{ padding: '3px 9px', borderRadius: 6, background: '#f1f5f9', color: D.textMuted, fontSize: 10, fontStyle: 'italic' }}>sem vencim.</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>
                    {l.vendaMediaCxDia > 0
                      ? `${Math.round(l.vendaMediaCxDia)} cx/dia`
                      : '—'}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', color: l.quantPerda > 0 ? D.red : D.textMuted, fontWeight: l.quantPerda > 0 ? 700 : 400 }}>
                    {fmtNum(l.quantPerda, 0)}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right', color: l.hectoPerda > 0 ? D.red : D.textMuted, fontWeight: l.hectoPerda > 0 ? 700 : 400 }}>
                    {fmtNum(l.hectoPerda, 2)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-block', minWidth: 60, textAlign: 'center',
                      padding: '2px 8px', borderRadius: 10, fontSize: 10.5, fontWeight: 700,
                      backgroundColor: corStatus(l.situacao) + '22',
                      color: corStatus(l.situacao),
                      textTransform: 'capitalize',
                    }}>{l.situacao}</span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{l.pzvDias ?? '—'}</td>
                  <td style={tdStyle}>
                    {l.pctShelfLife == null ? <span style={{ color: D.textMuted }}>—</span> : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: D.mono, fontWeight: 700, color: corShelfLife(l.pctShelfLife) }}>
                        <div style={{ width: 50, height: 6, background: D.borderLight, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, l.pctShelfLife)}%`, height: '100%', background: corShelfLife(l.pctShelfLife) }} />
                        </div>
                        {fmtPct(l.pctShelfLife)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
