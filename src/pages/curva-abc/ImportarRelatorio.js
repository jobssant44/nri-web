import { useState, useRef } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
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

/** Converte HL: igual a num() mas nunca aplica a regra de "3 dígitos = milhar"
 *  Ex: "6,21" → 6.21 | "1.234" → 1.234 (não 1234, pois HL é sempre decimal pequeno) */
export function numHL(val) {
  if (typeof val === 'number') return isNaN(val) || val < 0 ? 0 : val;
  const str = String(val ?? '').trim().replace(/\s/g, '');
  if (!str || str === '-') return 0;
  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  let s = str;
  if (lastComma !== -1 && lastDot !== -1) {
    // Dois separadores: identifica qual é decimal
    s = lastComma > lastDot
      ? str.replace(/\./g, '').replace(',', '.')   // "1.234,56" → 1234.56
      : str.replace(/,/g, '');                      // "1,234.56" → 1234.56
  } else if (lastComma !== -1) {
    s = str.replace(',', '.');                      // "6,21" → 6.21
  }
  // Ponto simples: SEMPRE decimal (nunca milhar) para HL
  // "1.234" → 1.234  |  "6.21" → 6.21
  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? 0 : n;
}

/** Arredonda para 1 decimal (caixas) */
function r2(v) { return Math.round(v * 10) / 10; }
/** Arredonda para 4 decimais (HL) */
function r4(v) { return Math.round(v * 10000) / 10000; }

