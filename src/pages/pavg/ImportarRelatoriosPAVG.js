import { useState, useRef } from 'react';
import { collection, doc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import * as XLSX from 'xlsx';

// ─── Parser genérico (SheetJS) ────────────────────────────────────────────────
function lerArquivo(file, callback) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      callback({ rows });
    } catch {
      callback({ erro: 'Erro ao processar o arquivo. Verifique se é um CSV ou Excel válido.' });
    }
  };
  reader.onerror = () => callback({ erro: 'Falha ao ler o arquivo.' });
  reader.readAsArrayBuffer(file);
}

function validarExtensao(arquivo) {
  const nome = arquivo.name.toLowerCase();
  return nome.endsWith('.csv') || nome.endsWith('.xlsx') || nome.endsWith('.xls');
}

// ─── Configuração Embalagens PA ───────────────────────────────────────────────
const COLS_EMBALAGENS_PA = [
  { campo: 'codProduto', label: 'Cód. Produto' },
  { campo: 'embalagem',  label: 'Embalagem' },
];

function parsearEmbalagensPА(file, callback) {
  lerArquivo(file, ({ rows, erro }) => {
    if (erro) return callback({ erro });
    if (rows.length < 2) return callback({ erro: 'Nenhuma linha de dados encontrada.' });

    const linhas = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const codProduto = String(row[0] ?? '').trim();
      if (!codProduto) continue;
      linhas.push({
        codProduto,
        embalagem: String(row[1] ?? '').trim(),
      });
    }
    if (!linhas.length) return callback({ erro: 'Nenhuma linha de dados encontrada.' });
    callback({ linhas, total: linhas.length });
  });
}

// ─── Configuração Carta de Saldo ──────────────────────────────────────────────
const COLS_CARTA_SALDO = [
  { idx: 2, campo: 'nomeRevenda',       label: 'Nome da Revenda' },
  { idx: 4, campo: 'fabrica',           label: 'Fábrica' },
  { idx: 5, campo: 'codMaterial',       label: 'Cód. Material' },
  { idx: 6, campo: 'descricaoMaterial', label: 'Descrição' },
  { idx: 8, campo: 'saldo',             label: 'Saldo' },
];

const CODIGOS_CARTA_SALDO = new Set([
  '38719','38728','38767','38773','38790','39891','40749',
  '38731','38781','38782','38784','38620','38725','38760',
  '38783','38786','38796','38911','38625',
]);

function parsearCartaSaldo(file, callback) {
  lerArquivo(file, ({ rows, erro }) => {
    if (erro) return callback({ erro });
    if (rows.length < 2) return callback({ erro: 'Nenhuma linha de dados encontrada.' });

    const linhas = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cod = String(row[5] ?? '').trim();
      if (!CODIGOS_CARTA_SALDO.has(cod)) continue;
      const obj = {};
      COLS_CARTA_SALDO.forEach(({ idx, campo }) => { obj[campo] = String(row[idx] ?? '').trim(); });
      if (!COLS_CARTA_SALDO.every(({ campo }) => !obj[campo])) linhas.push(obj);
    }
    if (!linhas.length) return callback({ erro: 'Nenhum código correspondente encontrado.' });
    callback({ linhas, total: linhas.length });
  });
}

// ─── Configuração 02.05.02 ────────────────────────────────────────────────────
const COLS_020502 = [
  { campo: 'deposito',         label: 'Depósito' },
  { campo: 'codProduto',       label: 'Cód. Produto' },
  { campo: 'descricaoProduto', label: 'Descrição' },
  { campo: 'disponivel',       label: 'Disponível' },
];

const CODIGOS_020502 = new Set([
  '828','838','982','988','2006','2538','2546','2548','20530','23186',
  '13196','1388','1695','1743','2585','10530','10537','20533','29253',
  '35331','13201','13203','13205','20217',
]);

