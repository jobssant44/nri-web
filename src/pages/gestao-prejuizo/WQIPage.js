import { useState, useEffect, useMemo } from 'react';
import { getDocs, setDoc } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts';
import {
  D, brl, numFmt,
  sLabel, sInput, sSelectInline, tdStyle,
  PageContainer, PageHeader, KPICardPrimary, KPICardSecondary, ChartCard,
  FilterBar, FilterField, Chip, Tabela, TooltipBRL, Skeleton, EmptyState, Vazio,
  BotaoVoltar, BotaoNav, BotaoClear, MiniRanking,
} from '../../design';

// ─── Mapeamento de motivos ─────────────────────────────────────────────────────
const MOTIVOS_WQI = {
  '901': 'Quebra por Movimentação',
  '902': 'Blitz de Puxada',
  '903': 'Perda / Diferença',
  '904': 'Prejuízo Inventário',
  '905': 'Micro Furo',
  '906': 'Quebra de FEFO',
  '907': 'Erro de Programação',
  '908': 'Furto / Sinistro',
};

function resolverMotivo(val) {
  const chave = String(val ?? '').trim();
  return MOTIVOS_WQI[chave] ?? chave;
}

function gerarChave(l) {
  return `${l.nota || 'SN'}_${l.produto || 'SP'}_${String(l.emissao || '').replace(/\//g, '')}`;
}

