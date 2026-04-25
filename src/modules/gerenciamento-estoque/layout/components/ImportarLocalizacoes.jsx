import React, { useState } from 'react';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import * as XLSX from 'xlsx';

export function ImportarLocalizacoes() {
  const [arquivo, setArquivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);
  const [erros, setErros] = useState([]);
  const [message, setMessage] = useState('');
  const [dadosValidos, setDadosValidos] = useState([]);

  const containerStyle = {
    maxWidth: '800px',
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

  const buttonSecundarioStyle = {
    ...buttonStyle,
    backgroundColor: '#1D5A9E',
    marginRight: '8px',
  };

  const buttonCancelStyle = {
    ...buttonStyle,
    backgroundColor: '#6b7280',
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '20px',
    fontSize: '12px',
  };

  const thStyle = {
    backgroundColor: '#E31837',
    color: 'white',
    padding: '10px',
    textAlign: 'left',
    fontWeight: 'bold',
  };

  const tdStyle = {
    padding: '8px 10px',
    borderBottom: '1px solid #ddd',
  };

  // ========== VALIDAR LINHA ==========
  function validarLinha(row, lineNumber) {
    const errosLinha = [];

    // Coluna A: Área
    if (!row[0]) {
      errosLinha.push(`Linha ${lineNumber}: Área vazia`);
    } else {
      const area = String(row[0]).trim().toUpperCase();
      if (area.length !== 1 || !/^[A-Z]$/.test(area)) {
        errosLinha.push(`Linha ${lineNumber}: Área inválida "${row[0]}" (deve ser A-Z)`);
      }
    }

    // Coluna B: Rua
    if (!row[1]) {
      errosLinha.push(`Linha ${lineNumber}: Rua vazia`);
    } else {
      const rua = String(row[1]).trim();
      if (!/^\d+$/.test(rua)) {
        errosLinha.push(`Linha ${lineNumber}: Rua inválida "${row[1]}" (deve ser número)`);
      }
    }

    // Coluna C: Posição
    if (!row[2]) {
      errosLinha.push(`Linha ${lineNumber}: Posição vazia`);
    } else {
      const posicao = String(row[2]).trim();
      if (!/^\d+$/.test(posicao)) {
        errosLinha.push(`Linha ${lineNumber}: Posição inválida "${row[2]}" (deve ser número)`);
      }
    }

    return errosLinha;
  }

  // ========== PROCESSAR ARQUIVO ==========
  async function processarArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;

    setArquivo(file);
    setMessage('');
    setErros([]);
    setPreview([]);
    setDadosValidos([]);

    try {
      const dados = await file.arrayBuffer();
      const workbook = XLSX.read(dados, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 0, defval: '' });

      if (rows.length === 0) {
        setMessage('❌ Arquivo vazio ou sem dados');
        return;
      }

      const errosValidacao = [];
      const dadosProcessados = [];

      // Validar cada linha
      rows.forEach((row, idx) => {
        const lineNumber = idx + 2; // +1 para cabeçalho, +1 para 1-indexed
        const area = String(row['Área'] || row['Area'] || row[0] || '').trim().toUpperCase();
        const rua = String(row['Rua'] || row[1] || '').trim();
        const posicao = String(row['Posição'] || row['Posicao'] || row[2] || '').trim();

        const errosLinha = validarLinha([area, rua, posicao], lineNumber);

        if (errosLinha.length > 0) {
          errosValidacao.push(...errosLinha);
        } else {
          // Gerar ID automaticamente
          const id = `${area}-${parseInt(rua)}-${parseInt(posicao)}`;

          dadosProcessados.push({
            id,
            area,
            street: parseInt(rua),
            palettePosition: parseInt(posicao),
            createdAt: new Date(),
            isActive: true,
          });
        }
      });

      if (errosValidacao.length > 0) {
        setErros(errosValidacao);
        setMessage(`❌ ${errosValidacao.length} erro(s) encontrado(s). Corrija antes de importar.`);
        return;
      }

      // Mostrar preview (primeiras 5 linhas)
      setPreview(dadosProcessados.slice(0, 5));
      setDadosValidos(dadosProcessados);
      setMessage(`✅ ${dadosProcessados.length} localização(ões) validada(s) com sucesso!`);
    } catch (error) {
      setMessage(`❌ Erro ao ler arquivo: ${error.message}`);
      console.error(error);
    }
  }

  // ========== IMPORTAR NO FIREBASE ==========
  async function importarDados() {
    if (dadosValidos.length === 0) {
      setMessage('❌ Nenhum dado para importar');
      return;
    }

    setLoading(true);
    setMessage('⏳ Importando...');

    try {
      let sucessoCount = 0;
      const CHUNK_SIZE = 450; // Limite do Firestore

      for (let i = 0; i < dadosValidos.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = dadosValidos.slice(i, i + CHUNK_SIZE);

        chunk.forEach((localizacao) => {
          const docRef = doc(db, 'locations', localizacao.id);
          batch.set(docRef, {
            area: localizacao.area,
            street: localizacao.street,
            palettePosition: localizacao.palettePosition,
            createdAt: localizacao.createdAt,
            isActive: localizacao.isActive,
          });
        });

        await batch.commit();
        sucessoCount += chunk.length;
      }

      setMessage(`✅ ${sucessoCount} localização(ões) importada(s) com sucesso!`);
      setDadosValidos([]);
      setPreview([]);
      setArquivo(null);
      setErros([]);

      // Limpar após 3 segundos
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`❌ Erro ao importar: ${error.message}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  // ========== LIMPAR ==========
  function limpar() {
    setArquivo(null);
    setPreview([]);
    setErros([]);
    setMessage('');
    setDadosValidos([]);
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '20px' }}>📥 Importar Localizações em Lote</h2>

      {message && (
        <div
          style={{
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '4px',
            backgroundColor: message.includes('✅')
              ? '#dcfce7'
              : message.includes('⏳')
              ? '#dbeafe'
              : '#fee2e2',
            color: message.includes('✅')
              ? '#166534'
              : message.includes('⏳')
              ? '#0369a1'
              : '#991b1b',
            borderLeft: `4px solid ${
              message.includes('✅')
                ? '#22c55e'
                : message.includes('⏳')
                ? '#0ea5e9'
                : '#ef4444'
            }`,
          }}
        >
          {message}
        </div>
      )}

      {/* ERROS DETALHADOS */}
      {erros.length > 0 && (
        <div
          style={{
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '4px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          <h4 style={{ color: '#991b1b', marginTop: 0, marginBottom: '10px' }}>⚠️ Erros encontrados:</h4>
          {erros.map((erro, idx) => (
            <div key={idx} style={{ color: '#991b1b', fontSize: '12px', marginBottom: '4px' }}>
              • {erro}
            </div>
          ))}
        </div>
      )}

      {/* INPUT DE ARQUIVO */}
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
          Clique aqui ou arraste um arquivo • Formato esperado: Área | Rua | Posição
        </div>
      </label>

      {arquivo && (
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
          📄 Arquivo selecionado: <strong>{arquivo.name}</strong>
        </div>
      )}

      {/* PREVIEW */}
      {preview.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#333', marginBottom: '10px', fontSize: '14px' }}>
            Preview (primeiras {preview.length} linhas):
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Área</th>
                  <th style={thStyle}>Rua</th>
                  <th style={thStyle}>Posição</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((loc, idx) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                    <td style={tdStyle}>
                      <strong>{loc.id}</strong>
                    </td>
                    <td style={tdStyle}>{loc.area}</td>
                    <td style={tdStyle}>{loc.street}</td>
                    <td style={tdStyle}>{loc.palettePosition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dadosValidos.length > preview.length && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              ... e mais {dadosValidos.length - preview.length} localização(ões)
            </div>
          )}
        </div>
      )}

      {/* BOTÕES */}
      <div style={{ marginTop: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {dadosValidos.length > 0 && (
          <>
            <button
              style={buttonStyle}
              onClick={importarDados}
              disabled={loading || dadosValidos.length === 0}
            >
              {loading ? '⏳ Importando...' : `✅ Importar ${dadosValidos.length} localização(ões)`}
            </button>
            <button style={buttonCancelStyle} onClick={limpar} disabled={loading}>
              ❌ Cancelar
            </button>
          </>
        )}
      </div>

      {/* INFO */}
      <div
        style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#f0f9ff',
          borderLeft: '4px solid #1D5A9E',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#0369a1',
        }}
      >
        <h4 style={{ marginTop: 0, marginBottom: '8px' }}>ℹ️ Formato esperado do arquivo:</h4>
        <table style={{ width: '100%', fontSize: '11px', marginBottom: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: '#1D5A9E', color: 'white' }}>
              <th style={{ padding: '6px', textAlign: 'left' }}>Coluna</th>
              <th style={{ padding: '6px', textAlign: 'left' }}>Campo</th>
              <th style={{ padding: '6px', textAlign: 'left' }}>Exemplo</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ backgroundColor: 'white' }}>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>A</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Área</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>A, B, C, U...</td>
            </tr>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>B</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Rua</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>1, 2, 35, 100...</td>
            </tr>
            <tr style={{ backgroundColor: 'white' }}>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>C</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>Posição</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>1, 2, 209, 500...</td>
            </tr>
          </tbody>
        </table>

        <strong>🔄 Substituição de duplicatas:</strong> Se uma localização já existe com o mesmo ID
        (ÁREA-RUA-POSIÇÃO), será automaticamente substituída pela nova entrada.
      </div>
    </div>
  );
}
