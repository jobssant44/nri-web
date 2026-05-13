import { useState, useRef } from 'react';
import { collection, writeBatch, doc, getDocs, query, where } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import * as XLSX from 'xlsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizarRevenda(raw) {
  const lower = String(raw ?? '').trim().toLowerCase();
  if (lower === 'carpina')  return 'Carpina';
  if (lower === 'palmares') return 'Palmares';
  return null;
}

function parseNomeArquivo(nome) {
  const semExt = nome.replace(/\.[^.]+$/, '');
  const partes = semExt.split('.');
  if (partes.length < 4) return null;
  const revenda = normalizarRevenda(partes[0]);
  if (!revenda) return null;
  const dia = parseInt(partes[1], 10);
  const mes = parseInt(partes[2], 10);
  const ano = parseInt(partes[3], 10);
  if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return {
    revenda,
    dia,
    mes,
    ano,
    data: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`,
    nomeArquivo: nome,
  };
}

function parseDiferenca(valor) {
  const str = String(valor ?? '').trim();
  if (!str) return null;
  const negativo = str.endsWith('-');
  const semSinal = negativo ? str.slice(0, -1) : str;
  const num = parseInt(semSinal.split('/')[0].trim(), 10);
  return isNaN(num) ? null : (negativo ? -Math.abs(num) : num);
}

function lerArquivo(file) {
  const isCSV = file.name.toLowerCase().endsWith('.csv');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (isCSV) {
      // CSV: ler como texto para evitar auto-conversão do XLSX
      // SAP exporta em latin-1; se falhar, tenta UTF-8
      reader.onload = (ev) => {
        try {
          const texto = ev.target.result;
          const linhas = texto.split(/\r?\n/).filter(l => l.trim());
          if (!linhas.length) { resolve([]); return; }

          // Detecta separador pela primeira linha
          const sep = linhas[0].includes(';') ? ';' : ',';

          // Cada célula é sempre string — sem auto-conversão possível
          const rows = linhas.map(l => l.split(sep).map(c => c.trim()));
          resolve(rows);
        } catch {
          reject(new Error('Erro ao processar o arquivo CSV.'));
        }
      };
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsText(file, 'latin1');
    } else {
      // Excel (.xlsx / .xls): continua com XLSX em modo binário
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
          resolve(rows);
        } catch {
          reject(new Error('Erro ao processar o arquivo Excel. Verifique se é um .xlsx ou .xls válido.'));
        }
      };
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsArrayBuffer(file);
    }
  });
}

function extrairLinhas(rows, info) {
  const linhas = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const codProduto = String(row[3] ?? '').trim();
    const deposito   = String(row[1] ?? '').trim();
    if (!codProduto && !deposito) continue;
    linhas.push({
      ...info,
      deposito,
      codProduto,
      descricao:   String(row[4] ?? '').trim(),
      un:          String(row[5] ?? '').trim(),
      diferenca:   parseDiferenca(row[13]),
      importadoEm: new Date().toISOString(),
    });
  }
  return linhas;
}

// ─── Card PAR ─────────────────────────────────────────────────────────────────

function CardPAR() {
  const { col, colRevenda, docRef, db, stamp, rid } = useDb();
  const [fase, setFase]       = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [preview, setPreview] = useState(null); // { linhas, total }
  const inputRef              = useRef(null);

  async function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setFase('lendo');
    setPreview(null);
    setMensagem('');

    try {
      const rows = await lerArquivo(arquivo);
      if (rows.length < 2) {
        setFase('erro');
        setMensagem('Nenhuma linha de dados encontrada no arquivo.');
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      const linhas = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const codProduto = String(row[0] ?? '').trim(); // Coluna A
        if (!codProduto) continue;
        linhas.push({ codProduto, descricao: String(row[1] ?? '').trim() });
      }
      if (!linhas.length) {
        setFase('erro');
        setMensagem('Nenhuma linha válida encontrada.');
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      setPreview({ nomeArquivo: arquivo.name, linhas, total: linhas.length });
      setFase('preview');
    } catch (err) {
      setFase('erro');
      setMensagem(err.message);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSalvar() {
    if (!preview) return;
    setFase('salvando');
    try {
      // Apaga apenas os documentos da revenda atual
      const snap = await getDocs(colRevenda('conciliacao_par'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Salva os novos usando {rid}_{codProduto} como ID do documento
      const prefixo = rid || 'global';
      for (let i = 0; i < preview.linhas.length; i += 450) {
        const batch = writeBatch(db);
        preview.linhas.slice(i, i + 450).forEach(item => {
          batch.set(docRef('conciliacao_par', `${prefixo}_${item.codProduto}`), { ...item, ...stamp() });
        });
        await batch.commit();
      }
      setFase('salvo');
      setMensagem(`${preview.total} produto(s) P.A.R. salvos com sucesso.`);
      setPreview(null);
    } catch (err) {
      setFase('erro');
      setMensagem(`Erro ao salvar: ${err.message}`);
    }
  }

  function handleLimpar() {
    setFase('idle'); setMensagem(''); setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ fontSize: 24 }}>⚠️</span>
        <div>
          <div style={s.cardTitulo}>PAR — Produto de Alto Risco</div>
          <div style={s.cardDescricao}>
            Colunas importadas: <strong>A</strong> Cód. Produto · <strong>B</strong> Descrição.
            Reimportação substitui toda a lista anterior.
          </div>
        </div>
      </div>

      <div style={s.uploadArea}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          id="file-par"
          style={{ display: 'none' }}
          onChange={handleArquivo}
        />
        <label
          htmlFor="file-par"
          style={{ ...s.botaoUpload, opacity: fase === 'salvando' ? 0.5 : 1, pointerEvents: fase === 'salvando' ? 'none' : 'auto' }}
        >
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

      {fase === 'lendo'  && <div style={{ ...s.alerta, ...s.alertaInfo }}>⏳ Processando arquivo...</div>}
      {fase === 'salvo'  && <div style={{ ...s.alerta, ...s.alertaSucesso }}>✅ {mensagem}</div>}
      {fase === 'erro'   && <div style={{ ...s.alerta, ...s.alertaErro }}>❌ {mensagem}</div>}

      {temPreview && preview && (
        <div style={{ ...s.alerta, ...s.alertaInfo }}>
          📋 <strong>{preview.nomeArquivo}</strong> · <strong>{preview.total}</strong> produto(s) prontos para salvar
        </div>
      )}

      {temPreview && preview && (
        <div style={s.tabelaWrapper}>
          <table style={s.tabela}>
            <thead>
              <tr>
                {['Cód. Produto', 'Descrição'].map(h => <th key={h} style={s.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.linhas.slice(0, 10).map((linha, i) => (
                <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                  <td style={s.td}>{linha.codProduto || '—'}</td>
                  <td style={s.td}>{linha.descricao  || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.total > 10 && (
            <div style={s.maisLinhas}>... e mais {preview.total - 10} produto(s)</div>
          )}
        </div>
      )}

      {fase === 'idle' && (
        <div style={s.placeholder}>Selecione um arquivo .csv, .xlsx ou .xls para visualizar e salvar</div>
      )}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ImportarConciliacaoPage() {
  const { col, docRef, db, stamp } = useDb();
  // lotes: [{ nomeArquivo, info, linhas, total, erro }]
  const [lotes, setLotes]       = useState([]);
  const [fase, setFase]         = useState('idle'); // idle | lendo | preview | salvando | salvo
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const inputRef                = useRef(null);

  async function handleArquivos(e) {
    const arquivos = Array.from(e.target.files ?? []);
    if (!arquivos.length) return;

    setFase('lendo');
    setLotes([]);

    const resultados = [];

    for (const arquivo of arquivos) {
      const info = parseNomeArquivo(arquivo.name);
      if (!info) {
        resultados.push({
          nomeArquivo: arquivo.name,
          erro: `Nome inválido — esperado: Carpina.DD.MM.AAAA.csv ou Palmares.DD.MM.AAAA.csv`,
        });
        continue;
      }

      try {
        const rows = await lerArquivo(arquivo);
        if (rows.length < 2) {
          resultados.push({ nomeArquivo: arquivo.name, erro: 'Nenhuma linha de dados encontrada.' });
          continue;
        }
        const linhas = extrairLinhas(rows, info);
        if (!linhas.length) {
          resultados.push({ nomeArquivo: arquivo.name, erro: 'Nenhuma linha válida encontrada.' });
          continue;
        }
        resultados.push({ nomeArquivo: arquivo.name, info, linhas, total: linhas.length });
      } catch (err) {
        resultados.push({ nomeArquivo: arquivo.name, erro: err.message });
      }
    }

    if (inputRef.current) inputRef.current.value = '';
    setLotes(resultados);
    setFase('preview');
  }

  async function handleSalvar() {
    const validos = lotes.filter(l => !l.erro);
    if (!validos.length) return;

    setFase('salvando');
    setProgresso({ atual: 0, total: validos.length });

    try {
      for (let idx = 0; idx < validos.length; idx++) {
        const { info, linhas } = validos[idx];

        // Apaga registros existentes com mesma revenda + data antes de salvar
        const snap = await getDocs(
          query(
            col('conciliacao_estoque'),
            where('revenda', '==', info.revenda),
            where('data',    '==', info.data)
          )
        );
        for (let i = 0; i < snap.docs.length; i += 450) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }

        // Salva os novos registros
        for (let i = 0; i < linhas.length; i += 450) {
          const batch = writeBatch(db);
          linhas.slice(i, i + 450).forEach(item => {
            batch.set(doc(col('conciliacao_estoque')), { ...item, ...stamp() });
          });
          await batch.commit();
        }

        setProgresso({ atual: idx + 1, total: validos.length });
      }
      setFase('salvo');
    } catch (err) {
      setFase('preview');
      setLotes(prev => [...prev, { nomeArquivo: '—', erro: `Erro ao salvar no Firebase: ${err.message}` }]);
    }
  }

  function handleLimpar() {
    setFase('idle');
    setLotes([]);
    setProgresso({ atual: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = '';
  }

  const validos  = lotes.filter(l => !l.erro);
  const invalidos = lotes.filter(l => l.erro);
  const totalRegistros = validos.reduce((acc, l) => acc + l.total, 0);
  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 }}>
          Importar 02.05.02
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Selecione um ou mais arquivos de uma vez. Cada arquivo deve seguir o padrão{' '}
          <strong>Carpina.DD.MM.AAAA.csv</strong> ou <strong>Palmares.DD.MM.AAAA.csv</strong>.
        </p>
      </div>

      {/* Card principal */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={{ fontSize: 24 }}>🏭</span>
          <div>
            <div style={s.cardTitulo}>Relatório 02.05.02</div>
            <div style={s.cardDescricao}>
              Colunas importadas: <strong>B</strong> Depósito · <strong>D</strong> Cód. Produto ·{' '}
              <strong>E</strong> Descrição · <strong>F</strong> Un · <strong>N</strong> Diferença
            </div>
          </div>
        </div>

        {/* Botões */}
        <div style={s.uploadArea}>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            id="file-conciliacao-020502"
            multiple
            style={{ display: 'none' }}
            onChange={handleArquivos}
          />
          <label
            htmlFor="file-conciliacao-020502"
            style={{ ...s.botaoUpload, opacity: fase === 'salvando' ? 0.5 : 1, pointerEvents: fase === 'salvando' ? 'none' : 'auto' }}
          >
            📂 Selecionar arquivo(s)
          </label>

          {temPreview && validos.length > 0 && (
            <button
              onClick={handleSalvar}
              disabled={fase === 'salvando'}
              style={{ ...s.botaoSalvar, opacity: fase === 'salvando' ? 0.6 : 1, cursor: fase === 'salvando' ? 'not-allowed' : 'pointer' }}
            >
              {fase === 'salvando'
                ? `⏳ Salvando ${progresso.atual}/${progresso.total}...`
                : `💾 Salvar ${validos.length} arquivo(s) no Firebase`}
            </button>
          )}

          {(temPreview || fase === 'salvo') && (
            <button onClick={handleLimpar} style={s.botaoLimpar}>✕ Limpar</button>
          )}
        </div>

        {/* Sucesso geral */}
        {fase === 'salvo' && (
          <div style={{ ...s.alerta, ...s.alertaSucesso }}>
            ✅ {validos.length} arquivo(s) salvos com sucesso — {totalRegistros} registros importados no total.
          </div>
        )}

        {/* Lendo */}
        {fase === 'lendo' && (
          <div style={{ ...s.alerta, ...s.alertaInfo }}>⏳ Processando arquivos...</div>
        )}

        {/* Resumo dos lotes */}
        {temPreview && lotes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Válidos */}
            {validos.map((l, i) => (
              <div key={i} style={{ ...s.alerta, ...s.alertaSucesso, marginBottom: 0 }}>
                ✅ <strong>{l.nomeArquivo}</strong> · Revenda: <strong>{l.info.revenda}</strong> · Data: <strong>{l.info.data}</strong> · <strong>{l.total}</strong> linha(s)
              </div>
            ))}
            {/* Inválidos */}
            {invalidos.map((l, i) => (
              <div key={i} style={{ ...s.alerta, ...s.alertaErro, marginBottom: 0 }}>
                ❌ <strong>{l.nomeArquivo}</strong> · {l.erro}
              </div>
            ))}

            {/* Totalizador */}
            {validos.length > 0 && (
              <div style={{ ...s.alerta, ...s.alertaInfo, marginBottom: 0, marginTop: 4 }}>
                📦 <strong>{validos.length}</strong> arquivo(s) válido(s) ·{' '}
                <strong>{totalRegistros}</strong> registros prontos para salvar
                {invalidos.length > 0 && (
                  <> · <span style={{ color: '#991b1b' }}>{invalidos.length} arquivo(s) com erro serão ignorados</span></>
                )}
              </div>
            )}
          </div>
        )}

        {/* Preview da tabela do primeiro arquivo válido */}
        {temPreview && validos.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Pré-visualização — {validos[0].nomeArquivo} (primeiras 10 linhas)
            </div>
            <div style={s.tabelaWrapper}>
              <table style={s.tabela}>
                <thead>
                  <tr>
                    {['Depósito', 'Cód. Produto', 'Descrição', 'Un', 'Diferença'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validos[0].linhas.slice(0, 10).map((linha, i) => (
                    <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                      <td style={s.td}>{linha.deposito   || '—'}</td>
                      <td style={s.td}>{linha.codProduto || '—'}</td>
                      <td style={s.td}>{linha.descricao  || '—'}</td>
                      <td style={s.td}>{linha.un         || '—'}</td>
                      <td style={{ ...s.td, fontWeight: 600, color: linha.diferenca === null ? '#9ca3af' : linha.diferenca < 0 ? '#dc2626' : linha.diferenca > 0 ? '#16a34a' : '#374151' }}>
                        {linha.diferenca === null ? '—' : linha.diferenca}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validos[0].total > 10 && (
                <div style={s.maisLinhas}>... e mais {validos[0].total - 10} linha(s)</div>
              )}
            </div>
          </div>
        )}

        {fase === 'idle' && (
          <div style={s.placeholder}>
            Selecione um ou mais arquivos .csv, .xlsx ou .xls para visualizar e salvar
          </div>
        )}
      </div>

      {/* Card PAR */}
      <div style={{ marginTop: 20 }}>
        <CardPAR />
      </div>

      {/* Instruções */}
      <div style={{ marginTop: 20, padding: '16px 20px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>ℹ️ Padrão do nome do arquivo</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#78350f', lineHeight: 1.8 }}>
          <li>Formato: <code style={s.code}>Carpina.DD.MM.AAAA.csv</code> ou <code style={s.code}>Palmares.DD.MM.AAAA.csv</code></li>
          <li>Exemplo: <code style={s.code}>Carpina.01.02.2026.csv</code> → Revenda: Carpina, Data: 01/02/2026</li>
          <li>O nome da revenda não diferencia maiúsculas/minúsculas (carpina, CARPINA e Carpina são aceitos)</li>
          <li>Coluna N (Diferença): <code style={s.code}>150/00</code> = 150 | <code style={s.code}>150/00-</code> = −150</li>
          <li>Arquivos com nome inválido são listados como erro e ignorados — os válidos são salvos normalmente</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = {
  card:          { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardHeader:    { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 },
  cardTitulo:    { fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 2 },
  cardDescricao: { fontSize: 13, color: '#6b7280' },
  uploadArea:    { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  botaoUpload:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none' },
  botaoSalvar:   { padding: '8px 16px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600 },
  botaoLimpar:   { padding: '8px 14px', backgroundColor: 'transparent', border: '1px solid #d1d5db', color: '#6b7280', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  alerta:        { padding: '9px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, marginBottom: 12 },
  alertaSucesso: { backgroundColor: '#dcfce7', color: '#166534', borderLeft: '4px solid #22c55e' },
  alertaErro:    { backgroundColor: '#fee2e2', color: '#991b1b', borderLeft: '4px solid #ef4444' },
  alertaInfo:    { backgroundColor: '#dbeafe', color: '#1e40af', borderLeft: '4px solid #3b82f6' },
  tabelaWrapper: { overflowX: 'auto', borderRadius: 6, border: '1px solid #e5e7eb', marginTop: 4 },
  tabela:        { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:            { backgroundColor: '#1a1a2e', color: '#fff', padding: '8px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' },
  trPar:         { backgroundColor: '#fff' },
  trImpar:       { backgroundColor: '#f9fafb' },
  td:            { padding: '7px 12px', color: '#374151', borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  maisLinhas:    { padding: '8px 12px', fontSize: 12, color: '#9ca3af', fontStyle: 'italic', borderTop: '1px solid #e5e7eb' },
  placeholder:   { padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13, fontStyle: 'italic' },
  code:          { backgroundColor: '#f3f4f6', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 },
};