// ─── Utilitários de parsing (lógica de negócio, não design) ────────────────────
function parseNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val ?? '').trim().replace(/\s/g, '');
  if (!str || str === '-') return 0;
  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  let s = str;
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = str.replace(',', '.');
  } else if (lastDot !== -1) {
    const after = str.substring(lastDot + 1);
    if (after.length === 3 && /^\d+$/.test(after) && /^\d/.test(str))
      s = str.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDataBR(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function toISO(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMesAno(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Sub-página: Registro de Quebras ──────────────────────────────────────────

function RegistroDeQuebras({ onVoltar, linhasBase, colaboradores, areas, motivos, classificacoes, onSalvar }) {
  const { docRef, stamp } = useDb();
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim,    setFiltroDataFim]    = useState('');
  const [salvando,         setSalvando]         = useState({});

  async function salvar(chave, campo, valor) {
    setSalvando(prev => ({ ...prev, [chave]: true }));
    const atual = classificacoes[chave] || {};
    const novo  = { ...atual, [campo]: valor };
    try {
      await setDoc(docRef('prejuizo_classificacoes', chave), { ...novo, ...stamp() });
      onSalvar(chave, novo);
    } finally {
      setSalvando(prev => ({ ...prev, [chave]: false }));
    }
  }

  const linhasFiltradas = useMemo(() => {
    if (!filtroDataInicio && !filtroDataFim) return [];
    return linhasBase.filter(l => {
      const iso = toISO(l.emissao);
      if (!iso) return false;
      if (filtroDataInicio && iso < filtroDataInicio) return false;
      if (filtroDataFim   && iso > filtroDataFim)   return false;
      return true;
    });
  }, [linhasBase, filtroDataInicio, filtroDataFim]);

  const classificadas = linhasFiltradas.filter(l => classificacoes[gerarChave(l)]?.colaborador);
  const filtroAtivo   = filtroDataInicio || filtroDataFim;

  return (
    <PageContainer>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <BotaoVoltar onClick={onVoltar} />
      </div>
      <PageHeader kicker="WQI" titulo="Registro de Quebras" />

      <FilterBar>
        <FilterField label="Data de">
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={sInput} />
        </FilterField>
        <FilterField label="Data até">
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={sInput} />
        </FilterField>
        {linhasFiltradas.length > 0 && (
          <div style={{ alignSelf: 'flex-end', fontSize: 12, color: D.textSec, fontFamily: D.font, paddingBottom: 8 }}>
            <span style={{ fontWeight: 600, color: D.text }}>{linhasFiltradas.length}</span> registro(s) ·{' '}
            <span style={{ fontWeight: 600, color: D.green }}>{classificadas.length}</span> classificado(s)
          </div>
        )}
        {filtroAtivo && (
          <BotaoClear onClick={() => { setFiltroDataInicio(''); setFiltroDataFim(''); }} />
        )}
      </FilterBar>

      {!filtroDataInicio && !filtroDataFim ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow, padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: D.blueSoft, border: `1px solid ${D.blueBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="22" height="22" fill="none" stroke={D.blue} strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 6, fontFamily: D.font }}>Selecione um período</div>
          <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.font }}>Use os filtros acima para carregar os registros do período desejado.</div>
        </div>
      ) : linhasFiltradas.length === 0 ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <Vazio />
        </div>
      ) : (
        <Tabela
          colunas={['Data', 'Cód. Produto', 'Descrição', 'R$ Perda', 'Colaborador', 'Área', 'Motivo']}
          linhas={linhasFiltradas}
          renderLinha={(l, i) => {
            const chave = gerarChave(l);
            const cls   = classificacoes[chave] || {};
            const load  = salvando[chave];
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                <td style={tdStyle}>{l.emissao || '—'}</td>
                <td style={tdStyle}>{l.produto  || '—'}</td>
                <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.descricao || '—'}</td>
                <td style={{ ...tdStyle, color: D.red, fontWeight: 700, fontFamily: D.mono }}>{brl(parseNum(l.valor))}</td>
                <td style={tdStyle}>
                  <select value={cls.colaborador || ''} disabled={load} onChange={e => salvar(chave, 'colaborador', e.target.value)} style={sSelectInline}>
                    <option value="">—</option>
                    {colaboradores.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <select value={cls.area || ''} disabled={load} onChange={e => salvar(chave, 'area', e.target.value)} style={sSelectInline}>
                    <option value="">—</option>
                    {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <select value={cls.motivo || ''} disabled={load} onChange={e => salvar(chave, 'motivo', e.target.value)} style={sSelectInline}>
                    <option value="">—</option>
                    {motivos.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
              </tr>
            );
          }}
        />
      )}
    </PageContainer>
  );
}

// ─── Sub-página: Quebra por Ajudante ──────────────────────────────────────────

function QuebraPorAjudante({ onVoltar, linhasBase, classificacoes, colaboradores, areas, motivos }) {
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim,    setFiltroDataFim]    = useState('');
  const [filtroColab,      setFiltroColab]      = useState('');
  const [filtroArea,       setFiltroArea]       = useState('');
  const [filtroMotivo,     setFiltroMotivo]     = useState('');

  const linhasEnriquecidas = useMemo(() =>
    linhasBase.map(l => ({ ...l, ...(classificacoes[gerarChave(l)] || {}) })),
    [linhasBase, classificacoes]
  );

  const linhasFiltradas = useMemo(() => {
    return linhasEnriquecidas.filter(l => {
      if (filtroDataInicio || filtroDataFim) {
        const iso = toISO(l.emissao);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
      }
      if (filtroColab  && l.colaborador !== filtroColab)  return false;
      if (filtroArea   && l.area        !== filtroArea)   return false;
      if (filtroMotivo && l.motivo      !== filtroMotivo) return false;
      return true;
    });
  }, [linhasEnriquecidas, filtroDataInicio, filtroDataFim, filtroColab, filtroArea, filtroMotivo]);

  const classificadas    = useMemo(() => linhasFiltradas.filter(l => l.colaborador), [linhasFiltradas]);
  const naoClassificadas = linhasFiltradas.length - classificadas.length;
  const totalValor       = useMemo(() => linhasFiltradas.reduce((s, l) => s + parseNum(l.valor), 0), [linhasFiltradas]);
  const totalClass       = useMemo(() => classificadas.reduce((s, l) => s + parseNum(l.valor), 0), [classificadas]);

  const topProdutos = useMemo(() => {
    const map = {};
    classificadas.forEach(l => {
      const k = l.descricao || l.produto || '—';
      map[k] = (map[k] || 0) + parseNum(l.valor);
    });
    return Object.entries(map).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 6);
  }, [classificadas]);

  const porArea = useMemo(() => {
    const map = {};
    classificadas.filter(l => l.area).forEach(l => { map[l.area] = (map[l.area] || 0) + parseNum(l.valor); });
    return Object.entries(map).map(([area, valor]) => ({ area, valor })).sort((a, b) => b.valor - a.valor);
  }, [classificadas]);

  const porMotivoClass = useMemo(() => {
    const map = {};
    classificadas.filter(l => l.motivo).forEach(l => { map[l.motivo] = (map[l.motivo] || 0) + parseNum(l.valor); });
    return Object.entries(map).map(([motivo, valor]) => ({ motivo, valor })).sort((a, b) => b.valor - a.valor);
  }, [classificadas]);

  const filtroAtivo = filtroDataInicio || filtroDataFim || filtroColab || filtroArea || filtroMotivo;

  function limparFiltros() {
    setFiltroDataInicio(''); setFiltroDataFim('');
    setFiltroColab(''); setFiltroArea(''); setFiltroMotivo('');
  }

  return (
    <PageContainer>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <BotaoVoltar onClick={onVoltar} />
      </div>
      <PageHeader kicker="WQI" titulo="Quebra por Ajudante" />

      <FilterBar>
        <FilterField label="Data de">
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={sInput} />
        </FilterField>
        <FilterField label="Data até">
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={sInput} />
        </FilterField>
        <FilterField label="Colaborador">
          <select value={filtroColab} onChange={e => setFiltroColab(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {colaboradores.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FilterField>
        <FilterField label="Área">
          <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={sInput}>
            <option value="">Todas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </FilterField>
        <FilterField label="Motivo">
          <select value={filtroMotivo} onChange={e => setFiltroMotivo(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {motivos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </FilterField>
        {filtroAtivo && <BotaoClear onClick={limparFiltros} />}
      </FilterBar>

      {/* 4 cards — bento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderLeft: `3px solid ${D.red}`, borderRadius: D.radius, padding: '20px', boxShadow: D.shadow, animation: 'wjs-fadeUp 0.35s ease both' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font, marginBottom: 10 }}>R$ Perda Total</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -1, lineHeight: 1, marginBottom: 14 }}>{brl(totalValor)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: D.font }}>
              <span style={{ color: D.textSec }}>Classificado</span>
              <span style={{ color: D.green, fontWeight: 700, fontFamily: D.mono }}>{brl(totalClass)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: D.font }}>
              <span style={{ color: D.textSec }}>Sem classif.</span>
              <span style={{ color: D.textMuted, fontWeight: 600, fontFamily: D.mono }}>{naoClassificadas}</span>
            </div>
          </div>
        </div>

        <MiniRanking titulo="Top Produtos" itens={topProdutos.map(p => ({ label: p.nome, valor: p.valor }))} cor={D.red}   />
        <MiniRanking titulo="Por Área"     itens={porArea.map(a => ({ label: a.area, valor: a.valor }))}      cor={D.blue}  />
        <MiniRanking titulo="Por Motivo"   itens={porMotivoClass.map(m => ({ label: m.motivo, valor: m.valor }))} cor={D.amber} />
      </div>

      {filtroColab && (
        <div style={{ animation: 'wjs-fadeUp 0.3s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: D.text, fontFamily: D.font }}>
              Quebras — {filtroColab}
            </span>
            <span style={{ fontSize: 12, color: D.textSec, fontFamily: D.font }}>
              {linhasFiltradas.length} registro(s) · {brl(totalValor)}
            </span>
          </div>
          <Tabela
            colunas={['Data', 'Cód. Produto', 'Descrição', 'R$ Perda', 'Área', 'Motivo']}
            linhas={linhasFiltradas}
            renderLinha={(l, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                <td style={tdStyle}>{l.emissao || '—'}</td>
                <td style={tdStyle}>{l.produto  || '—'}</td>
                <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.descricao || '—'}</td>
                <td style={{ ...tdStyle, color: D.red, fontWeight: 700, fontFamily: D.mono }}>{brl(parseNum(l.valor))}</td>
                <td style={tdStyle}>{l.area   || '—'}</td>
                <td style={tdStyle}>{l.motivo || '—'}</td>
              </tr>
            )}
          />
        </div>
      )}
    </PageContainer>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function WQIPage() {
  const { col, colRevenda } = useDb();
  const [linhasBase,       setLinhasBase]       = useState([]);
  const [hectoBase,        setHectoBase]        = useState([]);
  const [colaboradores,    setColaboradores]    = useState([]);
  const [areas,            setAreas]            = useState([]);
  const [motivos,          setMotivos]          = useState([]);
  const [classificacoes,   setClassificacoes]   = useState({});
  const [topN,             setTopN]             = useState(10);
  const [subPagina,        setSubPagina]        = useState('wqi');
  const [carregando,       setCarregando]       = useState(true);
  const [erro,             setErro]             = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim,    setFiltroDataFim]    = useState('');
  const [filtroMotivo,     setFiltroMotivo]     = useState('');

  useEffect(() => {
    async function carregar() {
      try {
        const [snap030237, snapHecto, snapColabs, snapAreas, snapMotivos, snapClass] = await Promise.all([
          getDocs(colRevenda('relatorio_030237')),
          getDocs(colRevenda('relatorio_030147hecto')),
          getDocs(col('prejuizo_colaboradores')),
          getDocs(col('prejuizo_areas')),
          getDocs(col('prejuizo_motivos')),
          getDocs(colRevenda('prejuizo_classificacoes')),
        ]);
        const todas = [];
        snap030237.docs.forEach(d => {
          (d.data().linhas || []).forEach(l => {
            const op = parseInt(l.operacao, 10);
            if (op < 101 || op > 108) return;
            if (String(l.status ?? '').trim().toUpperCase() === 'C') return;
            todas.push(l);
          });
        });
        setLinhasBase(todas);
        setHectoBase(snapHecto.docs.map(d => d.data()));
        setColaboradores(snapColabs.docs.map(d => d.data().nome).filter(Boolean).sort());
        setAreas(snapAreas.docs.map(d => d.data().nome).filter(Boolean).sort());
        setMotivos(snapMotivos.docs.map(d => d.data().nome).filter(Boolean).sort());
        const clsMap = {};
        snapClass.docs.forEach(d => { clsMap[d.id] = d.data(); });
        setClassificacoes(clsMap);
      } catch (e) {
        setErro('Erro ao carregar dados: ' + e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  function handleSalvarClassificacao(chave, dados) {
    setClassificacoes(prev => ({ ...prev, [chave]: dados }));
  }

  const motivosUnicos = useMemo(() => {
    const set = new Set(linhasBase.map(l => resolverMotivo(l.vendedor)).filter(Boolean));
    return [...set].sort();
  }, [linhasBase]);

  const filtradas = useMemo(() => {
    return linhasBase.filter(l => {
      if (filtroDataInicio || filtroDataFim) {
        const iso = toISO(l.emissao);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
      }
      if (filtroMotivo && resolverMotivo(l.vendedor) !== filtroMotivo) return false;
      return true;
    });
  }, [linhasBase, filtroDataInicio, filtroDataFim, filtroMotivo]);

  const totalHecto = useMemo(() => {
    return hectoBase
      .filter(h => {
        if (!filtroDataInicio && !filtroDataFim) return true;
        const iso = toISO(h.data);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
        return true;
      })
      .reduce((s, h) => s + parseNum(h.totalHecto), 0);
  }, [hectoBase, filtroDataInicio, filtroDataFim]);

  const totalValor = useMemo(
    () => filtradas.reduce((s, l) => s + parseNum(l.valor), 0),
    [filtradas]
  );

  const porMotivo = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const m = resolverMotivo(l.vendedor) || '(Em branco)';
      map[m] = (map[m] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([motivo, valor]) => ({ motivo, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor);
  }, [filtradas]);

  const topEmbalagem = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const e = l.descricao || l.produto || '(Em branco)';
      map[e] = (map[e] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([embalagem, valor]) => ({ embalagem, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, topN);
  }, [filtradas, topN]);

  const porDia = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const d = l.emissao ? String(l.emissao).trim() : null;
      if (!d) return;
      map[d] = (map[d] || 0) + parseNum(l.valor);
    });
    const hectoMap = {};
    hectoBase.forEach(h => {
      const iso = toISO(h.data);
      if (iso) hectoMap[iso] = (hectoMap[iso] || 0) + parseNum(h.totalHecto);
    });
    return Object.entries(map)
      .sort(([a], [b]) => (parseDataBR(a) || 0) - (parseDataBR(b) || 0))
      .map(([dia, valor]) => {
        const dataAtual = parseDataBR(dia);
        let meta = null;
        if (dataAtual) {
          const buscarHecto = n => {
            const d = new Date(dataAtual); d.setDate(d.getDate() - n);
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return hectoMap[iso] || 0;
          };
          const hecto = buscarHecto(1) || buscarHecto(2);
          if (hecto > 0) meta = Math.round(hecto * 0.50 * 100) / 100;
        }
        return { dia, valor: Math.round(valor * 100) / 100, meta };
      });
  }, [filtradas, hectoBase]);

  const porMes = useMemo(() => {
    const map = {};
    filtradas.forEach(l => {
      const m = toMesAno(l.emissao);
      if (m) map[m] = (map[m] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .sort(([a], [b]) => {
        const [ma, ya] = a.split('/').map(Number);
        const [mb, yb] = b.split('/').map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      })
      .map(([mes, valor]) => ({ mes, valor: Math.round(valor * 100) / 100 }));
  }, [filtradas]);

  // ── Sub-páginas ──────────────────────────────────────────────────────────────
  if (subPagina === 'registro') {
    return <RegistroDeQuebras onVoltar={() => setSubPagina('wqi')} linhasBase={linhasBase} colaboradores={colaboradores} areas={areas} motivos={motivos} classificacoes={classificacoes} onSalvar={handleSalvarClassificacao} />;
  }
  if (subPagina === 'ajudante') {
    return <QuebraPorAjudante onVoltar={() => setSubPagina('wqi')} linhasBase={linhasBase} classificacoes={classificacoes} colaboradores={colaboradores} areas={areas} motivos={motivos} />;
  }

  // ── Skeleton loading ─────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <PageContainer maxWidth={1100}>
        <div style={{ marginBottom: 32 }}>
          <Skeleton width={120} height={11} radius={4} style={{ marginBottom: 10 }} />
          <Skeleton width={280} height={28} radius={6} style={{ marginBottom: 8 }} />
          <Skeleton width={200} height={13} radius={4} />
        </div>
        <Skeleton height={60} radius={D.radius} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Skeleton height={120} radius={D.radius} />
          <Skeleton height={120} radius={D.radius} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <Skeleton height={88} radius={D.radius} />
          <Skeleton height={88} radius={D.radius} />
          <Skeleton height={88} radius={D.radius} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Skeleton height={280} radius={D.radius} />
          <Skeleton height={280} radius={D.radius} />
        </div>
        <Skeleton height={260} radius={D.radius} style={{ marginBottom: 16 }} />
        <Skeleton height={280} radius={D.radius} />
      </PageContainer>
    );
  }

  const filtroAtivo = filtroDataInicio || filtroDataFim || filtroMotivo;
  const temDados    = linhasBase.length > 0;
  const metaRS      = totalHecto * 0.50;
  const saldo       = metaRS - totalValor;
  const dentroMeta  = saldo >= 0;

  return (
    <PageContainer maxWidth={1100}>

      <PageHeader
        kicker="Gestão de Prejuízo"
        titulo="Warehouse Quality Index"
        sub={linhasBase.length > 0
          ? `${linhasBase.length.toLocaleString('pt-BR')} registros${filtroAtivo ? ` · ${filtradas.length.toLocaleString('pt-BR')} após filtros` : ''}`
          : undefined}
        acoes={
          <>
            <BotaoNav onClick={() => setSubPagina('registro')}>Registro de Quebras</BotaoNav>
            <BotaoNav onClick={() => setSubPagina('ajudante')}>Quebra por Ajudante</BotaoNav>
          </>
        }
      />

      {erro && (
        <div style={{ padding: '12px 16px', background: D.redSoft, color: D.red, borderRadius: 10, border: `1px solid ${D.redBorder}`, marginBottom: 20, fontSize: 13, fontWeight: 500 }}>
          {erro}
        </div>
      )}

      <FilterBar>
        <FilterField label="Data de">
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={sInput} />
        </FilterField>
        <FilterField label="Data até">
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={sInput} />
        </FilterField>
        <FilterField label="Motivo">
          <select value={filtroMotivo} onChange={e => setFiltroMotivo(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {motivosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </FilterField>
        {filtroAtivo && (
          <BotaoClear onClick={() => { setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroMotivo(''); }} />
        )}
      </FilterBar>

      {/* ── KPIs — bento assimétrico ────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <KPICardPrimary label="R$ Perda Total" valor={brl(totalValor)} cor={D.red} />
          <KPICardPrimary
            label={dentroMeta ? 'Economia' : 'Estouro'}
            valor={brl(Math.abs(saldo))}
            cor={dentroMeta ? D.green : D.red}
            sub="Meta − R$ Perda"
            destaque
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <KPICardSecondary label="Hecto Entregue" valor={numFmt(totalHecto)} cor={D.blue} />
          <KPICardSecondary label="Meta R$" valor={brl(metaRS)} cor={D.amber} sub="R$ 0,50 × Hecto" />
          <KPICardSecondary label="Perda R$/HL" valor={totalHecto > 0 ? brl(totalValor / totalHecto) : '—'} cor={D.green} sub="R$ Perda ÷ Hecto" />
        </div>
      </div>

      {!temDados && (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState
            titulo="Nenhum dado de WQI importado"
            descricao={<>Importe o relatório <strong>03.02.37</strong> na página <strong>Importar relatórios</strong> para visualizar os dados.</>}
          />
        </div>
      )}

      {temDados && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Chips de filtro ativo ─────────────────────────────────────── */}
          {filtroAtivo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 16px', background: D.surface, border: `1px solid ${D.redBorder}`, borderRadius: D.radius, boxShadow: D.shadow, animation: 'wjs-fadeUp 0.25s ease both' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted }}>Filtros ativos</span>
              <div style={{ width: 1, height: 14, background: D.border }} />
              {filtroDataInicio && <Chip label={`De: ${filtroDataInicio}`} onClear={() => setFiltroDataInicio('')} />}
              {filtroDataFim    && <Chip label={`Até: ${filtroDataFim}`}   onClear={() => setFiltroDataFim('')} />}
              {filtroMotivo     && <Chip label={filtroMotivo}              onClear={() => setFiltroMotivo('')} />}
            </div>
          )}

          {/* ── Motivo + Embalagem lado a lado ───────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <ChartCard titulo="R$ Perda por Motivo">
              {porMotivo.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, porMotivo.length * 38), 380)}>
                  <BarChart data={porMotivo} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="motivo" width={140} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 20 ? v.slice(0, 20) + '…' : v} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.blueSoft }} />
                    <Bar dataKey="valor" name="R$ Perda" fill={D.blue} radius={[0, 5, 5, 0]}
                      label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              titulo={`Top ${topN} R$ Perda por Embalagem`}
              badge={
                <select value={topN} onChange={e => setTopN(Number(e.target.value))} style={{ ...sInput, fontSize: 11, padding: '4px 8px', minWidth: 'auto' }}>
                  {[1, 3, 5, 10, 15, 20].map(n => <option key={n} value={n}>Top {n}</option>)}
                </select>
              }
            >
              {topEmbalagem.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, topEmbalagem.length * 34), 360)}>
                  <BarChart data={topEmbalagem} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="embalagem" width={130} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.redSoft }} />
                    <Bar dataKey="valor" name="R$ Perda" radius={[0, 5, 5, 0]}
                      label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }}>
                      {topEmbalagem.map((_, i) => <Cell key={i} fill={D.red} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>

          {/* ── R$ Perda por Mês ─────────────────────────────────────────── */}
          <ChartCard titulo="R$ Perda — Mês a Mês">
            {porMes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={porMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} />
                  <Line type="linear" dataKey="valor" name="R$ Perda" stroke={D.red} strokeWidth={2} dot={{ r: 4, fill: D.red }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ── R$ Perda por Dia (com meta) ───────────────────────────────── */}
          <ChartCard titulo="R$ Perda — Dia a Dia">
            {porDia.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={porDia} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: D.font, paddingTop: 8 }} />
                  <Line type="linear" dataKey="valor" name="R$ Perda" stroke={D.blue} strokeWidth={2} dot={{ r: 3, fill: D.blue }} activeDot={{ r: 6 }} />
                  <Line type="linear" dataKey="meta" name="Meta (R$0,50 × HL anterior)" stroke={D.red} strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 5 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

        </div>
      )}
    </PageContainer>
  );
}
