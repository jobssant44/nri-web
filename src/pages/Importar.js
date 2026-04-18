import { useState } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function Importar() {
  const [abaAtiva, setAbaAtiva] = useState('produtos');
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  function lerCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const texto = e.target.result;
      const linhas = texto.split('\n').filter(l => l.trim());
      const dados = linhas.slice(1).map(l => {
        const cols = l.split(';');
        if (abaAtiva === 'produtos') {
          return { codigo: cols[0]?.trim(), nome: cols[1]?.trim(), cxPorPlt: cols[21]?.trim() || '' };
        } else {
          return { codigo: cols[0]?.trim(), curva: cols[1]?.trim() };
        }
      }).filter(d => d.codigo && (d.nome || d.curva));
      setPreview(dados.slice(0, 5));
      setArquivo(dados);
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function importar() {
    if (!arquivo || arquivo.length === 0) { alert('Selecione um arquivo válido.'); return; }
    setImportando(true);
    setResultado(null);
    try {
      const colecao = abaAtiva === 'produtos' ? 'produtos' : 'curva_abc';
      const snapExistente = await getDocs(collection(db, colecao));
      const deletes = snapExistente.docs.map(d => deleteDoc(doc(db, colecao, d.id)));
      await Promise.all(deletes);
      for (const item of arquivo) {
        await addDoc(collection(db, colecao), item);
      }
      setResultado(arquivo.length);
      setArquivo(null);
      setPreview([]);
    } catch (e) { alert('Erro: ' + e.message); }
    setImportando(false);
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Importar Base</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[{ key: 'produtos', label: '📦 Base de Produtos' }, { key: 'curva', label: '📊 Curva ABC' }].map(a => (
          <button key={a.key} onClick={() => { setAbaAtiva(a.key); setArquivo(null); setPreview([]); setResultado(null); }}
            style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid #ddd', cursor: 'pointer', fontWeight: '500', fontSize: 14, backgroundColor: abaAtiva === a.key ? '#E31837' : '#fff', color: abaAtiva === a.key ? '#fff' : '#555' }}>
            {a.label}
          </button>
        ))}
      </div>

      <div style={secao}>
        <div style={{ backgroundColor: '#f9f9f9', border: '1px dashed #ddd', borderRadius: 8, padding: 20, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>
            {abaAtiva === 'produtos' ? 'Arquivo CSV com colunas: Código ; Nome' : 'Arquivo CSV com colunas: Código ; Curva (A, B ou C)'}
          </p>
          <p style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>Separador: ponto e vírgula ( ; ) — primeira linha é o cabeçalho</p>
          <input type="file" accept=".csv" onChange={e => { if (e.target.files[0]) lerCSV(e.target.files[0]); }}
            style={{ fontSize: 14 }} />
        </div>

        {preview.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>Preview (primeiros 5 registros):</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={th}>Código</th>
                  <th style={th}>{abaAtiva === 'produtos' ? 'Nome' : 'Curva'}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={td}>{p.codigo}</td>
                    <td style={td}>{p.nome || p.curva}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Total: {arquivo?.length} registros encontrados</p>
          </div>
        )}

        <button onClick={importar} disabled={!arquivo || importando}
          style={{ ...btnPrimario, width: '100%', padding: 14, fontSize: 15, opacity: !arquivo || importando ? 0.6 : 1 }}>
          {importando ? 'Importando...' : `📥 Importar ${arquivo?.length || 0} registros`}
        </button>

        {resultado && (
          <div style={{ backgroundColor: '#E1F5EE', borderRadius: 8, padding: 14, marginTop: 16, textAlign: 'center', color: '#085041', fontWeight: '500' }}>
            ✅ {resultado} registros importados com sucesso! Base atualizada.
          </div>
        )}
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 };
const th = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#666', fontWeight: '500' };
const td = { padding: '8px 12px' };