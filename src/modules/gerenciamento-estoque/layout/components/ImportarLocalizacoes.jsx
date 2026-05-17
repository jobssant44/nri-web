import React, { useState } from 'react';
import { writeBatch, serverTimestamp } from 'firebase/firestore';
import { useDb } from '../../../../utils/db';
import * as XLSX from 'xlsx';
import { monthKey } from '../../shared/curvaLookup';

const CURVAS_VALIDAS = ['A', 'B', 'C'];

// Aceita o mês como número (1–12), número-string ("01"), nome completo
// ("Janeiro") ou abreviação ("Jan"), em qualquer caixa. Retorna o número
// 1–12 ou NaN se não reconhecer.
const NOMES_MES = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, 'março': 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9, sept: 9, sep: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};
function parseMes(valor) {
  if (valor == null || valor === '') return NaN;
  // Número direto
  if (typeof valor === 'number' && Number.isFinite(valor)) return Math.round(valor);
  const s = String(valor).trim();
  // String numérica
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  // Nome (com ou sem acento) — normaliza para forma sem diacríticos
  const limpo = s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  return NOMES_MES[limpo] ?? NaN;
}

export function ImportarLocalizacoes() {
  const { docRef, db, stamp } = useDb();
  const [arquivo, setArquivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);
  const [erros, setErros] = useState([]);
  const [message, setMessage] = useState('');
  const [dadosValidos, setDadosValidos] = useState([]);

  const containerStyle = {
    maxWidth: '900px',
    margin: '20px auto',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  const fileInputStyle = {
    display: 'block',
    marginBottom: '15px',
    padding: '12px',
    border: '2px dashed #E31837',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: '#fef2f2',
  };

  const buttonStyle = {
    padding: '12px 24px',
    backgroundColor: '#E31837',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '13px',
    marginRight: '8px',
  };

  const buttonCancelStyle = { ...buttonStyle, backgroundColor: '#6b7280' };

  const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' };
  const thStyle = { backgroundColor: '#E31837', color: 'white', padding: '10px', textAlign: 'left', fontWeight: 'bold' };
  const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #ddd' };

  // ─── Validar linha individual ─────────────────────────────────────────
  function validarLinha(linha, n) {
    const errs = [];
    const { ano, mes, endereco, curva } = linha;

    if (!ano || ano < 2000 || ano > 2100) errs.push(`Linha ${n}: ano inválido "${linha.anoBruto}"`);
    if (!mes || mes < 1 || mes > 12) errs.push(`Linha ${n}: mês inválido "${linha.mesBruto}"`);
    if (!endereco) errs.push(`Linha ${n}: endereço vazio`);
    else if (!/^[A-Z0-9.\-_/]+$/i.test(endereco)) {
      errs.push(`Linha ${n}: endereço inválido "${endereco}" (use letras, números, "-", ".", "_", "/")`);
    }
    if (!curva) errs.push(`Linha ${n}: curva vazia`);
    else if (!CURVAS_VALIDAS.includes(curva)) {
      errs.push(`Linha ${n}: curva inválida "${curva}" (esperado A, B ou C)`);
    }
    // Produto é opcional — só usado para futura aderência ao Layout

    return errs;
  }

  // ─── Processar arquivo ────────────────────────────────────────────────
  async function processarArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;

    setArquivo(file);
    setMessage('');
    setErros([]);
    setPreview([]);
    setDadosValidos([]);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // header:1 = retorna como array de arrays
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (!rows || rows.length === 0) {
        setMessage('❌ Arquivo vazio.');
        return;
      }

      // Se a primeira linha parece cabeçalho (não-numérico em A), descarta
      const primeira = rows[0];
      const cabecalho = primeira && String(primeira[0] || '').match(/[a-zA-Zçã]/);
      const linhasUteis = cabecalho ? rows.slice(1) : rows;

      const errosValidacao = [];
      const dadosProcessados = [];

      linhasUteis.forEach((row, idx) => {
        // Ignora linhas totalmente vazias
        if (!row || row.every(c => c === '' || c == null)) return;

        const lineNumber = (cabecalho ? idx + 2 : idx + 1);
        const linha = {
          anoBruto:      row[0],
          mesBruto:      row[1],
          ano:           parseInt(row[0], 10),
          mes:           parseMes(row[1]),
          endereco:      String(row[2] || '').trim().toUpperCase(),
          curva:         String(row[3] || '').trim().toUpperCase(),
          produtoCodigo: row[4] != null && String(row[4]).trim() !== '' ? String(row[4]).trim() : null,
          produtoNome:   row[5] != null && String(row[5]).trim() !== '' ? String(row[5]).trim() : null,
        };

        const errsLinha = validarLinha(linha, lineNumber);
        if (errsLinha.length > 0) {
          errosValidacao.push(...errsLinha);
          return;
        }

        dadosProcessados.push(linha);
      });

      if (errosValidacao.length > 0) {
        setErros(errosValidacao);
        setMessage(`❌ ${errosValidacao.length} erro(s) encontrado(s). Corrija o arquivo e tente de novo.`);
        return;
      }

      if (dadosProcessados.length === 0) {
        setMessage('❌ Nenhuma linha válida encontrada.');
        return;
      }

      setPreview(dadosProcessados.slice(0, 8));
      setDadosValidos(dadosProcessados);
      const meses = new Set(dadosProcessados.map(d => monthKey(d.ano, d.mes)));
      const enderecos = new Set(dadosProcessados.map(d => d.endereco));
      setMessage(`✅ ${dadosProcessados.length} linha(s) válida(s) · ${enderecos.size} endereço(s) único(s) · ${meses.size} mês(es)`);
    } catch (error) {
      setMessage(`❌ Erro ao ler arquivo: ${error.message}`);
      console.error(error);
    }
  }

  // ─── Importar no Firebase ─────────────────────────────────────────────
  async function importarDados() {
    if (dadosValidos.length === 0) {
      setMessage('❌ Nenhum dado para importar');
      return;
    }

    setLoading(true);
    setMessage('⏳ Importando...');

    try {
      // Para cada linha, gravamos em DUAS coleções:
      //  - locations/{endereco}                    (idempotente)
      //  - locations_mensal/{YYYY-MM_endereco}     (overwrite por mês)
      // Cada doc novo conta como 1 operação no batch; juntando os 2,
      // o limite efetivo do batch fica em 225 linhas (450/2).
      const CHUNK_SIZE = 200;
      let total = 0;
      const enderecosVistos = new Set();

      for (let i = 0; i < dadosValidos.length; i += CHUNK_SIZE) {
        const chunk = dadosValidos.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((linha) => {
          const chave = monthKey(linha.ano, linha.mes);
          const mensalId = `${chave}_${linha.endereco}`;

          // Doc base (location) — cria se não existir; merge mantém info anterior
          if (!enderecosVistos.has(linha.endereco)) {
            batch.set(docRef('locations', linha.endereco), {
              endereco: linha.endereco,
              isActive: true,
              ultimoMes: chave,
              atualizadoEm: serverTimestamp(),
              ...stamp(),
            }, { merge: true });
            enderecosVistos.add(linha.endereco);
          }

          // Doc do mês — overwrite (verdade do mês)
          batch.set(docRef('locations_mensal', mensalId), {
            ano: linha.ano,
            mes: linha.mes,
            chaveMes: chave,
            endereco: linha.endereco,
            curva: linha.curva,
            produtoCodigo: linha.produtoCodigo,
            produtoNome: linha.produtoNome,
            origem: 'importacao',
            atualizadoEm: serverTimestamp(),
            ...stamp(),
          });
        });

        await batch.commit();
        total += chunk.length;
      }

      setMessage(`✅ ${total} linha(s) importada(s) · ${enderecosVistos.size} endereço(s) atualizado(s).`);
      setDadosValidos([]);
      setPreview([]);
      setArquivo(null);
      setErros([]);
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      setMessage(`❌ Erro ao importar: ${error.message}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function limpar() {
    setArquivo(null);
    setPreview([]);
    setErros([]);
    setMessage('');
    setDadosValidos([]);
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '6px' }}>📥 Importar Endereços (CSV/Excel)</h2>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
        Cada linha cria ou atualiza um endereço para um mês específico.
        A combinação <strong>ano × mês × endereço</strong> é a chave única.
      </p>

      {message && (
        <div style={{
          padding: '12px', marginBottom: '15px', borderRadius: '4px',
          backgroundColor: message.includes('✅') ? '#dcfce7' : message.includes('⏳') ? '#dbeafe' : '#fee2e2',
          color: message.includes('✅') ? '#166534' : message.includes('⏳') ? '#0369a1' : '#991b1b',
          borderLeft: `4px solid ${
            message.includes('✅') ? '#22c55e' : message.includes('⏳') ? '#0ea5e9' : '#ef4444'
          }`,
        }}>
          {message}
        </div>
      )}

      {erros.length > 0 && (
        <div style={{
          padding: '12px', marginBottom: '15px', borderRadius: '4px',
          backgroundColor: '#fee2e2', border: '1px solid #fca5a5',
          maxHeight: '220px', overflowY: 'auto',
        }}>
          <h4 style={{ color: '#991b1b', marginTop: 0, marginBottom: '10px' }}>⚠️ Erros encontrados:</h4>
          {erros.map((erro, idx) => (
            <div key={idx} style={{ color: '#991b1b', fontSize: '12px', marginBottom: '4px' }}>
              • {erro}
            </div>
          ))}
        </div>
      )}

      <label style={fileInputStyle}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#E31837', marginBottom: '8px' }}>
          📂 Selecione um arquivo (CSV ou Excel)
        </div>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={processarArquivo}
          disabled={loading}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: '12px', color: '#666' }}>
          Colunas: <strong>A=Ano · B=Mês · C=Endereço · D=Curva · E=Produto (cód.) · F=Produto (descrição, opcional)</strong>
        </div>
      </label>

      {arquivo && (
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
          📄 Arquivo selecionado: <strong>{arquivo.name}</strong>
        </div>
      )}

      {preview.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#333', marginBottom: '10px', fontSize: '14px' }}>
            Preview (primeiras {preview.length} linha(s)):
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Mês</th>
                  <th style={thStyle}>Endereço</th>
                  <th style={thStyle}>Curva</th>
                  <th style={thStyle}>Cód. Produto</th>
                  <th style={thStyle}>Produto</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((l, idx) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                    <td style={tdStyle}>{monthKey(l.ano, l.mes)}</td>
                    <td style={tdStyle}><strong>{l.endereco}</strong></td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                        backgroundColor: l.curva === 'A' ? '#dcfce7' : l.curva === 'B' ? '#fef3c7' : '#fee2e2',
                        color: l.curva === 'A' ? '#166534' : l.curva === 'B' ? '#92400e' : '#991b1b',
                        fontWeight: 'bold',
                      }}>{l.curva}</span>
                    </td>
                    <td style={tdStyle}>{l.produtoCodigo || '—'}</td>
                    <td style={tdStyle}>{l.produtoNome || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dadosValidos.length > preview.length && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              ... e mais {dadosValidos.length - preview.length} linha(s).
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {dadosValidos.length > 0 && (
          <>
            <button style={buttonStyle} onClick={importarDados} disabled={loading}>
              {loading ? '⏳ Importando...' : `✅ Importar ${dadosValidos.length} linha(s)`}
            </button>
            <button style={buttonCancelStyle} onClick={limpar} disabled={loading}>
              ❌ Cancelar
            </button>
          </>
        )}
      </div>

      <div style={{
        marginTop: '30px', padding: '15px',
        backgroundColor: '#f0f9ff', borderLeft: '4px solid #1D5A9E',
        borderRadius: '4px', fontSize: '12px', color: '#0369a1',
      }}>
        <h4 style={{ marginTop: 0, marginBottom: '8px' }}>ℹ️ Formato do arquivo</h4>
        <table style={{ width: '100%', fontSize: '11px', marginBottom: '8px' }}>
          <thead>
            <tr style={{ backgroundColor: '#1D5A9E', color: 'white' }}>
              <th style={{ padding: '6px', textAlign: 'left' }}>Coluna</th>
              <th style={{ padding: '6px', textAlign: 'left' }}>Campo</th>
              <th style={{ padding: '6px', textAlign: 'left' }}>Exemplo</th>
              <th style={{ padding: '6px', textAlign: 'left' }}>Obrigatório?</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ backgroundColor: 'white' }}><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>A</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Ano</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>2026</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Sim</td></tr>
            <tr style={{ backgroundColor: '#f9f9f9' }}><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>B</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Mês</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>5, "05", "Maio" ou "Mai"</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Sim</td></tr>
            <tr style={{ backgroundColor: 'white' }}><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>C</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Endereço</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>A-1-007</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Sim</td></tr>
            <tr style={{ backgroundColor: '#f9f9f9' }}><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>D</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Curva</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>A, B ou C</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Sim</td></tr>
            <tr style={{ backgroundColor: 'white' }}><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>E</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Cód. produto previsto</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>1695</td><td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Opcional</td></tr>
            <tr style={{ backgroundColor: '#f9f9f9' }}><td style={{ padding: '6px' }}>F</td><td style={{ padding: '6px' }}>Descrição (opcional)</td><td style={{ padding: '6px' }}>SKOL LATA 350ML</td><td style={{ padding: '6px' }}>Opcional</td></tr>
          </tbody>
        </table>
        <strong>🔄 Duplicatas:</strong> Se já existir registro para o mesmo endereço naquele mês, ele é substituído pelo novo.
      </div>
    </div>
  );
}