function parseDisponivel(valor) {
  const str = String(valor ?? '').trim();
  if (!str) return null;
  const barra = str.indexOf('/');
  if (barra === -1) {
    const n = parseFloat(str.replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  const antes = parseInt(str.slice(0, barra).trim(), 10);
  if (isNaN(antes)) return null;
  const negativo = str.slice(barra + 1).includes('-');
  return negativo ? -Math.abs(antes) : Math.abs(antes);
}

function parsear020502(file, callback) {
  lerArquivo(file, ({ rows, erro }) => {
    if (erro) return callback({ erro });
    if (rows.length < 2) return callback({ erro: 'Nenhuma linha de dados encontrada.' });

    const linhas = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cod = String(row[3] ?? '').trim();
      if (!cod || !CODIGOS_020502.has(cod)) continue;
      const obj = {
        deposito:         String(row[1]  ?? '').trim(),
        codProduto:       cod,
        descricaoProduto: String(row[4]  ?? '').trim(),
        disponivel:       parseDisponivel(row[11]),
      };
      if (obj.deposito || obj.codProduto) linhas.push(obj);
    }
    if (!linhas.length) return callback({ erro: 'Nenhum dos códigos configurados encontrado no arquivo.' });
    callback({ linhas, total: linhas.length });
  });
}

// ─── Configuração 03.02.36.08 ─────────────────────────────────────────────────
const COLS_030236 = [
  { campo: 'codProduto',       label: 'Cód. Produto' },
  { campo: 'descricaoProduto', label: 'Descrição' },
  { campo: 'quantidade',       label: 'Quantidade' },
];

function parsear030236(file, callback) {
  lerArquivo(file, ({ rows, erro }) => {
    if (erro) return callback({ erro });
    if (rows.length < 2) return callback({ erro: 'Nenhuma linha de dados encontrada.' });

    const linhas = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cod = String(row[19] ?? '').trim();
      if (!cod) continue;
      linhas.push({
        codProduto:       cod,
        descricaoProduto: String(row[20] ?? '').trim(),
        quantidade:       String(row[26] ?? '').trim(),
      });
    }
    if (!linhas.length) return callback({ erro: 'Nenhuma linha de dados encontrada.' });
    callback({ linhas, total: linhas.length });
  });
}

// ─── Configuração Comodato 02.02.20 ──────────────────────────────────────────
const COLS_COMODATO = [
  { campo: 'codProduto',       label: 'Cód. Produto' },
  { campo: 'descricaoProduto', label: 'Descrição' },
  { campo: 'saldo',            label: 'Saldo' },
];

const CODIGOS_COMODATO = new Set([
  '188005','188006','198214','863059','287241','296156','101489','101490',
  '235894','786238','899599','27983','198213','30486','138165','108261',
  '108266','29043','30491','100606',
]);

function parsearComodato(file, callback) {
  lerArquivo(file, ({ rows, erro }) => {
    if (erro) return callback({ erro });
    if (rows.length < 2) return callback({ erro: 'Nenhuma linha de dados encontrada.' });

    const mapa = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cod = String(row[14] ?? '').trim();
      if (!CODIGOS_COMODATO.has(cod)) continue;
      const saldoRaw = row[19];
      const saldo = typeof saldoRaw === 'number' ? saldoRaw : parseFloat(String(saldoRaw ?? '').replace(',', '.')) || 0;
      if (mapa[cod]) {
        mapa[cod].saldo += saldo;
      } else {
        mapa[cod] = { codProduto: cod, descricaoProduto: String(row[15] ?? '').trim(), saldo };
      }
    }
    const linhas = Object.values(mapa);
    if (!linhas.length) return callback({ erro: 'Nenhum código correspondente encontrado.' });
    callback({ linhas, total: linhas.length });
  });
}

