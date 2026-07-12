import { useState, useEffect, useMemo } from 'react';
import { getDocs } from 'firebase/firestore';
import { useDb } from '../../../utils/db';
import { useLocalFilter } from '../../../hooks/useLocalFilter';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, Cell,
  PieChart, Pie,
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

// Normaliza nota fiscal pra usar como chave do JOIN.
//   "12345-001" → "12345"  ·  "00012345" → "12345"  ·  " 12345 " → "12345"
// Mesma regra que o import do 03.18.05 aplica (split('-')[0]). Removo zeros
// à esquerda também pra cobrir caso de NF zero-padding em um relatório só.
function normNF(nota) {
  const raw = String(nota ?? '').trim();
  if (!raw) return '';
  const semSufixo = raw.split('-')[0].trim();
  return semSufixo.replace(/^0+(?=\d)/, '');
}

// ─── Acessores de campos ──────────────────────────────────────────────────────
const getNome    = l => {
  const c = l.codProduto || l.produto, d = l.descricao;
  return c ? (d ? `${c} - ${d}` : String(c)) : (d || '—');
};
const getCliente = l => {
  const c = l.cliente, n = l.nomeCliente;
  return c ? (n ? `${c} - ${n}` : String(c)) : (n || '—');
};
const getRN = l => {
  const rn = String(l.rn || '').trim();
  if (!rn) return '(sem RN)';
  return rn.replace(/^0+/, '') || rn;
};

const getMotorista = l => l._rep_motorista || '(sem motorista)';
const getPlaca     = l => l._rep_placa     || '(sem placa)';
const getAjudante  = l => l._rep_ajudante  || '(sem ajudante)';
const getMotivo    = l => l._rep_motivo    || '(sem motivo)';

