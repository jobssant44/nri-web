/**
 * Importar Preços de Produtos.
 *
 * Lê Excel/CSV com colunas:
 *   A = Código do produto
 *   B = Descrição do produto
 *   C = Preço da caixa
 *   D = Preço da unidade
 *
 * Salva em `precos_produtos` (doc ID = código). MERGE: não apaga preços
 * antigos — só sobrescreve o que veio no arquivo. Produtos não presentes
 * no arquivo mantêm os preços anteriores.
 *
 * Consumo (em `src/utils/precos.js`): o preço aplicado depende da UNIDADE da
 * linha do relatório (03.02.37, col Q): "cx"→precoCaixa, "Un"→precoUnidade.
 * Sem preço aplicável → mantém o valor do próprio relatório.
 */
import { useState, useRef } from 'react';
import { writeBatch, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useDb } from '../utils/db';
import { useUser } from '../context/UserContext';

// Parser BR-friendly de valor monetário. Aceita "12,34" "12.34" "1.234,56".
// Retorna número ou null se inválido.
function parsePreco(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const s = String(val).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  // Se tem vírgula, é decimal BR: remove pontos (milhar), troca vírgula por ponto
  let limpo;
  if (s.includes(',')) {
    limpo = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Sem vírgula: pode ter ponto como decimal (US) ou milhar (BR).
    // Se tem 3 dígitos depois do ponto, considera milhar e remove.
    const m = s.match(/^(\d+)\.(\d{3})$/);
    limpo = m ? `${m[1]}${m[2]}` : s;
  }
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : null;
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

export default function ImportarPrecosPage() {
  const { col, db } = useDb();
  const { usuario } = useUser();
  const inputRef = useRef();

  const [preview,     setPreview]     = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [salvando,    setSalvando]    = useState(false);
  const [totalSalvo,  setTotalSalvo]  = useState(null);
  const [erro,        setErro]        = useState('');
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
      if (rows.length === 0) { setErro('Arquivo vazio.'); return; }

      // Detecta header automaticamente: se A (linha 0) parece texto não-numérico,
      // considera header e pula. "Codigo", "Cód", "Item" etc.
      const primeira = String(rows[0]?.[0] ?? '').trim();
      const temHeader = primeira && !/^\d+$/.test(primeira);
      const dataRows = temHeader ? rows.slice(1) : rows;

      const dados = [];
      const ignoradas = [];
      dataRows.forEach((row, idx) => {
        const codigo = String(row[0] ?? '').trim();
        if (!codigo) {
          ignoradas.push({ linha: idx + (temHeader ? 2 : 1), motivo: 'sem código' });
          return;
        }
        const descricao    = String(row[1] ?? '').trim();
        const precoCaixa   = parsePreco(row[2]);
        const precoUnidade = parsePreco(row[3]);
        if (precoCaixa == null && precoUnidade == null) {
          ignoradas.push({ linha: idx + (temHeader ? 2 : 1), motivo: 'sem preço de caixa nem de unidade' });
          return;
        }
        dados.push({ codigo, descricao, precoCaixa, precoUnidade });
      });

      if (dados.length === 0) {
        setErro(`Nenhuma linha válida encontrada. ${ignoradas.length} linha(s) ignorada(s).`);
        return;
      }

      setPreview({ dados, ignoradas, temHeader });
    } catch (err) {
      setErro('Erro ao ler arquivo: ' + err.message);
    }
    e.target.value = '';
  }

  async function salvar() {
    if (!preview || preview.dados.length === 0) return;
    setSalvando(true);
    setErro('');
    setProgresso(0);
    setProgressoMsg('Iniciando...');
    try {
      const CHUNK = 450;
      let salvos = 0;
      const total = preview.dados.length;
      for (let i = 0; i < total; i += CHUNK) {
        const batch = writeBatch(db);
        const slice = preview.dados.slice(i, i + CHUNK);
        slice.forEach(p => {
          // MERGE: preço em branco no arquivo NÃO entra no payload — assim um
          // import que só traz o preço de caixa preserva o preço de unidade já
          // cadastrado (e vice-versa). Firestore só ignora campos AUSENTES no
          // merge; gravar `null` apagaria o preço anterior daquela unidade.
          const payload = {
            codigo: p.codigo,
            atualizadoEm: serverTimestamp(),
            atualizadoPor: usuario?.nome || '',
          };
          if (p.descricao)            payload.descricao    = p.descricao;
          if (p.precoCaixa   != null) payload.precoCaixa   = p.precoCaixa;
          if (p.precoUnidade != null) payload.precoUnidade = p.precoUnidade;
          batch.set(doc(col('precos_produtos'), String(p.codigo)), payload, { merge: true });
        });
        await batch.commit();
        salvos += slice.length;
        setProgresso(Math.round((salvos / total) * 100));
        setProgressoMsg(`Salvando ${salvos} de ${total} produtos...`);
      }
      setProgresso(100);
      setProgressoMsg(`✅ ${total} produto(s) salvos`);
      setTotalSalvo(total);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setErro('Erro ao salvar: ' + err.message);
    } finally {
      setSalvando(false);
    }
  }

  function limpar() {
    setPreview(null);
    setNomeArquivo('');
    setErro('');
    setTotalSalvo(null);
    setProgresso(0);
    setProgressoMsg('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1 style={{ color: '#E31837', marginBottom: 8 }}>💰 Importar Preços</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>
        Excel/CSV com colunas: <strong>A = Código</strong> · <strong>B = Descrição</strong> · <strong>C = Preço caixa</strong> · <strong>D = Preço unidade</strong>.
        O preço aplicado depende da unidade da linha do relatório (cx → caixa, Un → unidade).
        A importação faz <strong>merge</strong>: produtos não presentes no arquivo mantêm os preços antigos.
      </p>

      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          style={{ display: 'none' }}
          id="input-precos"
        />
        <label htmlFor="input-precos" style={{
          display: 'inline-block', padding: '12px 24px',
          backgroundColor: '#E31837', color: '#fff', borderRadius: 8,
          cursor: 'pointer', fontWeight: 'bold', fontSize: 14, marginRight: 8,
        }}>
          📂 Selecionar arquivo
        </label>
        {nomeArquivo && (
          <span style={{ fontSize: 13, color: '#666' }}>
            📋 {nomeArquivo}
          </span>
        )}

        {erro && (
          <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: 8, color: '#c00', fontSize: 13 }}>
            ❌ {erro}
          </div>
        )}

        {salvando && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{progressoMsg}</div>
            <div style={{ height: 8, backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progresso}%`, backgroundColor: '#E31837', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {totalSalvo != null && !salvando && (
          <div style={{ marginTop: 16, padding: 12, backgroundColor: '#efe', border: '1px solid #cfc', borderRadius: 8, color: '#080', fontSize: 13 }}>
            ✅ {totalSalvo} produto(s) salvos com sucesso (merge — preços antigos não removidos).
          </div>
        )}

        {preview && (
          <div style={{ marginTop: 24 }}>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
              📋 Preview: <strong>{preview.dados.length}</strong> produto(s) prontos
              {preview.ignoradas.length > 0 && <> · <span style={{ color: '#c80' }}>{preview.ignoradas.length} ignorada(s)</span></>}
              {preview.temHeader && <> · cabeçalho detectado (1ª linha pulada)</>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f8f8' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left',  borderBottom: '1px solid #ddd' }}>Código</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left',  borderBottom: '1px solid #ddd' }}>Descrição</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Preço caixa</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Preço unidade</th>
                </tr>
              </thead>
              <tbody>
                {preview.dados.slice(0, 20).map((p, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px 12px', fontFamily: 'monospace' }}>{p.codigo}</td>
                    <td style={{ padding: '6px 12px' }}>{p.descricao || '—'}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', color: p.precoCaixa != null ? '#000' : '#bbb' }}>
                      {p.precoCaixa != null ? `R$ ${p.precoCaixa.toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', color: p.precoUnidade != null ? '#000' : '#bbb' }}>
                      {p.precoUnidade != null ? `R$ ${p.precoUnidade.toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.dados.length > 20 && (
              <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 8 }}>
                ... e mais {preview.dados.length - 20} linha(s) não exibida(s)
              </div>
            )}

            {preview.ignoradas.length > 0 && (
              <details style={{ marginTop: 16, fontSize: 12 }}>
                <summary style={{ cursor: 'pointer', color: '#c80' }}>
                  Ver {preview.ignoradas.length} linha(s) ignorada(s)
                </summary>
                <ul style={{ marginTop: 8, color: '#666' }}>
                  {preview.ignoradas.slice(0, 30).map((ig, i) => (
                    <li key={i}>Linha {ig.linha}: {ig.motivo}</li>
                  ))}
                </ul>
              </details>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  padding: '12px 24px', backgroundColor: '#E31837', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: salvando ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold', fontSize: 14, opacity: salvando ? 0.6 : 1,
                }}
              >
                💾 Salvar {preview.dados.length} produto(s)
              </button>
              <button
                onClick={limpar}
                disabled={salvando}
                style={{
                  padding: '12px 24px', backgroundColor: '#f5f5f5', color: '#333',
                  border: '1px solid #ddd', borderRadius: 8, cursor: salvando ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                }}
              >
                ✕ Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
