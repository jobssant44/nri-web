import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { calcularABC } from './ImportarRelatorio';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';

// ─── Constantes ──────────────────────────────────────────────────────────────

const MESES_NOME  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const COR_A = '#22c55e';
const COR_B = '#f59e0b';
const COR_C = '#ef4444';
const POR_PAGINA = 50;

// Mapeamento (metrica, tipo) → campo no produto
const CAMPO = {
  cx:  { armazem: 'cxTotal', picking: 'cxAberto', estoque: 'cxFechado' },
  plt: { armazem: 'cxTotal', picking: 'cxAberto', estoque: 'cxFechado' },
};

const LABEL_METRICA = { cx: 'Caixas', plt: 'Paletes' };
const UNIT_METRICA  = { cx: 'cx',     plt: 'plt'     };
const LABEL_TIPO    = { armazem: 'Armazém', picking: 'Picking', estoque: 'Estoque' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthKey(ano, mes) { return `${ano}-${String(mes).padStart(2,'0')}`; }

function prevMonth(ano, mes, offset) {
  let m = mes - offset, a = ano;
  while (m <= 0) { m += 12; a--; }
  return { ano: a, mes: m };
}

// Retrocompatibilidade: dados antigos podem ter qtdTotal em vez de cxTotal
function getCampo(produto, campo) {
  if (produto[campo] !== undefined) return produto[campo];
  if (campo === 'cxTotal')   return produto.qtdTotal ?? 0;
  if (campo === 'cxAberto')  return produto.qtdTotal ?? produto.cxTotal ?? 0; // fallback: tudo é picking
  if (campo === 'hlAberto')  return produto.hlTotal  ?? 0;
  if (campo === 'hlFechado') return 0;
  return 0;
}

/**
 * Retorna o valor final a ser usado no Pareto.
 * - cx: quantidade de caixas diretamente
 * - plt: caixas ÷ fatorPalete do produto (relatório 01.11)
 *        Se o produto não tiver fator cadastrado, retorna 0 (excluído do ranking).
 */
function getValorFinal(produto, campo, metrica, fatores) {
  const cx = getCampo(produto, campo);
  if (metrica !== 'plt') return cx;
  const fator = fatores[produto.codigo];
  if (!fator || fator <= 0) return 0;
  return cx / fator;
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function DashboardCurvaABC() {
  const [indices, setIndices]       = useState([]);
  const [anos, setAnos]             = useState([]);
  const [mesesDoAno, setMesesDoAno] = useState([]);
  const [anoSel, setAnoSel]         = useState('');
  const [mesSel, setMesSel]         = useState('');
  const [dadosM0, setDadosM0]       = useState(null);
  const [dadosM1, setDadosM1]       = useState(null);
  const [dadosM2, setDadosM2]       = useState(null);
  const [carregando, setCarregando] = useState(false);
  // Mapa codigo → fatorPalete carregado do relatório 01.11
  const [fatores, setFatores]       = useState({});

  // Filtros de visão
  const [metrica, setMetrica] = useState('cx');       // cx | plt
  const [tipo, setTipo]       = useState('armazem');  // armazem | picking | estoque

  // Filtros de tabela
  const [filtroCurva, setFiltroCurva] = useState('');
  const [busca, setBusca]             = useState('');
  const [pagina, setPagina]           = useState(1);

  // ── Carregamento ──
  useEffect(() => { carregarIndices(); carregarFatores(); }, []);

  useEffect(() => {
    if (!anoSel || !indices.length) return;
    const lista = indices.filter(k => k.startsWith(anoSel + '-'))
      .map(k => parseInt(k.split('-')[1])).sort((a, b) => a - b);
    setMesesDoAno(lista);
    setMesSel(lista.length > 0 ? String(lista[0]) : '');
  }, [anoSel, indices]);

  useEffect(() => {
    if (anoSel && mesSel) carregarDados(parseInt(anoSel), parseInt(mesSel));
  }, [anoSel, mesSel]);

  // ── Exportar CSV da tabela atual ──────────────────────────────────────────
  function exportarCSV() {
    const nomeArq = `curva_abc_${metrica}_${tipo}_${anoSel}-${String(mesSel).padStart(2,'0')}.csv`;
    const unitLabel = metrica === 'plt' ? 'Plt/Dia' : 'Cx/Dia';
    const header  = ['Posição','Código','Nome',`${LABEL_METRICA[metrica]} ${LABEL_TIPO[tipo]}`,
                     'Curva Atual',`% Acumulado`,unitLabel,`Curva ${lblM2}`,`Curva ${lblM1}`];
    const linhas  = produtosFiltrados.map(p => [
      p._rank,
      p.codigo,
      `"${p.nome}"`,
      p._val?.toFixed ? p._val.toFixed(3) : p._val,
      p._curva,
      p._percAcumulado?.toFixed(2),
      p.diasComVendas > 0 ? (p._val / p.diasComVendas).toFixed(2) : '0',
      mapaM2[p.codigo] ?? '',
      mapaM1[p.codigo] ?? '',
    ]);
    const csv  = [header, ...linhas].map(r => r.join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = nomeArq; a.click();
    URL.revokeObjectURL(url);
  }

  async function carregarIndices() {
    const snap = await getDoc(doc(db, 'curva_abc_meta', 'indices'));
    if (!snap.exists()) return;
    const lista = (snap.data().meses || []).sort();
    setIndices(lista);
    const anosUnicos = [...new Set(lista.map(k => k.split('-')[0]))].sort((a,b)=>b-a);
    setAnos(anosUnicos);
    if (anosUnicos.length) setAnoSel(anosUnicos[0]);
  }

  async function carregarFatores() {
    try {
      const snap = await getDocs(collection(db, 'produtos_fatores'));
      const mapa = {};
      snap.forEach(d => { mapa[d.data().codigo] = d.data().fatorPalete; });
      setFatores(mapa);
    } catch (_) {
      // coleção ainda não existe — plt ficará desabilitado
    }
  }

  async function carregarDados(ano, mes) {
    setCarregando(true); setPagina(1);
    const m1 = prevMonth(ano, mes, 1);
    const m2 = prevMonth(ano, mes, 2);
    const [s0, s1, s2] = await Promise.all([
      getDoc(doc(db, 'curva_abc_mensal', monthKey(ano, mes))),
      getDoc(doc(db, 'curva_abc_mensal', monthKey(m1.ano, m1.mes))),
      getDoc(doc(db, 'curva_abc_mensal', monthKey(m2.ano, m2.mes))),
    ]);
    setDadosM0(s0.exists() ? s0.data() : null);
    setDadosM1(s1.exists() ? s1.data() : null);
    setDadosM2(s2.exists() ? s2.data() : null);
    setCarregando(false);
  }

  // ── Dados calculados dinamicamente ────────────────────────────────────────
  const campo = CAMPO[metrica]?.[tipo] ?? 'cxTotal';

  // Plt disponível quando o relatório 01.11 foi importado (há fatores de palete)
  const temFatores = Object.keys(fatores).length > 0;
  // Verifica se o dataset tem a coluna E (split picking/estoque)
  const temSplit   = dadosM0?.produtos?.[0]?.cxFechado !== undefined;
  const temPlt     = temFatores;
  const metricaDisponivel = metrica === 'cx' || (metrica === 'plt' && temPlt);

  const produtosM0 = useMemo(() => {
    if (!dadosM0?.produtos) return [];
    const raw = dadosM0.produtos.map(p => ({
      ...p,
      [campo]: getValorFinal(p, campo, metrica, fatores),
    }));
    return calcularABC(raw, campo);
  }, [dadosM0, campo, metrica, fatores]);

  const produtosM1 = useMemo(() => {
    if (!dadosM1?.produtos) return [];
    return calcularABC(
      dadosM1.produtos.map(p => ({ ...p, [campo]: getValorFinal(p, campo, metrica, fatores) })),
      campo,
    );
  }, [dadosM1, campo, metrica, fatores]);

  const produtosM2 = useMemo(() => {
    if (!dadosM2?.produtos) return [];
    return calcularABC(
      dadosM2.produtos.map(p => ({ ...p, [campo]: getValorFinal(p, campo, metrica, fatores) })),
      campo,
    );
  }, [dadosM2, campo, metrica, fatores]);

  const mapaM1 = useMemo(() => Object.fromEntries(produtosM1.map(p => [p.codigo, p._curva])), [produtosM1]);
  const mapaM2 = useMemo(() => Object.fromEntries(produtosM2.map(p => [p.codigo, p._curva])), [produtosM2]);

  const countA = produtosM0.filter(p => p._curva === 'A').length;
  const countB = produtosM0.filter(p => p._curva === 'B').length;
  const countC = produtosM0.filter(p => p._curva === 'C').length;
  const totalQtd = produtosM0.reduce((s, p) => s + (p._val ?? 0), 0);

  const paretoData = produtosM0.slice(0, 40).map(p => ({
    rank: p._rank,
    qtd: Math.round(p._val * 10) / 10,
    percAcumulado: p._percAcumulado,
    curva: p._curva,
  }));

  const produtosFiltrados = useMemo(() => produtosM0.filter(p => {
    if (filtroCurva && p._curva !== filtroCurva) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!p.nome.toLowerCase().includes(q) && !String(p.codigo).includes(q)) return false;
    }
    return true;
  }), [produtosM0, filtroCurva, busca]);

  const totalPaginas = Math.ceil(produtosFiltrados.length / POR_PAGINA);
  const produtosPagina = produtosFiltrados.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  const ano = parseInt(anoSel) || 0;
  const mes = parseInt(mesSel) || 0;
  const m1i = mes ? prevMonth(ano, mes, 1) : null;
  const m2i = mes ? prevMonth(ano, mes, 2) : null;
  const lblAtual = mes ? `${MESES_CURTO[mes-1]}/${String(ano).slice(2)}` : 'Atual';
  const lblM1    = m1i ? `${MESES_CURTO[m1i.mes-1]}/${String(m1i.ano).slice(2)}` : 'M-1';
  const lblM2    = m2i ? `${MESES_CURTO[m2i.mes-1]}/${String(m2i.ano).slice(2)}` : 'M-2';
  const unit     = UNIT_METRICA[metrica];

  // ── Tela vazia ──
  if (!anos.length && !carregando) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📊</div>
      <p style={{ color: '#555', fontSize: 16, fontWeight: '500' }}>Nenhum dado disponível</p>
      <p style={{ color: '#aaa', fontSize: 13 }}>Importe o relatório 03.02.36.08 para visualizar a Curva ABC.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 1400 }}>

      {/* ── Cabeçalho ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: '#333' }}>📊 Dashboard Curva ABC</h2>
          {dadosM0 && (
            <p style={{ margin: '4px 0 0', color: '#999', fontSize: 13 }}>
              {MESES_NOME[mes-1]} {ano} · {produtosM0.length} SKUs ·{' '}
              {Math.round(totalQtd).toLocaleString('pt-BR')} {unit} ({LABEL_TIPO[tipo]})
            </p>
          )}
        </div>
        {/* Filtros Ano/Mês */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={lblStyle}>Ano:</label>
          <select value={anoSel} onChange={e => setAnoSel(e.target.value)} style={sel}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label style={lblStyle}>Mês:</label>
          <select value={mesSel} onChange={e => setMesSel(e.target.value)} style={sel}>
            {mesesDoAno.map(m => <option key={m} value={m}>{MESES_NOME[m-1]}</option>)}
          </select>
          <button onClick={() => carregarDados(ano, mes)} style={btnSec}>🔄</button>
        </div>
      </div>

      {/* ── Filtros Métrica + Tipo ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Parâmetro */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#555', fontWeight: '600' }}>Parâmetro:</span>
          <div style={{ display: 'flex', backgroundColor: '#f5f5f5', borderRadius: 8, padding: 3, gap: 2 }}>
            {[['cx','📦 Caixas'],['plt','📦📦 Paletes']].map(([val, label]) => {
              const desab = val === 'plt' && !temPlt;
              return (
                <button key={val} onClick={() => { if (!desab) { setMetrica(val); setPagina(1); } }}
                  disabled={desab}
                  title={desab ? 'Importe o relatório 01.11 para ativar' : ''}
                  style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: desab ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: '600', transition: 'all .15s',
                    backgroundColor: metrica === val ? '#1D5A9E' : 'transparent',
                    color: metrica === val ? '#fff' : desab ? '#ccc' : '#555',
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tipo de visão */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#555', fontWeight: '600' }}>Visão:</span>
          <div style={{ display: 'flex', backgroundColor: '#f5f5f5', borderRadius: 8, padding: 3, gap: 2 }}>
            {[['armazem','🏭 Armazém'],['picking','📦 Picking'],['estoque','📦📦 Estoque']].map(([val, label]) => (
              <button key={val} onClick={() => { setTipo(val); setPagina(1); }}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: '600', transition: 'all .15s',
                  backgroundColor: tipo === val ? '#E31837' : 'transparent',
                  color: tipo === val ? '#fff' : '#555',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Legenda da visão */}
        <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>
          {tipo === 'armazem' && 'Total geral vendido (col. D)'}
          {tipo === 'picking'  && 'Venda fracionada — D menos palete fechado (col. D − E)'}
          {tipo === 'estoque'  && 'Somente palete fechado (col. E)'}
        </div>
      </div>

      {!metricaDisponivel && (
        <div style={{ backgroundColor: '#FFF3CD', border: '1px solid #FFECB5', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13, color: '#856404' }}>
          ⚠️ O parâmetro <strong>Paletes</strong> requer o relatório <strong>01.11</strong> importado (fatores de palete por produto).
          Acesse <em>Importar relatórios → 01.11</em> para habilitar esta métrica.
        </div>
      )}

      {carregando && <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>Carregando...</div>}

      {!carregando && !dadosM0 && anoSel && mesSel && (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#aaa' }}>Sem dados para {MESES_NOME[mes-1]} {ano}.</p>
        </div>
      )}

      {!carregando && dadosM0 && produtosM0.length > 0 && (
        <>
          {/* ── KPI Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
            <KPICard label={`Total — ${LABEL_TIPO[tipo]}`} valor={Math.round(totalQtd)} unit={unit}
              sub={`${produtosM0.length} SKUs ativos`} cor="#333" />
            <KPICard label="Curva A — Alto Giro" valor={countA} unit="SKUs"
              sub={`${((countA/produtosM0.length)*100).toFixed(1)}% dos SKUs`} cor={COR_A} />
            <KPICard label="Curva B — Médio Giro" valor={countB} unit="SKUs"
              sub={`${((countB/produtosM0.length)*100).toFixed(1)}% dos SKUs`} cor={COR_B} />
            <KPICard label="Curva C — Baixo Giro" valor={countC} unit="SKUs"
              sub={`${((countC/produtosM0.length)*100).toFixed(1)}% dos SKUs`} cor={COR_C} />
          </div>

          {/* ── Pareto + Pizza ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={card}>
              <h3 style={tituloCard}>
                Pareto — Top 40 · {LABEL_METRICA[metrica]} · {LABEL_TIPO[tipo]} · {lblAtual}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={paretoData} margin={{ top: 5, right: 52, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="rank" tick={{ fontSize: 11 }}
                    label={{ value: 'Ranking', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#888' }} />
                  <YAxis yAxisId="left" tickFormatter={v => v.toLocaleString('pt-BR')} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0,100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <Tooltip content={<TooltipPareto unit={unit} />} />
                  <ReferenceLine yAxisId="right" y={80} stroke={COR_A} strokeDasharray="4 3"
                    label={{ value:'80%', position:'right', fill:COR_A, fontSize:11 }} />
                  <ReferenceLine yAxisId="right" y={95} stroke={COR_B} strokeDasharray="4 3"
                    label={{ value:'95%', position:'right', fill:COR_B, fontSize:11 }} />
                  <Bar yAxisId="left" dataKey="qtd" name={`Qtd. (${unit})`} radius={[3,3,0,0]}>
                    {paretoData.map((e,i) => (
                      <Cell key={i} fill={e.curva==='A'?COR_A:e.curva==='B'?COR_B:COR_C} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="percAcumulado" name="% Acum."
                    stroke="#1D5A9E" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={card}>
              <h3 style={tituloCard}>Distribuição</h3>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={[{name:'A',value:countA},{name:'B',value:countB},{name:'C',value:countC}]}
                    dataKey="value" cx="50%" cy="50%" outerRadius={65}
                    label={({name,percent}) => `${name}: ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {[COR_A,COR_B,COR_C].map((c,i) => <Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip formatter={v=>[`${v} SKUs`,'']} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                {[['A',COR_A,'Alto Giro',countA],['B',COR_B,'Médio Giro',countB],['C',COR_C,'Baixo Giro',countC]].map(([c,cor,lbl,n]) => (
                  <div key={c} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #f0f0f0', fontSize:13 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:10, height:10, borderRadius:2, backgroundColor:cor }} />
                      <span style={{ fontWeight:'600', color:cor }}>Curva {c}</span>
                      <span style={{ color:'#aaa', fontSize:11 }}>{lbl}</span>
                    </div>
                    <span style={{ color:'#555', fontWeight:'500' }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Tabela ── */}
          <div style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
              <h3 style={{ ...tituloCard, marginBottom:0 }}>
                Curva ABC — {LABEL_METRICA[metrica]} · {LABEL_TIPO[tipo]}
              </h3>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input type="text" placeholder="Buscar código ou nome..."
                  value={busca} onChange={e => { setBusca(e.target.value); setPagina(1); }}
                  style={{ ...sel, minWidth:200 }} />
                <select value={filtroCurva}
                  onChange={e => { setFiltroCurva(e.target.value); setPagina(1); }} style={sel}>
                  <option value="">Todas as curvas</option>
                  <option value="A">Curva A</option>
                  <option value="B">Curva B</option>
                  <option value="C">Curva C</option>
                </select>
                <button onClick={exportarCSV}
                  title={`Exportar tabela atual como CSV (${produtosFiltrados.length} produtos)`}
                  style={{ padding:'8px 14px', backgroundColor:'#1D5A9E', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'600', fontSize:13, whiteSpace:'nowrap' }}>
                  ⬇️ Exportar CSV
                </button>
              </div>
            </div>

            <p style={{ fontSize:12, color:'#aaa', marginBottom:12 }}>
              {produtosFiltrados.length} produto(s) · {POR_PAGINA} por página
            </p>

            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ backgroundColor:'#1a1a2e' }}>
                    {[
                      ['Pos.','left',44], ['Cód_Descrição','left',null],
                      [`${LABEL_METRICA[metrica]} (Mês)`,'right',null],
                      [`${unit}/Dia`,'right',80],
                      ['Pareto','right',80],
                      [lblM2,'center',80], [lblM1,'center',80], ['Atual','center',80],
                    ].map(([label, align, width]) => (
                      <th key={label} style={{
                        padding:'11px 12px', textAlign:align, color:'#fff',
                        fontWeight:'600', fontSize:13, whiteSpace:'nowrap',
                        ...(width ? {width} : {}),
                      }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {produtosPagina.map((p, i) => {
                    const curvaM1 = mapaM1[p.codigo] ?? null;
                    const curvaM2 = mapaM2[p.codigo] ?? null;
                    const qtdDia  = p.diasComVendas > 0 ? p._val / p.diasComVendas : p._val;
                    return (
                      <tr key={p.codigo} style={{ borderBottom:'1px solid #f0f0f0', backgroundColor: i%2===0?'#fff':'#fafafa' }}>
                        <td style={{ ...td, color:'#aaa', fontSize:12 }}>{p._rank}</td>
                        <td style={td}>
                          <span style={{ color:'#999', fontFamily:'monospace', fontSize:11, marginRight:8 }}>{p.codigo}</span>
                          {p.nome}
                        </td>
                        <td style={{ ...td, textAlign:'right', fontWeight:'600' }}>
                          {p._val?.toLocaleString('pt-BR', {maximumFractionDigits:1})}
                        </td>
                        <td style={{ ...td, textAlign:'right', color:'#777' }}>
                          {qtdDia?.toFixed(1)}
                        </td>
                        <td style={{ ...td, textAlign:'right', color:'#777' }}>
                          {p._percAcumulado?.toFixed(1)}%
                        </td>
                        <td style={{ ...td, textAlign:'center' }}><CurvaTag curva={curvaM2} /></td>
                        <td style={{ ...td, textAlign:'center' }}><CurvaTag curva={curvaM1} /></td>
                        <td style={{ ...td, textAlign:'center' }}><CurvaTag curva={p._curva} grande /></td>
                      </tr>
                    );
                  })}
                  {produtosPagina.length === 0 && (
                    <tr><td colSpan={8} style={{ padding:28, textAlign:'center', color:'#aaa' }}>Nenhum produto encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginTop:16 }}>
                <button onClick={() => setPagina(p => Math.max(1,p-1))} disabled={pagina===1} style={btnPag}>◀ Anterior</button>
                <span style={{ fontSize:13, color:'#666' }}>Página {pagina} de {totalPaginas}</span>
                <button onClick={() => setPagina(p => Math.min(totalPaginas,p+1))} disabled={pagina===totalPaginas} style={btnPag}>Próxima ▶</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function KPICard({ label, valor, unit, sub, cor }) {
  return (
    <div style={{ backgroundColor:'#fff', borderRadius:12, padding:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', borderTop:`4px solid ${cor}` }}>
      <div style={{ fontSize:12, color:'#888', marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:'bold', color:cor }}>
        {typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}
        <span style={{ fontSize:13, fontWeight:'400', marginLeft:4, color:cor }}>{unit}</span>
      </div>
      <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>{sub}</div>
    </div>
  );
}

function CurvaTag({ curva, grande }) {
  if (!curva) return <span style={{ color:'#ccc', fontSize:12 }}>—</span>;
  const bg = curva==='A'?COR_A:curva==='B'?COR_B:COR_C;
  return (
    <span style={{ backgroundColor:bg, color:'#fff', padding: grande?'4px 14px':'2px 10px', borderRadius:12, fontWeight:'bold', fontSize: grande?13:12 }}>
      {curva}
    </span>
  );
}

function TooltipPareto({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ backgroundColor:'#fff', border:'1px solid #ddd', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <p style={{ margin:'0 0 4px', fontWeight:'bold', color:'#333' }}>Rank #{d?.rank} — Curva {d?.curva}</p>
      {payload.map((entry,i) => (
        <p key={i} style={{ margin:'2px 0', color: entry.color ?? entry.stroke }}>
          {entry.name}: {entry.dataKey==='percAcumulado'
            ? `${entry.value}%`
            : `${entry.value?.toLocaleString('pt-BR')} ${unit}`}
        </p>
      ))}
    </div>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const card    = { backgroundColor:'#fff', borderRadius:12, padding:24, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' };
const tituloCard = { margin:'0 0 16px', fontSize:15, fontWeight:'600', color:'#333' };
const td      = { padding:'9px 12px', color:'#333' };
const btnPag  = { padding:'6px 14px', border:'1px solid #ddd', borderRadius:6, cursor:'pointer', backgroundColor:'#fff', fontSize:13 };
const btnSec  = { padding:'8px 12px', border:'1px solid #ddd', borderRadius:8, cursor:'pointer', backgroundColor:'#fff', fontSize:13, color:'#555' };
const sel     = { padding:'8px 12px', borderRadius:8, border:'1px solid #ddd', fontSize:13 };
const lblStyle = { fontSize:13, color:'#555' };
