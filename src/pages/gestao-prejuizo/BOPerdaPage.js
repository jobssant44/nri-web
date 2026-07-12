/**
 * BOPerdaPage — BO de Perda (Gestão de Prejuízo).
 *
 * Duas abas:
 *  - Registrar perda: formulário com autocomplete código↔descrição (catálogo),
 *    quantidade + unidade, local, motivo e colaborador (opcional).
 *    Grava em `prejuizo_bos` — MESMO shape usado pelo app mobile.
 *  - Histórico de BOs: últimos 6 meses (server-side filter), filtros
 *    client-side, tabela ordenável, edição/exclusão (soft delete) só pra
 *    supervisor+ e export CSV.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { addDoc, getDocs, query, where, orderBy, limit, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useUser } from '../../context/UserContext';
import { useCatalogos } from '../../context/CatalogosContext';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import { NIVEIS_SUPERVISOR } from '../admin/ConfigurarEmpresaPage';
import { buscarProdutos } from '../../modules/gerenciamento-estoque/shared/contagemConstants';
import {
  D, PageContainer, PageHeader, FilterBar, FilterField, Chip,
  EmptyState, Vazio, Skeleton, sLabel, sInput, sBtnPrimary, tdStyle, cardStyle,
  BotaoClear,
} from '../../design';

// ─── Helpers de data ─────────────────────────────────────────────────────────
function tsToDate(t) {
  if (!t) return null;
  if (typeof t.toDate === 'function') return t.toDate();
  if (t instanceof Date) return t;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}
function toISOKey(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDataBR(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Colunas do histórico (com chave de ordenação) ───────────────────────────
const COLUNAS = [
  { key: '_data',        label: 'Data' },
  { key: 'productCode',  label: 'Código' },
  { key: 'productName',  label: 'Descrição' },
  { key: 'quantidade',   label: 'Quant.' },
  { key: 'unidade',      label: 'Unid.' },
  { key: 'local',        label: 'Local' },
  { key: 'motivo',       label: 'Motivo' },
  { key: 'colaborador',  label: 'Colaborador' },
  { key: 'registradoPor', label: 'Registrado por' },
];

// ─── Dropdown do autocomplete ────────────────────────────────────────────────
const dropdownStyle = {
  position: 'absolute', top: '100%', left: 0, right: 0,
  backgroundColor: D.surface, border: `1px solid ${D.border}`, borderTop: 'none',
  borderRadius: '0 0 8px 8px', zIndex: 10,
  maxHeight: 240, overflowY: 'auto',
  boxShadow: D.shadowMd, minWidth: 320,
};
const itemSugStyle = (i, total) => ({
  padding: '8px 10px', cursor: 'pointer', fontSize: 12, fontFamily: D.font,
  color: D.textSec,
  borderBottom: i < total - 1 ? `1px solid ${D.borderLight}` : 'none',
});

// ─── Modal de edição de um BO (padrão do FEFO) ───────────────────────────────
function ModalEditarBO({ linha, baseProdutos, areas, motivos, colaboradores, salvando, onSalvar, onFechar }) {
  const [codigo, setCodigo]           = useState(linha.productCode || '');
  const [quantidade, setQuantidade]   = useState(linha.quantidade ?? '');
  const [unidade, setUnidade]         = useState(linha.unidade || 'caixa');
  const [local, setLocal]             = useState(linha.local || '');
  const [motivo, setMotivo]           = useState(linha.motivo || '');
  const [colaborador, setColaborador] = useState(linha.colaborador || '');
  const [erro, setErro]               = useState('');

  const produtoSel = useMemo(() => {
    if (!codigo) return null;
    return baseProdutos.find(p => p.codigo === String(codigo).trim()) || null;
  }, [codigo, baseProdutos]);

  const campo = { marginBottom: 14 };
  const label = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: D.textMuted, marginBottom: 5, fontFamily: D.font };

  function tentarSalvar() {
    if (!produtoSel) { setErro('Código sem match exato no catálogo.'); return; }
    if (!(Number(quantidade) > 0)) { setErro('Quantidade precisa ser maior que zero.'); return; }
    if (!local) { setErro('Selecione o local.'); return; }
    if (!motivo) { setErro('Selecione o motivo.'); return; }
    setErro('');
    onSalvar({
      productCode: produtoSel.codigo,
      productName: produtoSel.descricao,
      quantidade: Number(quantidade),
      unidade,
      local,
      motivo,
      colaborador: colaborador || null,
    });
  }

  return (
    <div
      onClick={onFechar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: D.surface, borderRadius: 14, boxShadow: D.shadowMd, padding: 24, width: '100%', maxWidth: 440, fontFamily: D.font }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: D.text }}>Editar BO</h2>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: D.textMuted }}>
          {linha.productName || linha.productCode}
        </p>

        <div style={campo}>
          <label style={label}>Código do produto</label>
          <input style={{ ...sInput, width: '100%', boxSizing: 'border-box', fontFamily: D.mono }} value={codigo} onChange={e => setCodigo(e.target.value.replace(/[^0-9]/g, ''))} />
          {produtoSel && (
            <div style={{ fontSize: 11, color: D.textSec, marginTop: 4 }}>{produtoSel.descricao}</div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={campo}>
            <label style={label}>Quantidade</label>
            <input style={{ ...sInput, width: '100%', boxSizing: 'border-box', minWidth: 0 }} type="number" step="any" min="0" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
          </div>
          <div style={campo}>
            <label style={label}>Unidade</label>
            <select style={{ ...sInput, width: '100%', boxSizing: 'border-box', minWidth: 0 }} value={unidade} onChange={e => setUnidade(e.target.value)}>
              <option value="caixa">Caixa</option>
              <option value="unidade">Unidade</option>
            </select>
          </div>
        </div>
        <div style={campo}>
          <label style={label}>Local</label>
          <select style={{ ...sInput, width: '100%', boxSizing: 'border-box' }} value={local} onChange={e => setLocal(e.target.value)}>
            <option value="">—</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
            {local && !areas.includes(local) && <option value={local}>{local}</option>}
          </select>
        </div>
        <div style={campo}>
          <label style={label}>Motivo</label>
          <select style={{ ...sInput, width: '100%', boxSizing: 'border-box' }} value={motivo} onChange={e => setMotivo(e.target.value)}>
            <option value="">—</option>
            {motivos.map(m => <option key={m} value={m}>{m}</option>)}
            {motivo && !motivos.includes(motivo) && <option value={motivo}>{motivo}</option>}
          </select>
        </div>
        <div style={campo}>
          <label style={label}>Colaborador</label>
          <select style={{ ...sInput, width: '100%', boxSizing: 'border-box' }} value={colaborador} onChange={e => setColaborador(e.target.value)}>
            <option value="">—</option>
            {colaboradores.map(c => <option key={c} value={c}>{c}</option>)}
            {colaborador && !colaboradores.includes(colaborador) && <option value={colaborador}>{colaborador}</option>}
          </select>
        </div>

        {erro && (
          <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: D.redSoft, border: `1px solid ${D.redBorder}`, color: D.red, fontSize: 12 }}>
            ❌ {erro}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button
            onClick={onFechar}
            disabled={salvando}
            style={{ padding: '9px 16px', background: D.surface, border: `1px solid ${D.border}`, borderRadius: 8, cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, color: D.textSec, fontFamily: D.font, fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            onClick={tentarSalvar}
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

// ─── Aba: Registrar perda ────────────────────────────────────────────────────
function RegistrarPerda({ baseProdutos, carregandoCatalogos, areas, motivos, colaboradores }) {
  const { col, stamp } = useDb();
  const { usuario } = useUser();

  const [codigo, setCodigo]           = useState('');
  const [descricao, setDescricao]     = useState('');
  const [sugestoes, setSugestoes]     = useState([]);
  const [campoAtivo, setCampoAtivo]   = useState(null); // 'codigo' | 'descricao' | null
  const [quantidade, setQuantidade]   = useState('');
  const [unidade, setUnidade]         = useState('caixa');
  const [local, setLocal]             = useState('');
  const [motivo, setMotivo]           = useState('');
  const [colaborador, setColaborador] = useState('');
  const [salvando, setSalvando]       = useState(false);
  const [mensagem, setMensagem]       = useState('');
  const [errs, setErrs]               = useState({});

  // Produto selecionado (match exato pelo código)
  const produtoSel = useMemo(() => {
    if (!codigo) return null;
    return baseProdutos.find(p => p.codigo === codigo.trim()) || null;
  }, [codigo, baseProdutos]);

  // ─── Autocomplete bidirecional ────────────────────────────────────────────
  function onChangeCodigo(v) {
    const t = String(v).replace(/[^0-9]/g, '');
    setCodigo(t);
    const exato = baseProdutos.find(p => p.codigo === t);
    if (exato) setDescricao(exato.descricao);
    else if (descricao && !t) setDescricao('');
    setSugestoes(t ? buscarProdutos(baseProdutos, t).filter(p => p.codigo.startsWith(t)) : []);
    setCampoAtivo('codigo');
  }
  function onChangeDescricao(v) {
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

  async function salvar(e) {
    e?.preventDefault?.();
    setMensagem('');
    const novosErrs = {};
    if (!codigo)          novosErrs.codigo = 'Informe o código';
    else if (!produtoSel) novosErrs.codigo = 'Código não encontrado na base';
    if (!(Number(quantidade) > 0)) novosErrs.quantidade = 'Informe uma quantidade maior que zero';
    if (!local)  novosErrs.local  = 'Selecione o local';
    if (!motivo) novosErrs.motivo = 'Selecione o motivo';
    setErrs(novosErrs);
    if (Object.keys(novosErrs).length > 0) return;

    setSalvando(true);
    try {
      await addDoc(col('prejuizo_bos'), {
        productCode: produtoSel.codigo,
        productName: produtoSel.descricao,
        quantidade:  Number(quantidade),
        unidade,
        local,
        motivo,
        colaborador: colaborador || null,
        registradoPor: usuario?.nome || '',
        timestamp:  Timestamp.fromDate(new Date()),
        criadoEm:   serverTimestamp(),
        origem:     'manual-web-perda',
        ...stamp(),
      });
      setMensagem('✅ BO registrado!');
      // Limpa tudo (mais seguro pra registros em sequência)
      setCodigo(''); setDescricao(''); setSugestoes([]); setCampoAtivo(null);
      setQuantidade(''); setUnidade('caixa');
      setLocal(''); setMotivo(''); setColaborador('');
      setTimeout(() => setMensagem(''), 3500);
    } catch (err) {
      setMensagem(`❌ Erro: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  const wideInput = { ...sInput, width: '100%', boxSizing: 'border-box', minWidth: 0 };

  return (
    <div style={{ ...cardStyle, maxWidth: 760, animation: 'wjs-fadeUp 0.3s ease both' }}>
      {mensagem && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8, fontSize: 13, fontFamily: D.font, fontWeight: 600,
          background: mensagem.includes('✅') ? D.greenSoft : D.redSoft,
          border: `1px solid ${mensagem.includes('✅') ? D.greenBorder : D.redBorder}`,
          color: mensagem.includes('✅') ? D.green : D.red,
        }}>{mensagem}</div>
      )}

      <form onSubmit={salvar}>
        {/* ── Código ↔ Descrição ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ ...sLabel, display: 'block', marginBottom: 5 }}>Código</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ex: 1695"
                value={codigo}
                onChange={e => onChangeCodigo(e.target.value)}
                onFocus={() => setCampoAtivo('codigo')}
                onBlur={() => setTimeout(() => setCampoAtivo(null), 150)}
                disabled={salvando}
                style={{ ...wideInput, fontFamily: D.mono, borderColor: errs.codigo ? D.red : D.border }}
              />
              {campoAtivo === 'codigo' && sugestoes.length > 0 && (
                <div style={dropdownStyle}>
                  {sugestoes.map((p, i) => (
                    <div key={p.codigo} onMouseDown={() => escolherProduto(p)} style={itemSugStyle(i, sugestoes.length)}>
                      <strong style={{ fontFamily: D.mono, color: D.text }}>{p.codigo}</strong> — {p.descricao}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errs.codigo && <div style={{ color: D.red, fontSize: 12, marginTop: 4, fontFamily: D.font }}>❌ {errs.codigo}</div>}
          </div>

          <div>
            <label style={{ ...sLabel, display: 'block', marginBottom: 5 }}>Descrição</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Digite parte do nome…"
                value={descricao}
                onChange={e => onChangeDescricao(e.target.value)}
                onFocus={() => setCampoAtivo('descricao')}
                onBlur={() => setTimeout(() => setCampoAtivo(null), 150)}
                disabled={salvando}
                style={wideInput}
              />
              {campoAtivo === 'descricao' && sugestoes.length > 0 && (
                <div style={dropdownStyle}>
                  {sugestoes.map((p, i) => (
                    <div key={p.codigo} onMouseDown={() => escolherProduto(p)} style={itemSugStyle(i, sugestoes.length)}>
                      <strong style={{ fontFamily: D.mono, color: D.text }}>{p.codigo}</strong> — {p.descricao}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Quantidade + Unidade ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '170px 170px', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ ...sLabel, display: 'block', marginBottom: 5 }}>Quantidade</label>
            <input
              type="number"
              step="any"
              min="0"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              disabled={salvando}
              style={{ ...wideInput, fontFamily: D.mono, borderColor: errs.quantidade ? D.red : D.border }}
            />
            {errs.quantidade && <div style={{ color: D.red, fontSize: 12, marginTop: 4, fontFamily: D.font }}>❌ {errs.quantidade}</div>}
          </div>
          <div>
            <label style={{ ...sLabel, display: 'block', marginBottom: 5 }}>Unidade</label>
            <select value={unidade} onChange={e => setUnidade(e.target.value)} disabled={salvando} style={wideInput}>
              <option value="caixa">Caixa</option>
              <option value="unidade">Unidade</option>
            </select>
          </div>
        </div>

        {/* ── Local + Motivo + Colaborador ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ ...sLabel, display: 'block', marginBottom: 5 }}>Local</label>
            <select
              value={local}
              onChange={e => setLocal(e.target.value)}
              disabled={salvando}
              style={{ ...wideInput, borderColor: errs.local ? D.red : D.border }}
            >
              <option value="">Selecione…</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {errs.local && <div style={{ color: D.red, fontSize: 12, marginTop: 4, fontFamily: D.font }}>❌ {errs.local}</div>}
          </div>
          <div>
            <label style={{ ...sLabel, display: 'block', marginBottom: 5 }}>Motivo</label>
            <select
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              disabled={salvando}
              style={{ ...wideInput, borderColor: errs.motivo ? D.red : D.border }}
            >
              <option value="">Selecione…</option>
              {motivos.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {errs.motivo && <div style={{ color: D.red, fontSize: 12, marginTop: 4, fontFamily: D.font }}>❌ {errs.motivo}</div>}
          </div>
          <div>
            <label style={{ ...sLabel, display: 'block', marginBottom: 5 }}>Colaborador</label>
            <select value={colaborador} onChange={e => setColaborador(e.target.value)} disabled={salvando} style={wideInput}>
              <option value="">—</option>
              {colaboradores.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={salvando || carregandoCatalogos}
          style={{
            ...sBtnPrimary,
            padding: '11px 26px',
            opacity: (salvando || carregandoCatalogos) ? 0.6 : 1,
            cursor: (salvando || carregandoCatalogos) ? 'not-allowed' : 'pointer',
          }}
        >
          {salvando ? 'Registrando…' : 'Registrar BO'}
        </button>
      </form>
    </div>
  );
}

// ─── Aba: Histórico de BOs ───────────────────────────────────────────────────
function HistoricoBOs({ baseProdutos, areas, motivos, colaboradores }) {
  const { col, docRef } = useDb();
  const { usuario } = useUser();
  const isSup = NIVEIS_SUPERVISOR.includes(usuario?.nivel);

  const [bos, setBos]           = useState(null); // null = ainda não carregou
  const [loading, setLoading]   = useState(false);
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // Filtros (client-side — mudar filtro NÃO refaz fetch)
  const [filtroDataIni, setFiltroDataIni] = useSessionFilter('boperda:hist:dataIni', '');
  const [filtroDataFim, setFiltroDataFim] = useSessionFilter('boperda:hist:dataFim', '');
  const [filtroLocal, setFiltroLocal]     = useSessionFilter('boperda:hist:local', '');
  const [filtroMotivo, setFiltroMotivo]   = useSessionFilter('boperda:hist:motivo', '');
  const [filtroColab, setFiltroColab]     = useSessionFilter('boperda:hist:colab', '');
  const [filtroBusca, setFiltroBusca]     = useSessionFilter('boperda:hist:busca', '');
  const [sortKey, setSortKey]             = useSessionFilter('boperda:hist:sortKey', '_data');
  const [sortDir, setSortDir]             = useSessionFilter('boperda:hist:sortDir', 'desc');

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      try {
        const corte = new Date();
        corte.setMonth(corte.getMonth() - 6);
        const snap = await getDocs(query(
          col('prejuizo_bos'),
          where('timestamp', '>=', Timestamp.fromDate(corte)),
          orderBy('timestamp', 'desc'),
          limit(2000),
        ));
        if (!ativo) return;
        setBos(snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => b.excluido !== true)
          .map(b => ({ ...b, _data: tsToDate(b.timestamp) })));
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listas de filtro — só valores realmente presentes nos BOs carregados
  const locaisPresentes = useMemo(() => {
    const s = new Set((bos || []).map(b => b.local).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [bos]);
  const motivosPresentes = useMemo(() => {
    const s = new Set((bos || []).map(b => b.motivo).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [bos]);
  const colabsPresentes = useMemo(() => {
    const s = new Set((bos || []).map(b => b.colaborador).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [bos]);

  const filtrados = useMemo(() => {
    if (!bos) return [];
    const q = filtroBusca.trim().toLowerCase();
    const base = bos.filter(b => {
      if (filtroDataIni || filtroDataFim) {
        const iso = toISOKey(b._data);
        if (!iso) return false;
        if (filtroDataIni && iso < filtroDataIni) return false;
        if (filtroDataFim && iso > filtroDataFim) return false;
      }
      if (filtroLocal  && b.local  !== filtroLocal)  return false;
      if (filtroMotivo && b.motivo !== filtroMotivo) return false;
      if (filtroColab  && b.colaborador !== filtroColab) return false;
      if (q) {
        const hay = `${b.productCode || ''} ${b.productName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!sortKey) return base;
    return [...base].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va instanceof Date && vb instanceof Date) {
        const d = va.getTime() - vb.getTime();
        return sortDir === 'asc' ? d : -d;
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const cmp = String(va).toLowerCase().localeCompare(String(vb).toLowerCase(), 'pt-BR', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [bos, filtroDataIni, filtroDataFim, filtroLocal, filtroMotivo, filtroColab, filtroBusca, sortKey, sortDir]);

  function alternarSort(key) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(''); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filtroAtivo = filtroDataIni || filtroDataFim || filtroLocal || filtroMotivo || filtroColab || filtroBusca;
  function limpar() {
    setFiltroDataIni(''); setFiltroDataFim('');
    setFiltroLocal(''); setFiltroMotivo(''); setFiltroColab(''); setFiltroBusca('');
  }

  async function salvarEdicao(form) {
    if (!editando?.id) return;
    setSalvando(true);
    try {
      const update = {
        ...form,
        editadoEm:  new Date(),
        editadoPor: usuario?.nome || '',
      };
      await updateDoc(docRef('prejuizo_bos', editando.id), update);
      setBos(prev => prev.map(b => (b.id === editando.id ? { ...b, ...update } : b)));
      setEditando(null);
    } catch (e) {
      alert('Erro ao salvar edição: ' + (e?.message || e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluirLinha(linha) {
    if (!linha?.id) return;
    const ok = window.confirm(
      `Excluir este BO?\n\n${linha.productCode} — ${linha.productName || ''}\n\nEle sai de todos os relatórios.`
    );
    if (!ok) return;
    setSalvando(true);
    try {
      await updateDoc(docRef('prejuizo_bos', linha.id), {
        excluido:    true,
        excluidoEm:  new Date(),
        excluidoPor: usuario?.nome || '',
      });
      setBos(prev => prev.filter(b => b.id !== linha.id));
    } catch (e) {
      alert('Erro ao excluir: ' + (e?.message || e));
    } finally {
      setSalvando(false);
    }
  }

  // CSV BR-friendly: BOM, ';', datas DD/MM/AAAA (padrão do FEFO)
  function exportarCSV() {
    if (filtrados.length === 0) return;
    const cols = [
      { key: '_data',         label: 'Data' },
      { key: 'productCode',   label: 'Codigo' },
      { key: 'productName',   label: 'Descricao' },
      { key: 'quantidade',    label: 'Quantidade' },
      { key: 'unidade',       label: 'Unidade' },
      { key: 'local',         label: 'Local' },
      { key: 'motivo',        label: 'Motivo' },
      { key: 'colaborador',   label: 'Colaborador' },
      { key: 'registradoPor', label: 'Registrado por' },
    ];
    function fmtCelula(v) {
      if (v == null) return '';
      if (v instanceof Date) return fmtDataBR(v);
      if (typeof v === 'number') return String(v).replace('.', ',');
      const s = String(v);
      if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }
    const header = cols.map(c => c.label).join(';');
    const linhas = filtrados.map(b => cols.map(c => fmtCelula(b[c.key])).join(';'));
    const csv = '﻿' + [header, ...linhas].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const hoje = new Date();
    const stamp = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, '0')}${String(hoje.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `bos-perda-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || bos === null) {
    return (
      <div>
        <Skeleton height={60} radius={D.radius} style={{ marginBottom: 16 }} />
        <Skeleton height={320} radius={D.radius} />
      </div>
    );
  }

  if (bos.length === 0) {
    return (
      <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
        <EmptyState
          titulo="Nenhum BO registrado"
          descricao={<>Registre a primeira perda na aba <strong>Registrar perda</strong>.</>}
        />
      </div>
    );
  }

  return (
    <div style={{ animation: 'wjs-fadeUp 0.3s ease both' }}>
      <FilterBar>
        <FilterField label="Data de">
          <input type="date" value={filtroDataIni} onChange={e => setFiltroDataIni(e.target.value)} style={sInput} />
        </FilterField>
        <FilterField label="Data até">
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={sInput} />
        </FilterField>
        <FilterField label="Local">
          <select value={filtroLocal} onChange={e => setFiltroLocal(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {locaisPresentes.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </FilterField>
        <FilterField label="Motivo">
          <select value={filtroMotivo} onChange={e => setFiltroMotivo(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {motivosPresentes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </FilterField>
        <FilterField label="Colaborador">
          <select value={filtroColab} onChange={e => setFiltroColab(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {colabsPresentes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FilterField>
        <FilterField label="Busca">
          <input
            style={{ ...sInput, minWidth: 200 }}
            placeholder="Código ou descrição"
            value={filtroBusca}
            onChange={e => setFiltroBusca(e.target.value)}
          />
        </FilterField>
        {filtroAtivo && <BotaoClear onClick={limpar} />}
      </FilterBar>

      {filtroAtivo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {filtroDataIni && <Chip label={`De: ${filtroDataIni}`} onClear={() => setFiltroDataIni('')} />}
          {filtroDataFim && <Chip label={`Até: ${filtroDataFim}`} onClear={() => setFiltroDataFim('')} />}
          {filtroLocal && <Chip label={filtroLocal} onClear={() => setFiltroLocal('')} />}
          {filtroMotivo && <Chip label={filtroMotivo} onClear={() => setFiltroMotivo('')} />}
          {filtroColab && <Chip label={filtroColab} onClear={() => setFiltroColab('')} />}
          {filtroBusca && <Chip label={`"${filtroBusca}"`} onClear={() => setFiltroBusca('')} />}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: D.textMuted, fontFamily: D.font }}>
          Mostrando <strong>{filtrados.length}</strong> de {bos.length} BOs.
        </div>
        <button
          onClick={exportarCSV}
          disabled={filtrados.length === 0}
          style={{
            padding: '7px 14px',
            background: D.surface,
            border: `1px solid ${D.border}`,
            borderRadius: 8,
            cursor: filtrados.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 12,
            color: filtrados.length === 0 ? D.textMuted : D.text,
            fontFamily: D.font,
            fontWeight: 600,
            opacity: filtrados.length === 0 ? 0.5 : 1,
            transition: D.transition,
          }}
        >
          📥 Baixar CSV ({filtrados.length})
        </button>
      </div>

      {filtrados.length === 0 ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <Vazio />
        </div>
      ) : (
        <div style={{
          background: D.surface, border: `1px solid ${D.border}`,
          borderRadius: D.radius, overflow: 'hidden', boxShadow: D.shadow,
          overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
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
                        background: D.text, color: '#fff', padding: '8px 12px',
                        textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11,
                        cursor: 'pointer', userSelect: 'none',
                      }}
                    >
                      <span>{c.label}</span>
                      <span style={{ marginLeft: 6, fontSize: 10, opacity: ativo ? 1 : 0.35, color: ativo ? '#fff' : '#cbd5e1' }}>
                        {ativo ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </th>
                  );
                })}
                {isSup && (
                  <th style={{ background: D.text, color: '#fff', padding: '8px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11 }}>
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((b, i) => (
                <tr key={b.id} style={{ background: i % 2 ? D.bg : D.surface }}>
                  <td style={{ ...tdStyle, fontFamily: D.mono }}>{fmtDataBR(b._data)}</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{b.productCode || '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.productName}>{b.productName || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{b.quantidade ?? '—'}</td>
                  <td style={tdStyle}>{b.unidade === 'unidade' ? 'Unidade' : 'Caixa'}</td>
                  <td style={tdStyle}>{b.local || '—'}</td>
                  <td style={tdStyle}>{b.motivo || '—'}</td>
                  <td style={tdStyle}>{b.colaborador || '—'}</td>
                  <td style={tdStyle}>{b.registradoPor || '—'}</td>
                  {isSup && (
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditando(b)}
                          disabled={salvando}
                          title="Editar este BO"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: D.surface, border: `1px solid ${D.border}`, borderRadius: 6, cursor: 'pointer', color: D.textSec }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => excluirLinha(b)}
                          disabled={salvando}
                          title="Excluir este BO"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: D.redSoft, border: `1px solid ${D.redBorder}`, borderRadius: 6, cursor: 'pointer', color: D.red }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <ModalEditarBO
          linha={editando}
          baseProdutos={baseProdutos}
          areas={areas}
          motivos={motivos}
          colaboradores={colaboradores}
          salvando={salvando}
          onSalvar={salvarEdicao}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function BOPerdaPage() {
  const { col } = useDb();
  const { produtos: produtosCtx, carregandoCatalogos } = useCatalogos();
  const [aba, setAba] = useSessionFilter('boperda:aba', 'registrar');

  // Cadastros (colaboradores / áreas / motivos) — 1 fetch por mount
  const [colaboradores, setColaboradores] = useState([]);
  const [areas, setAreas]                 = useState([]);
  const [motivos, setMotivos]             = useState([]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [snapColabs, snapAreas, snapMotivos] = await Promise.all([
        getDocs(col('prejuizo_colaboradores')),
        getDocs(col('prejuizo_areas')),
        getDocs(col('prejuizo_motivos')),
      ]);
      if (!ativo) return;
      setColaboradores(snapColabs.docs.map(d => d.data().nome).filter(Boolean).sort());
      setAreas(snapAreas.docs.map(d => d.data().nome).filter(Boolean).sort());
      setMotivos(snapMotivos.docs.map(d => d.data().nome).filter(Boolean).sort());
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Catálogo normalizado (produtos SÓ via useCatalogos)
  const baseProdutos = useMemo(() => {
    return (produtosCtx || []).map(x => ({
      codigo: String(x.codigo || x.id || ''),
      descricao: x.descricao || x.nome || '',
    })).filter(p => p.codigo);
  }, [produtosCtx]);

  const tabStyle = (active) => ({
    padding: '9px 20px',
    background: active ? D.red : D.surface,
    color: active ? '#fff' : D.textSec,
    border: `1px solid ${active ? D.red : D.border}`,
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    fontFamily: D.font,
    transition: D.transition,
  });

  return (
    <PageContainer maxWidth={1100}>
      <PageHeader kicker="Gestão de Prejuízo" titulo="BO de Perda" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={tabStyle(aba === 'registrar')} onClick={() => setAba('registrar')}>
          Registrar perda
        </button>
        <button style={tabStyle(aba === 'historico')} onClick={() => setAba('historico')}>
          Histórico de BOs
        </button>
      </div>

      {aba === 'registrar' && (
        <RegistrarPerda
          baseProdutos={baseProdutos}
          carregandoCatalogos={carregandoCatalogos}
          areas={areas}
          motivos={motivos}
          colaboradores={colaboradores}
        />
      )}
      {aba === 'historico' && (
        <HistoricoBOs
          baseProdutos={baseProdutos}
          areas={areas}
          motivos={motivos}
          colaboradores={colaboradores}
        />
      )}
    </PageContainer>
  );
}