// ─── Filtro cruzado (gráficos interativos) ───────────────────────────────────
function filtrarLinhas(linhas, { excluir, ...f }) {
  return linhas.filter(l => {
    if (excluir !== 'rn'        && f.filtroRN        && getRN(l)        !== f.filtroRN)        return false;
    if (excluir !== 'produto'   && f.filtroProduto   && getNome(l)      !== f.filtroProduto)   return false;
    if (excluir !== 'cliente'   && f.filtroCliente   && getCliente(l)   !== f.filtroCliente)   return false;
    if (excluir !== 'motorista' && f.filtroMotorista && getMotorista(l) !== f.filtroMotorista) return false;
    if (excluir !== 'placa'     && f.filtroPlaca     && getPlaca(l)     !== f.filtroPlaca)     return false;
    if (excluir !== 'ajudante'  && f.filtroAjudante  && getAjudante(l)  !== f.filtroAjudante)  return false;
    if (excluir !== 'motivo'    && f.filtroMotivo    && getMotivo(l)    !== f.filtroMotivo)    return false;
    if (excluir !== 'mes'       && f.filtroMes       && toMesAno(l.data)!== f.filtroMes)       return false;
    if (excluir !== 'dia'       && f.filtroDia       && toISO(l.data)   !== f.filtroDia)       return false;
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

// Paleta circular pra Pizza de Motivos (8 cores)
const CORES_PIZZA = [
  D.red, D.blue, D.amber, D.green,
  '#a855f7', '#06b6d4', '#f97316', '#64748b',
];

// Helper pra YAxis custom (rótulo à esquerda) — reaproveitado em 6 gráficos
function tickEsquerda({ width, fontSize = 10, fontWeight }) {
  return ({ x, y, payload }) => {
    const txt = String(payload.value || '');
    const max = Math.floor(width / (fontSize * 0.58));
    const trunc = txt.length > max ? txt.slice(0, max) + '…' : txt;
    return (
      <text x={x - (width - 4)} y={y} dy={4} textAnchor="start" fontSize={fontSize} fontFamily={D.font} fill={D.textSec} fontWeight={fontWeight}>
        {trunc}
      </text>
    );
  };
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ReposicaoPage() {
  const { col, colRevenda, docRef, rid } = useDb();
  const [linhasBase, setLinhasBase] = useState([]);
  // Solicitações brutas do 03.18.05 (1 doc por NF) — usado pros KPIs de
  // "Solicitações" e listas pros dropdowns de filtros.
  const [solicBase,  setSolicBase]  = useState([]);
  // Hecto entregue (do 03.01.47.01) — usado pros KPIs Meta/Economia/R$/HL.
  const [hectoBase,  setHectoBase]  = useState([]);
  // Mapa código (sem zeros à esquerda) → { nome, codigoGV, nomeGV }
  // Igual ao TrocaPage — usado pra mostrar "502 - José Roberto" no eixo do RN.
  const [vendedoresMap, setVendedoresMap] = useState({});
  // Meta R$/HL — vem do cadastro `prejuizo_meta_reposicao` (fallback 0,20).
  const [metaPorHL, setMetaPorHL] = useState(META_PADRAO.reposicao);
  const [carregando, setCarregando] = useState(true);
  const [erro,       setErro]       = useState('');

  // Filtros barra (escopo geral)
  const [filtroDataInicio,        setFiltroDataInicio]        = useLocalFilter('prejuizo:reposicao:filtroDataInicio', '');
  const [filtroDataFim,           setFiltroDataFim]           = useLocalFilter('prejuizo:reposicao:filtroDataFim', '');
  const [filtroAprovador,         setFiltroAprovador]         = useLocalFilter('prejuizo:reposicao:filtroAprovador', '');
  const [filtroSolicitante,       setFiltroSolicitante]       = useLocalFilter('prejuizo:reposicao:filtroSolicitante', '');
  const [filtroStatusSolicitacao, setFiltroStatusSolicitacao] = useLocalFilter('prejuizo:reposicao:filtroStatusSolicitacao', '');
  const [filtroStatusNF,          setFiltroStatusNF]          = useLocalFilter('prejuizo:reposicao:filtroStatusNF', '');

  // Filtros interativos (via clique em gráfico)
  const [filtroRN,        setFiltroRN]        = useLocalFilter('prejuizo:reposicao:filtroRN', '');
  const [filtroProduto,   setFiltroProduto]   = useLocalFilter('prejuizo:reposicao:filtroProduto', '');
  const [filtroCliente,   setFiltroCliente]   = useLocalFilter('prejuizo:reposicao:filtroCliente', '');
  const [filtroMotorista, setFiltroMotorista] = useLocalFilter('prejuizo:reposicao:filtroMotorista', '');
  const [filtroPlaca,     setFiltroPlaca]     = useLocalFilter('prejuizo:reposicao:filtroPlaca', '');
  const [filtroAjudante,  setFiltroAjudante]  = useLocalFilter('prejuizo:reposicao:filtroAjudante', '');
  const [filtroMotivo,    setFiltroMotivo]    = useLocalFilter('prejuizo:reposicao:filtroMotivo', '');
  const [filtroMes,       setFiltroMes]       = useLocalFilter('prejuizo:reposicao:filtroMes', '');
  const [filtroDia,       setFiltroDia]       = useLocalFilter('prejuizo:reposicao:filtroDia', '');

  // Top N
  const [topN,           setTopN]           = useLocalFilter('prejuizo:reposicao:topNProduto', 10);
  const [topNCliente,    setTopNCliente]    = useLocalFilter('prejuizo:reposicao:topNCliente', 10);
  const [topNMotorista,  setTopNMotorista]  = useLocalFilter('prejuizo:reposicao:topNMotorista', 10);
  const [topNPlaca,      setTopNPlaca]      = useLocalFilter('prejuizo:reposicao:topNPlaca', 10);
  const [topNAjudante,   setTopNAjudante]   = useLocalFilter('prejuizo:reposicao:topNAjudante', 10);

  // ── Carga ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function carregar() {
      try {
        const OPS_REPOSICAO = new Set(['5', '39', '43']);
        const [snapTroca, snapRep, snapVend, snapHecto, meta, precosMap] = await Promise.all([
          getDocs(colRevenda('relatorio_030237')),
          getDocs(colRevenda('relatorio_031805')),
          getDocs(col('vendedores')),
          getDocs(colRevenda('relatorio_030147hecto')),
          carregarMeta('reposicao', docRef, rid),
          carregarPrecosMap({ col }),
        ]);
        setMetaPorHL(meta);
        setHectoBase(snapHecto.docs.map(d => d.data()));

        // Mapa NF normalizada → solicitação (1ª encontrada vence em caso de duplicata)
        const mapRep = {};
        const solics = [];
        snapRep.docs.forEach(d => {
          (d.data().linhas || []).forEach(l => {
            const nf = normNF(l.notaFiscal);
            if (!nf) return;
            if (!mapRep[nf]) mapRep[nf] = l;
            solics.push(l);
          });
        });

        // Mapa código (sem zeros à esquerda) → { nome, codigoGV, nomeGV }
        const vmap = {};
        snapVend.docs.forEach(d => {
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

        // Linhas de venda (Reposição) + enrichment com dados da solicitação
        const todas = [];
        snapTroca.docs.forEach(d => {
          (d.data().linhas || []).forEach(rawL => {
            const op  = String(rawL.operacao     ?? '').trim();
            const ori = String(rawL.origemPedido ?? '').trim().toLowerCase();
            if (!OPS_REPOSICAO.has(op)) return;
            if (ori !== 'palmtop')     return;
            // Aplica preço cadastrado antes do spread (mesma regra do WQI/Troca):
            // quando há preço em precos_produtos, l.valor = qtde × preço; senão
            // mantém o valor original do 03.02.37 como fallback.
            const l   = aplicarPrecoCadastrado(rawL, precosMap, parseNum);
            const nf  = normNF(l.nota);
            const rep = mapRep[nf];
            todas.push({
              ...l,
              data:        l.dataOperacao || l.data,
              codProduto:  l.produto      || l.codProduto,
              nomeCliente: l.nome         || l.nomeCliente,
              rn:          l.vendedor     || l.rn,
              // Campos enriquecidos do 03.18.05
              _rep_motivo:      rep?.motivo            || '',
              _rep_placa:       rep?.placa             || '',
              _rep_motorista:   rep?.nomeMotorista     || rep?.codMotorista || '',
              _rep_ajudante:    rep?.nomeAjudante      || rep?.codAjudante  || '',
              _rep_aprovador:   rep?.aprovador         || '',
              _rep_solicitante: rep?.solicitante       || '',
              _rep_statusSol:   rep?.statusSolicitacao || '',
              _rep_statusNF:    rep?.statusNF          || '',
              _rep_opcao:       rep?.opcaoReposicao    || '',
              _rep_match:       !!rep,
            });
          });
        });

        setLinhasBase(todas);
        setSolicBase(solics);
      } catch (e) {
        setErro('Erro ao carregar dados: ' + e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve código → "código - Nome". Mesmo padrão do TrocaPage: fallback
  // pro código puro quando o RN ainda não tem cadastro em /vendedores.
  const labelRN = (codigo) => {
    if (!codigo) return '(sem RN)';
    const v = vendedoresMap[codigo];
    if (v && v.nome) return `${codigo} - ${v.nome}`;
    return codigo;
  };

  // ── Aplica filtros da barra (escopo) ────────────────────────────────────
  const linhasFiltradas = useMemo(() => {
    return linhasBase.filter(l => {
      if (filtroDataInicio || filtroDataFim) {
        const iso = toISO(l.data);
        if (!iso) return false;
        if (filtroDataInicio && iso < filtroDataInicio) return false;
        if (filtroDataFim   && iso > filtroDataFim)   return false;
      }
      if (filtroAprovador          && l._rep_aprovador  !== filtroAprovador)          return false;
      if (filtroSolicitante        && l._rep_solicitante!== filtroSolicitante)        return false;
      if (filtroStatusSolicitacao  && l._rep_statusSol  !== filtroStatusSolicitacao)  return false;
      if (filtroStatusNF           && l._rep_statusNF   !== filtroStatusNF)           return false;
      return true;
    });
  }, [linhasBase, filtroDataInicio, filtroDataFim, filtroAprovador, filtroSolicitante, filtroStatusSolicitacao, filtroStatusNF]);

  // ── Listas distintas pros dropdowns (computadas no universo todo, não filtrado, pra não desaparecer opções) ──
  const opcoesAprovador     = useMemo(() => listaDistinta(solicBase, 'aprovador'),         [solicBase]);
  const opcoesSolicitante   = useMemo(() => listaDistinta(solicBase, 'solicitante'),       [solicBase]);
  const opcoesStatusSol     = useMemo(() => listaDistinta(solicBase, 'statusSolicitacao'), [solicBase]);
  const opcoesStatusNF      = useMemo(() => listaDistinta(solicBase, 'statusNF'),          [solicBase]);

  // ── KPIs ───────────────────────────────────────────────────────────────
  const totalReposicao  = useMemo(() => linhasFiltradas.reduce((s, l) => s + parseNum(l.valor), 0), [linhasFiltradas]);
  // Hecto entregue respeitando filtro de data (igual o KPI de Troca)
  const totalHecto      = useMemo(() => {
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
  const metaRS      = totalHecto * metaPorHL;
  const saldo       = metaRS - totalReposicao;
  const economia    = saldo >= 0;
  const reposRsHL   = totalHecto > 0 ? totalReposicao / totalHecto : 0;

  // ── Cross-filtros (cada gráfico ignora o seu próprio filtro) ──────────────
  const fi = { filtroRN, filtroProduto, filtroCliente, filtroMotorista, filtroPlaca, filtroAjudante, filtroMotivo, filtroMes, filtroDia };

  const linhasParaRN        = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'rn',        ...fi }), [linhasFiltradas, filtroProduto, filtroCliente, filtroMotorista, filtroPlaca, filtroAjudante, filtroMotivo, filtroMes, filtroDia]); // eslint-disable-line
  const linhasParaProdutos  = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'produto',   ...fi }), [linhasFiltradas, filtroRN, filtroCliente, filtroMotorista, filtroPlaca, filtroAjudante, filtroMotivo, filtroMes, filtroDia]); // eslint-disable-line
  const linhasParaCliente   = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'cliente',   ...fi }), [linhasFiltradas, filtroRN, filtroProduto, filtroMotorista, filtroPlaca, filtroAjudante, filtroMotivo, filtroMes, filtroDia]); // eslint-disable-line
  const linhasParaMotorista = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'motorista', ...fi }), [linhasFiltradas, filtroRN, filtroProduto, filtroCliente, filtroPlaca, filtroAjudante, filtroMotivo, filtroMes, filtroDia]); // eslint-disable-line
  const linhasParaPlaca     = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'placa',     ...fi }), [linhasFiltradas, filtroRN, filtroProduto, filtroCliente, filtroMotorista, filtroAjudante, filtroMotivo, filtroMes, filtroDia]); // eslint-disable-line
  const linhasParaAjudante  = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'ajudante',  ...fi }), [linhasFiltradas, filtroRN, filtroProduto, filtroCliente, filtroMotorista, filtroPlaca, filtroMotivo, filtroMes, filtroDia]); // eslint-disable-line
  const linhasParaMotivo    = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'motivo',    ...fi }), [linhasFiltradas, filtroRN, filtroProduto, filtroCliente, filtroMotorista, filtroPlaca, filtroAjudante, filtroMes, filtroDia]); // eslint-disable-line
  const linhasParaMes       = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'mes',       ...fi }), [linhasFiltradas, filtroRN, filtroProduto, filtroCliente, filtroMotorista, filtroPlaca, filtroAjudante, filtroMotivo, filtroDia]); // eslint-disable-line
  const linhasParaDia       = useMemo(() => filtrarLinhas(linhasFiltradas, { excluir: 'dia',       ...fi }), [linhasFiltradas, filtroRN, filtroProduto, filtroCliente, filtroMotorista, filtroPlaca, filtroAjudante, filtroMotivo, filtroMes]); // eslint-disable-line

  // ── Agregadores ─────────────────────────────────────────────────────────
  // Agrupa por CÓDIGO do RN (chave única) e calcula "código - Nome" via vendedoresMap.
  // Mesmo padrão do TrocaPage: getRN devolve só o código; labelRN compõe o rótulo.
  const dadosRN = useMemo(() => {
    const map = {};
    linhasParaRN.forEach(l => {
      const cod = getRN(l);
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
  const dadosProdutos  = useMemo(() => agregaSimples(linhasParaProdutos,  getNome,      'nome',     topN),         [linhasParaProdutos, topN]);
  const dadosClientes  = useMemo(() => agregaSimples(linhasParaCliente,   getCliente,   'cliente',  topNCliente),  [linhasParaCliente, topNCliente]);
  const dadosMotorista = useMemo(() => agregaSimples(linhasParaMotorista, getMotorista, 'motorista',topNMotorista, true), [linhasParaMotorista, topNMotorista]);
  const dadosPlaca     = useMemo(() => agregaSimples(linhasParaPlaca,     getPlaca,     'placa',    topNPlaca,     true), [linhasParaPlaca,     topNPlaca]);
  const dadosAjudante  = useMemo(() => agregaSimples(linhasParaAjudante,  getAjudante,  'ajudante', topNAjudante,  true), [linhasParaAjudante,  topNAjudante]);
  const dadosMotivo    = useMemo(() => agregaSimples(linhasParaMotivo,    getMotivo,    'motivo',   null,          true), [linhasParaMotivo]);
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
  // Soma R$ Reposição por dia + calcula meta diária = (Hecto D-1) × metaPorHL,
  // mesmo padrão de WQI e Troca. Fallback D-2 cobre o "domingo sem operação".
  const dadosDia = useMemo(() => {
    const map = {};
    linhasParaDia.forEach(l => {
      const iso = toISO(l.data);
      if (!iso) return;
      map[iso] = (map[iso] || 0) + parseNum(l.valor);
    });
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

  // ── Handlers de clique (toggle do filtro) ───────────────────────────────
  const toggleFiltro = (setter, valor) => setter(prev => prev === valor ? '' : valor);
  const handleClickRN        = d => d?.codigo    && toggleFiltro(setFiltroRN,        d.codigo);
  const handleClickProduto   = d => d?.nome      && toggleFiltro(setFiltroProduto,   d.nome);
  const handleClickCliente   = d => d?.cliente   && toggleFiltro(setFiltroCliente,   d.cliente);
  const handleClickMotorista = d => d?.motorista && toggleFiltro(setFiltroMotorista, d.motorista);
  const handleClickPlaca     = d => d?.placa     && toggleFiltro(setFiltroPlaca,     d.placa);
  const handleClickAjudante  = d => d?.ajudante  && toggleFiltro(setFiltroAjudante,  d.ajudante);
  const handleClickMotivo    = d => d?.motivo    && toggleFiltro(setFiltroMotivo,    d.motivo);
  const handleClickMes       = d => d?.mes       && toggleFiltro(setFiltroMes,       d.mes);
  const handleClickDia       = (_, pl) => pl?.payload?.iso && toggleFiltro(setFiltroDia, pl.payload.iso);

  function limparTodosFiltrosGrafico() {
    setFiltroRN(''); setFiltroProduto(''); setFiltroCliente(''); setFiltroMotorista('');
    setFiltroPlaca(''); setFiltroAjudante(''); setFiltroMotivo(''); setFiltroMes(''); setFiltroDia('');
  }
  function limparFiltrosBarra() {
    setFiltroDataInicio(''); setFiltroDataFim('');
    setFiltroAprovador(''); setFiltroSolicitante('');
    setFiltroStatusSolicitacao(''); setFiltroStatusNF('');
  }

  const filtroBarraAtivo   = filtroDataInicio || filtroDataFim || filtroAprovador || filtroSolicitante || filtroStatusSolicitacao || filtroStatusNF;
  const filtroGraficoAtivo = filtroRN || filtroProduto || filtroCliente || filtroMotorista || filtroPlaca || filtroAjudante || filtroMotivo || filtroMes || filtroDia;
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

  // ─── Render ─────────────────────────────────────────────────────────────
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
        <FilterField label="Aprovador">
          <select value={filtroAprovador} onChange={e => setFiltroAprovador(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {opcoesAprovador.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FilterField>
        <FilterField label="Solicitante">
          <select value={filtroSolicitante} onChange={e => setFiltroSolicitante(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {opcoesSolicitante.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status Solicitação">
          <select value={filtroStatusSolicitacao} onChange={e => setFiltroStatusSolicitacao(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {opcoesStatusSol.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status NF">
          <select value={filtroStatusNF} onChange={e => setFiltroStatusNF(e.target.value)} style={sInput}>
            <option value="">Todos</option>
            {opcoesStatusNF.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FilterField>
        {filtroBarraAtivo && <BotaoClear onClick={limparFiltrosBarra} />}
      </FilterBar>

      {/* ── KPIs — bento assimétrico igual WQI/Troca, logo abaixo dos filtros ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <KPICardPrimary label="R$ Reposição Total" valor={brl(totalReposicao)} cor={D.red} />
          <KPICardPrimary
            label={economia ? 'Economia' : 'Estouro'}
            valor={brl(Math.abs(saldo))}
            cor={economia ? D.green : D.red}
            sub="Meta − R$ Reposição"
            destaque
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <KPICardSecondary label="Hecto Entregue"      valor={numFmt(totalHecto)}                            cor={D.blue} />
          <KPICardSecondary label="Meta R$"             valor={brl(metaRS)}                                    cor={D.amber} sub={`R$ ${metaPorHL.toFixed(2).replace('.', ',')} × Hecto`} />
          <KPICardSecondary label="Reposição R$/HL"     valor={totalHecto > 0 ? brl(reposRsHL) : '—'}          cor={D.green} sub="R$ Reposição ÷ Hecto" />
        </div>
      </div>

      {/* ── Overview temporal (Mês a Mês + Dia a Dia, lado a lado) ────────── */}
      {temDados && (
        <div style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ChartCard titulo="R$ Reposição — Mês a Mês">
            {dadosMes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosMes} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.borderLight} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: D.amberSoft }} />
                  <Bar dataKey="valor" name="R$ Reposição" radius={[5, 5, 0, 0]} maxBarSize={48} onClick={handleClickMes} style={{ cursor: 'pointer' }}>
                    {dadosMes.map((e, i) => <Cell key={i} fill={D.amber} opacity={filtroMes && filtroMes !== e.mes ? 0.18 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

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
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: D.font, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name="R$ Reposição"
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

      {!temDados && (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState
            titulo="Nenhum dado de reposição importado"
            descricao={<>Importe os relatórios <strong>03.02.37</strong> e <strong>03.18.05</strong> na página <strong>Importar relatórios</strong>.</>}
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
              {filtroRN        && <Chip label={`RN ${labelRN(filtroRN)}`}         onClear={() => setFiltroRN('')} />}
              {filtroProduto   && <Chip label={`Produto: ${filtroProduto}`}       onClear={() => setFiltroProduto('')} />}
              {filtroCliente   && <Chip label={`Cliente: ${filtroCliente}`}       onClear={() => setFiltroCliente('')} />}
              {filtroMotorista && <Chip label={`Motorista: ${filtroMotorista}`}   onClear={() => setFiltroMotorista('')} />}
              {filtroPlaca     && <Chip label={`Placa: ${filtroPlaca}`}           onClear={() => setFiltroPlaca('')} />}
              {filtroAjudante  && <Chip label={`Ajudante: ${filtroAjudante}`}     onClear={() => setFiltroAjudante('')} />}
              {filtroMotivo    && <Chip label={`Motivo: ${filtroMotivo}`}         onClear={() => setFiltroMotivo('')} />}
              {filtroMes       && <Chip label={`Mês: ${filtroMes}`}               onClear={() => setFiltroMes('')} />}
              {filtroDia       && <Chip label={`Dia: ${isoParaBR(filtroDia)}`}    onClear={() => setFiltroDia('')} />}
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

          {/* ── 1+2. Motivo (pizza) + Produto ──────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ChartCard titulo="R$ Reposição por Motivo">
              {dadosMotivo.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Tooltip content={<TooltipBRL />} />
                    <Pie
                      data={dadosMotivo}
                      dataKey="valor"
                      nameKey="motivo"
                      cx="50%" cy="50%"
                      outerRadius={110}
                      innerRadius={55}
                      paddingAngle={1}
                      labelLine={false}
                      label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                      onClick={handleClickMotivo}
                      style={{ cursor: 'pointer' }}
                    >
                      {dadosMotivo.map((e, i) => (
                        <Cell key={i}
                          fill={CORES_PIZZA[i % CORES_PIZZA.length]}
                          opacity={filtroMotivo && filtroMotivo !== e.motivo ? 0.25 : 1}
                          stroke="#fff" strokeWidth={2}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
              {dadosMotivo.length > 0 && (
                <LegendaMotivos dados={dadosMotivo} filtro={filtroMotivo} onClick={handleClickMotivo} />
              )}
            </ChartCard>

            <ChartCard
              titulo="Top Produtos por R$ Reposição"
              badge={<SelectTopN value={topN} onChange={setTopN} />}
            >
              {dadosProdutos.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosProdutos.length * 32), 360)}>
                  <BarChart data={dadosProdutos} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nome" width={180} axisLine={false} tickLine={false} interval={0} tick={tickEsquerda({ width: 180 })} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.redSoft }} />
                    <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickProduto} style={{ cursor: 'pointer' }}>
                      {dadosProdutos.map((e, i) => <Cell key={i} fill={D.red} opacity={filtroProduto && filtroProduto !== e.nome ? 0.18 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* ── 3+4. Motoristas + Ajudante ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ChartCard
              titulo="Top Motoristas por R$ Reposição"
              badge={<SelectTopN value={topNMotorista} onChange={setTopNMotorista} />}
            >
              {dadosMotorista.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosMotorista.length * 32), 360)}>
                  <BarChart data={dadosMotorista} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="motorista" width={180} axisLine={false} tickLine={false} interval={0} tick={tickEsquerda({ width: 180 })} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.amberSoft }} />
                    <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickMotorista} style={{ cursor: 'pointer' }}>
                      {dadosMotorista.map((e, i) => <Cell key={i} fill={D.amber} opacity={filtroMotorista && filtroMotorista !== e.motorista ? 0.18 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              titulo="Top Ajudantes por R$ Reposição"
              badge={<SelectTopN value={topNAjudante} onChange={setTopNAjudante} />}
            >
              {dadosAjudante.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosAjudante.length * 32), 360)}>
                  <BarChart data={dadosAjudante} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="ajudante" width={180} axisLine={false} tickLine={false} interval={0} tick={tickEsquerda({ width: 180 })} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.greenSoft }} />
                    <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickAjudante} style={{ cursor: 'pointer' }}>
                      {dadosAjudante.map((e, i) => <Cell key={i} fill={D.green} opacity={filtroAjudante && filtroAjudante !== e.ajudante ? 0.18 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* ── 5+6. Placa + RN ────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ChartCard
              titulo="Top Placas por R$ Reposição"
              badge={<SelectTopN value={topNPlaca} onChange={setTopNPlaca} />}
            >
              {dadosPlaca.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosPlaca.length * 32), 360)}>
                  <BarChart data={dadosPlaca} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="placa" width={120} axisLine={false} tickLine={false} interval={0} tick={tickEsquerda({ width: 120, fontWeight: 700 })} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.blueSoft }} />
                    <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickPlaca} style={{ cursor: 'pointer' }}>
                      {dadosPlaca.map((e, i) => <Cell key={i} fill={D.blue} opacity={filtroPlaca && filtroPlaca !== e.placa ? 0.18 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard titulo="R$ Reposição por RN">
              {dadosRN.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosRN.length * 32), 360)}>
                  <BarChart data={dadosRN} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                    <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={180} axisLine={false} tickLine={false} interval={0} tick={tickEsquerda({ width: 180 })} />
                    <Tooltip content={<TooltipBRL />} cursor={{ fill: D.blueSoft }} />
                    <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10, fill: D.textSec, fontFamily: D.font }} onClick={handleClickRN} style={{ cursor: 'pointer' }}>
                      {dadosRN.map((e, i) => <Cell key={i} fill={D.blue} opacity={filtroRN && filtroRN !== e.codigo ? 0.18 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* ── 7. Cliente (full — lista mais longa, dá espaço pros nomes) ──── */}
          <ChartCard
            titulo="Top Clientes por R$ Reposição"
            badge={<SelectTopN value={topNCliente} onChange={setTopNCliente} />}
          >
            {dadosClientes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosClientes.length * 34), 700)}>
                <BarChart data={dadosClientes} layout="vertical" margin={{ top: 4, right: 110, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                  <XAxis type="number" tickFormatter={v => brl(v)} tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="cliente" width={280} axisLine={false} tickLine={false} interval={0} tick={tickEsquerda({ width: 280, fontSize: 10.5 })} />
                  <Tooltip content={<TooltipBRL />} cursor={{ fill: 'rgba(100,116,139,0.06)' }} />
                  <Bar dataKey="valor" name="R$ Reposição" radius={[0, 5, 5, 0]} label={{ position: 'right', formatter: v => brl(v), fontSize: 10.5, fill: D.textSec, fontFamily: D.font }} onClick={handleClickCliente} style={{ cursor: 'pointer' }}>
                    {dadosClientes.map((e, i) => <Cell key={i} fill="#64748b" opacity={filtroCliente && filtroCliente !== e.cliente ? 0.18 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

        </div>
      )}
    </PageContainer>
  );
}

// ─── Helpers de UI/aggregação ────────────────────────────────────────────────

function SelectTopN({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))}
      style={{ ...sInput, fontSize: 11, padding: '4px 8px', minWidth: 'auto' }}>
      {[5, 10, 15, 20].map(n => <option key={n} value={n}>Top {n}</option>)}
    </select>
  );
}

// Legenda compacta clicável pra Pizza de Motivos (mostra valor e %)
function LegendaMotivos({ dados, filtro, onClick }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 6, marginTop: 12, padding: '0 4px', maxHeight: 100, overflowY: 'auto',
    }}>
      {dados.map((d, i) => {
        const pct = total > 0 ? (d.valor / total) * 100 : 0;
        const ativo = !filtro || filtro === d.motivo;
        return (
          <button
            key={d.motivo}
            onClick={() => onClick(d)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: D.font, opacity: ativo ? 1 : 0.4, transition: D.transition,
              textAlign: 'left',
            }}
          >
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: 2,
              background: CORES_PIZZA[i % CORES_PIZZA.length], flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: D.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {d.motivo}
            </span>
            <span style={{ fontSize: 10, color: D.textMuted, fontFamily: D.mono }}>
              {pct.toFixed(0)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Lista de valores distintos não vazios de um campo do 03.18.05, ordenados
function listaDistinta(linhas, campo) {
  const set = new Set();
  linhas.forEach(l => {
    const v = String(l[campo] ?? '').trim();
    if (v) set.add(v);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Agregador genérico: groupBy(getter(l)) → soma de l.valor; sort desc; opcional topN/incluirVazios
function parseValor(l) { return parseNum(l.valor); }
function agregaSimples(linhas, getter, dataKey, topN, soComMatch) {
  const map = {};
  linhas.forEach(l => {
    if (soComMatch && !l._rep_match) return; // ignora linhas sem solicitação no 03.18.05
    const k = getter(l);
    map[k] = (map[k] || 0) + parseValor(l);
  });
  let arr = Object.entries(map).map(([k, valor]) => ({ [dataKey]: k, valor: Math.round(valor * 100) / 100 }));
  arr = arr.sort((a, b) => b.valor - a.valor);
  if (topN) arr = arr.slice(0, topN);
  return arr;
}
