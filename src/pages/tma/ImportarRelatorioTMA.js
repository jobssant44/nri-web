import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { useDb } from '../../utils/db';

// Índices das colunas (base 0): A=0, B=1, C=2 ...
const COL = {
  placa:      0, // A
  local:      2, // C
  tempoPerm:  3, // D
  revenda:    4, // E
  motorista:  5, // F
  dataInicio: 6, // G
  horaInicio: 7, // H
  dataFim:    8, // I
  horaFim:    9, // J
};

// Converte serial Excel de data para DD/MM/AAAA
function normalizeDate(val) {
  if (!val && val !== 0) return '';
  if (typeof val === 'number') {
    const serial = Math.floor(val);
    if (serial > 25569) {
      const d = new Date((serial - 25569) * 86400 * 1000);
      return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
  }
  return String(val).trim();
}

// Converte fração Excel de horário para HH:MM:SS
function normalizeTime(val) {
  if (!val && val !== 0) return '';
  if (typeof val === 'number') {
    const frac = Math.abs(val % 1);
    const totalSeg = Math.round(frac * 86400);
    const h = Math.floor(totalSeg / 3600);
    const m = Math.floor((totalSeg % 3600) / 60);
    const s = totalSeg % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return String(val).trim();
}

function parseDataHora(dataStr, horaStr) {
  if (!dataStr || !horaStr) return null;
  const dp = String(dataStr).split('/');
  if (dp.length !== 3) return null;
  const [dia, mes, ano] = dp.map(Number);
  const hp = String(horaStr).split(':');
  const h = Number(hp[0]) || 0;
  const m = Number(hp[1]) || 0;
  const s = Number(hp[2]) || 0;
  const dt = new Date(ano, mes - 1, dia, h, m, s);
  return isNaN(dt.getTime()) ? null : dt;
}

function calcularTMA(dataInicio, horaInicio, dataFim, horaFim) {
  const inicio = parseDataHora(dataInicio, horaInicio);
  const fim    = parseDataHora(dataFim,    horaFim);
  if (!inicio || !fim) return { ms: 0, formatado: '—' };
  let diffMs = fim - inicio;
  if (diffMs < 0) diffMs = 0;
  const totalSeg = Math.floor(diffMs / 1000);
  const h  = Math.floor(totalSeg / 3600);
  const mm = Math.floor((totalSeg % 3600) / 60);
  const ss = totalSeg % 60;
  return {
    ms: diffMs,
    formatado: `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`,
  };
}

function processarLinhas(rows) {
  const vistas = new Set();
  const registros = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c && c !== 0)) continue;

    const placa      = String(row[COL.placa]     ?? '').trim();
    const local      = String(row[COL.local]     ?? '').trim();
    const tempoPerm  = normalizeTime(row[COL.tempoPerm]);
    const revenda    = String(row[COL.revenda]   ?? '').trim();
    // Motorista: desconsidera tudo após primeira vírgula
    const motorista  = String(row[COL.motorista] ?? '').split(',')[0].trim();
    const dataInicio = normalizeDate(row[COL.dataInicio]);
    const horaInicio = normalizeTime(row[COL.horaInicio]);
    const dataFim    = normalizeDate(row[COL.dataFim]);
    const horaFim    = normalizeTime(row[COL.horaFim]);

    if (!placa) continue;

    // Chave única para deduplicação
    const chave = `${placa}|${local}|${dataInicio}|${horaInicio}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    const tma = calcularTMA(dataInicio, horaInicio, dataFim, horaFim);

    registros.push({
      placa,
      local,
      tempoPermanencia: tempoPerm,
      revenda,
      motorista,
      dataInicio,
      horaInicio,
      dataFim,
      horaFim,
      tmaMs:       tma.ms,
      tmaFormatado: tma.formatado,
    });
  }

  return registros;
}

export default function ImportarRelatorioTMA() {
  const { col, db, stamp } = useDb();
  const [fase,          setFase]          = useState('idle');
  const [mensagem,      setMensagem]      = useState('');
  const [dados,         setDados]         = useState(null);
  const [faseApagar,    setFaseApagar]    = useState('idle'); // idle | confirmando | apagando | apagado | erro
  const [msgApagar,     setMsgApagar]     = useState('');
  const inputRef = useRef(null);

  function lerArquivo(arquivo) {
    const ext = arquivo.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setFase('erro');
      setMensagem('Selecione um arquivo .xlsx, .xls ou .csv válido.');
      return;
    }
    setFase('idle');
    setMensagem('');
    setDados(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const workbook = XLSX.read(ev.target.result, { type: 'array' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

        if (rows.length < 2) {
          setFase('erro');
          setMensagem('Arquivo vazio ou sem dados.');
          return;
        }

        const registros = processarLinhas(rows);

        if (registros.length === 0) {
          setFase('erro');
          setMensagem('Nenhum registro válido encontrado. Verifique se o arquivo está no formato correto (coluna A = Placa).');
          return;
        }

        setDados({ registros, total: registros.length, nomeArquivo: arquivo.name });
        setFase('preview');
      } catch (e) {
        setFase('erro');
        setMensagem('Erro ao processar o arquivo: ' + e.message);
      }
    };
    reader.onerror = () => { setFase('erro'); setMensagem('Falha ao ler o arquivo.'); };
    reader.readAsArrayBuffer(arquivo);
  }

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (arquivo) lerArquivo(arquivo);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    const arquivo = e.dataTransfer.files?.[0];
    if (arquivo) lerArquivo(arquivo);
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando');
    setMensagem('');
    try {
      // Limpa coleção antes de reimportar
      const snap = await getDocs(col('tma_registros'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Salva novos registros em lotes
      const { registros } = dados;
      for (let i = 0; i < registros.length; i += 450) {
        const batch = writeBatch(db);
        registros.slice(i, i + 450).forEach(r => {
          batch.set(doc(col('tma_registros')), {
            ...r,
            importadoEm: new Date().toISOString(),
            nomeArquivo: dados.nomeArquivo,
            ...stamp(),
          });
        });
        await batch.commit();
      }
      setFase('salvo');
      setMensagem(`${dados.total} registro(s) salvos com sucesso.`);
      setDados(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setFase('erro');
      setMensagem(`Erro ao salvar: ${err.message}`);
    }
  }

  function handleLimpar() {
    setFase('idle');
    setMensagem('');
    setDados(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleApagarTudo() {
    setFaseApagar('apagando');
    setMsgApagar('');
    try {
      const snap = await getDocs(col('tma_registros'));
      if (snap.empty) {
        setFaseApagar('apagado');
        setMsgApagar('A coleção já estava vazia.');
        return;
      }
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      setFaseApagar('apagado');
      setMsgApagar(`${snap.size} registro(s) apagados com sucesso.`);
    } catch (err) {
      setFaseApagar('erro');
      setMsgApagar(`Erro ao apagar: ${err.message}`);
    }
  }

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 }}>
          TMA — Importar Relatório
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Colunas lidas: <strong>A</strong> Placa · <strong>C</strong> Local · <strong>D</strong> Tempo Permanência ·{' '}
          <strong>E</strong> Revenda · <strong>F</strong> Motorista · <strong>G</strong> Data Início ·{' '}
          <strong>H</strong> Hora Início · <strong>I</strong> Data Fim · <strong>J</strong> Hora Fim
        </p>
      </div>

      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={{ fontSize: 22 }}>📊</span>
          <div>
            <div style={s.cardTitulo}>Relatório TMA</div>
            <div style={s.cardDescricao}>
              Suporta .xlsx, .xls e .csv. Duplicatas removidas automaticamente. TMA calculado como Hora Fim − Hora Início (suporta virada de dia).
            </div>
          </div>
        </div>

        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={s.dropZone}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            id="file-tma"
            style={{ display: 'none' }}
            onChange={handleArquivo}
          />
          <label htmlFor="file-tma" style={s.botaoUpload}>📂 Selecionar arquivo</label>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>ou arraste e solte aqui</span>
          <span style={{ fontSize: 11, color: '#d1d5db', fontFamily: 'monospace' }}>.xlsx · .xls · .csv</span>

          {temPreview && (
            <button
              onClick={handleSalvar}
              disabled={fase === 'salvando'}
              style={{ ...s.botaoSalvar, opacity: fase === 'salvando' ? 0.6 : 1, cursor: fase === 'salvando' ? 'not-allowed' : 'pointer' }}
            >
              {fase === 'salvando' ? '⏳ Salvando...' : '💾 Salvar no Firebase'}
            </button>
          )}
          {(temPreview || fase === 'salvo' || fase === 'erro') && (
            <button onClick={handleLimpar} style={s.botaoLimpar}>✕ Limpar</button>
          )}
        </div>

        {fase === 'salvo' && <div style={{ ...s.alerta, ...s.alertaSucesso }}>✅ {mensagem}</div>}
        {fase === 'erro'  && <div style={{ ...s.alerta, ...s.alertaErro }}>❌ {mensagem}</div>}

        {temPreview && dados && (
          <div style={{ ...s.alerta, ...s.alertaInfo }}>
            📋 <strong>{dados.nomeArquivo}</strong> · <strong>{dados.total}</strong> registro(s) únicos prontos para salvar
          </div>
        )}

        {temPreview && dados && (
          <div style={s.tabelaWrapper}>
            <table style={s.tabela}>
              <thead>
                <tr>
                  {['Placa','Local','Revenda','Motorista','Data Início','Hora Início','Data Fim','Hora Fim','TMA Calculado'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.registros.slice(0, 15).map((r, i) => (
                  <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{r.placa}</td>
                    <td style={s.td}>{r.local}</td>
                    <td style={s.td}>{r.revenda}</td>
                    <td style={s.td}>{r.motorista}</td>
                    <td style={s.td}>{r.dataInicio}</td>
                    <td style={s.td}>{r.horaInicio}</td>
                    <td style={s.td}>{r.dataFim}</td>
                    <td style={s.td}>{r.horaFim}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: '#1D5A9E' }}>{r.tmaFormatado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dados.total > 15 && (
              <div style={s.maisLinhas}>... e mais {dados.total - 15} registro(s) não exibidos</div>
            )}
          </div>
        )}

        {fase === 'idle' && (
          <div style={s.placeholder}>Selecione ou arraste um arquivo para visualizar os dados</div>
        )}
      </div>

      {/* ── Zona de perigo ───────────────────────────────────────────────────── */}
      <div style={{ ...s.card, marginTop: 20, border: '1px solid #fecaca' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b', marginBottom: 2 }}>
              Apagar dados do Firebase
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              Remove todos os registros da coleção <code style={{ backgroundColor: '#f3f4f6', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>tma_registros</code>. Esta ação não pode ser desfeita.
            </div>
          </div>

          {faseApagar === 'idle' && (
            <button
              onClick={() => setFaseApagar('confirmando')}
              style={s.botaoApagar}
            >
              🗑 Apagar tudo
            </button>
          )}

          {faseApagar === 'confirmando' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>Tem certeza?</span>
              <button
                onClick={handleApagarTudo}
                style={{ ...s.botaoApagar, backgroundColor: '#b91c1c' }}
              >
                Sim, apagar
              </button>
              <button
                onClick={() => setFaseApagar('idle')}
                style={s.botaoLimpar}
              >
                Cancelar
              </button>
            </div>
          )}

          {faseApagar === 'apagando' && (
            <span style={{ fontSize: 13, color: '#6b7280' }}>⏳ Apagando...</span>
          )}

          {faseApagar === 'apagado' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#166534', fontWeight: 500 }}>✅ {msgApagar}</span>
              <button onClick={() => { setFaseApagar('idle'); setMsgApagar(''); }} style={s.botaoLimpar}>OK</button>
            </div>
          )}

          {faseApagar === 'erro' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 500 }}>❌ {msgApagar}</span>
              <button onClick={() => { setFaseApagar('idle'); setMsgApagar(''); }} style={s.botaoLimpar}>OK</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 24,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
  },
  cardTitulo: {
    fontSize: 16,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 2,
  },
  cardDescricao: {
    fontSize: 13,
    color: '#6b7280',
  },
  dropZone: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    flexWrap: 'wrap',
    padding: '14px 16px',
    border: '2px dashed #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  botaoUpload: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    backgroundColor: '#E31837',
    color: '#fff',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
  },
  botaoSalvar: {
    padding: '8px 16px',
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  botaoLimpar: {
    padding: '8px 14px',
    backgroundColor: 'transparent',
    border: '1px solid #d1d5db',
    color: '#6b7280',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
    fontFamily: 'inherit',
  },
  botaoApagar: {
    padding: '8px 16px',
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  alerta: {
    padding: '9px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 12,
  },
  alertaSucesso: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderLeft: '4px solid #22c55e',
  },
  alertaErro: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderLeft: '4px solid #ef4444',
  },
  alertaInfo: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    borderLeft: '4px solid #3b82f6',
  },
  tabelaWrapper: {
    overflowX: 'auto',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
    marginTop: 4,
  },
  tabela: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '8px 12px',
    textAlign: 'left',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  trPar:   { backgroundColor: '#fff' },
  trImpar: { backgroundColor: '#f9fafb' },
  td: {
    padding: '7px 12px',
    color: '#374151',
    borderTop: '1px solid #f0f0f0',
    whiteSpace: 'nowrap',
  },
  maisLinhas: {
    padding: '8px 12px',
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    borderTop: '1px solid #e5e7eb',
  },
  placeholder: {
    padding: '32px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
    fontStyle: 'italic',
  },
};
