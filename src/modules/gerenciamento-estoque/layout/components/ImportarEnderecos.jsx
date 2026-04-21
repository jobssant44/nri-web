import React, { useState } from 'react';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import * as XLSX from 'xlsx';
import { AlertWidget } from '../../shared/AlertWidget';

const AREA_TYPES = ['EstoqueA', 'EstoqueB', 'EstoqueC', 'Picking', 'AG', 'Marketplace'];

const tick = () => new Promise(r => setTimeout(r, 0));

function validarLinha(row, index) {
  const errors = [];

  if (!row[0]) errors.push(`Linha ${index + 1}: Área vazia`);
  if (row[0] && !AREA_TYPES.includes(row[0])) {
    errors.push(`Linha ${index + 1}: Área inválida: ${row[0]}`);
  }

  if (!row[1]?.toString().trim()) errors.push(`Linha ${index + 1}: Rua vazia`);
  if (!row[2]?.toString().trim()) errors.push(`Linha ${index + 1}: Posição vazia`);
  if (!row[3]?.toString().trim()) errors.push(`Linha ${index + 1}: SKU vazio`);

  const capacity = parseInt(row[4]);
  if (!row[4] || isNaN(capacity) || capacity < 1) {
    errors.push(`Linha ${index + 1}: Capacidade inválida`);
  }

  return errors;
}