/** Interpreta a data da célula — suporta serial Excel, Date, DD/MM/AAAA, AAAA-MM-DD */
function parseData(cell) {
  // Serial numérico do Excel (sem cellDates: coluna de data real vira número)
  // Serial 1 = 01/01/1900; época JS = 25569 dias depois de 01/01/1900
  if (typeof cell === 'number' && cell > 1) {
    const d = new Date(Math.round((cell - 25569) * 86400 * 1000));
    if (!isNaN(d)) return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
  }
  // Objeto Date (caso algum engine retorne Date mesmo sem cellDates)
  if (cell instanceof Date && !isNaN(cell)) {
    return { ano: cell.getUTCFullYear(), mes: cell.getUTCMonth() + 1 };
  }
  // String DD/MM/AAAA — formato brasileiro
  const s = String(cell || '').trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return { mes: parseInt(m1[2]), ano: parseInt(m1[3]) };
  // String AAAA-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return { ano: parseInt(m2[1]), mes: parseInt(m2[2]) };
  return null;
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

/** Apaga todos os documentos de uma coleção em lotes de 450 */
async function limparColecao(nomeColecao) {
  const snap = await getDocs(collection(db, nomeColecao));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

// ─── Subcomponente: aba 01.11 ─────────────────────────────────────────────────

function Importar0111() {
  const [produtos,   setProdutos]   = useState(null);   // array de { codigo, fatorHL, fatorPalete }
  const [progresso,  setProgresso]  = useState(null);   // { pct, etapa }
  const [resultado,  setResultado]  = useState(null);
  const [importando, setImportando] = useState(false);
  const [limpando,   setLimpando]   = useState(false);
  const [avisos,     setAvisos]     = useState([]);

  function prog(pct, etapa) { setProgresso({ pct, etapa }); }
  const processando = progresso !== null && progresso.pct < 80;

  // ── Apagar coleção produtos_fatores ─────────────────────────────────────────
  async function apagarTudo() {
    if (!window.confirm('Apagar TODOS os fatores de produtos do Firebase? Esta ação não pode ser desfeita.')) return;
    setLimpando(true);
    try {
      prog(0, 'Apagando dados...');
      await limparColecao('produtos_fatores');
      prog(100, '✅ Dados apagados!');
      setTimeout(() => setProgresso(null), 2000);
    } catch (err) {
      alert('Erro ao apagar: ' + err.message);
      setProgresso(null);
    }
    setLimpando(false);
  }

  // ── Processar arquivo ────────────────────────────────────────────────────────
  async function processarArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setProdutos(null); setAvisos([]); setResultado(null);
    prog(0, 'Lendo arquivo...');

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        prog(20, 'Decodificando planilha...'); await tick();

        const wb    = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];

        // Limita a 3 colunas (A-C)
        if (sheet['!ref']) {
          const range = XLSX.utils.decode_range(sheet['!ref']);
          range.e.c = Math.min(range.e.c, 2);
          sheet['!ref'] = XLSX.utils.encode_range(range);
        }

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
        prog(40, 'Processando linhas...'); await tick();

        const lista  = [];
        const erros  = [];

        // Começa da linha 1 (índice 1) — linha 0 é o cabeçalho
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

          const codigo      = String(row[0] ?? '').trim();
          const fatorHL     = num(row[1]);   // decimal BR: "0,621" → 0.621
          const fatorPalete = num(row[2]);   // caixas por palete (inteiro ou decimal)

          if (!codigo) continue;

          if (fatorPalete <= 0) {
            erros.push(`Linha ${i + 1}: fator de palete inválido para o código ${codigo}`);
            continue;
          }

          lista.push({ codigo, fatorHL, fatorPalete });
        }

        if (lista.length === 0) {
          setProgresso(null);
          alert('Nenhum produto válido encontrado.\nVerifique: A=Código · B=Fator HL · C=Fator Palete (caixas/palete).');
          return;
        }

        prog(80, `✓ ${lista.length} produtos detectados`);
        setProdutos(lista);
        if (erros.length) setAvisos(erros.slice(0, 8));
        setTimeout(() => setProgresso(null), 800);

      } catch (err) {
        setProgresso(null);
        alert('Erro ao processar arquivo: ' + err.message);
      }
    };
    reader.onerror = () => { setProgresso(null); alert('Erro ao ler arquivo.'); };
    reader.readAsArrayBuffer(file);
  }

  // ── Confirmar importação ─────────────────────────────────────────────────────
  async function importar() {
    if (!produtos?.length) return;
    setImportando(true);
    try {
      prog(80, 'Limpando coleção anterior...');
      await limparColecao('produtos_fatores');

      prog(88, 'Gravando produtos...');
      const CHUNK = 450;
      for (let i = 0; i < produtos.length; i += CHUNK) {
        const batch = writeBatch(db);
        produtos.slice(i, i + CHUNK).forEach(p =>
          batch.set(doc(db, 'produtos_fatores', p.codigo), {
            codigo:      p.codigo,
            fatorHL:     p.fatorHL,
            fatorPalete: p.fatorPalete,
          })
        );
        await batch.commit();
        prog(88 + Math.round(((i + CHUNK) / produtos.length) * 11), 'Gravando...');
      }

      prog(100, '✅ Importação concluída!');
      setResultado(produtos.length);
      setProdutos(null);
      setTimeout(() => setProgresso(null), 2500);
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
      setProgresso(null);
    }
    setImportando(false);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ color: '#333', marginBottom: 4 }}>📥 Importar Relatório — 01.11</h2>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
        Colunas esperadas (1ª linha = cabeçalho):{' '}
        <strong>A</strong> Código do Produto ·{' '}
        <strong>B</strong> Fator HL ·{' '}
        <strong>C</strong> Fator de Palete (caixas/palete)
      </p>

      {/* ── Botão apagar tudo ── */}
      <div style={{ backgroundColor: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontWeight: '600', color: '#991b1b', margin: 0, fontSize: 14 }}>🗑️ Apagar todos os fatores de produtos</p>
          <p style={{ color: '#b91c1c', fontSize: 12, margin: '2px 0 0' }}>Remove toda a coleção <code>produtos_fatores</code> do Firebase.</p>
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
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <p style={{ color: '#555', fontWeight: '500', marginBottom: 4 }}>Selecione o arquivo 01.11 (.xlsx, .xls, .csv)</p>
          <p style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>
            A planilha deve ter cabeçalho na 1ª linha. Colunas: A=Código · B=Fator HL · C=Fator Palete
          </p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={processarArquivo}
            disabled={processando || limpando}
            style={{ fontSize: 14, cursor: 'pointer' }} />
        </div>

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

        {/* ── Avisos ── */}
        {avisos.length > 0 && (
          <div style={{ backgroundColor: '#FFF3CD', border: '1px solid #FFECB5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <p style={{ fontWeight: '600', color: '#856404', marginBottom: 4, fontSize: 13 }}>⚠️ {avisos.length} linha(s) ignoradas</p>
            {avisos.map((a, i) => <p key={i} style={{ color: '#856404', fontSize: 12, margin: '2px 0' }}>{a}</p>)}
          </div>
        )}

        {/* ── Preview dos produtos carregados ── */}
        {produtos && produtos.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: '600', color: '#333', margin: 0 }}>
                ✅ <span style={{ color: '#E31837' }}>{produtos.length} produtos</span> prontos para importar
              </p>
            </div>

            {/* Tabela preview (primeiros 10) */}
            <div style={{ overflowX: 'auto', marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>
                    <th style={estilos.thD}>Código</th>
                    <th style={estilos.thD}>Fator HL</th>
                    <th style={estilos.thD}>Fator Palete (cx/plt)</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.slice(0, 10).map((p, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...estilos.tdD, fontFamily: 'monospace', fontWeight: 'bold', color: '#E31837' }}>{p.codigo}</td>
                      <td style={{ ...estilos.tdD, color: '#1D5A9E' }}>{p.fatorHL.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 6 })}</td>
                      <td style={{ ...estilos.tdD, fontWeight: '600' }}>{p.fatorPalete.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                  {produtos.length > 10 && (
                    <tr>
                      <td colSpan={3} style={{ ...estilos.tdD, textAlign: 'center', color: '#aaa', fontStyle: 'italic' }}>
                        ... e mais {produtos.length - 10} produto(s)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ backgroundColor: '#FFF3CD', border: '1px solid #FFECB5', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#856404' }}>
              ⚠️ A importação irá <strong>substituir todos</strong> os fatores existentes na coleção <code>produtos_fatores</code>.
            </div>

            <button onClick={importar} disabled={importando}
              style={{ ...estilos.btnPrimario, width: '100%', padding: 14, fontSize: 15, opacity: importando ? 0.5 : 1 }}>
              {importando ? 'Salvando no Firebase...' : `📥 Confirmar Importação (${produtos.length} produtos)`}
            </button>
          </>
        )}

        {resultado && (
          <div style={{ backgroundColor: '#E1F5EE', borderRadius: 8, padding: 16, marginTop: 16, textAlign: 'center', color: '#085041', fontWeight: '500' }}>
            ✅ {resultado} produtos importados com sucesso! Coleção <code>produtos_fatores</code> atualizada.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ImportarRelatorio() {
  const [abaAtiva, setAbaAtiva] = useState('030236');  // '030236' | '0111'

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ── Navegação interna por abas ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
        {[
          { id: '030236', label: '📊 03.02.36.08' },
          { id: '0111',   label: '📋 01.11' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setAbaAtiva(id)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: abaAtiva === id ? '3px solid #E31837' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: abaAtiva === id ? '#E31837' : '#888',
              fontWeight: abaAtiva === id ? '700' : '500',
              fontSize: 14,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              transition: 'all .15s',
              marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Conteúdo da aba ── */}
      {abaAtiva === '0111' ? <Importar0111 /> : <Importar030236 />}
    </div>
  );
}

// ─── Subcomponente: aba 03.02.36.08 (lógica original) ─────────────────────────

function Importar030236() {
  const [analise,    setAnalise]    = useState(null);   // dados processados do arquivo
  const [mesesSel,   setMesesSel]   = useState({});     // { 'YYYY-MM': true/false }
  const [buscaVerif, setBuscaVerif] = useState('');
  const [progresso,  setProgresso]  = useState(null);   // { pct, etapa }
  const [avisos,     setAvisos]     = useState([]);
  const [resultado,  setResultado]  = useState(null);
  const [importando, setImportando] = useState(false);
  const [limpando,   setLimpando]   = useState(false);
  const [diagLinhas, setDiagLinhas] = useState(null);   // primeiras linhas do arquivo
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
      await limparColecao('curva_abc_mensal');
      prog(50, 'Apagando índice de meses...');
      await deleteDoc(doc(db, 'curva_abc_meta', 'indices'));
      prog(75, 'Apagando curva ABC do módulo NRI...');
      await limparColecao('curva_abc');
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
    setAnalise(null); setMesesSel({}); setAvisos([]); setResultado(null); setDiagLinhas(null);
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
        const wb    = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];

        // Limita a 6 colunas (A-F, índices 0-5)
        if (sheet['!ref']) {
          const range = XLSX.utils.decode_range(sheet['!ref']);
          range.e.c = Math.min(range.e.c, 5);
          sheet['!ref'] = XLSX.utils.encode_range(range);
        }

        const rows       = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
        rowsRef.current  = rows;                         // guarda para diagnóstico
        const totalLinhas = rows.length - 1;

        // ── Diagnóstico: primeiras 10 linhas ──
        const diag = [];
        for (let i = 0; i < rows.length && diag.length < 11; i++) {
          const r = rows[i];
          if (!r || r.every(c => c === '' || c === null || c === undefined)) continue;
          diag.push({
            rowIdx: i,
            isCab:  i === 0,
            cols: [r[0], r[1], r[2], r[3], r[4], r[5]].map((v, ci) => ({
              raw:  v,
              tipo: v instanceof Date ? 'Date' : typeof v,
              txt:  v instanceof Date ? v.toLocaleDateString('pt-BR')
                  : (typeof v === 'number' && ci === 0 && v > 1)
                    ? (() => { const d = new Date(Math.round((v-25569)*86400000)); return d.toLocaleDateString('pt-BR'); })()
                    : String(v ?? ''),
              numInterpretado: (ci === 3 || ci === 4 || ci === 5) ? num(v) : null,
            })),
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

          // A=data  B=código  C=descrição  D=qtd cx  E=flag palete fechado  F=HL
          const dataCell     = row[0];
          const codigo       = String(row[1] ?? '').trim();
          const nome         = String(row[2] ?? '').trim();
          const qtdCx        = num(row[3]);
          // Coluna E: flag — qualquer valor > 0 indica palete FECHADO (vai p/ Estoque)
          const paleteFechado = num(row[4]) > 0;
          // Coluna F: HL decimal (ex: "6,21" = 6.21) × 100
          const hlVendido     = numHL(row[5]) * 100;

          if (!codigo || !nome) continue;

          const dp = parseData(dataCell);
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
              hlTotal: 0, hlFechado: 0, hlAberto: 0,
              diasSet: new Set(),
            };
          }

          const prod = mesesData[chave][codigo];
          prod.cxTotal  += qtdCx;
          prod.hlTotal  += hlVendido;

          if (paleteFechado) {
            // Linha de palete FECHADO → Estoque
            prod.cxFechado += qtdCx;
            prod.hlFechado += hlVendido;
          } else {
            // Linha fracionada / picking → Picking
            prod.cxAberto  += qtdCx;
            prod.hlAberto  += hlVendido;
          }

          prod.diasSet.add(`${dp.ano}-${dp.mes}-${String(row[0]).slice(0,10)}`);
          validas++;

          if (i % CHUNK === 0) {
            prog(38 + Math.round(((i - 1) / totalLinhas) * 30),
              `Processando... ${i.toLocaleString('pt-BR')} / ${totalLinhas.toLocaleString('pt-BR')} linhas`);
            await tick();
          }
        }

        if (validas === 0) {
          setProgresso(null);
          alert('Nenhuma linha válida encontrada.\nVerifique: A=data, B=código, C=descrição, D=qtd caixas, E=palete fechado, F=HL.');
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
              // Caixas — acumulados diretamente por flag da col E
              cxTotal:       r2(p.cxTotal),
              cxFechado:     r2(p.cxFechado),
              cxAberto:      r2(p.cxAberto),
              // HL — acumulados diretamente por flag da col E
              hlTotal:       r4(p.hlTotal),
              hlFechado:     r4(p.hlFechado),
              hlAberto:      r4(p.hlAberto),
              diasComVendas: p.diasSet.size,
            }))
            .filter(p => p.cxTotal > 0);

          resultado[chave] = {
            ano:           parseInt(anoStr),
            mes:           parseInt(mesStr),
            produtos,
            totalProdutos: produtos.length,
            totalCx:       r2(produtos.reduce((s, p) => s + p.cxTotal, 0)),
            totalHL:       r4(produtos.reduce((s, p) => s + p.hlTotal, 0)),
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
        await setDoc(doc(db, 'curva_abc_mensal', k), analise[k]);
      }

      // 2. Atualiza índice de meses
      prog(90, 'Atualizando índice...');
      const snapIdx   = await getDoc(doc(db, 'curva_abc_meta', 'indices'));
      const existentes = snapIdx.exists() ? (snapIdx.data().meses || []) : [];
      await setDoc(doc(db, 'curva_abc_meta', 'indices'),
        { meses: [...new Set([...existentes, ...chaves])].sort() });

      // 3. Atualiza curva_abc (usada pelo módulo de Recebimento de NRI)
      //    Usa o mês mais recente dos importados, classificação por cxTotal (Pareto)
      const mesRecente = chaves[chaves.length - 1];
      const curvaPorCx = calcularABC(analise[mesRecente].produtos, 'cxTotal');

      prog(93, 'Limpando curva ABC do módulo NRI...');
      await limparColecao('curva_abc');

      prog(95, 'Gravando nova curva ABC...');
      for (let i = 0; i < curvaPorCx.length; i += 450) {
        const batch = writeBatch(db);
        curvaPorCx.slice(i, i + 450).forEach(p =>
          batch.set(doc(collection(db, 'curva_abc')), { codigo: p.codigo, curva: p._curva })
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
        Colunas esperadas (1ª linha = cabeçalho):{' '}
        <strong>A</strong> Data · <strong>B</strong> Código · <strong>C</strong> Descrição ·{' '}
        <strong>D</strong> Qtd Caixas/dia · <strong>E</strong> Palete Fechado (cx) · <strong>F</strong> HL vendido
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
          <p style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>A planilha deve ter cabeçalho na 1ª linha. Colunas: A=Data · B=Código · C=Descrição · D=Qtd Caixas/dia · E=Palete Fechado (cx) · F=HL vendido</p>
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
                  {['A — Data','B — Código','C — Descrição','D — Qtd Cx','E — Plt Fechado','F — HL'].map(h =>
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
                  function serialParaData(v) {
                    if (v instanceof Date) return v.toLocaleDateString('pt-BR');
                    if (typeof v === 'number' && v > 1) {
                      const d = new Date(Math.round((v - 25569) * 86400000));
                      return isNaN(d) ? String(v) : d.toLocaleDateString('pt-BR');
                    }
                    return String(v ?? '').slice(0, 10);
                  }

                  const linhasBrutas = isExato && rowsRef.current
                    ? rowsRef.current.slice(1).reduce((acc, row, idx) => {
                        const cod = String(row[1] ?? '').trim();
                        if (cod !== prod.codigo) return acc;
                        const dp        = parseData(row[0]);
                        const chaveLinha = dp ? mesKey(dp.ano, dp.mes) : null;
                        const qtdRaw    = row[3];
                        const qtdParsed = num(qtdRaw);
                        const estesMes  = chaveLinha === chave;
                        acc.push({
                          linha:    idx + 2,
                          dataFmt:  serialParaData(row[0]),
                          dataRaw:  String(row[0] ?? ''),
                          chaveLinha,
                          estesMes,
                          qtdRaw:   String(qtdRaw ?? ''),
                          qtdParsed,
                          incluido: estesMes && qtdParsed > 0,
                        });
                        return acc;
                      }, [])
                    : [];

                  const somaLinhas     = linhasBrutas.filter(r => r.incluido).reduce((s, r) => s + r.qtdParsed, 0);
                  const excluidas      = linhasBrutas.filter(r => !r.incluido);
                  const outrosMeses    = excluidas.filter(r => r.chaveLinha && r.chaveLinha !== chave);
                  const somaOutros     = outrosMeses.reduce((s, r) => s + r.qtdParsed, 0);

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
                            🔬 {linhasBrutas.length} linhas lidas no arquivo · Soma: {Math.round(somaLinhas * 10) / 10} cx
                            {excluidas.length > 0 && <span style={{ color: '#E31837', marginLeft: 8 }}>⚠️ {excluidas.length} linha(s) com qtd = 0 (ignoradas)</span>}
                          </summary>
                          <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#1a1a2e', color: '#fff', position: 'sticky', top: 0 }}>
                                  <th style={estilos.thD}>Linha</th>
                                  <th style={estilos.thD}>Data</th>
                                  <th style={estilos.thD}>Col D (bruto)</th>
                                  <th style={estilos.thD}>Lido como</th>
                                  <th style={estilos.thD}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {linhasBrutas.map((r, ri) => (
                                  <tr key={ri} style={{ backgroundColor: r.incluido ? (ri%2===0?'#fff':'#fafafa') : '#fff5f5' }}>
                                    <td style={{ ...estilos.tdD, color: '#aaa' }}>{r.linha}</td>
                                    <td style={estilos.tdD}>{r.dataFmt}</td>
                                    <td style={{ ...estilos.tdD, fontFamily: 'monospace', color: '#555' }}>{r.qtdRaw || <em style={{color:'#ccc'}}>vazio</em>}</td>
                                    <td style={{ ...estilos.tdD, fontWeight: 'bold', color: r.incluido ? '#166534' : '#dc2626' }}>
                                      {r.qtdParsed}
                                    </td>
                                    <td style={{ ...estilos.tdD, color: r.incluido ? '#166534' : '#dc2626' }}>
                                      {r.incluido ? '✓ somado' : '✗ ignorado'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{ backgroundColor: '#f0f4ff', fontWeight: 'bold' }}>
                                  <td colSpan={3} style={{ ...estilos.tdD, textAlign: 'right', color: '#333' }}>TOTAL:</td>
                                  <td style={{ ...estilos.tdD, color: '#E31837', fontWeight: 'bold' }}>{Math.round(somaLinhas * 10) / 10}</td>
                                  <td style={estilos.tdD}>{linhasBrutas.filter(r => r.incluido).length} linhas incluídas</td>
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
