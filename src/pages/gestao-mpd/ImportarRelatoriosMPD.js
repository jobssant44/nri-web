import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, getDocs, writeBatch, doc } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useRelatoriosMPD } from '../../context/RelatoriosMPDContext';
import { HistoricoImportacoes } from '../../modules/importacoes/HistoricoImportacoes';
import * as XLSX from 'xlsx';

// ─── Campos do relatório 03.11.20 ────────────────────────────────────────────
// Mapeamento por NOME do cabeçalho (case-insensitive) em vez de índice fixo.
// Mais robusto: se a AMBEV adicionar/remover colunas no relatório, o import
// continua funcionando porque resolve via header.
const CAMPOS_031120 = [
  { nome: 'Mapa',            campo: 'mapa',            label: 'Mapa',            isDate: false },
  { nome: 'Fase',            campo: 'fase',            label: 'Fase',            isDate: false },
  { nome: 'Veiculo',         campo: 'veiculo',         label: 'Veículo',         isDate: false },
  { nome: 'Placa',           campo: 'placa',           label: 'Placa',           isDate: false },
  { nome: 'Frota Cadastro',  campo: 'frotaCadastrada', label: 'Frota Cadastrada',isDate: false },
  { nome: 'Emissao',         campo: 'dataEmissao',     label: 'Data Emissão',    isDate: true  },
  { nome: 'DtOper',          campo: 'dataOperacao',    label: 'Data Operação',   isDate: true  },
  { nome: 'HrOper',          campo: 'horaOperacao',    label: 'Hora',            isDate: false },
  { nome: 'Usuario',         campo: 'usuario',         label: 'Usuário',         isDate: false },
  { nome: 'Motorista',       campo: 'motorista',       label: 'Motorista',       isDate: false },
];

// ─── Campos do relatório 01.20.01.47 ──────────────────────────────────────────
const CAMPOS_MOTORISTAS = [
  { nome: 'Código', campo: 'codigoMotorista', label: 'Código' },
  { nome: 'Nome',   campo: 'nomeMotorista',   label: 'Nome' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Formata Date object em DD/MM/AAAA (usando UTC pra evitar deslocamento de timezone)
function dataParaBR(d) {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

// Normaliza string de data pra sempre devolver DD/MM/AAAA, aceitando:
//   - "AAAA-MM-DD"      (ISO — comum em CSVs novos da AMBEV)
//   - "AAAA/MM/DD"      (ISO com barra)
//   - "DD/MM/AAAA"      (BR)
//   - "DD-MM-AAAA"      (BR com hífen)
//   - "MM/DD/AAAA"      (US — quando exportado de locale en-US)
//
// Estratégia: se primeiro ou segundo número > 12 → desambígua sozinho;
// se ambos ≤ 12 → assume DD/MM (BR é o padrão do sistema).
function normalizarStringData(s) {
  if (!s) return s;
  const str = String(s).trim();

  // ── 1) ISO: AAAA-MM-DD ou AAAA/MM/DD (com hora opcional depois)
  const iso = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const ano = iso[1];
    const mes = String(parseInt(iso[2], 10)).padStart(2, '0');
    const dia = String(parseInt(iso[3], 10)).padStart(2, '0');
    if (+mes >= 1 && +mes <= 12 && +dia >= 1 && +dia <= 31) {
      return `${dia}/${mes}/${ano}`;
    }
  }

  // ── 2) PP/SS/AAAA (com barra ou hífen)
  const m = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (m) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    const ano = m[3];
    let dia, mes;
    if (p1 > 12)      { dia = p1; mes = p2; }   // DD/MM (BR)
    else if (p2 > 12) { dia = p2; mes = p1; }   // MM/DD (US) — normaliza
    else              { dia = p1; mes = p2; }   // ambíguo → DD/MM
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
    }
  }

  return str; // não reconheceu → retorna como veio (parseDataBR no FasePage ainda tenta)
}

function celulaParaString(val, isDate = false) {
  if (val === null || val === undefined) return '';
  // Date object (caso cellDates: true em algum momento)
  if (val instanceof Date) return dataParaBR(val);
  // Serial numérico do Excel
  if (isDate && typeof val === 'number' && val > 1) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return dataParaBR(d);
  }
  const str = String(val).trim();
  // String de data — normaliza MM/DD → DD/MM se necessário
  if (isDate) return normalizarStringData(str);
  return str;
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