// ─── Card genérico reutilizável ───────────────────────────────────────────────
function CardImport({ titulo, descricao, icon, inputId, parsear, onSalvar, colsPreview, renderCelula }) {
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [dados, setDados] = useState(null);
  const inputRef = useRef(null);

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!validarExtensao(arquivo)) {
      setFase('erro');
      setMensagem('Selecione um arquivo .csv, .xlsx ou .xls válido.');
      return;
    }
    setFase('idle'); setMensagem(''); setDados(null);
    parsear(arquivo, (resultado) => {
      if (resultado.erro) { setFase('erro'); setMensagem(resultado.erro); }
      else { setDados({ ...resultado, nomeArquivo: arquivo.name }); setFase('preview'); }
    });
    e.target.value = '';
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando'); setMensagem('');
    try {
      await onSalvar(dados);
      setFase('salvo');
      setMensagem(`${dados.total} linha(s) salvas com sucesso.`);
      setDados(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setFase('erro');
      setMensagem(`Erro ao salvar no Firebase: ${err.message}`);
    }
  }

  function handleLimpar() {
    setFase('idle'); setMensagem(''); setDados(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div>
          <div style={s.cardTitulo}>{titulo}</div>
          <div style={s.cardDescricao}>{descricao}</div>
        </div>
      </div>

      <div style={s.uploadArea}>
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" id={inputId} style={{ display: 'none' }} onChange={handleArquivo} />
        <label htmlFor={inputId} style={s.botaoUpload}>📂 Selecionar arquivo</label>
        {temPreview && (
          <button onClick={handleSalvar} disabled={fase === 'salvando'} style={{ ...s.botaoSalvar, opacity: fase === 'salvando' ? 0.6 : 1, cursor: fase === 'salvando' ? 'not-allowed' : 'pointer' }}>
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
          📋 <strong>{dados.nomeArquivo}</strong> · <strong>{dados.total}</strong> linha(s) prontas para salvar
        </div>
      )}

      {temPreview && dados && (
        <div style={s.tabelaWrapper}>
          <table style={s.tabela}>
            <thead>
              <tr>{colsPreview.map(c => <th key={c.campo} style={s.th}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {dados.linhas.slice(0, 10).map((linha, i) => (
                <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                  {colsPreview.map(c => (
                    <td key={c.campo} style={s.td}>
                      {renderCelula ? renderCelula(c.campo, linha) : (linha[c.campo] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {dados.total > 10 && <div style={s.maisLinhas}>... e mais {dados.total - 10} linha(s)</div>}
        </div>
      )}

      {fase === 'idle' && <div style={s.placeholder}>Selecione um arquivo .csv, .xlsx ou .xls para visualizar e salvar</div>}
    </div>
  );
}

// ─── Card Embalagens PA ───────────────────────────────────────────────────────
// Salva: um documento por produto, codProduto = ID do documento

function CardEmbalagensPА() {
  async function onSalvar(dados) {
    const snap = await getDocs(collection(db, 'pavg_embalagens'));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    for (let i = 0; i < dados.linhas.length; i += 450) {
      const batch = writeBatch(db);
      dados.linhas.slice(i, i + 450).forEach(linha => {
        batch.set(doc(db, 'pavg_embalagens', linha.codProduto), {
          codProduto:   linha.codProduto,
          embalagem:    linha.embalagem,
          atualizadoEm: new Date(),
        });
      });
      await batch.commit();
    }
  }

  return (
    <CardImport
      titulo="Embalagens PA"
      descricao="Associa Cód. Produto → Embalagem. Cada produto salvo como documento individual. Reimportação sobrescreve tudo."
      icon="🔗"
      inputId="file-embalagens-pa"
      parsear={parsearEmbalagensPА}
      onSalvar={onSalvar}
      colsPreview={COLS_EMBALAGENS_PA}
    />
  );
}

// ─── Card Carta de Saldo ──────────────────────────────────────────────────────
// Salva: documento único "atual" (sobrescreve)

function CardCartaSaldo() {
  async function onSalvar(dados) {
    await setDoc(doc(db, 'pavg_carta_saldo', 'atual'), {
      importadoEm: new Date(),
      nomeArquivo: dados.nomeArquivo,
      totalLinhas: dados.total,
      linhas: dados.linhas,
    });
  }

  return (
    <CardImport
      titulo="Carta de Saldo"
      descricao={`Colunas: Nome da Revenda · Fábrica · Cód. Material · Descrição · Saldo — ${CODIGOS_CARTA_SALDO.size} códigos filtrados. Sobrescreve importação anterior.`}
      icon="📊"
      inputId="file-carta-saldo"
      parsear={parsearCartaSaldo}
      onSalvar={onSalvar}
      colsPreview={COLS_CARTA_SALDO}
    />
  );
}

// ─── Card 02.05.02 ────────────────────────────────────────────────────────────
// Salva: documento único "atual" por revenda (sobrescreve)

function Card020502({ titulo, colecao, inputId }) {
  async function onSalvar(dados) {
    await setDoc(doc(db, colecao, 'atual'), {
      importadoEm: new Date(),
      nomeArquivo: dados.nomeArquivo,
      totalLinhas: dados.total,
      linhas: dados.linhas,
    });
  }

  return (
    <CardImport
      titulo={titulo}
      descricao={`Depósito · Cód. Produto · Descrição · Disponível — ${CODIGOS_020502.size} códigos filtrados. Sobrescreve importação anterior.`}
      icon="🏭"
      inputId={inputId}
      parsear={parsear020502}
      onSalvar={onSalvar}
      colsPreview={COLS_020502}
      renderCelula={(campo, linha) => linha[campo] === null ? '—' : linha[campo]}
    />
  );
}

// ─── Card 03.02.36.08 ─────────────────────────────────────────────────────────
// Salva: documento único "atual" por revenda (sobrescreve)

function Card030236({ titulo, colecao, inputId }) {
  async function onSalvar(dados) {
    await setDoc(doc(db, colecao, 'atual'), {
      importadoEm: new Date(),
      nomeArquivo: dados.nomeArquivo,
      totalLinhas: dados.total,
      linhas: dados.linhas,
    });
  }

  return (
    <CardImport
      titulo={titulo}
      descricao="Cód. Produto · Descrição · Quantidade. Sobrescreve importação anterior."
      icon="📋"
      inputId={inputId}
      parsear={parsear030236}
      onSalvar={onSalvar}
      colsPreview={COLS_030236}
    />
  );
}

// ─── Card Comodato 02.02.20 ───────────────────────────────────────────────────
// Salva: documento único "atual" por revenda, saldo somado por produto (sobrescreve)

function CardComodato({ titulo, colecao, inputId }) {
  async function onSalvar(dados) {
    await setDoc(doc(db, colecao, 'atual'), {
      importadoEm: new Date(),
      nomeArquivo: dados.nomeArquivo,
      totalLinhas: dados.total,
      linhas: dados.linhas,
    });
  }

  return (
    <CardImport
      titulo={titulo}
      descricao={`Cód. Produto · Descrição · Saldo somado por produto — ${CODIGOS_COMODATO.size} códigos filtrados. Sobrescreve importação anterior.`}
      icon="🤝"
      inputId={inputId}
      parsear={parsearComodato}
      onSalvar={onSalvar}
      colsPreview={COLS_COMODATO}
    />
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ImportarRelatoriosPAVG() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 }}>
          PAVG — Importar Relatórios
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Cada reimportação sobrescreve os dados anteriores. Importe Embalagens e Associações primeiro.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <CardEmbalagensPА />
          <div style={{ ...s.card, opacity: 0.5, pointerEvents: 'none' }}>
            <div style={s.cardHeader}>
              <span style={{ fontSize: 22 }}>🔗</span>
              <div>
                <div style={s.cardTitulo}>Embalagem AG</div>
                <div style={s.cardDescricao}>Em breve — estrutura a definir.</div>
              </div>
            </div>
          </div>
        </div>
        <CardCartaSaldo />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Card020502 titulo="02.05.02 Carpina"  colecao="pavg_020502_carpina"  inputId="file-020502-carpina" />
          <Card020502 titulo="02.05.02 Palmares" colecao="pavg_020502_palmares" inputId="file-020502-palmares" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Card030236 titulo="03.02.36.08 Carpina"  colecao="pavg_030236_carpina"  inputId="file-030236-carpina" />
          <Card030236 titulo="03.02.36.08 Palmares" colecao="pavg_030236_palmares" inputId="file-030236-palmares" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <CardComodato titulo="Comodato Carpina - 02.02.20"  colecao="pavg_comodato_carpina"  inputId="file-comodato-carpina" />
          <CardComodato titulo="Comodato Palmares - 02.02.20" colecao="pavg_comodato_palmares" inputId="file-comodato-palmares" />
        </div>
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = {
  card:        { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardHeader:  { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 },
  cardTitulo:  { fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 2 },
  cardDescricao: { fontSize: 13, color: '#6b7280' },
  uploadArea:  { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  botaoUpload: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none' },
  botaoSalvar: { padding: '8px 16px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600 },
  botaoLimpar: { padding: '8px 14px', backgroundColor: 'transparent', border: '1px solid #d1d5db', color: '#6b7280', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  alerta:      { padding: '9px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, marginBottom: 12 },
  alertaSucesso: { backgroundColor: '#dcfce7', color: '#166534', borderLeft: '4px solid #22c55e' },
  alertaErro:    { backgroundColor: '#fee2e2', color: '#991b1b', borderLeft: '4px solid #ef4444' },
  alertaInfo:    { backgroundColor: '#dbeafe', color: '#1e40af', borderLeft: '4px solid #3b82f6' },
  tabelaWrapper: { overflowX: 'auto', borderRadius: 6, border: '1px solid #e5e7eb', marginTop: 4 },
  tabela:      { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:          { backgroundColor: '#1a1a2e', color: '#fff', padding: '8px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' },
  trPar:       { backgroundColor: '#fff' },
  trImpar:     { backgroundColor: '#f9fafb' },
  td:          { padding: '7px 12px', color: '#374151', borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  maisLinhas:  { padding: '8px 12px', fontSize: 12, color: '#9ca3af', fontStyle: 'italic', borderTop: '1px solid #e5e7eb' },
  placeholder: { padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13, fontStyle: 'italic' },
};
