import { useState, useRef } from 'react';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import { doc, getDoc, getDocs, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import * as XLSX from 'xlsx';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES_NOME = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const tick = () => new Promise(r => setTimeout(r, 0));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converte qualquer valor de célula para número JS (suporta formato BR e EN) */
export function num(val) {
  if (typeof val === 'number') return isNaN(val) || val < 0 ? 0 : val;
  const str = String(val ?? '').trim().replace(/\s/g, '');
  if (!str || str === '-') return 0;

  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  let s = str;

  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot
      ? str.replace(/\./g, '').replace(',', '.')   // "3.456,78" → 3456.78
      : str.replace(/,/g, '');                      // "1,234.56" → 1234.56
  } else if (lastComma !== -1) {
    s = str.replace(',', '.');                      // "3456,78"  → 3456.78
  } else if (lastDot !== -1) {
    const after = str.substring(lastDot + 1);
    if (after.length === 3 && /^\d+$/.test(after) && /^\d/.test(str)) {
      s = str.replace(/\./g, '');                   // "58.936"   → 58936
    }
  }

  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? 0 : n;
}


/** Arredonda para 1 decimal (caixas) */
function r2(v) { return Math.round(v * 10) / 10; }

/**
 * Converte serial inteiro do Excel para { dia, mes, ano } em UTC.
 * Recebe o serial JÁ sem a parte fracionária (hora) — use Math.floor antes de chamar.
 * date1904=true → sistema de datas 1904 (Mac Excel): offset 24107 em vez de 25569.
 */
function serialParaYMD(serial, date1904 = false) {
  const offset = date1904 ? 24107 : 25569;
  const d = new Date((serial - offset) * 86400 * 1000);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth() + 1, ano: d.getUTCFullYear() };
}

/**
 * Interpreta a data da célula.
 * Aceita três formas:
 *   - Serial numérico do Excel  (ex: 46053.999 → 31/01/2026)
 *   - Texto DD/MM/AAAA          (ex: "31/01/2026" ou "31/01/2026 0:00:00")
 *   - Texto AAAA/MM/DD ou AAAA-MM-DD  (ex: "2026/01/31" — formato personalizado Excel)
 * Retorna { dia, mes, ano } ou null se inválido / mês futuro.
 *
 * date1904=true → sistema de datas 1904 (Mac Excel/Promax): offset 24107.
 * Math.floor no serial descarta a parte de hora (46053.999 → 46053 = 31/01/2026 00:00 UTC).
 */
function parseData(cell, date1904 = false) {
  let dia, mes, ano;

  if (typeof cell === 'number' && cell > 40000) {
    // Serial do Excel — Math.floor descarta a hora, evitando qualquer ambiguidade
    const { dia: d, mes: m, ano: a } = serialParaYMD(Math.floor(cell), date1904);
    dia = d; mes = m; ano = a;
  } else {
    const s = String(cell || '').trim();
    if (!s) return null;
    // Tenta DD/MM/AAAA primeiro
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m1) {
      dia = parseInt(m1[1]); mes = parseInt(m1[2]); ano = parseInt(m1[3]);
    } else {
      // Tenta AAAA/MM/DD ou AAAA-MM-DD (formato personalizado Excel "AAAA/MM/DD")
      const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (m2) { ano = parseInt(m2[1]); mes = parseInt(m2[2]); dia = parseInt(m2[3]); }
      else return null;
    }
  }

  if (mes < 1 || mes > 12 || ano < 2020) return null;

  // Rejeita meses futuros: dados de vendas são sempre históricos
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1; // 1–12
  if (ano > anoAtual || (ano === anoAtual && mes > mesAtual)) return null;

  return { dia, mes, ano };
}

function mesKey(ano, mes) { return `${ano}-${String(mes).padStart(2,'0')}`; }

/** Aplica Pareto e classifica em A / B / C */
export function calcularABC(produtos, campo) {
  const ordenados = [...(produtos || [])]
    .map(p => ({ ...p, _val: p[campo] ?? 0 }))
    .filter(p => p._val > 0)
    .sort((a, b) => b._val - a._val);

  const total = ordenados.reduce((s, p) => s + p._val, 0);
  let acum = 0;

  return ordenados.map((p, idx) => {
    const perc = total > 0 ? (p._val / total) * 100 : 0;
    acum += perc;
    return {
      ...p,
      _rank:          idx + 1,
      _percIndividual: Math.round(perc * 100) / 100,
      _percAcumulado:  Math.round(acum * 100) / 100,
      _curva: acum <= 80 ? 'A' : acum <= 95 ? 'B' : 'C',
    };
  });
}

