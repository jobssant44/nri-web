import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import * as XLSX from 'xlsx';

// ─── Campos do relatório 03.11.20 (índice 0-based) ───────────────────────────
const CAMPOS_031120 = [
  { idx: 0,  campo: 'mapa',           label: 'Mapa',            isDate: false },
  { idx: 1,  campo: 'fase',           label: 'Fase',            isDate: false },
  { idx: 2,  campo: 'revenda',        label: 'Revenda',         isDate: false },
  { idx: 3,  campo: 'placa',          label: 'Placa',           isDate: false },
  { idx: 4,  campo: 'frotaCadastrada',label: 'Frota Cadastrada',isDate: false },
  { idx: 7,  campo: 'dataEmissao',    label: 'Data Emissão',    isDate: true  },
  { idx: 8,  campo: 'dataOperacao',   label: 'Data Operação',   isDate: true  },
  { idx: 9,  campo: 'horaOperacao',   label: 'Hora',            isDate: false },
  { idx: 10, campo: 'usuario',        label: 'Usuário',         isDate: false },
  { idx: 15, campo: 'motorista',      label: 'Motorista',       isDate: false },
];

// ─── Campos do relatório 01.20.01.47 (índice 0-based) ────────────────────────
const CAMPOS_MOTORISTAS = [
  { idx: 0, campo: 'codigoMotorista', label: 'Código' },
  { idx: 1, campo: 'nomeMotorista',   label: 'Nome' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function celulaParaString(val, isDate = false) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    const d = val;
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  // Serial numérico do Excel para campos de data (sem cellDates: true)
  if (isDate && typeof val === 'number' && val > 1) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }
  }
  return String(val).trim();
}

function parsearArquivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        resolve(rows);
      } catch (e) {
        reject(new Error('Erro ao processar o arquivo: ' + e.message));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function extrairLinhas(rows, campos, pularHeader, filtroPlaca) {
  const inicio = pularHeader ? 1 : 0;
  const linhas = [];
  for (let i = inicio; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    campos.forEach(({ idx, campo, isDate }) => {
      obj[campo] = celulaParaString(row[idx], isDate);
    });
    const vazia = campos.every(({ campo }) => !obj[campo]);
    if (vazia) continue;
    if (filtroPlaca && !obj.placa) continue;
    linhas.push(obj);
  }
  return linhas;
}

// ─── Card 03.11.20 ────────────────────────────────────────────────────────────

function Card031120() {
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [dados, setDados] = useState(null);
  const inputRef = useRef(null);

  async function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setFase('idle');
    setMensagem('');
    setDados(null);
    e.target.value = '';

    try {
      const rows = await parsearArquivo(arquivo);
      if (rows.length < 2) {
        setFase('erro');
        setMensagem('Arquivo vazio ou sem dados.');
        return;
      }
      const linhas = extrairLinhas(rows, CAMPOS_031120, true, true);
      if (linhas.length === 0) {
        setFase('erro');
        setMensagem('Nenhuma linha com Placa preenchida encontrada (pré-filtro ativo).');
        return;
      }
      setDados({ linhas, total: linhas.length, nomeArquivo: arquivo.name });
      setFase('preview');
    } catch (err) {
      setFase('erro');
      setMensagem(err.message);
    }
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando');
    setMensagem('');
    try {
      const snap = await getDocs(collection(db, 'relatorio031120'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      for (let i = 0; i < dados.linhas.length; i += 450) {
        const batch = writeBatch(db);
        dados.linhas.slice(i, i + 450).forEach(linha => {
          batch.set(doc(collection(db, 'relatorio031120')), {
            ...linha,
            importadoEm: new Date().toISOString(),
            nomeArquivo: dados.nomeArquivo,
          });
        });
        await batch.commit();
      }
      setFase('salvo');
      setMensagem(`${dados.total} linha(s) salvas com sucesso.`);
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

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ fontSize: 22 }}>🚚</span>
        <div>
          <div style={s.cardTitulo}>03.11.20</div>
          <div style={s.cardDescricao}>
            Mapa · Fase · Placa · Frota · Datas · Hora · Usuário · Motorista — pré-filtro: ignora linhas sem Placa
          </div>
        </div>
      </div>

      <div style={s.uploadArea}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          id="file-031120"
          style={{ display: 'none' }}
          onChange={handleArquivo}
        />
        <label htmlFor="file-031120" style={s.botaoUpload}>
          📂 Selecionar arquivo
        </label>

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
          📋 Arquivo: <strong>{dados.nomeArquivo}</strong> · <strong>{dados.total}</strong> linha(s) prontas para salvar
        </div>
      )}

      {temPreview && dados && (
        <div style={s.tabelaWrapper}>
          <table style={s.tabela}>
            <thead>
              <tr>{CAMPOS_031120.map(c => <th key={c.campo} style={s.th}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {dados.linhas.slice(0, 10).map((linha, i) => (
                <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                  {CAMPOS_031120.map(c => <td key={c.campo} style={s.td}>{linha[c.campo]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {dados.total > 10 && (
            <div style={s.maisLinhas}>... e mais {dados.total - 10} linha(s) não exibidas</div>
          )}
        </div>
      )}

      {fase === 'idle' && (
        <div style={s.placeholder}>Selecione um arquivo CSV ou Excel para visualizar e salvar</div>
      )}
    </div>
  );
}

// ─── Card 01.20.01.47 — Motoristas ───────────────────────────────────────────

function CardMotoristas() {
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [dados, setDados] = useState(null);
  const inputRef = useRef(null);

  async function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setFase('idle');
    setMensagem('');
    setDados(null);
    e.target.value = '';

    try {
      const rows = await parsearArquivo(arquivo);
      if (rows.length < 2) {
        setFase('erro');
        setMensagem('Arquivo vazio ou sem dados.');
        return;
      }
      const linhas = extrairLinhas(rows, CAMPOS_MOTORISTAS, true, false);
      if (linhas.length === 0) {
        setFase('erro');
        setMensagem('Nenhuma linha de dados encontrada.');
        return;
      }
      setDados({ linhas, total: linhas.length, nomeArquivo: arquivo.name });
      setFase('preview');
    } catch (err) {
      setFase('erro');
      setMensagem(err.message);
    }
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando');
    setMensagem('');
    try {
      const snap = await getDocs(collection(db, 'relatoriomotoristas'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      for (let i = 0; i < dados.linhas.length; i += 450) {
        const batch = writeBatch(db);
        dados.linhas.slice(i, i + 450).forEach(linha => {
          batch.set(doc(collection(db, 'relatoriomotoristas')), {
            ...linha,
            importadoEm: new Date().toISOString(),
            nomeArquivo: dados.nomeArquivo,
          });
        });
        await batch.commit();
      }
      setFase('salvo');
      setMensagem(`${dados.total} motorista(s) salvo(s) com sucesso.`);
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

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ fontSize: 22 }}>👤</span>
        <div>
          <div style={s.cardTitulo}>01.20.01.47</div>
          <div style={s.cardDescricao}>
            Código do motorista · Nome do Motorista
          </div>
        </div>
      </div>

      <div style={s.uploadArea}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          id="file-motoristas"
          style={{ display: 'none' }}
          onChange={handleArquivo}
        />
        <label htmlFor="file-motoristas" style={s.botaoUpload}>
          📂 Selecionar arquivo
        </label>

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
          📋 Arquivo: <strong>{dados.nomeArquivo}</strong> · <strong>{dados.total}</strong> motorista(s) pronto(s) para salvar
        </div>
      )}

      {temPreview && dados && (
        <div style={s.tabelaWrapper}>
          <table style={s.tabela}>
            <thead>
              <tr>{CAMPOS_MOTORISTAS.map(c => <th key={c.campo} style={s.th}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {dados.linhas.slice(0, 10).map((linha, i) => (
                <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                  {CAMPOS_MOTORISTAS.map(c => <td key={c.campo} style={s.td}>{linha[c.campo]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {dados.total > 10 && (
            <div style={s.maisLinhas}>... e mais {dados.total - 10} motorista(s) não exibido(s)</div>
          )}
        </div>
      )}

      {fase === 'idle' && (
        <div style={s.placeholder}>Selecione um arquivo CSV ou Excel para visualizar e salvar</div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ImportarRelatoriosMPD() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Topbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 28,
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 }}>
            Importar Relatórios
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Gestão MDP — selecione os arquivos CSV ou Excel para cada relatório.
          </p>
        </div>
        <button
          onClick={() => navigate('/gestao-mpd/metas')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 20px',
            backgroundColor: '#1D5A9E',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: 0.3,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#174d8a'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#1D5A9E'}
        >
          🎯 Metas
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card031120 />
        <CardMotoristas />
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

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
  uploadArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
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
    padding: '24px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
    fontStyle: 'italic',
  },
};
