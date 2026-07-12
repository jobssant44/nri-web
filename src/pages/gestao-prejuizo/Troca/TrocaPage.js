import { useState, useEffect, useMemo } from 'react';
import { getDocs } from 'firebase/firestore';
import { useDb } from '../../../utils/db';
import { useSessionFilter } from '../../../hooks/useSessionFilter';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import {
  D, brl, numFmt,
  sInput,
  PageContainer, PageHeader, KPICardPrimary, KPICardSecondary, ChartCard,
  FilterBar, FilterField, Chip, TooltipBRL, Skeleton, EmptyState, Vazio,
  BotaoClear,
} from '../../../design';
import { carregarMeta, META_PADRAO } from '../../../modules/gestao-prejuizo/metasHelpers';
import { carregarPrecosMap, aplicarPrecoCadastrado } from '../../../utils/precos';

// ─── Helpers de parsing ───────────────────────────────────────────────────────
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

const getNome    = l => {
  const c = l.codProduto || l.produto, d = l.descricao;
  return c ? (d ? `${c} - ${d}` : String(c)) : (d || '—');
};
const getCliente = l => {
  const c = l.cliente, n = l.nomeCliente;
  return c ? (n ? `${c} - ${n}` : String(c)) : (n || '—');
};
// Código do RN bruto (sem zeros à esquerda). Aceita tanto `rn` quanto `vendedor`
// (relatorio_030237 grava como `vendedor`; mapeamentos antigos usavam `rn`).
const getRNCodigo = l => {
  const raw = String(l.rn || l.vendedor || '').trim();
  if (!raw) return '';
  const s = raw.replace(/^0+/, '');
  return s || raw;
};
// Código do GV (via lookup do RN no mapa de vendedores). Retorna '' quando
// o RN não tem GV cadastrado.
const getGVCodigo = (l, vmap) => {
  const rn = getRNCodigo(l);
  if (!rn) return '';
  const v = vmap && vmap[rn];
  const gv = v && v.codigoGV ? String(v.codigoGV).trim() : '';
  return gv.replace(/^0+/, '') || gv;
};

