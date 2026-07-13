import React, { useState, useEffect, useMemo, useRef } from 'react';
import { updateDoc } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useUser } from '../../context/UserContext';
import { NIVEIS_SUPERVISOR } from '../admin/ConfigurarEmpresaPage';
import { useLocalFilter } from '../../hooks/useLocalFilter';
import {
  D, PageContainer, PageHeader, EmptyState, FilterBar, FilterField,
  BotaoClear, sInput, tdStyle,
} from '../../design';
import { GestaoIdadeTabs } from '../../modules/gestao-idade/GestaoIdadeTabs';
import {
  avaliarPalete, fmtData, fmtNum, fmtPct, tsToDate, resolverPZV, PZV_PADRAO_DIAS,
  carregarLogsContagem, carregarProdutosMap, carregarPZVMap, carregarVendaMediaMap,
  calcularPerdaFEFOConsolidada,
  COR,
} from '../../modules/gestao-idade/gestaoIdadeHelpers';
import { carregarMapaCurvaComFallback } from '../../modules/gerenciamento-estoque/shared/curvaLookup';
import { carregarPrecosMap, getPrecoProduto } from '../../utils/precos';

// Converte string "YYYY-MM-DD" (input type=date) → Date local
function parseISODate(s) {
  if (!s) return undefined;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

// Date → "YYYY-MM-DD" (pra prefill do <input type=date>)
function toISOInput(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Date → "DD/MM/AAAA" (campos legados `validade`/`validadeStr` lidos pela Reunião)
function fmtBR(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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
  { key: 'rsPerda',      label: 'R$ Perda' },
  { key: 'hectoPerda',   label: 'Hecto Perda' },
  { key: 'situacao',     label: 'Situação' },
  { key: 'pzvDias',      label: 'PZV' },
  { key: 'pctShelfLife', label: '% Shelf Life' },
];

// ─── Modal de edição de uma contagem (inventory_logs) ──────────────────────────
function ModalEditar({ linha, salvando, onSalvar, onFechar }) {
  const [productCode, setProductCode] = useState(linha.productCode || '');
  const [quantidade, setQuantidade]   = useState(linha._quantidade ?? '');
  const [unidade, setUnidade]         = useState(linha._unidade || 'caixa');
  const [endereco, setEndereco]       = useState(linha.endereco || '');
  const [validade, setValidade]       = useState(toISOInput(linha.vencimento));

  const campo = { marginBottom: 14 };
  const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: D.textMuted, marginBottom: 5, fontFamily: D.font };

  return (
    <div
      onClick={onFechar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, boxShadow: D.shadowMd, padding: 24, width: '100%', maxWidth: 440, fontFamily: D.font }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: D.text }}>Editar contagem</h2>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: D.textMuted }}>
          {linha.descricao || linha.productCode} · a alteração reflete em todos os relatórios.
        </p>

        <div style={campo}>
          <label style={label}>Código do produto</label>
          <input style={sInput} value={productCode} onChange={e => setProductCode(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={campo}>
            <label style={label}>Quantidade</label>
            <input style={sInput} type="number" step="any" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
          </div>
          <div style={campo}>
            <label style={label}>Unidade</label>
            <select style={sInput} value={unidade} onChange={e => setUnidade(e.target.value)}>
              <option value="caixa">Caixa</option>
              <option value="palete">Palete</option>
              <option value="lastro">Lastro</option>
              <option value="unidade">Unidade</option>
            </select>
          </div>
        </div>
        <div style={campo}>
          <label style={label}>Endereço / Local</label>
          <input style={sInput} value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Ex: A-1-007, PNC-01…" />
        </div>
        <div style={campo}>
          <label style={label}>Validade</label>
          <input style={sInput} type="date" value={validade} onChange={e => setValidade(e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button
            onClick={onFechar}
            disabled={salvando}
            style={{ padding: '9px 16px', background: D.surface, border: `1px solid ${D.border}`, borderRadius: 8, cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, color: D.textSec, fontFamily: D.font, fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSalvar({ productCode, quantidade, unidade, endereco, validade })}
            disabled={salvando}
            style={{ padding: '9px 18px', background: salvando ? D.textMuted : D.red, border: 'none', borderRadius: 8, cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, color: '#fff', fontFamily: D.font, fontWeight: 700 }}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GestaoFEFOPage() {
  const { col, docRef, colRevenda, rid } = useDb();
  const { usuario } = useUser();
  // "Supervisor pra cima" = mesma lista canônica dos route guards (guardaSup).
  const isSup = NIVEIS_SUPERVISOR.includes(usuario?.nivel);

  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contagens, setContagens] = useState([]); // datas únicas de contagem
  const [resumo, setResumo] = useState({ pzv: 0, venda: 0 });
  const [editando, setEditando] = useState(null); // linha em edição (ou null)
  const [salvando, setSalvando] = useState(false);
  // Catálogo (produtos + curva ABC atual) da última carga — usado pra resolver
  // nome/curva do produto quando o código é alterado numa edição.
  const catalogoRef = useRef({ produtos: {}, curva: {} });
  const [modoEdicao, setModoEdicao] = useState(false); // toggle do topo: mostra ações (editar/excluir) por linha

  // Filtros
  const [dataContagemSel, setDataContagemSel] = useLocalFilter('fefo:data', '');
  const [filtroBusca, setFiltroBusca] = useLocalFilter('fefo:busca', '');
  const [filtroLocal, setFiltroLocal] = useLocalFilter('fefo:local', 'Todos');
  const [filtroCurva, setFiltroCurva] = useLocalFilter('fefo:curva', 'Todas');
  const [filtroEmbalagem, setFiltroEmbalagem] = useLocalFilter('fefo:emb', 'Todas');
  const [filtroStatus, setFiltroStatus] = useLocalFilter('fefo:status', 'Todos');
  const [filtroShelfLife60, setFiltroShelfLife60] = useLocalFilter('fefo:sl60', false);
  const [sortKey, setSortKey] = useLocalFilter('fefo:sortKey', 'prazo');
  const [sortDir, setSortDir] = useLocalFilter('fefo:sortDir', 'asc');
  // Janela da Venda Média (default: últimos 30 dias)
  const [vendaInicio, setVendaInicio] = useLocalFilter('fefo:vmInicio', '');
  const [vendaFim,    setVendaFim]    = useLocalFilter('fefo:vmFim',    '');

  // Recarrega quando muda a janela da Venda Média (recalcula vendaMap + cobertura)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [vendaInicio, vendaFim]);

  async function carregar() {
    setLoading(true);
    try {
      const hoje = new Date();
      const [logs, produtosMap, pzvMap, vendaMap, precosMap, curvaInfo] = await Promise.all([
        carregarLogsContagem({ col }),
        carregarProdutosMap({ col }),
        carregarPZVMap({ col }),
        carregarVendaMediaMap({
          col,
          docRef,
          rid,
          dataInicio: vendaInicio ? parseISODate(vendaInicio) : undefined,
          dataFim:    vendaFim    ? parseISODate(vendaFim)    : undefined,
          diasJanela: 30,
        }),
        // Preços importados em /importar/precos. Usado pra calcular R$ Perda
        // por linha (quantPerda × preço de caixa — coletas são em caixa).
        // Sem preço cadastrado → R$ Perda = null (—).
        carregarPrecosMap({ col }),
        // Curva ABC ATUAL (não o snapshot do log) — regra do user em 2026-05-24.
        // Mensal do mês corrente com fallback pra curva_abc achatada (último import).
        carregarMapaCurvaComFallback({
          docRefFn: docRef, colFn: col, colRevendaFn: colRevenda, rid,
          ano: hoje.getFullYear(), mes: hoje.getMonth() + 1,
        }),
      ]);
      const curvaAtualMap = curvaInfo?.mapa || {};
      catalogoRef.current = { produtos: produtosMap, curva: curvaAtualMap };

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

      // Calcula perda FEFO CONSOLIDADA (versão 02/06/26): lotes do mesmo
      // produto compartilham a venda média em cadeia (em vez do cálculo
      // linha-a-linha que tratava cada lote isoladamente). O map retornado
      // é por REFERÊNCIA de log, então cada palete recupera seu próprio valor.
      const perdaFEFOMap = calcularPerdaFEFOConsolidada(logs, produtosMap, vendaMap, hoje);

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
          // Perda FEFO consolidada (sobrescreve cálculo linha-a-linha).
          quantPerdaPreCalculada: perdaFEFOMap.get(log),
        });
        a._ts = tsToDate(log.timestamp);
        // Campos crus do log (pra edição): id do doc + quantidade/unidade originais.
        a._logId = log.id;
        a._quantidade = log.quantidade ?? '';
        a._unidade = log.unidade || 'caixa';
        // R$ Perda — multiplica quantPerda × preço de caixa do produto (coletas
        // são em caixa). Sem preço cadastrado → null.
        const precoUnit = getPrecoProduto(cod, precosMap, 'caixa'); // coletas FEFO são em caixa
        a.precoUnit = precoUnit;
        a.rsPerda = (precoUnit != null && a.quantPerda > 0)
          ? a.quantPerda * precoUnit
          : (a.quantPerda > 0 ? null : 0);
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

  // Salva a edição de uma contagem direto no doc de inventory_logs (fonte única).
  // Como todas as telas de Gestão de Idade + a Reunião lêem essa mesma coleção,
  // a correção reflete em todos os relatórios onde essa linha aparece.
  async function salvarEdicao(form) {
    if (!editando?._logId) return;
    setSalvando(true);
    try {
      const novoCod  = String(form.productCode || '').trim();
      const codMudou = novoCod !== String(editando.productCode || '').trim();
      const dtVenc   = form.validade ? parseISODate(form.validade) : null;
      const vencBR   = fmtBR(dtVenc);

      const update = {
        productCode: novoCod,
        quantidade:  Number(form.quantidade) || 0,
        unidade:     form.unidade || 'caixa',
        endereco:    String(form.endereco || '').trim().toUpperCase() || null,
        // Validade em TODAS as representações que os relatórios leem:
        //  - expiryDate (Timestamp/Date) → telas de Gestão de Idade
        //  - validade / validadeStr (string DD/MM/AAAA) → módulo FEFO da Reunião
        expiryDate:  dtVenc,
        validade:    vencBR,
        validadeStr: vencBR,
        editadoEm:   new Date(),
        editadoPor:  usuario?.nome || '',
      };

      // Se o código do produto mudou, atualiza os snapshots nome/curva — que são
      // lidos direto (sem lookup) por Stock Age, Estoque x Picking/Estoque,
      // Coletas e Reunião. Sem isso, a linha apareceria com o produto ANTIGO lá.
      if (codMudou) {
        const cat = catalogoRef.current;
        update.productName  = cat.produtos[novoCod]?.descricao ?? '';
        update.productCurva = cat.curva[novoCod] ?? null;
      }

      await updateDoc(docRef('inventory_logs', editando._logId), update);
      setEditando(null);
      await carregar();
    } catch (e) {
      alert('Erro ao salvar edição: ' + (e?.message || e));
    } finally {
      setSalvando(false);
    }
  }

  // Soft delete (excluido:true): some de TODAS as telas que filtram isLogExcluido
  // (Gestão de Idade + Reunião). Recuperável só via script admin, por design.
  async function excluirLinha(linha) {
    if (!linha?._logId) return;
    const ok = window.confirm(
      `Excluir esta contagem?\n\n${linha.productCode} — ${linha.descricao || ''}\n\n` +
      `Ela sai de todos os relatórios.`
    );
    if (!ok) return;
    setSalvando(true);
    try {
      await updateDoc(docRef('inventory_logs', linha._logId), {
        excluido:    true,
        excluidoEm:  new Date(),
        excluidoPor: usuario?.nome || '',
      });
      await carregar();
    } catch (e) {
      alert('Erro ao excluir: ' + (e?.message || e));
    } finally {
      setSalvando(false);
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

  // Exporta as linhas FILTRADAS (respeita filtros atuais) pra CSV BR-friendly:
  // separador ';', decimal com vírgula, datas DD/MM/AAAA, UTF-8 com BOM
  // (pra Excel BR abrir certo). Filtra _ts (campo interno) e expõe data legível.
  function exportarCSV() {
    if (filtradas.length === 0) return;

    // Colunas do export — mais completas que a tabela visual (inclui dataContagem).
    const cols = [
      { key: 'productCode',     label: 'Codigo' },
      { key: 'descricao',       label: 'Descricao' },
      { key: 'local',           label: 'Local' },
      { key: 'rua',             label: 'Endereco' },
      { key: 'quantidadeCx',    label: 'Quantidade (cx)' },
      { key: 'hectoTotal',      label: 'Hecto Total' },
      { key: 'curva',           label: 'Curva' },
      { key: 'vencimento',      label: 'Vencimento' },
      { key: 'dataContagem',    label: 'Data Contagem' },
      { key: 'prazo',           label: 'Prazo (dias)' },
      { key: 'status',          label: 'Status' },
      { key: 'vendaMediaCxDia', label: 'Venda Media (cx/dia)' },
      { key: 'quantPerda',      label: 'Quant. Perda' },
      { key: 'rsPerda',         label: 'R$ Perda' },
      { key: 'hectoPerda',      label: 'Hecto Perda' },
      { key: 'pzvDias',         label: 'PZV (dias)' },
      { key: 'pctShelfLife',    label: '% Shelf Life' },
    ];

    function fmtData(d) {
      if (!d) return '';
      const x = d instanceof Date ? d : new Date(d);
      if (isNaN(x.getTime())) return String(d);
      return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
    }
    function fmtCelula(v) {
      if (v == null) return '';
      if (v instanceof Date) return fmtData(v);
      if (typeof v === 'number') return String(v).replace('.', ',');
      const s = String(v);
      // Escape CSV: se contém ; " ou quebra de linha, encerra em aspas e escapa aspas duplas
      if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }

    const header = cols.map(c => c.label).join(';');
    const linhas = filtradas.map(l => {
      const linhaComData = {
        ...l,
        dataContagem: fmtData(l._ts),
        vencimento:   l.vencimento ? fmtData(l.vencimento) : '',
      };
      return cols.map(c => fmtCelula(linhaComData[c.key])).join(';');
    });

    // BOM (﻿) → Excel BR abre como UTF-8 sem precisar trocar encoding
    const csv = '﻿' + [header, ...linhas].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const hoje = new Date();
    const stamp = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, '0')}${String(hoje.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `contagens-fefo-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageContainer maxWidth={1500}>
      <PageHeader
        kicker="Gestão de Idade"
        titulo="Gestão de FEFO"
        sub="Planificador de vencimento/shelf life — produtos contados, status de segregação e estimativa de perda."
        acoes={isSup && (
          <button
            onClick={() => setModoEdicao(v => !v)}
            title={modoEdicao ? 'Sair do modo edição' : 'Editar linhas (editar / excluir)'}
            aria-label="Modo edição"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, flexShrink: 0,
              background: modoEdicao ? D.red : D.surface,
              border: `1px solid ${modoEdicao ? D.red : D.border}`,
              borderRadius: 8, cursor: 'pointer',
              color: modoEdicao ? '#fff' : D.textMuted,
              boxShadow: D.shadow, transition: D.transition,
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5.25L18.75 9" />
            </svg>
          </button>
        )}
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: D.textMuted }}>
          Mostrando <strong>{filtradas.length}</strong> de {linhas.length} contagens.
        </div>
        <button
          onClick={exportarCSV}
          disabled={filtradas.length === 0}
          style={{
            padding: '7px 14px',
            background: D.surface,
            border: `1px solid ${D.border}`,
            borderRadius: 8,
            cursor: filtradas.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 12,
            color: filtradas.length === 0 ? D.textMuted : D.text,
            fontFamily: D.font,
            fontWeight: 600,
            opacity: filtradas.length === 0 ? 0.5 : 1,
            transition: D.transition,
          }}
          title={filtradas.length === 0 ? 'Nenhuma contagem pra exportar' : `Baixar ${filtradas.length} contagens em CSV`}
        >
          📥 Baixar CSV ({filtradas.length})
        </button>
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
                {isSup && modoEdicao && (
                  <th style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11 }}>Ações</th>
                )}
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
                  {isSup && modoEdicao && (
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditando(l)}
                          title="Editar esta contagem"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: D.surface, border: `1px solid ${D.border}`, borderRadius: 6, cursor: 'pointer', color: D.textSec }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => excluirLinha(l)}
                          title="Excluir esta linha"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: D.redSoft, border: `1px solid ${D.redBorder}`, borderRadius: 6, cursor: 'pointer', color: D.red }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
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
                  {/* R$ Perda — null quando produto não tem preço cadastrado (mostra '—'
                      + tooltip explicativo). Quando sem perda (qtdPerda=0), valor é 0
                      e fica neutro. Cor vermelha só quando >0. */}
                  <td
                    style={{
                      ...tdStyle, fontFamily: D.mono, textAlign: 'right',
                      color: l.rsPerda > 0 ? D.red : D.textMuted,
                      fontWeight: l.rsPerda > 0 ? 700 : 400,
                    }}
                    title={
                      l.rsPerda == null ? 'Produto sem preço cadastrado em /importar/precos'
                      : l.precoUnit ? `Preço unit. R$ ${l.precoUnit.toFixed(2).replace('.', ',')}`
                      : ''
                    }
                  >
                    {l.rsPerda == null
                      ? '—'
                      : `R$ ${l.rsPerda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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

      {editando && (
        <ModalEditar
          linha={editando}
          salvando={salvando}
          onSalvar={salvarEdicao}
          onFechar={() => setEditando(null)}
        />
      )}
    </PageContainer>
  );
}
