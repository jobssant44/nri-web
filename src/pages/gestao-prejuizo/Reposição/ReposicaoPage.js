import { useState, useEffect, useMemo } from 'react';
import { getDocs } from 'firebase/firestore';
import { useDb } from '../../../utils/db';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import {
  D, brl,
  sInput,
  PageContainer, PageHeader, KPICardPrimary, KPICardSecondary, ChartCard,
  FilterBar, FilterField, Chip, TooltipBRL, Skeleton, EmptyState, Vazio,
  BotaoClear,
} from '../../../design';

// ─── Utilitários ──────────────────────────────────────────────────────────────
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

function mesAnoParaISO(mesAno) {
  if (!mesAno) return '';
  const [mm, yyyy] = mesAno.split('/');
  return `${yyyy}-${mm}`;
}

function isoParaBR(iso) {
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

// ─── Acessores de campos ──────────────────────────────────────────────────────
const getNome    = l => l.descricao || l.codProduto || '—';
const getCliente = l => l.nomeCliente || l.cliente || '—';
const getRN      = l => {
  const rn = String(l.rn || '').trim();
  if (!rn) return '(sem RN)';
  const s = rn.replace(/^0+/, '');
  return s || rn;
};

// ─── Filtro cruzado ───────────────────────────────────────────────────────────
function filtrarLinhas(linhas, { excluir, filtroRN, filtroProduto, filtroMes, filtroDia, filtroCliente }) {
  return linhas.filter(l => {
    if (excluir !== 'rn'      && filtroRN      && getRN(l)        !== filtroRN)      return false;
    if (excluir !== 'produto' && filtroProduto && getNome(l)       !== filtroProduto) return false;
    if (excluir !== 'mes'     && filtroMes     && toMesAno(l.data) !== filtroMes)     return false;
    if (excluir !== 'dia'     && filtroDia     && toISO(l.data)    !== filtroDia)     return false;
    if (excluir !== 'cliente' && filtroCliente && getCliente(l)    !== filtroCliente) return false;
    return true;
  });
}

// ─── Componente: dot do gráfico de linha (Dia a Dia) ─────────────────────────
function DotDia({ cx, cy, payload, filtroDia }) {
  const selected = filtroDia && filtroDia === payload?.iso;
  return (
    <circle
      cx={cx} cy={cy}
      r={selected ? 6 : 3}
      fill={selected ? '#fff' : D.green}
      stroke={D.green}
      strokeWidth={selected ? 2.5 : 0}
    />
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ReposicaoPage() {
  const { colRevenda } = useDb();
  const [linhasBase,       setLinhasBase]       = useState([]);
  const [carregando,       setCarregando]       = useState(true);
  const [erro,             setErro]             = useState('');

  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim,    setFiltroDataFim]    = useState('');

  const [filtroRN,      setFiltroRN]      = useState('');
  const [filtroProduto, setFiltroProduto] = useState('');
  const [filtroMes,     setFiltroMes]     = useState('');
  const [filtroDia,     setFiltroDia]     = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');

  const [topN,        setTopN]        = useState(10);
  const [topNCliente, setTopNCliente] = useState(10);

  useEffect(() => {
    async function carregar() {
      try {
        const snap = await getDocs(colRevenda('relatorio_reposicao'));
        const todas = [];
        snap.docs.forEach(d => {
          (d.data().linhas || []).forEach(l => todas.push(l));
        });
        setLinhasBase(todas);
      } catch (e) {
        setErro('Erro ao carregar dados: ' + e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  const linhasFiltradas = useMemo(() => {
    return linhasBase.filter(l => {
      if (filtroDataInicio || filtroDataFim) {
        const iso = toISO(l.data);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
      }
      return true;
    });
  }, [linhasBase, filtroDataInicio, filtroDataFim]);

  const totalReposicao = useMemo(
    () => linhasFiltradas.reduce((s, l) => s + parseNum(l.valor), 0),
    [linhasFiltradas]
  );

  const filtrosInterativos = { filtroRN, filtroProduto, filtroMes, filtroDia, filtroCliente };

  const linhasParaRN = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'rn', ...filtrosInterativos }),
    [linhasFiltradas, filtroProduto, filtroMes, filtroDia, filtroCliente] // eslint-disable-line
  );
  const linhasParaProdutos = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'produto', ...filtrosInterativos }),
    [linhasFiltradas, filtroRN, filtroMes, filtroDia, filtroCliente] // eslint-disable-line
  );
  const linhasParaMes = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'mes', ...filtrosInterativos }),
    [linhasFiltradas, filtroRN, filtroProduto, filtroDia, filtroCliente] // eslint-disable-line
  );
  const linhasParaDia = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'dia', ...filtrosInterativos }),
    [linhasFiltradas, filtroRN, filtroProduto, filtroMes, filtroCliente] // eslint-disable-line
  );
  const linhasParaCliente = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'cliente', ...filtrosInterativos }),
    [linhasFiltradas, filtroRN, filtroProduto, filtroMes, filtroDia] // eslint-disable-line
  );

  const dadosRN = useMemo(() => {
    const map = {};
    linhasParaRN.forEach(l => {
      const rn = getRN(l);
      map[rn] = (map[rn] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([rn, valor]) => ({ rn, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor);
  }, [linhasParaRN]);

  const dadosProdutos = useMemo(() => {
    const map = {};
    linhasParaProdutos.forEach(l => {
      const nome = getNome(l);
      map[nome] = (map[nome] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, topN);
  }, [linhasParaProdutos, topN]);

  const dadosMes = useMemo(() => {
    const map = {};
    linhasParaMes.forEach(l => {
      const mes = toMesAno(l.data);
      if (!mes) return;
      map[mes] = (map[mes] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([mes, valor]) => ({ mes, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => mesAnoParaISO(a.mes).localeCompare(mesAnoParaISO(b.mes)));
  }, [linhasParaMes]);

  const dadosDia = useMemo(() => {
    const map = {};
    linhasParaDia.forEach(l => {
      const iso = toISO(l.data);
      if (!iso) return;
      map[iso] = (map[iso] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([iso, valor]) => {
        const [, mm, dd] = iso.split('-');
        return { dia: `${dd}/${mm}`, iso, valor: Math.round(valor * 100) / 100 };
      })
      .sort((a, b) => a.iso.localeCompare(b.iso));
  }, [linhasParaDia]);

  const dadosClientes = useMemo(() => {
    const map = {};
    linhasParaCliente.forEach(l => {
      const cli = getCliente(l);
      map[cli] = (map[cli] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([cliente, valor]) => ({ cliente, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, topNCliente);
  }, [linhasParaCliente, topNCliente]);

  function handleClickRN(data)      { const v = data?.rn;      if (v) setFiltroRN(p      => p === v ? '' : v); }
  function handleClickProduto(data) { const v = data?.nome;    if (v) setFiltroProduto(p => p === v ? '' : v); }
  function handleClickMes(data)     { const v = data?.mes;     if (v) setFiltroMes(p     => p === v ? '' : v); }
  function handleClickDia(_, pl)    { const v = pl?.payload?.iso; if (v) setFiltroDia(p  => p === v ? '' : v); }
  function handleClickCliente(data) { const v = data?.cliente; if (v) setFiltroCliente(p => p === v ? '' : v); }

  function limparTodosFiltrosGrafico() {
    setFiltroRN(''); setFiltroProduto(''); setFiltroMes(''); setFiltroDia(''); setFiltroCliente('');
  }

  const filtroBarraAtivo   = filtroDataInicio || filtroDataFim;
  const filtroGraficoAtivo = filtroRN || filtroProduto || filtroMes || filtroDia || filtroCliente;
  const temDados           = linhasBase.length > 0;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <PageContainer maxWidth={1100}>
        <div style={{ marginBottom: 32 }}>
          <Skeleton width={120} height={11} radius={4} style={{ marginBottom: 10 }} />
          <Skeleton width={180} height={28} radius={6} style={{ marginBottom: 8 }} />
          <Skeleton width={260} height={13} radius={4} />
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
        <Skeleton height={260} radius={D.radius} style={{ marginBottom: 16 }} />
        <Skeleton height={260} radius={D.radius} />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth={1100}>

      <PageHeader kicker="Gestão de Prejuízo" titulo="Reposição" />

      {erro && (
        <div style={{
          padding: '12px 16px', background: D.redSoft, color: D.red,
          borderRadius: 10, border: `1px solid ${D.redBorder}`,
          marginBottom: 20, fontSize: 13, fontWeight: 500, fontFamily: D.font,
        }}>
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
        {filtroBarraAtivo && (
          <BotaoClear onClick={() => { setFiltroDataInicio(''); setFiltroDataFim(''); }} />
        )}
      </FilterBar>

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <KPICardPrimary label="R$ Reposição" valor={brl(totalReposicao)} cor={D.red} />
          <KPICardPrimary label="KPI 2" valor="—" cor={D.blue} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <KPICardSecondary label="KPI 3" valor="—" cor={D.blue} />
          <KPICardSecondary label="KPI 4" valor="—" cor={D.amber} />
          <KPICardSecondary label="KPI 5" valor="—" cor={D.green} />
        </div>
      </div>

      {!temDados && (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState
            titulo="Nenhum dado de reposição importado"
            descricao={<>Importe o relatório na página <strong>Importar relatórios</strong> para visualizar os dados.</>}
          />
        </div>
      )}

      {temDados && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {filtroGraficoAtivo && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '12px 16px', background: D.surface,
              border: `1px solid ${D.redBorder}`, borderRadius: D.radius,
              boxShadow: D.shadow, animation: 'wjs-fadeUp 0.25s ease both',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted }}>
                Filtros ativos
              </span>
              <div style={{ width: 1, height: 14, background: D.border }} />
              {filtroRN      && <Chip label={`RN ${filtroRN}`}              onClear={() => setFiltroRN('')} />}
              {filtroProduto && <Chip label={`Produto: ${filtroProduto}`}   onClear={() => setFiltroProduto('')} />}
              {filtroCliente && <Chip label={`Cliente: ${filtroCliente}`}   onClear={() => setFiltroCliente('')} />}
              {filtroMes     && <Chip label={`Mês: ${filtroMes}`}           onClear={() => setFiltroMes('')} />}
              {filtroDia     && <Chip label={`Dia: ${isoParaBR(filtroDia)}`} onClear={() => setFiltroDia('')} />}
              <button
                onClick={limparTodosFiltrosGrafico}
                style={{
                  fontSize: 11, color: D.textMuted, background: 'none',
                  border: 'none', cursor: 'pointer', textDecoration: 'underline',
                  marginLeft: 4, fontFamily: D.font, transition: D.transition,
                }}
              >
                Limpar tudo
              </button>
            </div>
          )}

          {/* RN + Produtos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ChartCard titulo="R$ Reposição por RN">
              {dadosRN.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosRN.length * 34), 360)}>
                  <BarChart data={dadosRN} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="rn" width={80} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.blueSoft }} />
                    <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickRN} style={{ cursor: 'pointer' }}>
                      {dadosRN.map((entry, i) => (
                        <Cell key={i} fill={D.blue} opacity={filtroRN && filtroRN !== entry.rn ? 0.18 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              titulo="Top Produtos por R$ Reposição"
              badge={
                <select value={topN} onChange={e => setTopN(Number(e.target.value))} style={{ ...sInput, fontSize: 11, padding: '4px 8px', minWidth: 'auto' }}>
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                  <option value={15}>Top 15</option>
                  <option value={20}>Top 20</option>
                </select>
              }
            >
              {dadosProdutos.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosProdutos.length * 34), 360)}>
                  <BarChart data={dadosProdutos} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.redSoft }} />
                    <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickProduto} style={{ cursor: 'pointer' }}>
                      {dadosProdutos.map((entry, i) => (
                        <Cell key={i} fill={D.red} opacity={filtroProduto && filtroProduto !== entry.nome ? 0.18 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Clientes — largura total */}
          <ChartCard
            titulo="Top Clientes por R$ Reposição"
            badge={
              <select value={topNCliente} onChange={e => setTopNCliente(Number(e.target.value))} style={{ ...sInput, fontSize: 11, padding: '4px 8px', minWidth: 'auto' }}>
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={15}>Top 15</option>
                <option value={20}>Top 20</option>
              </select>
            }
          >
            {dadosClientes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosClientes.length * 34), 700)}>
                <BarChart data={dadosClientes} layout="vertical" margin={{ top: 4, right: 110, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                  <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="cliente" width={180} tick={{ fontSize: 10.5, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} tickFormatter={v => v.length > 26 ? v.slice(0, 26) + '…' : v} />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: 'rgba(100,116,139,0.06)' }} />
                  <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10.5, fill: D.textSec, fontFamily: D.font }} onClick={handleClickCliente} style={{ cursor: 'pointer' }}>
                    {dadosClientes.map((entry, i) => (
                      <Cell key={i} fill="#64748b" opacity={filtroCliente && filtroCliente !== entry.cliente ? 0.18 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Mês a Mês */}
          <ChartCard titulo="R$ Reposição — Mês a Mês">
            {dadosMes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: D.amberSoft }} />
                  <Bar dataKey="valor" name="R$ Reposição" radius={[5, 5, 0, 0]} onClick={handleClickMes} style={{ cursor: 'pointer' }}>
                    {dadosMes.map((entry, i) => (
                      <Cell key={i} fill={D.amber} opacity={filtroMes && filtroMes !== entry.mes ? 0.18 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Dia a Dia */}
          <ChartCard titulo="R$ Reposição — Dia a Dia">
            {dadosDia.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dadosDia} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }}
                    axisLine={false} tickLine={false}
                    interval={dadosDia.length > 20 ? Math.floor(dadosDia.length / 10) : 0}
                  />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name="R$ Reposição"
                    stroke={D.green}
                    strokeWidth={2}
                    activeDot={{ r: 6, cursor: 'pointer', onClick: handleClickDia, fill: D.green, stroke: '#fff', strokeWidth: 2 }}
                    dot={props => <DotDia {...props} filtroDia={filtroDia} />}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

        </div>
      )}
    </PageContainer>
  );
}
