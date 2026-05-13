import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useDb } from '../../utils/db';


const MESES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function ordenarDatas(a, b) {
  const [dA, mA, yA] = a.split('/').map(Number);
  const [dB, mB, yB] = b.split('/').map(Number);
  return new Date(yA, mA - 1, dA) - new Date(yB, mB - 1, dB);
}

function diaSemana(data) {
  const [d, m, y] = data.split('/').map(Number);
  return DIAS_SEMANA[new Date(y, m - 1, d).getDay()];
}

function estiloDiferenca(val) {
  if (val === undefined || val === null) return {};
  if (val < 0) return { color: '#dc2626', fontWeight: 600 };
  if (val > 0) return { color: '#16a34a', fontWeight: 600 };
  return { color: '#374151' };
}

const STORAGE_KEY = 'conciliacao-diaria-filtros';

function lerFiltrosSalvos() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ConciliacaoDiariaPage() {
  const { col, colRevenda } = useDb();
  const salvo = lerFiltrosSalvos();

  const [registros, setRegistros]           = useState([]);
  const [carregando, setCarregando]         = useState(true);
  const [filtroRevenda, setFiltroRevenda]   = useState(salvo.revenda   || '');
  const [filtroAno, setFiltroAno]           = useState(salvo.ano       || '');
  const [filtroMes, setFiltroMes]           = useState(salvo.mes       || '');
  const [filtroDeposito, setFiltroDeposito] = useState(salvo.deposito  || '');
  const [busca, setBusca]                   = useState(salvo.busca     || '');
  const [ordenacao, setOrdenacao]           = useState(salvo.ordenacao || 'cod-asc');
  const [parAtivo, setParAtivo]             = useState(salvo.parAtivo  || false);
  const [codigosPAR, setCodigosPAR]         = useState(new Set());

  // Persiste filtros no localStorage sempre que mudam
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      revenda: filtroRevenda, ano: filtroAno, mes: filtroMes,
      deposito: filtroDeposito, busca, ordenacao, parAtivo,
    }));
  }, [filtroRevenda, filtroAno, filtroMes, filtroDeposito, busca, ordenacao, parAtivo]);

  useEffect(() => {
    Promise.all([
      getDocs(colRevenda('conciliacao_estoque')),
      getDocs(colRevenda('conciliacao_par')),
    ]).then(([snapEst, snapPar]) => {
      setRegistros(snapEst.docs.map(d => ({ id: d.id, ...d.data() })));
      // Usa o campo codProduto salvo no documento (mais robusto que o ID)
      const codigosSet = new Set(
        snapPar.docs.map(d => String(d.data().codProduto ?? '').trim().replace(/^0+/, '')).filter(Boolean)
      );
      setCodigosPAR(codigosSet);
      setCarregando(false);
    });
  }, []);

  // ── Opções dos filtros ──
  const anos = useMemo(() =>
    [...new Set(registros.map(r => r.ano))].filter(Boolean).sort((a, b) => a - b),
    [registros]
  );

  const mesesDisponiveis = useMemo(() => {
    const set = new Set(
      registros
        .filter(r =>
          (!filtroRevenda || r.revenda === filtroRevenda) &&
          (!filtroAno     || r.ano === Number(filtroAno))
        )
        .map(r => r.mes)
    );
    return [...set].filter(Boolean).sort((a, b) => a - b);
  }, [registros, filtroRevenda, filtroAno]);

  const depositosDisponiveis = useMemo(() => {
    const set = new Set(
      registros
        .filter(r =>
          (!filtroRevenda || r.revenda === filtroRevenda) &&
          (!filtroAno     || r.ano === Number(filtroAno)) &&
          (!filtroMes     || r.mes === Number(filtroMes))
        )
        .map(r => r.deposito)
    );
    return [...set].filter(Boolean).sort();
  }, [registros, filtroRevenda, filtroAno, filtroMes]);

  // ── Registros filtrados ──
  const dadosFiltrados = useMemo(() =>
    registros.filter(r => {
      if (filtroRevenda  && r.revenda  !== filtroRevenda)     return false;
      if (filtroAno      && r.ano      !== Number(filtroAno)) return false;
      if (filtroMes      && r.mes      !== Number(filtroMes)) return false;
      if (filtroDeposito && r.deposito !== filtroDeposito)    return false;
      return true;
    }),
    [registros, filtroRevenda, filtroAno, filtroMes, filtroDeposito]
  );

  // ── Datas únicas ordenadas (colunas do eixo X) ──
  const datas = useMemo(() => {
    const set = new Set(dadosFiltrados.map(r => r.data).filter(Boolean));
    return [...set].sort(ordenarDatas);
  }, [dadosFiltrados]);

  // ── Linhas pivô: (deposito + codProduto) → { meta, valores } ──
  const linhasPivotBase = useMemo(() => {
    const mapa = new Map();
    dadosFiltrados.forEach(r => {
      const chave = `${r.deposito}||${r.codProduto}`;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          deposito:   r.deposito   || '—',
          codProduto: r.codProduto || '—',
          descricao:  r.descricao  || '—',
          un:         r.un         || '—',
          valores:    {},
        });
      }
      const linha = mapa.get(chave);
      if (r.data) {
        linha.valores[r.data] = (linha.valores[r.data] ?? 0) + (r.diferenca ?? 0);
      }
    });
    return [...mapa.values()];
  }, [dadosFiltrados]);

  // ── Busca por código ou descrição ──
  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let resultado = linhasPivotBase;
    if (termo) {
      resultado = resultado.filter(l =>
        l.codProduto.toLowerCase().includes(termo) ||
        l.descricao.toLowerCase().includes(termo)
      );
    }
    if (parAtivo) {
      resultado = resultado.filter(l => codigosPAR.has(l.codProduto.replace(/^0+/, '')));
    }
    return resultado;
  }, [linhasPivotBase, busca, parAtivo, codigosPAR]);

  // ── Ordenação ──
  const linhasPivot = useMemo(() => {
    const arr = [...linhasFiltradas];
    switch (ordenacao) {
      case 'cod-asc':
        return arr.sort((a, b) => a.codProduto.localeCompare(b.codProduto, 'pt-BR', { numeric: true }));
      case 'cod-desc':
        return arr.sort((a, b) => b.codProduto.localeCompare(a.codProduto, 'pt-BR', { numeric: true }));
      case 'desc-asc':
        return arr.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
      case 'desc-desc':
        return arr.sort((a, b) => b.descricao.localeCompare(a.descricao, 'pt-BR'));
      default:
        return arr;
    }
  }, [linhasFiltradas, ordenacao]);

  // ── Handlers de filtro em cascata ──
  function handleRevenda(val) { setFiltroRevenda(val); setFiltroMes(''); setFiltroDeposito(''); }
  function handleAno(val)     { setFiltroAno(val);     setFiltroMes(''); setFiltroDeposito(''); }
  function handleMes(val)     { setFiltroMes(val);     setFiltroDeposito(''); }
  function limparFiltros()    { setFiltroRevenda(''); setFiltroAno(''); setFiltroMes(''); setFiltroDeposito(''); setBusca(''); setParAtivo(false); }

  const filtrosAtivos = filtroRevenda || filtroAno || filtroMes || filtroDeposito || busca;

  // ── Botão de ordenação reutilizável ──
  function BotaoOrdem({ campo, label }) {
    const ascKey  = `${campo}-asc`;
    const descKey = `${campo}-desc`;
    const ativo   = ordenacao === ascKey || ordenacao === descKey;
    const crescente = ordenacao === ascKey;

    return (
      <button
        onClick={() => setOrdenacao(ativo && crescente ? descKey : ascKey)}
        style={{
          padding: '5px 10px',
          border: `1px solid ${ativo ? '#E31837' : '#d1d5db'}`,
          borderRadius: 5,
          backgroundColor: ativo ? 'rgba(227,24,55,0.07)' : 'transparent',
          color: ativo ? '#E31837' : '#6b7280',
          fontSize: 12,
          fontWeight: ativo ? 600 : 400,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <span style={{ fontSize: 10 }}>
          {!ativo ? '↕' : crescente ? '↑' : '↓'}
        </span>
      </button>
    );
  }

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 }}>
          Conciliação Diária
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Diferença por produto × data — filtre e ordene para navegar pelos registros.
        </p>
      </div>

      {/* Barra de filtros */}
      <div style={s.filtrosCard}>
        {/* Linha superior: filtros à esquerda, busca à direita */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          {/* Filtros esquerda */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={s.filtroGrupo}>
              <label style={s.filtroLabel}>Revenda</label>
              <select value={filtroRevenda} onChange={e => handleRevenda(e.target.value)} style={s.select}>
                <option value="">Todas</option>
                <option value="Carpina">Carpina</option>
                <option value="Palmares">Palmares</option>
              </select>
            </div>

            <div style={s.filtroGrupo}>
              <label style={s.filtroLabel}>Ano</label>
              <select value={filtroAno} onChange={e => handleAno(e.target.value)} style={s.select}>
                <option value="">Todos</option>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div style={s.filtroGrupo}>
              <label style={s.filtroLabel}>Mês</label>
              <select value={filtroMes} onChange={e => handleMes(e.target.value)} style={s.select}>
                <option value="">Todos</option>
                {mesesDisponiveis.map(m => <option key={m} value={m}>{MESES[m]}</option>)}
              </select>
            </div>

            <div style={s.filtroGrupo}>
              <label style={s.filtroLabel}>Depósito</label>
              <select value={filtroDeposito} onChange={e => setFiltroDeposito(e.target.value)} style={s.select}>
                <option value="">Todos</option>
                {depositosDisponiveis.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Toggle P.A.R. */}
            <div style={{ ...s.filtroGrupo, justifyContent: 'flex-end' }}>
              <label style={s.filtroLabel}>P.A.R.</label>
              <div
                onClick={() => codigosPAR.size > 0 && setParAtivo(v => !v)}
                title={codigosPAR.size === 0 ? 'Nenhum produto P.A.R. importado' : parAtivo ? 'Desativar filtro P.A.R.' : 'Mostrar apenas P.A.R.'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: codigosPAR.size === 0 ? 'not-allowed' : 'pointer',
                  opacity: codigosPAR.size === 0 ? 0.4 : 1,
                  userSelect: 'none',
                }}
              >
                {/* Trilho */}
                <div style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: parAtivo
                    ? 'linear-gradient(135deg, #6ee7b7, #60a5fa)'
                    : '#d1d5db',
                  position: 'relative',
                  transition: 'background 0.25s ease',
                  flexShrink: 0,
                  boxShadow: parAtivo ? '0 0 0 3px rgba(96,165,250,0.2)' : 'none',
                }}>
                  {/* Bolinha */}
                  <div style={{
                    position: 'absolute',
                    top: 3,
                    left: parAtivo ? 23 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    transition: 'left 0.25s ease',
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: parAtivo ? '#1a1a2e' : '#9ca3af', transition: 'color 0.2s' }}>
                  ⚠️ P.A.R.
                </span>
              </div>
            </div>

            {filtrosAtivos && (
              <button onClick={limparFiltros} style={{ ...s.botaoLimpar, alignSelf: 'flex-end' }}>
                ✕ Limpar
              </button>
            )}
          </div>

          {/* Busca — canto direito */}
          <div style={s.filtroGrupo}>
            <label style={s.filtroLabel}>Buscar produto</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13, pointerEvents: 'none' }}>
                🔍
              </span>
              <input
                type="text"
                placeholder="Código ou descrição..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ ...s.select, paddingLeft: 28, minWidth: 220 }}
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, lineHeight: 1, padding: 0 }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Linha de ordenação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginRight: 4 }}>
            Ordenar:
          </span>
          <BotaoOrdem campo="cod"  label="Cód. Produto" />
          <BotaoOrdem campo="desc" label="Descrição" />
        </div>
      </div>

      {/* Tabela pivô */}
      <div style={s.tabelaCard}>
        {carregando ? (
          <div style={s.vazio}>⏳ Carregando dados...</div>
        ) : linhasPivot.length === 0 ? (
          <div style={s.vazio}>
            {registros.length === 0
              ? 'Nenhum dado importado. Acesse "Importar 02.05.02" para importar um relatório.'
              : 'Nenhum registro encontrado com os filtros selecionados.'}
          </div>
        ) : (
          <div style={s.tabelaWrapper}>
            <table style={s.tabela}>
              <thead>
                <tr>
                  <th style={{ ...s.th, ...s.thFixo, minWidth: 90,  textAlign: 'left', left: 0   }}>Cód. Produto</th>
                  <th style={{ ...s.th, ...s.thFixo, minWidth: 240, textAlign: 'left', left: 90  }}>Descrição</th>
                  <th style={{ ...s.th, ...s.thFixo, minWidth: 50,  textAlign: 'left', left: 330 }}>Un</th>
                  {datas.map(d => (
                    <th key={d} style={{ ...s.th, minWidth: 92 }}>
                      <div style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginBottom: 1 }}>
                        {diaSemana(d)}
                      </div>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {linhasPivot.map((linha, i) => (
                  <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                    <td style={{ ...s.td, ...s.tdFixo, left: 0,   fontFamily: 'monospace', fontSize: 11 }}>{linha.codProduto}</td>
                    <td style={{ ...s.td, ...s.tdFixo, left: 90,  maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{linha.descricao}</td>
                    <td style={{ ...s.td, ...s.tdFixo, left: 330 }}>{linha.un}</td>
                    {datas.map(d => {
                      const val = linha.valores[d];
                      return (
                        <td key={d} style={{ ...s.td, textAlign: 'right', ...estiloDiferenca(val) }}>
                          {val === undefined ? <span style={{ color: '#e5e7eb' }}>—</span> : val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = {
  filtrosCard:  { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  filtroGrupo:  { display: 'flex', flexDirection: 'column', gap: 4 },
  filtroLabel:  { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8 },
  select:       { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#1a1a2e', backgroundColor: '#fff', cursor: 'pointer', outline: 'none' },
  botaoLimpar:  { padding: '7px 14px', backgroundColor: 'transparent', border: '1px solid #d1d5db', color: '#6b7280', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500 },

  tabelaCard:   { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  tabelaWrapper:{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' },
  tabela:       { borderCollapse: 'collapse', fontSize: 12 },

  th:     { backgroundColor: '#1a1a2e', color: '#fff', padding: '10px 12px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11, position: 'sticky', top: 0, zIndex: 2 },
  thFixo: { textAlign: 'left', zIndex: 3, position: 'sticky', top: 0 },

  trPar:  { backgroundColor: '#fff' },
  trImpar:{ backgroundColor: '#f9fafb' },

  td:     { padding: '8px 12px', color: '#374151', borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  tdFixo: { position: 'sticky', backgroundColor: 'inherit', zIndex: 1, borderRight: '1px solid #e5e7eb' },

  vazio:  { padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14, fontStyle: 'italic' },
};
