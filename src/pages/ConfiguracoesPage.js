import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { doc, writeBatch, getDocs } from 'firebase/firestore';
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
    try {
      for (let i = 0; i < preview.length; i += 450) {
        const batch = writeBatch(db);
        preview.slice(i, i + 450).forEach(p => {
          batch.set(doc(col('produtos'), String(p.codigo)), p);
        });
        await batch.commit();
      }
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
    try {
      const snap = await getDocs(col('produtos'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
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
