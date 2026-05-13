import { useState } from 'react';
import { getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import { useDb } from '../utils/db';

export default function Importar() {
  const { col, docRef } = useDb();
  const [arquivo,    setArquivo]    = useState(null);
  const [preview,    setPreview]    = useState([]);
  const [importando, setImportando] = useState(false);
  const [resultado,  setResultado]  = useState(null);

  function lerCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const linhas = e.target.result.split('\n').filter(l => l.trim());
      const dados = linhas.slice(1)
        .map(l => { const cols = l.split(';'); return { codigo: cols[0]?.trim(), curva: cols[1]?.trim() }; })
        .filter(d => d.codigo && d.curva);
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
      const snap = await getDocs(col('curva_abc'));
      await Promise.all(snap.docs.map(d => deleteDoc(docRef('curva_abc', d.id))));
      for (const item of arquivo) await addDoc(col('curva_abc'), item);
      setResultado(arquivo.length);
      setArquivo(null);
      setPreview([]);
    } catch (e) { alert('Erro: ' + e.message); }
    setImportando(false);
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Importar Base</h2>

      <div style={secao}>
        <h3 style={{ color: '#E31837', fontSize: 15, fontWeight: 'bold', marginTop: 0, marginBottom: 12 }}>Curva ABC</h3>
        <div style={{ backgroundColor: '#f9f9f9', border: '1px dashed #ddd', borderRadius: 8, padding: 20, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>Arquivo CSV com colunas: Código ; Curva (A, B ou C)</p>
          <p style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>Separador: ponto e vírgula ( ; ) — primeira linha é o cabeçalho</p>
          <input type="file" accept=".csv" onChange={e => { if (e.target.files[0]) lerCSV(e.target.files[0]); }} style={{ fontSize: 14 }} />
        </div>

        {preview.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>Preview (primeiros 5 registros):</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={th}>Código</th><th style={th}>Curva</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={td}>{p.codigo}</td><td style={td}>{p.curva}</td>
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
            ✅ {resultado} registros importados com sucesso!
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