// ─── Filtro cruzado ───────────────────────────────────────────────────────────
// Os filtros de RN/GV comparam pelo CÓDIGO (não pelo nome) — assim continuam
// funcionando mesmo se algum não tiver cadastro em /vendedores.
function filtrarLinhas(linhas, { excluir, filtroRN, filtroGV, filtroProduto, filtroMes, filtroDia, filtroCliente }, vmap) {
  return linhas.filter(l => {
    if (excluir !== 'rn'      && filtroRN      && getRNCodigo(l)        !== filtroRN)      return false;
    if (excluir !== 'gv'      && filtroGV      && getGVCodigo(l, vmap)  !== filtroGV)      return false;
    if (excluir !== 'produto' && filtroProduto && getNome(l)            !== filtroProduto) return false;
    if (excluir !== 'mes'     && filtroMes     && toMesAno(l.data)      !== filtroMes)     return false;
    if (excluir !== 'dia'     && filtroDia     && toISO(l.data)         !== filtroDia)     return false;
    if (excluir !== 'cliente' && filtroCliente && getCliente(l)         !== filtroCliente) return false;
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

export default function TrocaPage() {
  const { col, colRevenda, docRef, rid } = useDb();
  const [linhasBase,       setLinhasBase]       = useState([]);
  const [hectoBase,        setHectoBase]        = useState([]);
  // Mapa código (sem zeros à esquerda) → { nome, codigoGV, nomeGV }
  const [vendedoresMap,    setVendedoresMap]    = useState({});
  // Meta R$/HL — vem do cadastro `prejuizo_meta_troca` (fallback 0,20).
  const [metaPorHL,        setMetaPorHL]        = useState(META_PADRAO.troca);
  const [carregando,       setCarregando]       = useState(true);
  const [erro,             setErro]             = useState('');

  const [filtroRevenda,    setFiltroRevenda]    = useSessionFilter('prejuizo:troca:filtroRevenda', '');
  const [filtroDataInicio, setFiltroDataInicio] = useSessionFilter('prejuizo:troca:filtroDataInicio', '');
  const [filtroDataFim,    setFiltroDataFim]    = useSessionFilter('prejuizo:troca:filtroDataFim', '');

  const [filtroRN,       setFiltroRN]       = useSessionFilter('prejuizo:troca:filtroRN', '');
  const [filtroGV,       setFiltroGV]       = useSessionFilter('prejuizo:troca:filtroGV', '');
  const [filtroProduto,  setFiltroProduto]  = useSessionFilter('prejuizo:troca:filtroProduto', '');
  const [filtroMes,      setFiltroMes]      = useSessionFilter('prejuizo:troca:filtroMes', '');
  const [filtroDia,      setFiltroDia]      = useSessionFilter('prejuizo:troca:filtroDia', '');
  const [filtroCliente,  setFiltroCliente]  = useSessionFilter('prejuizo:troca:filtroCliente', '');

  const [topN,        setTopN]        = useSessionFilter('prejuizo:troca:topNProduto', 10);
  const [topNCliente, setTopNCliente] = useSessionFilter('prejuizo:troca:topNCliente', 10);

  useEffect(() => {
    async function carregar() {
      try {
        const [snapTroca, snapHecto, snapVendedores, meta, precosMap] = await Promise.all([
          getDocs(colRevenda('relatorio_030237')),
          getDocs(colRevenda('relatorio_030147hecto')),
          getDocs(col('vendedores')),
          carregarMeta('troca', docRef, rid),
          carregarPrecosMap({ col }),
        ]);
        const todas = [];
        snapTroca.docs.forEach(d => {
          (d.data().linhas || []).forEach(rawL => {
            // Pré-filtros: Operação = 5 · Status = A · Origem = Digitado
            const opNum  = parseFloat(String(rawL.operacao     || '').trim().replace(',', '.'));
            const status = String(rawL.status                  || '').trim().toUpperCase();
            const origem = String(rawL.origemPedido            || '').trim().toLowerCase();
            if (opNum !== 5 || status !== 'A' || origem !== 'digitado') return;
            // Aplica preço cadastrado antes do spread — quando o produto tem
            // preço em precos_produtos, l.valor passa a ser qtde × preço;
            // senão mantém o valor original do 03.02.37 como fallback.
            const l = aplicarPrecoCadastrado(rawL, precosMap, parseNum);
            todas.push({
              ...l,
              data:        l.dataOperacao || l.data || '',
              nomeCliente: l.nome         || l.nomeCliente || '',
              codProduto:  l.produto      || l.codProduto  || '',
            });
          });
        });
        // Monta o mapa código → { nome, codigoGV, nomeGV }. A chave usa o
        // código já normalizado (sem zeros à esquerda), pra bater com o que
        // sai de getRNCodigo() nas linhas do 03.02.37.
        const vmap = {};
        snapVendedores.docs.forEach(d => {
          const v = d.data();
          const cod = String(v.codigo || d.id || '').replace(/^0+/, '');
          if (!cod) return;
          vmap[cod] = {
            nome:     v.nome     || '',
            codigoGV: v.codigoGV || '',
            nomeGV:   v.nomeGV   || '',
          };
        });
        setVendedoresMap(vmap);
        setMetaPorHL(meta);
        setLinhasBase(todas);
        setHectoBase(snapHecto.docs.map(d => d.data()));
      } catch (e) {
        setErro('Erro ao carregar dados: ' + e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve código → label exibido. Se o RN tiver cadastro, usa "código - Nome";
  // senão usa só o código.
  const labelRN = (codigo) => {
    if (!codigo) return '(sem RN)';
    const v = vendedoresMap[codigo];
    if (v && v.nome) return `${codigo} - ${v.nome}`;
    return codigo;
  };

  // Resolve código do GV → label "código - Nome do GV". A varredura no mapa é
  // necessária porque o vendedoresMap é indexado por RN (não por GV); pega o
  // primeiro RN que aponta pro GV pra obter o nome.
  const labelGV = (codigoGV) => {
    if (!codigoGV) return '(sem GV)';
    for (const v of Object.values(vendedoresMap)) {
      const cod = String(v.codigoGV || '').replace(/^0+/, '');
      if (cod === codigoGV && v.nomeGV) return `${codigoGV} - ${v.nomeGV}`;
    }
    return codigoGV;
  };

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

  const totalTroca = useMemo(
    () => linhasFiltradas.reduce((s, l) => s + parseNum(l.valor), 0),
    [linhasFiltradas]
  );
  const metaTroca = totalHecto * metaPorHL;
  const trocaRsHL = totalHecto > 0 ? totalTroca / totalHecto : 0;
  const saldo     = metaTroca - totalTroca;
  const economia  = saldo >= 0;

  const filtrosInterativos = { filtroRN, filtroGV, filtroProduto, filtroMes, filtroDia, filtroCliente };

  const linhasParaRN = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'rn', ...filtrosInterativos }, vendedoresMap),
    [linhasFiltradas, filtroGV, filtroProduto, filtroMes, filtroDia, filtroCliente, vendedoresMap] // eslint-disable-line
  );
  const linhasParaGV = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'gv', ...filtrosInterativos }, vendedoresMap),
    [linhasFiltradas, filtroRN, filtroProduto, filtroMes, filtroDia, filtroCliente, vendedoresMap] // eslint-disable-line
  );
  const linhasParaProdutos = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'produto', ...filtrosInterativos }, vendedoresMap),
    [linhasFiltradas, filtroRN, filtroGV, filtroMes, filtroDia, filtroCliente, vendedoresMap] // eslint-disable-line
  );
  const linhasParaMes = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'mes', ...filtrosInterativos }, vendedoresMap),
    [linhasFiltradas, filtroRN, filtroGV, filtroProduto, filtroDia, filtroCliente, vendedoresMap] // eslint-disable-line
  );
  const linhasParaDia = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'dia', ...filtrosInterativos }, vendedoresMap),
    [linhasFiltradas, filtroRN, filtroGV, filtroProduto, filtroMes, filtroCliente, vendedoresMap] // eslint-disable-line
  );
  const linhasParaCliente = useMemo(
    () => filtrarLinhas(linhasFiltradas, { excluir: 'cliente', ...filtrosInterativos }, vendedoresMap),
    [linhasFiltradas, filtroRN, filtroGV, filtroProduto, filtroMes, filtroDia, vendedoresMap] // eslint-disable-line
  );

  // Agrupa por CÓDIGO do RN (chave única) e usa o NOME como rótulo (YAxis).
  // Se dois códigos colidirem no mesmo nome, mantém o código no label pra
  // não esconder a colisão.
  const dadosRN = useMemo(() => {
    const map = {};
    linhasParaRN.forEach(l => {
      const cod = getRNCodigo(l) || '(sem RN)';
      map[cod] = (map[cod] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([codigo, valor]) => ({
        codigo,
        label: labelRN(codigo),
        valor: Math.round(valor * 100) / 100,
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [linhasParaRN, vendedoresMap]); // eslint-disable-line

  // Agrupa por CÓDIGO do GV (via vendedoresMap[rn].codigoGV). RNs sem GV
  // cadastrado caem no balde "(sem GV)" pra não sumirem do total.
  const dadosGV = useMemo(() => {
    const map = {};
    linhasParaGV.forEach(l => {
      const cod = getGVCodigo(l, vendedoresMap) || '(sem GV)';
      map[cod] = (map[cod] || 0) + parseNum(l.valor);
    });
    return Object.entries(map)
      .map(([codigo, valor]) => ({
        codigo,
        label: labelGV(codigo),
        valor: Math.round(valor * 100) / 100,
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [linhasParaGV, vendedoresMap]); // eslint-disable-line

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

  // Soma R$ Troca por dia + calcula meta diária = (Hecto do dia anterior) × 0,20.
  // Fórmula igual à do WQI "Perda — Dia a Dia", trocando o coeficiente de R$/HL
  // (WQI = R$ 0,50/HL · Troca = R$ 0,20/HL).
  // Fallback: se não houver Hecto em D-1, tenta D-2. Sem Hecto vizinho, meta = null
  // (a linha tracejada só não desenha o ponto naquele dia).
  const dadosDia = useMemo(() => {
    const map = {};
    linhasParaDia.forEach(l => {
      const iso = toISO(l.data);
      if (!iso) return;
      map[iso] = (map[iso] || 0) + parseNum(l.valor);
    });
    // Mapa Hecto por dia ISO. Não respeita os filtros interativos
    // (dia/RN/produto/etc), só o range de data da FilterBar — isso bate com
    // o KPI lateral "Meta Troca R$" da página.
    const hectoMap = {};
    hectoBase.forEach(h => {
      if (filtroDataInicio || filtroDataFim) {
        const isoH = toISO(h.data);
        if (!isoH) return;
        if (filtroDataInicio && isoH < filtroDataInicio) return;
        if (filtroDataFim   && isoH > filtroDataFim)   return;
      }
      const iso = toISO(h.data);
      if (iso) hectoMap[iso] = (hectoMap[iso] || 0) + parseNum(h.totalHecto);
    });
    const isoMenosN = (iso, n) => {
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - n);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    return Object.entries(map)
      .map(([iso, valor]) => {
        const [, mm, dd] = iso.split('-');
        const hectoAnt = hectoMap[isoMenosN(iso, 1)] || hectoMap[isoMenosN(iso, 2)] || 0;
        const meta     = hectoAnt > 0 ? Math.round(hectoAnt * metaPorHL * 100) / 100 : null;
        return { dia: `${dd}/${mm}`, iso, valor: Math.round(valor * 100) / 100, meta };
      })
      .sort((a, b) => a.iso.localeCompare(b.iso));
  }, [linhasParaDia, hectoBase, filtroDataInicio, filtroDataFim, metaPorHL]);

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

  function handleClickRN(data)      { const cod = data?.codigo; if (cod) setFiltroRN(prev      => prev === cod ? '' : cod); }
  function handleClickGV(data)      { const cod = data?.codigo; if (cod) setFiltroGV(prev      => prev === cod ? '' : cod); }
  function handleClickProduto(data) { const nm  = data?.nome;    if (nm)  setFiltroProduto(prev => prev === nm  ? '' : nm);  }
  function handleClickMes(data)     { const mes = data?.mes;     if (mes) setFiltroMes(prev     => prev === mes ? '' : mes); }
  function handleClickDia(_, payload) { const iso = payload?.payload?.iso; if (iso) setFiltroDia(prev => prev === iso ? '' : iso); }
  function handleClickCliente(data) { const cli = data?.cliente; if (cli) setFiltroCliente(prev => prev === cli ? '' : cli); }
  function limparTodosFiltrosGrafico() {
    setFiltroRN(''); setFiltroGV(''); setFiltroProduto(''); setFiltroMes(''); setFiltroDia(''); setFiltroCliente('');
  }

  const filtroBarraAtivo   = filtroRevenda || filtroDataInicio || filtroDataFim;
  const filtroGraficoAtivo = filtroRN || filtroGV || filtroProduto || filtroMes || filtroDia || filtroCliente;
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <PageContainer maxWidth={1100}>

      <PageHeader kicker="Gestão de Prejuízo" titulo="Troca" />

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
        <FilterField label="Revenda">
          <select value={filtroRevenda} onChange={e => setFiltroRevenda(e.target.value)} style={sInput}>
            <option value="">Todas</option>
            <option value="Carpina">Carpina</option>
            <option value="Palmares">Palmares</option>
          </select>
        </FilterField>
        <FilterField label="Data de">
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={sInput} />
        </FilterField>
        <FilterField label="Data até">
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={sInput} />
        </FilterField>
        {filtroBarraAtivo && (
          <BotaoClear onClick={() => { setFiltroRevenda(''); setFiltroDataInicio(''); setFiltroDataFim(''); }} />
        )}
      </FilterBar>

      {/* ── KPIs — bento assimétrico ──────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <KPICardPrimary label="R$ Troca" valor={brl(totalTroca)} cor={D.red} />
          <KPICardPrimary
            label={economia ? 'Economia' : 'Estouro'}
            valor={brl(Math.abs(saldo))}
            cor={economia ? D.green : D.red}
            sub="Meta − R$ Troca"
            destaque
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <KPICardSecondary label="Hecto"         valor={numFmt(totalHecto)}                    cor={D.blue} />
          <KPICardSecondary label="Meta Troca R$" valor={brl(metaTroca)}                         cor={D.amber} sub={`R$ ${metaPorHL.toFixed(2).replace('.', ',')} × Hecto`} />
          <KPICardSecondary label="Troca R$/HL"   valor={totalHecto > 0 ? brl(trocaRsHL) : '—'} cor={D.green} sub="R$ Troca ÷ Hecto" />
        </div>
      </div>

      {!temDados && (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState
            titulo="Nenhum dado de troca importado"
            descricao={<>Importe o relatório <strong>03.02.37</strong> na página <strong>Importar relatórios</strong> para visualizar os dados.</>}
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
              {filtroRN      && <Chip label={`RN ${labelRN(filtroRN)}`}     onClear={() => setFiltroRN('')} />}
              {filtroGV      && <Chip label={`GV ${labelGV(filtroGV)}`}     onClear={() => setFiltroGV('')} />}
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

          {/* ── RN + Produtos lado a lado ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <ChartCard titulo="R$ Troca por RN">
              {dadosRN.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosRN.length * 34), 360)}>
                  <BarChart data={dadosRN} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={160}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      tick={({ x, y, payload }) => {
                        const txt = String(payload.value || '');
                        const trunc = txt.length > 24 ? txt.slice(0, 24) + '…' : txt;
                        return (
                          <text
                            x={x - 156}
                            y={y}
                            dy={4}
                            textAnchor="start"
                            fontSize={10}
                            fontFamily={D.font}
                            fill={D.textSec}
                          >
                            {trunc}
                          </text>
                        );
                      }}
                    />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.blueSoft }} />
                    <Bar dataKey="valor" name="R$ Troca" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickRN} style={{ cursor: 'pointer' }}>
                      {dadosRN.map((entry, i) => (
                        <Cell key={i} fill={D.blue} opacity={filtroRN && filtroRN !== entry.codigo ? 0.18 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              titulo="Top Produtos por R$ Troca"
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
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={180}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      tick={({ x, y, payload }) => {
                        const txt = String(payload.value || '');
                        const trunc = txt.length > 28 ? txt.slice(0, 28) + '…' : txt;
                        return (
                          <text
                            x={x - 176}
                            y={y}
                            dy={4}
                            textAnchor="start"
                            fontSize={10}
                            fontFamily={D.font}
                            fill={D.textSec}
                          >
                            {trunc}
                          </text>
                        );
                      }}
                    />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.redSoft }} />
                    <Bar dataKey="valor" name="R$ Troca" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickProduto} style={{ cursor: 'pointer' }}>
                      {dadosProdutos.map((entry, i) => (
                        <Cell key={i} fill={D.red} opacity={filtroProduto && filtroProduto !== entry.nome ? 0.18 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>

          {/* ── GV ───────────────────────────────────────────────────── */}
          <ChartCard titulo="R$ Troca por GV">
            {dadosGV.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosGV.length * 38), 420)}>
                <BarChart data={dadosGV} layout="vertical" margin={{ top: 4, right: 90, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                  <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={220}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={({ x, y, payload }) => {
                      const txt = String(payload.value || '');
                      const trunc = txt.length > 30 ? txt.slice(0, 30) + '…' : txt;
                      return (
                        <text x={x - 216} y={y} dy={4} textAnchor="start" fontSize={11} fontFamily={D.font} fill={D.textSec}>
                          {trunc}
                        </text>
                      );
                    }}
                  />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: D.amberSoft }} />
                  <Bar dataKey="valor" name="R$ Troca" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 11, fill: D.textSec, fontFamily: D.font }} onClick={handleClickGV} style={{ cursor: 'pointer' }}>
                    {dadosGV.map((entry, i) => (
                      <Cell key={i} fill={D.amber} opacity={filtroGV && filtroGV !== entry.codigo ? 0.18 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ── Clientes ───────────────────────────────────────────────── */}
          <ChartCard
            titulo="Top Clientes por R$ Troca"
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
                  <YAxis
                    type="category"
                    dataKey="cliente"
                    width={240}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={({ x, y, payload }) => {
                      const txt = String(payload.value || '');
                      const trunc = txt.length > 32 ? txt.slice(0, 32) + '…' : txt;
                      return (
                        <text x={x - 236} y={y} dy={4} textAnchor="start" fontSize={10.5} fontFamily={D.font} fill={D.textSec}>
                          {trunc}
                        </text>
                      );
                    }}
                  />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: 'rgba(100,116,139,0.06)' }} />
                  <Bar dataKey="valor" name="R$ Troca" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10.5, fill: D.textSec, fontFamily: D.font }} onClick={handleClickCliente} style={{ cursor: 'pointer' }}>
                    {dadosClientes.map((entry, i) => (
                      <Cell key={i} fill="#64748b" opacity={filtroCliente && filtroCliente !== entry.cliente ? 0.18 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ── Mês a Mês ────────────────────────────────────────────────── */}
          <ChartCard titulo="R$ Troca — Mês a Mês">
            {dadosMes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: D.amberSoft }} />
                  <Bar dataKey="valor" name="R$ Troca" radius={[5, 5, 0, 0]} maxBarSize={48} onClick={handleClickMes} style={{ cursor: 'pointer' }}>
                    {dadosMes.map((entry, i) => (
                      <Cell key={i} fill={D.amber} opacity={filtroMes && filtroMes !== entry.mes ? 0.18 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* ── Dia a Dia ──────────────────────────────────────────────── */}
          <ChartCard titulo="R$ Troca — Dia a Dia">
            {dadosDia.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dadosDia} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }}
                    axisLine={false}
                    tickLine={false}
                    interval={dadosDia.length > 20 ? Math.floor(dadosDia.length / 10) : 0}
                  />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: D.font, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name="R$ Troca"
                    stroke={D.green}
                    strokeWidth={2}
                    activeDot={{ r: 6, cursor: 'pointer', onClick: handleClickDia, fill: D.green, stroke: '#fff', strokeWidth: 2 }}
                    dot={props => <DotDia {...props} filtroDia={filtroDia} />}
                  />
                  <Line
                    type="linear"
                    dataKey="meta"
                    name={`Meta (R$ ${metaPorHL.toFixed(2).replace('.', ',')} × HL anterior)`}
                    stroke={D.red}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
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