/**
 * Decide qual mês usar pra gerar a `curva_abc` achatada (lida pela Nova NRI
 * e por outras telas operacionais).
 *
 * Regra do user:
 *   1. Se o mês atual está em `analise` (com produtos) → usa ele
 *   2. Senão, se o mês anterior está em `analise` → usa ele
 *   3. Senão, fallback pro mês mais recente importado
 *
 * Retorna a chave (YYYY-MM) ou null se `analise` estiver vazio.
 */
export function escolherMesParaCurvaAchatada(analise) {
  if (!analise || typeof analise !== 'object') return null;
  const chaves = Object.keys(analise).sort();
  if (chaves.length === 0) return null;

  const hoje      = new Date();
  const atual     = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const dataAnt   = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const anterior  = `${dataAnt.getFullYear()}-${String(dataAnt.getMonth() + 1).padStart(2, '0')}`;

  const temProdutos = (k) => analise[k] && Array.isArray(analise[k].produtos) && analise[k].produtos.length > 0;
  if (temProdutos(atual))    return atual;
  if (temProdutos(anterior)) return anterior;
  return chaves[chaves.length - 1]; // fallback: mais recente importado
}

/** Apaga todos os documentos de uma coleção em lotes de 450 */
async function limparColecao(nomeColecao, col, db) {
  const snap = await getDocs(col(nomeColecao));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ImportarRelatorio() {
  return (
    <div style={{ maxWidth: 900 }}>
      <Importar030236 />
    </div>
  );
}

// ─── Subcomponente: aba 03.02.36.08 (lógica original) ─────────────────────────

function Importar030236() {
  const { col, colRevenda, docRef, db, stamp, rid } = useDb();
  const [analise,    setAnalise]    = useState(null);   // dados processados do arquivo
  const [mesesSel,   setMesesSel]   = useState({});     // { 'YYYY-MM': true/false }
  const [buscaVerif, setBuscaVerif] = useSessionFilter('imprlt:busca', '');
  const [progresso,  setProgresso]  = useState(null);   // { pct, etapa }
  const [avisos,     setAvisos]     = useState([]);
  const [resultado,  setResultado]  = useState(null);
  const [importando, setImportando] = useState(false);
  const [limpando,   setLimpando]   = useState(false);
  const [diagLinhas, setDiagLinhas] = useState(null);   // primeiras linhas do arquivo
  const [date1904,   setDate1904]   = useState(false);  // sistema de datas do workbook
  const rowsRef = useRef(null);                          // todas as linhas brutas para diagnóstico

  function prog(pct, etapa) { setProgresso({ pct, etapa }); }

  // ── Selecionar / desselecionar meses ────────────────────────────────────────
  function toggleMes(k)       { setMesesSel(prev => ({ ...prev, [k]: !prev[k] })); }
  function selecionarTodos(v) { setMesesSel(prev => Object.fromEntries(Object.keys(prev).map(k => [k, v]))); }

  // ── Apagar todos os dados da Curva ABC no Firebase ──────────────────────────
  async function apagarTudo() {
    if (!window.confirm('Apagar TODOS os dados da Curva ABC no Firebase? Esta ação não pode ser desfeita.')) return;
    setLimpando(true);
    try {
      prog(0, 'Apagando dados mensais...');
      await limparColecao('curva_abc_mensal', colRevenda, db);
      prog(50, 'Apagando índice de meses...');
      await deleteDoc(docRef('curva_abc_meta', rid || 'global'));
      prog(75, 'Apagando curva ABC do módulo NRI...');
      await limparColecao('curva_abc', colRevenda, db);
      prog(100, '✅ Todos os dados foram apagados!');
      setTimeout(() => setProgresso(null), 2000);
    } catch (err) {
      alert('Erro ao apagar: ' + err.message);
      setProgresso(null);
    }
    setLimpando(false);
  }

  // ── Processar arquivo selecionado ────────────────────────────────────────────
  async function processarArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';                         // permite reimportar o mesmo arquivo
    setAnalise(null); setMesesSel({}); setAvisos([]); setResultado(null); setDiagLinhas(null); setDate1904(false);
    rowsRef.current = null;
    prog(0, 'Lendo arquivo...');

    const reader = new FileReader();
    reader.onprogress = ev => {
      if (ev.lengthComputable)
        prog(Math.min(18, Math.round((ev.loaded / ev.total) * 18)),
          `Lendo... ${Math.round(ev.loaded / 1024)} KB`);
    };

    reader.onload = async evt => {
      try {
        prog(20, 'Decodificando planilha...'); await tick();

        // SEM cellDates: evita que o SheetJS converta strings "03/02" como MM/DD (formato americano)
        // → datas texto ficam como string e nosso regex DD/MM/AAAA as lê corretamente
        // → datas reais do Excel (serial numérico) são convertidas manualmente em parseData()
        const wb         = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const isDate1904 = !!(wb.Workbook?.WBProps?.date1904);  // Mac Excel / Promax usa sistema 1904
        setDate1904(isDate1904);
        const sheet = wb.Sheets[wb.SheetNames[0]];

        // Limita até a coluna AC (índice 28)
        if (sheet['!ref']) {
          const range = XLSX.utils.decode_range(sheet['!ref']);
          range.e.c = Math.min(range.e.c, 28);
          sheet['!ref'] = XLSX.utils.encode_range(range);
        }

        const rows       = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
        rowsRef.current  = rows;                         // guarda para diagnóstico
        const totalLinhas = rows.length - 1;

        // ── Diagnóstico: primeiras 10 linhas (colunas B, T, U, AA, AC) ──
        const diag = [];
        for (let i = 0; i < rows.length && diag.length < 11; i++) {
          const r = rows[i];
          if (!r || r.every(c => c === '' || c === null || c === undefined)) continue;
          // Extrai apenas as colunas relevantes: B=1, T=19, U=20, AA=26, AC=28
          diag.push({
            rowIdx: i,
            isCab:  i === 0,
            cols: [r[1], r[19], r[20], r[26], r[28]].map((v, ci) => {
              let txt;
              if (v instanceof Date) {
                txt = v.toLocaleDateString('pt-BR');
              } else if (ci === 0 && typeof v === 'number' && v > 40000) {
                // Coluna B: serial do Excel → converte para DD/MM/AAAA legível
                const { dia, mes, ano } = serialParaYMD(Math.floor(v), isDate1904);
                txt = `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`;
              } else {
                txt = String(v ?? '');
              }
              return {
                raw:  v,
                tipo: v instanceof Date ? 'Date' : typeof v,
                txt,
                numInterpretado: ci === 3 ? num(v) : null, // só AA (índice 3 aqui) é numérico
              };
            }),
          });
        }
        setDiagLinhas(diag);

        prog(38, `Processando ${totalLinhas.toLocaleString('pt-BR')} linhas...`); await tick();

        // ── Acumulação por mês/produto ──
        // Estrutura: { 'YYYY-MM': { codigoProduto: { codigo, nome, cxTotal, diasSet } } }
        const mesesData  = {};
        const erros      = [];
        let   validas    = 0;
        const CHUNK      = 3000;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

          // B=data  T=código  U=descrição  AA=qtd cx  AC=palete fechado ("Sim"/"Não")
          const dataCell      = row[1];                                       // coluna B
          const codigo        = String(row[19] ?? '').trim();                 // coluna T
          const nome          = String(row[20] ?? '').trim();                 // coluna U
          const qtdCx         = num(row[26]);                                 // coluna AA
          const paleteFechado = String(row[28] ?? '').trim().toLowerCase() === 'sim'; // coluna AC

          if (!codigo || !nome) continue;

          const dp = parseData(dataCell, isDate1904);
          if (!dp) {
            erros.push(`Linha ${i + 1}: data inválida "${dataCell}" (cód. ${codigo})`);
            continue;
          }

          if (qtdCx <= 0) {
            erros.push(`Linha ${i + 1}: qtd caixas = 0 para ${codigo}`);
            continue;
          }

          const chave = mesKey(dp.ano, dp.mes);
          if (!mesesData[chave]) mesesData[chave] = {};
          if (!mesesData[chave][codigo]) {
            mesesData[chave][codigo] = {
              codigo, nome,
              cxTotal: 0, cxFechado: 0, cxAberto: 0,
              diasSet: new Set(),
            };
          }

          const prod = mesesData[chave][codigo];
          prod.cxTotal += qtdCx;

          if (paleteFechado) {
            prod.cxFechado += qtdCx; // AC = "Sim" → Estoque
          } else {
            prod.cxAberto  += qtdCx; // AC = "Não" → Picking
          }

          prod.diasSet.add(`${dp.ano}-${String(dp.mes).padStart(2,'0')}-${String(dp.dia).padStart(2,'0')}`); // "AAAA-MM-DD" → chave única por dia
          validas++;

          if (i % CHUNK === 0) {
            prog(38 + Math.round(((i - 1) / totalLinhas) * 30),
              `Processando... ${i.toLocaleString('pt-BR')} / ${totalLinhas.toLocaleString('pt-BR')} linhas`);
            await tick();
          }
        }

        if (validas === 0) {
          setProgresso(null);
          alert('Nenhuma linha válida encontrada.\nVerifique: B=data (DD/MM/AAAA), T=código, U=descrição, AA=qtd caixas, AC=palete fechado (Sim/Não).');
          return;
        }

        prog(70, 'Calculando Curva ABC...'); await tick();

        // ── Monta estrutura final por mês ──
        const resultado = {};
        for (const [chave, prodMap] of Object.entries(mesesData)) {
          const [anoStr, mesStr] = chave.split('-');
          const produtos = Object.values(prodMap)
            .map(p => ({
              codigo:        p.codigo,
              nome:          p.nome,
              cxTotal:       r2(p.cxTotal),   // Armazém: todos os valores de AA
              cxAberto:      r2(p.cxAberto),  // Picking: AA onde AC = "Não"
              cxFechado:     r2(p.cxFechado), // Estoque: AA onde AC = "Sim"
              diasComVendas: p.diasSet.size,
            }))
            .filter(p => p.cxTotal > 0);

          resultado[chave] = {
            ano:           parseInt(anoStr),
            mes:           parseInt(mesStr),
            produtos,
            totalProdutos: produtos.length,
            totalCx:       r2(produtos.reduce((s, p) => s + p.cxTotal, 0)),
            importadoEm:   new Date().toISOString(),
          };
        }

        prog(80, `✓ ${Object.keys(resultado).length} mês/meses detectado(s)`);
        setAnalise(resultado);
        const sel = {};
        Object.keys(resultado).forEach(k => { sel[k] = true; });
        setMesesSel(sel);
        if (erros.length) setAvisos(erros.slice(0, 8));

      } catch (err) {
        setProgresso(null);
        alert('Erro ao processar arquivo: ' + err.message);
      }
    };

    reader.onerror = () => { setProgresso(null); alert('Erro ao ler arquivo.'); };
    reader.readAsArrayBuffer(file);
  }

  // ── Confirmar importação no Firebase ────────────────────────────────────────
  async function importar() {
    if (!analise) return;
    const chaves = Object.keys(analise).filter(k => mesesSel[k]).sort();
    if (!chaves.length) { alert('Selecione ao menos um mês.'); return; }

    setImportando(true);
    try {
      // 1. Salva cada mês selecionado
      for (let i = 0; i < chaves.length; i++) {
        const k = chaves[i];
        prog(80 + Math.round(((i + 1) / chaves.length) * 8),
          `Salvando ${k}... (${i + 1}/${chaves.length})`);
        await setDoc(docRef('curva_abc_mensal', `${rid || 'global'}_${k}`), { ...analise[k], ...stamp() });
      }

      // 2. Atualiza índice de meses
      prog(90, 'Atualizando índice...');
      const metaDocId  = rid || 'global';
      const snapIdx    = await getDoc(docRef('curva_abc_meta', metaDocId));
      const existentes = snapIdx.exists() ? (snapIdx.data().meses || []) : [];
      await setDoc(docRef('curva_abc_meta', metaDocId),
        { meses: [...new Set([...existentes, ...chaves])].sort() });

      // 3. Atualiza curva_abc (usada pelo módulo de Recebimento de NRI)
      //    Regra do user: prioridade mês atual → mês anterior → mais recente
      //    importado (fallback). Pareto sobre cxTotal.
      const mesEscolhido = escolherMesParaCurvaAchatada(analise);
      const curvaPorCx = mesEscolhido
        ? calcularABC(analise[mesEscolhido].produtos, 'cxTotal')
        : [];

      prog(93, 'Limpando curva ABC do módulo NRI...');
      await limparColecao('curva_abc', colRevenda, db);

      prog(95, 'Gravando nova curva ABC...');
      for (let i = 0; i < curvaPorCx.length; i += 450) {
        const batch = writeBatch(db);
        curvaPorCx.slice(i, i + 450).forEach(p =>
          batch.set(doc(col('curva_abc')), { codigo: p.codigo, curva: p._curva, ...stamp() })
        );
        await batch.commit();
        prog(95 + Math.round(((i / curvaPorCx.length) * 4)), 'Gravando curva ABC...');
      }

      prog(100, '✅ Importação concluída!');
      setResultado({ meses: chaves.length, total: chaves.reduce((s, k) => s + analise[k].totalProdutos, 0) });
      setAnalise(null);
      setTimeout(() => setProgresso(null), 2500);
    } catch (err) {
      setProgresso(prev => prev ? { ...prev, etapa: '❌ Erro: ' + err.message } : null);
      alert('Erro ao salvar: ' + err.message);
    }
    setImportando(false);
  }

  // ── Dados derivados ──────────────────────────────────────────────────────────
  const mesesLista  = analise ? Object.entries(analise).sort((a, b) => a[0].localeCompare(b[0])) : [];
  const processando = progresso !== null && progresso.pct < 80;
  const nSel        = Object.values(mesesSel).filter(Boolean).length;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ color: '#333', marginBottom: 4 }}>📥 Importar Relatório — Curva ABC</h2>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
        Formato Promax (1ª linha = cabeçalho):{' '}
        <strong>B</strong> Data · <strong>T</strong> Código · <strong>U</strong> Descrição ·{' '}
        <strong>AA</strong> Qtd Caixas · <strong>AC</strong> Palete Fechado (Sim/Não)
      </p>

      {/* ── Botão apagar tudo ── */}
      <div style={{ backgroundColor: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontWeight: '600', color: '#991b1b', margin: 0, fontSize: 14 }}>🗑️ Apagar todos os dados da Curva ABC</p>
          <p style={{ color: '#b91c1c', fontSize: 12, margin: '2px 0 0' }}>Remove todos os meses importados e a classificação ABC do módulo NRI.</p>
        </div>
        <button onClick={apagarTudo} disabled={limpando || importando}
          style={{ padding: '8px 18px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13, opacity: limpando ? 0.6 : 1 }}>
          {limpando ? 'Apagando...' : 'Apagar tudo'}
        </button>
      </div>

      {/* ── Área de importação ── */}
      <div style={estilos.secao}>
        <h3 style={estilos.titulo}>📂 Selecionar Arquivo</h3>

        <div style={{ backgroundColor: '#f9f9f9', border: '2px dashed #ddd', borderRadius: 10, padding: 28, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
          <p style={{ color: '#555', fontWeight: '500', marginBottom: 4 }}>Selecione o arquivo de vendas (.xlsx, .xls, .csv)</p>
          <p style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>Relatório Promax — 1ª linha = cabeçalho. Colunas: B=Data · T=Código · U=Descrição · AA=Qtd Caixas · AC=Palete Fechado (Sim/Não)</p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={processarArquivo}
            disabled={processando || limpando}
            style={{ fontSize: 14, cursor: 'pointer' }} />
        </div>

        {/* ── Diagnóstico visual ── */}
        {diagLinhas && (
          <div style={{ marginBottom: 16, overflowX: 'auto' }}>
            <p style={{ fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 }}>
              🔬 Primeiras linhas lidas do arquivo — confira se as colunas estão corretas
            </p>
            <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>
                  <th style={estilos.thD}>Linha</th>
                  {['B — Data','T — Código','U — Descrição','AA — Qtd Cx','AC — Plt Fechado'].map(h =>
                    <th key={h} style={estilos.thD}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {diagLinhas.map((linha, li) => (
                  <tr key={li} style={{ backgroundColor: linha.isCab ? '#fff9e6' : li % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...estilos.tdD, color: '#aaa' }}>{linha.isCab ? '(cab.)' : linha.rowIdx + 1}</td>
                    {linha.cols.map((c, ci) => (
                      <td key={ci} style={{
                        ...estilos.tdD,
                        color: c.tipo === 'number' ? '#166534' : c.tipo === 'Date' ? '#1e40af' : '#374151',
                        fontWeight: ci === 3 ? '700' : '400',
                      }}>
                        {c.txt || <em style={{ color: '#ccc' }}>vazio</em>}
                        <span style={{ display: 'block', fontSize: 9, color: '#aaa' }}>{c.tipo}</span>
                        {c.numInterpretado !== null && !linha.isCab && (
                          <span style={{ display: 'block', fontSize: 10, color: '#E31837', fontWeight: 'bold', borderTop: '1px dotted #ccc', marginTop: 2, paddingTop: 2 }}>
                            → {c.numInterpretado.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              ■ verde = número · ■ azul = data · ■ preto = texto · A seta "→" mostra o valor que será somado na coluna D
            </div>
            <div style={{ fontSize: 11, marginTop: 4, padding: '3px 8px', display: 'inline-block', borderRadius: 4,
              backgroundColor: date1904 ? '#fef3c7' : '#f0fdf4', border: `1px solid ${date1904 ? '#f59e0b' : '#86efac'}`,
              color: date1904 ? '#92400e' : '#166534' }}>
              {date1904
                ? '⚠️ Sistema de datas 1904 (Mac/Promax) detectado — offset 24107 aplicado'
                : '✅ Sistema de datas 1900 (padrão Windows) — offset 25569 aplicado'}
            </div>
          </div>
        )}

        {/* ── Barra de progresso ── */}
        {progresso !== null && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: '#555' }}>{progresso.etapa}</span>
              <span style={{ fontSize: 14, fontWeight: 'bold', color: progresso.pct === 100 ? '#22c55e' : '#E31837' }}>
                {progresso.pct}%
              </span>
            </div>
            <div style={{ height: 10, backgroundColor: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progresso.pct}%`, borderRadius: 99,
                backgroundColor: progresso.pct === 100 ? '#22c55e' : progresso.pct >= 80 ? '#1D5A9E' : '#E31837',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* ── Avisos de linhas ignoradas ── */}
        {avisos.length > 0 && (
          <div style={{ backgroundColor: '#FFF3CD', border: '1px solid #FFECB5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <p style={{ fontWeight: '600', color: '#856404', marginBottom: 4, fontSize: 13 }}>⚠️ {avisos.length} linha(s) ignoradas</p>
            {avisos.map((a, i) => <p key={i} style={{ color: '#856404', fontSize: 12, margin: '2px 0' }}>{a}</p>)}
          </div>
        )}

        {/* ── Lista de meses detectados ── */}
        {mesesLista.length > 0 && (
          <>
            {/* Cabeçalho + seleção */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: '600', color: '#333', margin: 0 }}>
                {mesesLista.length} mês/meses no arquivo —{' '}
                <span style={{ color: '#E31837' }}>{nSel} selecionado(s) para importar</span>
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => selecionarTodos(true)}  style={estilos.btnVerde}>✓ Todos</button>
                <button onClick={() => selecionarTodos(false)} style={estilos.btnCinza}>✗ Nenhum</button>
              </div>
            </div>

            {/* Cards de meses */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 20 }}>
              {mesesLista.map(([chave, dados]) => {
                const sel = !!mesesSel[chave];
                const abc = calcularABC(dados.produtos, 'cxTotal');
                const cA  = abc.filter(p => p._curva === 'A').length;
                const cB  = abc.filter(p => p._curva === 'B').length;
                const cC  = abc.filter(p => p._curva === 'C').length;
                return (
                  <div key={chave} onClick={() => toggleMes(chave)} style={{
                    borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer', userSelect: 'none',
                    border: `2px solid ${sel ? '#E31837' : '#ddd'}`,
                    backgroundColor: sel ? '#fff' : '#f9f9f9',
                    opacity: sel ? 1 : 0.5,
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 'bold', color: sel ? '#E31837' : '#aaa' }}>
                        {MESES_NOME[dados.mes - 1]} {dados.ano}
                      </span>
                      <span style={{
                        width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: sel ? '#E31837' : '#fff', border: `2px solid ${sel ? '#E31837' : '#ccc'}`,
                        fontSize: 11, color: '#fff', fontWeight: 'bold',
                      }}>{sel ? '✓' : ''}</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 'bold', color: '#333' }}>{dados.totalProdutos}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
                      SKUs · {dados.totalCx.toLocaleString('pt-BR')} cx
                      {dados.totalHL > 0 && ` · ${dados.totalHL.toLocaleString('pt-BR')} HL`}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                      {[['A','#22c55e',cA],['B','#f59e0b',cB],['C','#ef4444',cC]].map(([c,cor,n]) => (
                        <span key={c} style={{ backgroundColor: cor, color: '#fff', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 'bold' }}>
                          {c}: {n}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Verificador de produto ── */}
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 16, backgroundColor: '#fafafa' }}>
              <p style={{ fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 10 }}>
                🔍 Verificar produto (conferência antes de importar)
              </p>
              <input
                type="text"
                placeholder="Digite código ou nome do produto..."
                value={buscaVerif}
                onChange={e => setBuscaVerif(e.target.value.trim())}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }}
              />
              {buscaVerif && (() => {
                const q = buscaVerif.toLowerCase();
                const isExato = mesesLista.some(([, d]) =>
                  d.produtos.some(p => String(p.codigo).toLowerCase() === q)
                );
                const resultados = mesesLista.flatMap(([chave, dados]) => {
                  const prod = dados.produtos.find(p =>
                    String(p.codigo).toLowerCase() === q ||
                    p.nome?.toLowerCase().includes(q)
                  );
                  return prod ? [{ chave, mes: dados.mes, ano: dados.ano, prod }] : [];
                });

                if (!resultados.length) return <p style={{ color: '#aaa', fontSize: 13 }}>Produto não encontrado.</p>;

                return resultados.map(({ chave, mes, ano, prod }) => {
                  const abc  = calcularABC(analise[chave]?.produtos ?? [], 'cxTotal');
                  const rank = abc.find(p => p.codigo === prod.codigo);

                  // ── Diagnóstico linha a linha (mostra TODAS as linhas do código no arquivo inteiro) ──
                  // Formato Promax: AAAA-MM-DD — exibe apenas os 10 primeiros chars
                  function serialParaData(v) {
                    if (typeof v === 'number' && v > 40000) {
                      const { dia, mes, ano } = serialParaYMD(Math.floor(v), date1904);
                      return `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`;
                    }
                    return String(v ?? '').slice(0, 10);
                  }

                  const linhasBrutas = isExato && rowsRef.current
                    ? rowsRef.current.slice(1).reduce((acc, row, idx) => {
                        const cod = String(row[19] ?? '').trim(); // T = código
                        if (cod !== prod.codigo) return acc;
                        const dp         = parseData(row[1], date1904);     // B = data
                        const chaveLinha = dp ? mesKey(dp.ano, dp.mes) : null;
                        const qtdRaw     = row[26];              // coluna AA
                        const qtdParsed  = num(qtdRaw);
                        const estesMes   = chaveLinha === chave;
                        const pltFechado = String(row[28] ?? '').trim(); // coluna AC
                        acc.push({
                          linha:     idx + 2,
                          dataFmt:   serialParaData(row[1]),
                          dataRaw:   String(row[1] ?? ''),
                          dataTipo:  typeof row[1],            // 'number' | 'string' | 'object'
                          chaveLinha,
                          estesMes,
                          qtdRaw:    String(qtdRaw ?? ''),
                          qtdParsed,
                          pltFechado,
                          incluido:  estesMes && qtdParsed > 0,
                        });
                        return acc;
                      }, [])
                    : [];

                  const somaLinhas  = linhasBrutas.filter(r => r.incluido).reduce((s, r) => s + r.qtdParsed, 0);
                  const excluidas   = linhasBrutas.filter(r => !r.incluido);
                  const outrosMeses = linhasBrutas.filter(r => !r.estesMes).length;
                  const qtdZero     = linhasBrutas.filter(r => r.estesMes && r.qtdParsed <= 0).length;

                  return (
                    <div key={chave} style={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 14, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#E31837', marginRight: 8 }}>{prod.codigo}</span>
                          <span style={{ fontSize: 13, color: '#333' }}>{prod.nome}</span>
                        </div>
                        <span style={{ fontSize: 12, color: '#999' }}>{MESES_NOME[mes - 1]} {ano}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
                        <div><span style={{ color: '#888' }}>Total caixas: </span><strong style={{ color: '#E31837', fontSize: 15 }}>{prod.cxTotal.toLocaleString('pt-BR')}</strong></div>
                        <div><span style={{ color: '#888' }}>Dias c/ vendas: </span><strong>{prod.diasComVendas}</strong></div>
                        {rank && <>
                          <div><span style={{ color: '#888' }}>Posição: </span><strong>#{rank._rank}</strong></div>
                          <div><span style={{ color: '#888' }}>% acumulado: </span><strong>{rank._percAcumulado}%</strong></div>
                          <div><span style={{ color: '#888' }}>Curva: </span>
                            <span style={{ backgroundColor: rank._curva==='A'?'#22c55e':rank._curva==='B'?'#f59e0b':'#ef4444', color:'#fff', padding:'1px 10px', borderRadius:10, fontWeight:'bold' }}>
                              {rank._curva}
                            </span>
                          </div>
                        </>}
                      </div>

                      {/* ── Tabela de linhas brutas ── */}
                      {linhasBrutas.length > 0 && (
                        <details style={{ marginTop: 8 }}>
                          <summary style={{ fontSize: 12, cursor: 'pointer', color: '#1D5A9E', fontWeight: '600', marginBottom: 6 }}>
                            🔬 {linhasBrutas.length} linhas no arquivo · {linhasBrutas.filter(r => r.incluido).length} incluídas · Soma: {Math.round(somaLinhas * 10) / 10} cx
                            {outrosMeses > 0 && <span style={{ color: '#888', marginLeft: 8 }}>· {outrosMeses} de outros meses (normal)</span>}
                            {qtdZero > 0 && <span style={{ color: '#E31837', marginLeft: 8 }}>⚠️ {qtdZero} com qtd = 0 (ignoradas)</span>}
                          </summary>
                          <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#1a1a2e', color: '#fff', position: 'sticky', top: 0 }}>
                                  <th style={estilos.thD}>Linha</th>
                                  <th style={estilos.thD}>Data (B)</th>
                                  <th style={estilos.thD}>Qtd AA (bruto)</th>
                                  <th style={estilos.thD}>Lido como</th>
                                  <th style={estilos.thD}>Plt Fech (AC)</th>
                                  <th style={estilos.thD}>Tipo / Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {linhasBrutas.map((r, ri) => {
                                  const isSim = r.pltFechado?.toLowerCase() === 'sim';
                                  const tipoLabel = !r.incluido
                                    ? (!r.estesMes ? '↩ outro mês' : '✗ qtd = 0')
                                    : isSim ? '📦 Estoque' : '🛒 Picking';
                                  const tipoColor = !r.incluido
                                    ? (!r.estesMes ? '#aaa' : '#dc2626')
                                    : isSim ? '#7c3aed' : '#166534';
                                  return (
                                    <tr key={ri} style={{ backgroundColor: r.incluido ? (ri%2===0?'#fff':'#fafafa') : r.estesMes ? '#fff5f5' : '#f5f5f5' }}>
                                      <td style={{ ...estilos.tdD, color: '#aaa' }}>{r.linha}</td>
                                      <td style={estilos.tdD}>
                                        <div>{r.dataFmt}</div>
                                        <div style={{ fontSize: 9, color: '#aaa', fontFamily: 'monospace' }}>
                                          {r.dataTipo}: {r.dataRaw.length > 24 ? r.dataRaw.slice(0,24) + '…' : r.dataRaw}
                                        </div>
                                      </td>
                                      <td style={{ ...estilos.tdD, fontFamily: 'monospace', color: '#555' }}>{r.qtdRaw || <em style={{color:'#ccc'}}>vazio</em>}</td>
                                      <td style={{ ...estilos.tdD, fontWeight: 'bold', color: r.incluido ? '#166534' : '#dc2626' }}>
                                        {r.qtdParsed}
                                      </td>
                                      <td style={{ ...estilos.tdD, color: isSim ? '#7c3aed' : '#166534', fontWeight: 'bold' }}>
                                        {r.pltFechado || <em style={{color:'#ccc'}}>—</em>}
                                      </td>
                                      <td style={{ ...estilos.tdD, color: tipoColor, fontWeight: '600' }}>
                                        {tipoLabel}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ backgroundColor: '#f0f4ff', fontWeight: 'bold' }}>
                                  <td colSpan={3} style={{ ...estilos.tdD, textAlign: 'right', color: '#333' }}>TOTAL:</td>
                                  <td style={{ ...estilos.tdD, color: '#E31837', fontWeight: 'bold' }}>{Math.round(somaLinhas * 10) / 10}</td>
                                  <td colSpan={2} style={estilos.tdD}>{linhasBrutas.filter(r => r.incluido).length} linhas incluídas</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            <div style={{ backgroundColor: '#E8F4FD', border: '1px solid #B8D9F5', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#1a4a7a' }}>
              ℹ️ A curva ABC do mês mais recente selecionado será aplicada ao módulo de Recebimento de NRIs (classificação por caixas).
            </div>

            <button onClick={importar} disabled={importando || nSel === 0}
              style={{ ...estilos.btnPrimario, width: '100%', padding: 14, fontSize: 15, opacity: (importando || nSel === 0) ? 0.5 : 1 }}>
              {importando ? 'Salvando no Firebase...' : `📥 Confirmar Importação (${nSel} de ${mesesLista.length} mês/meses)`}
            </button>
          </>
        )}

        {resultado && (
          <div style={{ backgroundColor: '#E1F5EE', borderRadius: 8, padding: 16, marginTop: 16, textAlign: 'center', color: '#085041', fontWeight: '500' }}>
            ✅ {resultado.meses} mês/meses importados · {resultado.total} SKUs · Curva ABC atualizada no módulo NRI!
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = {
  secao:     { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  titulo:    { margin: '0 0 16px', fontSize: 15, fontWeight: '600', color: '#333' },
  btnPrimario: { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  btnVerde:  { fontSize: 12, padding: '4px 10px', border: '1px solid #22c55e', color: '#22c55e', backgroundColor: '#fff', borderRadius: 6, cursor: 'pointer' },
  btnCinza:  { fontSize: 12, padding: '4px 10px', border: '1px solid #aaa',    color: '#888',    backgroundColor: '#fff', borderRadius: 6, cursor: 'pointer' },
  thD: { padding: '5px 8px', border: '1px solid #333', fontSize: 10, whiteSpace: 'nowrap', color: '#fff' },
  tdD: { padding: '4px 8px', border: '1px solid #e5e7eb', fontSize: 11, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' },
};