export function ImportarEnderecos({ onSuccess }) {
  const [enderecos, setEnderecos] = useState(null);
  const [preview, setPreview] = useState([]);
  const [progresso, setProgresso] = useState(null);
  const [importando, setImportando] = useState(false);
  const [errosValidacao, setErrosValidacao] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');

  const containerStyle = {
    maxWidth: '700px',
    margin: '20px auto',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  const cardStyle = {
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '15px',
    marginBottom: '15px',
    backgroundColor: '#f9f9f9',
  };

  const buttonStyle = {
    padding: '12px 20px',
    backgroundColor: '#E31837',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginRight: '10px',
  };

  const progressBarStyle = {
    width: '100%',
    height: '8px',
    backgroundColor: '#e0e0e0',
    borderRadius: '4px',
    marginTop: '10px',
    overflow: 'hidden',
  };

  const progressFillStyle = (pct) => ({
    height: '100%',
    backgroundColor: '#22c55e',
    width: `${pct}%`,
    transition: 'width 0.3s',
  });

  function prog(pct, etapa) {
    setProgresso({ pct, etapa });
  }

  async function processarArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setEnderecos(null);
    setPreview([]);
    setErrosValidacao([]);
    setSuccessMessage('');
    prog(0, 'Lendo arquivo...');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        prog(20, 'Decodificando planilha...');
        await tick();

        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];

        // Limita a 5 colunas (A-E)
        if (sheet['!ref']) {
          const range = XLSX.utils.decode_range(sheet['!ref']);
          range.e.c = Math.min(range.e.c, 4);
          sheet['!ref'] = XLSX.utils.encode_range(range);
        }

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
        prog(40, 'Processando linhas...');
        await tick();

        const lista = [];
        const erros = [];

        // Começa da linha 1 (índice 1) — linha 0 é o cabeçalho
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

          const validacoes = validarLinha(row, i);
          if (validacoes.length > 0) {
            erros.push(...validacoes);
            continue;
          }

          const areaName = String(row[0]).trim();
          const street = String(row[1]).trim();
          const palettePosition = String(row[2]).trim();
          const assignedSkuId = String(row[3]).trim();
          const capacity = parseInt(row[4]);

          lista.push({
            areaName,
            street,
            palettePosition,
            assignedSkuId,
            capacity,
          });
        }

        if (lista.length === 0) {
          setProgresso(null);
          setErrosValidacao(erros.length > 0 ? erros : ['Nenhuma linha válida encontrada no arquivo.']);
          return;
        }

        prog(80, `✓ ${lista.length} endereços detectados`);
        setEnderecos(lista);
        setPreview(lista.slice(0, 5));
        if (erros.length) setErrosValidacao(erros.slice(0, 10));
        setTimeout(() => setProgresso(null), 800);
      } catch (err) {
        setProgresso(null);
        setErrosValidacao([`Erro ao processar arquivo: ${err.message}`]);
      }
    };

    reader.onerror = () => {
      setProgresso(null);
      setErrosValidacao(['Erro ao ler arquivo.']);
    };

    reader.readAsArrayBuffer(file);
  }

  async function importar() {
    if (!enderecos?.length) return;
    setImportando(true);
    setErrosValidacao([]);

    try {
      prog(10, 'Iniciando importação...');
      await tick();

      const CHUNK = 450;
      let importados = 0;

      for (let i = 0; i < enderecos.length; i += CHUNK) {
        const batch = writeBatch(db);
        const chunk = enderecos.slice(i, i + CHUNK);

        chunk.forEach((endereco) => {
          const docId = `${endereco.areaName}_${endereco.street}_${endereco.palettePosition}`;
          const docRef = doc(db, 'locations', docId);
          batch.set(docRef, {
            areaName: endereco.areaName,
            street: endereco.street,
            palettePosition: endereco.palettePosition,
            assignedSkuId: endereco.assignedSkuId,
            capacity: endereco.capacity,
            isActive: true,
            createdAt: serverTimestamp(),
          });
        });

        await batch.commit();
        importados += chunk.length;
        const pct = 10 + Math.round(((importados / enderecos.length) * 85));
        prog(pct, `Gravando... ${importados}/${enderecos.length}`);
      }

      prog(100, '✅ Importação concluída!');
      setSuccessMessage(`✅ ${importados} endereços importados com sucesso!`);
      setEnderecos(null);
      setPreview([]);
      onSuccess?.({ count: importados });
      setTimeout(() => setProgresso(null), 2000);
    } catch (err) {
      setProgresso(null);
      setErrosValidacao([`Erro ao salvar: ${err.message}`]);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837' }}>📥 Importar Endereços em Lote</h2>

      {/* Input de arquivo */}
      <div style={cardStyle}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          📄 Selecionar arquivo (CSV ou Excel)
        </label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={processarArquivo}
          disabled={importando}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
        />
        <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
          ℹ️ <strong>Formato esperado:</strong> Coluna A = Área (EstoqueA/B/C, Picking, AG, Marketplace) · B = Rua (ex: 01) · C = Posição (ex: 001) · D = SKU · E = Capacidade
        </p>
      </div>

      {/* Progresso */}
      {progresso && (
        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
            {progresso.etapa}
          </div>
          <div style={progressBarStyle}>
            <div style={progressFillStyle(progresso.pct)} />
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            {progresso.pct}%
          </div>
        </div>
      )}

      {/* Erros de validação */}
      {errosValidacao.length > 0 && (
        <AlertWidget
          alerts={errosValidacao.map((msg) => ({
            type: 'IMPORT_ERROR',
            message: msg,
            severity: 'error',
          }))}
        />
      )}

      {/* Sucesso */}
      {successMessage && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#dcfce7',
            borderLeft: '4px solid #22c55e',
            borderRadius: '4px',
            color: '#166534',
            marginBottom: '15px',
          }}
        >
          {successMessage}
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ color: '#333', marginTop: 0 }}>Preview (primeiras {preview.length} linhas)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Área</th>
                  <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Rua</th>
                  <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Posição</th>
                  <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>SKU</th>
                  <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Capacidade</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.areaName}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.street}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.palettePosition}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.assignedSkuId}</td>
                    <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>
                      {row.capacity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Botões de ação */}
      {enderecos && enderecos.length > 0 && !importando && (
        <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
          <button
            style={buttonStyle}
            onClick={importar}
            disabled={importando}
          >
            ✅ Importar {enderecos.length} Endereços
          </button>
          <button
            style={{
              ...buttonStyle,
              backgroundColor: '#6b7280',
            }}
            onClick={() => {
              setEnderecos(null);
              setPreview([]);
              setErrosValidacao([]);
            }}
            disabled={importando}
          >
            ❌ Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
