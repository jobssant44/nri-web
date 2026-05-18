import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { doc, writeBatch, getDocs, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useDb } from '../utils/db';

// Colunas usadas do relatório 01.11
// A=0, B=1, E=4, G=6, I=8, J=9, M=12, P=15, V=21, X=23
const COLUNAS = [
  { idx: 0,  campo: 'codigo',      label: 'Código',      tipo: 'texto' },
  { idx: 1,  campo: 'descricao',   label: 'Descrição',   tipo: 'texto' },
  { idx: 4,  campo: 'tipoMarca',   label: 'Tipo Marca',  tipo: 'texto' },
  { idx: 6,  campo: 'embalagem',   label: 'Embalagem',   tipo: 'texto' },
  { idx: 8,  campo: 'garrafeira',  label: 'Garrafeira',  tipo: 'texto' },
  { idx: 9,  campo: 'garrafa',     label: 'Garrafa',     tipo: 'texto' },
  { idx: 12, campo: 'peso',        label: 'Peso',        tipo: 'decimal' },
  { idx: 15, campo: 'hecto',       label: 'Hecto',       tipo: 'decimal' },
  { idx: 21, campo: 'paletizacao', label: 'Paletização', tipo: 'decimal' },
  { idx: 23, campo: 'lastro',      label: 'Lastro',      tipo: 'decimal' },
];