// Normaliza string pra comparação de cabeçalho: lowercase, remove espaços
// extras, acentos e caracteres especiais. Assim "Data Emissão" casa com
// "data emissao", "DATA EMISSAO" etc.
function normalizarHeader(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairLinhas(rows, campos, pularHeader, filtroPlaca) {
  if (rows.length === 0) return [];

  // Resolve índice de cada campo pelo NOME na primeira linha (cabeçalho).
  // Se algum campo não for encontrado no cabeçalho, fica como -1 (ignorado).
  const cabecalho = (rows[0] || []).map(normalizarHeader);
  const idxPorCampo = {};
  const camposNaoEncontrados = [];
  campos.forEach(({ nome, campo }) => {
    const idx = cabecalho.indexOf(normalizarHeader(nome));
    idxPorCampo[campo] = idx;
    if (idx < 0) camposNaoEncontrados.push(nome);
  });
  if (camposNaoEncontrados.length > 0) {
    // Avisa no console pra ajudar debug — não bloqueia o import.
    console.warn(
      '[Importar 03.11.20] Colunas não encontradas no cabeçalho:',
      camposNaoEncontrados.join(', '),
      '\nCabeçalho lido:',
      cabecalho.filter(Boolean).join(' | ')
    );
  }

  const inicio = pularHeader ? 1 : 0;
  const linhas = [];
  for (let i = inicio; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const obj = {};
    campos.forEach(({ campo, isDate }) => {
      const idx = idxPorCampo[campo];
      obj[campo] = idx >= 0 ? celulaParaString(row[idx], isDate) : '';
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
  const { col, db, stamp } = useDb();
  const { recarregar } = useRelatoriosMPD();
  const [reloadHist, setReloadHist] = useState(0);
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
      // Formato NOVO (padrão do 03.02.37 desde 2026-07-13): 1 doc por
      // importação com `linhas[]` — o Histórico enxerga e permite excluir.
      // Grava PRIMEIRO — se falhar, os dados antigos continuam intactos.
      await addDoc(col('relatorio031120'), {
        importadoEm: new Date(),
        nomeArquivo: dados.nomeArquivo,
        totalLinhas: dados.total,
        linhas: dados.linhas,
        ...stamp(),
      });

      // Migração implícita: apaga docs no formato antigo (1 por linha, sem
      // `linhas[]`). Só roda depois do addDoc ter sucesso.
      const snap = await getDocs(col('relatorio031120'));
      const antigos = snap.docs.filter(d => !Array.isArray(d.data().linhas));
      for (let i = 0; i < antigos.length; i += 450) {
        const batch = writeBatch(db);
        antigos.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      setFase('salvo');
      setMensagem(`${dados.total} linha(s) salvas com sucesso.`);
      setDados(null);
      setReloadHist(k => k + 1);
      if (inputRef.current) inputRef.current.value = '';
      recarregar(); // invalida o cache das telas MPD (EFC/EFD/TI/Histograma)
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

      <HistoricoImportacoes
        colName="relatorio031120"
        campoData="dataEmissao"
        labelPeriodo="Emissão"
        reloadKey={reloadHist}
      />
    </div>
  );
}

// ─── Card 01.20.01.47 — Motoristas ───────────────────────────────────────────

function CardMotoristas() {
  const { col, db, stamp } = useDb();
  const { recarregar } = useRelatoriosMPD();
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
      const snap = await getDocs(col('relatoriomotoristas'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      for (let i = 0; i < dados.linhas.length; i += 450) {
        const batch = writeBatch(db);
        dados.linhas.slice(i, i + 450).forEach(linha => {
          batch.set(doc(col('relatoriomotoristas')), {
            ...linha,
            importadoEm: new Date().toISOString(),
            nomeArquivo: dados.nomeArquivo,
            ...stamp(),
          });
        });
        await batch.commit();
      }
      setFase('salvo');
      setMensagem(`${dados.total} motorista(s) salvo(s) com sucesso.`);
      setDados(null);
      if (inputRef.current) inputRef.current.value = '';
      recarregar(); // invalida o cache das telas MPD (EFC/EFD/TI/Histograma)
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