// Parser decimal seguro para formato brasileiro.
// Garante que "0,5664" → 0.5664 e não 5664.
function parseDecimal(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const str = String(val).trim().replace(/\s/g, '');
  if (!str) return null;
  if (str.includes(',')) {
    // Formato BR: ponto = milhar, vírgula = decimal
    const limpo = str.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(limpo);
    return isNaN(n) ? null : n;
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseTexto(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function mapearLinha(row) {
  const obj = {};
  COLUNAS.forEach(({ idx, campo, tipo }) => {
    obj[campo] = tipo === 'decimal' ? parseDecimal(row[idx]) : parseTexto(row[idx]);
  });
  return obj;
}

async function lerPlanilha(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export default function ConfiguracoesPage() {
  const { col, db } = useDb();
  const inputRef = useRef();

  const [preview,     setPreview]     = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [importando,  setImportando]  = useState(false);
  const [limpando,    setLimpando]    = useState(false);
  const [totalSalvo,  setTotalSalvo]  = useState(null);
  const [erro,        setErro]        = useState('');
  // Progresso 0..100 da operação em andamento (importação ou limpeza)
  const [progresso,   setProgresso]   = useState(0);
  const [progressoMsg, setProgressoMsg] = useState('');

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setTotalSalvo(null);
    setErro('');
    setPreview(null);
    try {
      const rows = await lerPlanilha(file);
      // Pula linha de cabeçalho (row 0)
      const dados = rows.slice(1)
        .map(mapearLinha)
        .filter(p => p.codigo && p.codigo !== '');
      if (dados.length === 0) { setErro('Nenhum produto encontrado. Verifique se o arquivo está correto.'); return; }
      setPreview(dados);
    } catch (err) {
      setErro('Erro ao ler o arquivo: ' + err.message);
    }
    e.target.value = '';
  }

  async function salvar() {
    if (!preview || preview.length === 0) return;
    setImportando(true);
    setErro('');
    setProgresso(0);
    setProgressoMsg('Iniciando...');
    try {
      const CHUNK = 450;
      let salvos = 0;
      for (let i = 0; i < preview.length; i += CHUNK) {
        const batch = writeBatch(db);
        const slice = preview.slice(i, i + CHUNK);
        slice.forEach(p => {
          batch.set(doc(col('produtos'), String(p.codigo)), p);
        });
        await batch.commit();
        salvos += slice.length;
        setProgresso(Math.round((salvos / preview.length) * 100));
        setProgressoMsg(`Salvando ${salvos} de ${preview.length} produtos...`);
      }
      setProgresso(100);
      setProgressoMsg('Finalizado');
      setTotalSalvo(preview.length);
      setPreview(null);
      setNomeArquivo('');
    } catch (err) {
      setErro('Erro ao salvar: ' + err.message);
    }
    setImportando(false);
  }

  async function limparCatalogo() {
    if (!window.confirm('Excluir todos os produtos do catálogo? Esta ação não pode ser desfeita.')) return;
    setLimpando(true);
    setErro('');
    setTotalSalvo(null);
    setProgresso(0);
    setProgressoMsg('Lendo catálogo atual...');
    try {
      const snap = await getDocs(col('produtos'));
      const total = snap.docs.length;
      if (total === 0) {
        setProgresso(100);
        setTotalSalvo(0);
        setLimpando(false);
        return;
      }
      const CHUNK = 450;
      let apagados = 0;
      for (let i = 0; i < total; i += CHUNK) {
        const batch = writeBatch(db);
        const slice = snap.docs.slice(i, i + CHUNK);
        slice.forEach(d => batch.delete(d.ref));
        await batch.commit();
        apagados += slice.length;
        setProgresso(Math.round((apagados / total) * 100));
        setProgressoMsg(`Excluindo ${apagados} de ${total} produtos...`);
      }
      setProgresso(100);
      setProgressoMsg('Finalizado');
      setTotalSalvo(0);
    } catch (err) {
      setErro('Erro ao limpar: ' + err.message);
    }
    setLimpando(false);
  }

  function cancelar() {
    setPreview(null);
    setNomeArquivo('');
    setErro('');
  }

  return (
    <div>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Configurações</h2>

      <div style={secao}>
        <h3 style={secaoTitulo}>Catálogo de Produtos — Importar 01.11</h3>
        <p style={{ fontSize: 13, color: '#888', marginTop: 0, marginBottom: 20 }}>
          Base de dados central dos produtos. Todos os módulos consultam este catálogo.<br />
          Os dados existentes serão substituídos pelos do arquivo importado.
        </p>

        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />

        {!preview && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => inputRef.current.click()} style={btnPrimario}>
              Selecionar arquivo 01.11
            </button>
            <button onClick={limparCatalogo} disabled={limpando} style={{ ...btnPerigo, opacity: limpando ? 0.6 : 1 }}>
              {limpando ? 'Excluindo...' : 'Limpar catálogo'}
            </button>
          </div>
        )}

        {erro && <div style={erroBox}>{erro}</div>}

        {/* Barra de progresso — visível durante salvar/limpar */}
        {(importando || limpando) && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>
                {limpando ? '⏳ Limpando catálogo...' : '⏳ Salvando catálogo...'}
              </span>
              <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{progresso}%</span>
            </div>
            <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progresso}%`,
                background: limpando ? '#6b7280' : '#E31837',
                transition: 'width 0.2s ease',
              }} />
            </div>
            {progressoMsg && (
              <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>{progressoMsg}</div>
            )}
          </div>
        )}

        {totalSalvo !== null && (
          <div style={okBox}>
            {totalSalvo === 0 ? '✓ Catálogo limpo com sucesso.' : `✓ ${totalSalvo} produtos salvos com sucesso!`}
          </div>
        )}

        {preview && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#555' }}>
                <strong style={{ color: '#333' }}>{preview.length}</strong> produtos lidos de{' '}
                <strong style={{ color: '#333' }}>{nomeArquivo}</strong>
              </span>
              <button onClick={salvar} disabled={importando} style={{ ...btnPrimario, opacity: importando ? 0.6 : 1 }}>
                {importando ? 'Salvando...' : `Salvar ${preview.length} produtos`}
              </button>
              <button onClick={cancelar} style={btnSec}>Cancelar</button>
            </div>

            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 900 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
                    {COLUNAS.map(c => (
                      <th key={c.campo} style={th}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((p, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={td}>{p.codigo}</td>
                      <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descricao}>{p.descricao}</td>
                      <td style={td}>{p.tipoMarca}</td>
                      <td style={td}>{p.embalagem}</td>
                      <td style={td}>{p.garrafeira}</td>
                      <td style={td}>{p.garrafa}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{p.peso}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{p.hecto}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{p.paletizacao}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{p.lastro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: '#9ca3af', borderTop: '1px solid #e5e7eb' }}>
                  Exibindo 50 de {preview.length} produtos na pré-visualização.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 20 }} />
      <SecaoMarketplace />
    </div>
  );
}

// ─── Seção Marketplace ────────────────────────────────────────────────────────
// Lista de SKUs considerados "Marketplace" — usados pelo filtro "Tipo de produto"
// no Dashboard Curva ABC. Armazenada em:
//   empresas/{eid}/config/marketplace  →  { codigos: [...], atualizadoEm }
//
// UI: textarea pra colar/digitar códigos (1 por linha ou separados por vírgula)
//     + botão "Importar CSV" (1 coluna, 1 código por linha)
//     + lista de SKUs salvos com remover individual
//     + botão "Salvar".
function SecaoMarketplace() {
  const { docRef } = useDb();
  const csvInputRef = useRef();

  const [codigosSalvos, setCodigosSalvos] = useState([]); // string[] — fonte da verdade do Firestore
  const [rascunho, setRascunho]           = useState(''); // textarea controlada
  const [carregando, setCarregando]       = useState(true);
  const [salvando, setSalvando]           = useState(false);
  const [erro, setErro]                   = useState('');
  const [okMsg, setOkMsg]                 = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const snap = await getDoc(docRef('config', 'marketplace'));
      const dados = snap.exists() ? snap.data() : {};
      const codigos = Array.isArray(dados.codigos)
        ? dados.codigos.map(c => String(c).trim()).filter(Boolean)
        : [];
      setCodigosSalvos(codigos);
    } catch (e) {
      setErro('Erro ao carregar lista: ' + e.message);
    } finally {
      setCarregando(false);
    }
  }

  // Normaliza códigos (trim, dedup, exclui vazios). Mantém ordem de inserção.
  function normalizar(codigos) {
    const set = new Set();
    const out = [];
    codigos.forEach(c => {
      const s = String(c).trim();
      if (!s) return;
      if (set.has(s)) return;
      set.add(s);
      out.push(s);
    });
    return out;
  }

  // Parseia o textarea: aceita códigos 1 por linha, separados por vírgula ou ponto-e-vírgula.
  function parsearRascunho(texto) {
    return normalizar(String(texto || '').split(/[\s,;]+/));
  }

  function adicionarDoRascunho() {
    const novos = parsearRascunho(rascunho);
    if (novos.length === 0) {
      setErro('Cole ou digite ao menos 1 código.');
      return;
    }
    const combinado = normalizar([...codigosSalvos, ...novos]);
    setCodigosSalvos(combinado);
    setRascunho('');
    setErro('');
    setOkMsg(`+${combinado.length - codigosSalvos.length} código(s) adicionados ao rascunho. Clique em "Salvar" pra gravar.`);
  }

  async function handleCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    setErro('');
    setOkMsg('');
    try {
      const texto = await file.text();
      // CSV simples: 1 coluna, 1 código por linha. Aceita ; , e tab como separador
      // pra tolerar arquivos com mais de uma coluna (pega só a primeira).
      const novos = normalizar(
        texto.split(/\r?\n/).map(l => l.split(/[;,\t]/)[0])
      );
      if (novos.length === 0) {
        setErro('CSV vazio ou sem códigos válidos na primeira coluna.');
        return;
      }
      const combinado = normalizar([...codigosSalvos, ...novos]);
      const adicionados = combinado.length - codigosSalvos.length;
      setCodigosSalvos(combinado);
      setOkMsg(`+${adicionados} código(s) adicionados do CSV (${file.name}). Clique em "Salvar" pra gravar.`);
    } catch (err) {
      setErro('Erro ao ler CSV: ' + err.message);
    }
    e.target.value = '';
  }

  function removerCodigo(codigo) {
    setCodigosSalvos(prev => prev.filter(c => c !== codigo));
    setOkMsg('');
  }

  function limparTudo() {
    if (!window.confirm('Remover TODOS os códigos da lista Marketplace? (Só vale após clicar em "Salvar".)')) return;
    setCodigosSalvos([]);
    setOkMsg('Lista limpa no rascunho. Clique em "Salvar" pra gravar.');
  }

  async function salvar() {
    setSalvando(true);
    setErro('');
    setOkMsg('');
    try {
      await setDoc(docRef('config', 'marketplace'), {
        codigos: codigosSalvos,
        atualizadoEm: serverTimestamp(),
      });
      setOkMsg(`✓ Lista salva (${codigosSalvos.length} código(s)).`);
    } catch (e) {
      setErro('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={secao}>
      <h3 style={secaoTitulo}>Marketplace — Lista de SKUs</h3>
      <p style={{ fontSize: 13, color: '#888', marginTop: 0, marginBottom: 20 }}>
        Códigos cadastrados aqui aparecem como <strong>Marketplace</strong> no filtro
        "Tipo de produto" do Dashboard Curva ABC. Os demais SKUs ficam classificados
        como <strong>Ambev</strong>. A curva é recalculada dentro de cada grupo.
      </p>

      <input ref={csvInputRef} type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Rascunho — adicionar códigos */}
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
            Adicionar códigos (1 por linha, vírgula ou ponto-e-vírgula)
          </label>
          <textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder={'123456\n789012\n345678\n... ou: 123456, 789012, 345678'}
            rows={6}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd',
              fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={adicionarDoRascunho} style={btnPrimario}>
              + Adicionar ao rascunho
            </button>
            <button onClick={() => csvInputRef.current?.click()} style={btnSec}>
              📥 Importar CSV
            </button>
          </div>
        </div>

        {/* Lista atual */}
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
              Lista atual ({codigosSalvos.length} código(s))
            </span>
            {codigosSalvos.length > 0 && (
              <button onClick={limparTudo}
                style={{ ...btnSec, padding: '4px 10px', fontSize: 11, color: '#E31837', borderColor: '#fca5a5' }}>
                Limpar tudo
              </button>
            )}
          </div>
          <div style={{
            maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8,
            background: '#fafafa',
          }}>
            {carregando ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#aaa', fontSize: 12 }}>Carregando...</div>
            ) : codigosSalvos.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#aaa', fontSize: 12 }}>
                Nenhum código cadastrado.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {codigosSalvos.map((c, i) => (
                    <tr key={c} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 ? '#fff' : 'transparent' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#333' }}>{c}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', width: 60 }}>
                        <button onClick={() => removerCodigo(c)}
                          title="Remover"
                          style={{
                            padding: '2px 8px', background: 'transparent', border: '1px solid #fca5a5',
                            color: '#E31837', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                          }}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Status */}
      {erro   && <div style={erroBox}>{erro}</div>}
      {okMsg  && <div style={okBox}>{okMsg}</div>}

      {/* Salvar */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={salvar} disabled={salvando || carregando}
          style={{ ...btnPrimario, opacity: salvando || carregando ? 0.6 : 1 }}>
          {salvando ? 'Salvando...' : `💾 Salvar lista (${codigosSalvos.length})`}
        </button>
      </div>
    </div>
  );
}

const secao      = { backgroundColor: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#E31837', fontSize: 15, fontWeight: 'bold', marginTop: 0, marginBottom: 8 };
const btnPrimario = { padding: '9px 20px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 };
const btnSec      = { padding: '9px 16px', backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnPerigo   = { padding: '9px 16px', backgroundColor: '#fff0f0', color: '#E31837', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const erroBox     = { marginTop: 12, padding: '10px 14px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 13, color: '#991b1b', fontWeight: 500 };
const okBox       = { marginTop: 12, padding: '10px 14px', backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, fontSize: 13, color: '#166534', fontWeight: 500 };
const th          = { padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
const td          = { padding: '7px 12px', color: '#374151', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' };
