import { useState, useRef } from 'react';
import { collection, addDoc, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// ─── Mapeamento de colunas do 03.02.37 — Troca (letra Excel → índice 0-based) ─
// Pré-filtros: Operação (E, idx 4) = "5" · Status (J, idx 9) = "A" · Origem (BO, idx 66) = "Digitado"
const CAMPOS_TROCA = [
  { idx: 3,  campo: 'cliente',     label: 'Cliente' },
  { idx: 4,  campo: 'operacao',    label: 'Operação' },
  { idx: 6,  campo: 'data',        label: 'Data' },
  { idx: 7,  campo: 'nota',        label: 'Nota' },
  { idx: 9,  campo: 'status',      label: 'Status' },
  { idx: 13, campo: 'nomeCliente', label: 'Nome Cliente' },
  { idx: 15, campo: 'codProduto',  label: 'Cód. Produto' },
  { idx: 16, campo: 'unidade',     label: 'Unidade' },
  { idx: 17, campo: 'descricao',   label: 'Descrição' },
  { idx: 19, campo: 'quantidade',  label: 'Quantidade' },
  { idx: 20, campo: 'valor',       label: 'Valor' },
  { idx: 66, campo: 'origem',      label: 'Origem' },
  { idx: 77, campo: 'rn',          label: 'RN' },
];

// ─── Mapeamento de colunas do 03.02.37 (letra Excel → índice 0-based) ────────
// Fórmula: letra única X → charCode(X) - 65
//          duas letras XY → (charCode(X)-64)*26 + (charCode(Y)-65)
const CAMPOS_030237 = [
  { idx: 2,  campo: 'operacao',      label: 'Operação' },
  { idx: 3,  campo: 'vendedor',      label: 'Vendedor' },
  { idx: 4,  campo: 'motorista',     label: 'Motorista' },
  { idx: 5,  campo: 'dataOperacao',  label: 'Dt. Operação' },
  { idx: 6,  campo: 'emissao',       label: 'Emissão' },
  { idx: 7,  campo: 'nota',          label: 'Nota' },
  { idx: 9,  campo: 'status',        label: 'Status' },
  { idx: 12, campo: 'cliente',       label: 'Cliente' },
  { idx: 13, campo: 'nome',          label: 'Nome' },
  { idx: 15, campo: 'produto',       label: 'Produto' },
  { idx: 16, campo: 'unidade',       label: 'Unidade' },
  { idx: 17, campo: 'descricao',     label: 'Descrição' },
  { idx: 19, campo: 'qtde',          label: 'Qtde' },
  { idx: 20, campo: 'valor',         label: 'Valor' },
  { idx: 26, campo: 'mapa',          label: 'Mapa' },
  { idx: 66, campo: 'origemPedido',  label: 'Origem do Pedido' },
  { idx: 86, campo: 'pesoBrutoMapa', label: 'Peso Bruto Mapa' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitLinha(linha, sep) {
  const cols = [];
  let dentro = false;
  let atual = '';
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      dentro = !dentro;
    } else if (c === sep && !dentro) {
      cols.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
  }
  cols.push(atual.trim());
  return cols;
}

function parsearCSV030237(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return { linhas: [], total: 0 };

  const sep = linhas[0].includes(';') ? ';' : ',';

  const dados = [];
  for (let i = 1; i < linhas.length; i++) {
    const cols = splitLinha(linhas[i], sep);
    const obj = {};
    CAMPOS_030237.forEach(({ idx, campo }) => {
      obj[campo] = (cols[idx] ?? '').replace(/^"|"$/g, '').trim();
    });
    // Ignorar linhas completamente vazias
    const vazia = CAMPOS_030237.every(({ campo }) => !obj[campo]);
    if (!vazia) dados.push(obj);
  }
  return { linhas: dados, total: dados.length };
}

// ─── Card 03.02.37 ────────────────────────────────────────────────────────────

function Card030237() {
  const [fase, setFase] = useState('idle'); // idle | preview | salvando | salvo | erro
  const [mensagem, setMensagem] = useState('');
  const [dados, setDados] = useState(null); // { linhas, total, nomeArquivo }
  const inputRef = useRef(null);

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith('.csv')) {
      setFase('erro');
      setMensagem('Selecione um arquivo .csv válido.');
      return;
    }
    setFase('idle');
    setMensagem('');
    setDados(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const texto = ev.target.result;
        const { linhas, total } = parsearCSV030237(texto);
        if (total === 0) {
          setFase('erro');
          setMensagem('Nenhuma linha de dados encontrada no arquivo.');
          return;
        }
        setDados({ linhas, total, nomeArquivo: arquivo.name });
        setFase('preview');
        setMensagem('');
      } catch {
        setFase('erro');
        setMensagem('Erro ao processar o arquivo.');
      }
    };
    reader.onerror = () => { setFase('erro'); setMensagem('Falha ao ler o arquivo.'); };
    reader.readAsText(arquivo, 'UTF-8');
    e.target.value = '';
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando');
    setMensagem('');
    try {
      await addDoc(collection(db, 'relatorio_030237'), {
        importadoEm: new Date(),
        nomeArquivo: dados.nomeArquivo,
        totalLinhas: dados.total,
        linhas: dados.linhas,
      });
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
    setFase('idle');
    setMensagem('');
    setDados(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ fontSize: 22 }}>📄</span>
        <div>
          <div style={s.cardTitulo}>03.02.37</div>
          <div style={s.cardDescricao}>Relatório de prejuízo — {CAMPOS_030237.length} campos mapeados por posição de coluna</div>
        </div>
      </div>

      {/* Ações */}
      <div style={s.uploadArea}>
        <input ref={inputRef} type="file" accept=".csv" id="file-030237" style={{ display: 'none' }} onChange={handleArquivo} />
        <label htmlFor="file-030237" style={s.botaoUpload}>
          📂 Selecionar CSV
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

      {/* Feedback */}
      {fase === 'salvo' && (
        <div style={{ ...s.alerta, ...s.alertaSucesso }}>✅ {mensagem}</div>
      )}
      {fase === 'erro' && (
        <div style={{ ...s.alerta, ...s.alertaErro }}>❌ {mensagem}</div>
      )}

      {/* Resumo do arquivo */}
      {temPreview && dados && (
        <div style={{ ...s.alerta, ...s.alertaInfo }}>
          📋 Arquivo: <strong>{dados.nomeArquivo}</strong> · <strong>{dados.total}</strong> linha(s) prontas para salvar
        </div>
      )}

      {/* Preview tabela */}
      {temPreview && dados && (
        <div style={s.tabelaWrapper}>
          <table style={s.tabela}>
            <thead>
              <tr>
                {CAMPOS_030237.map(c => (
                  <th key={c.campo} style={s.th}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.linhas.slice(0, 10).map((linha, i) => (
                <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                  {CAMPOS_030237.map(c => (
                    <td key={c.campo} style={s.td}>{linha[c.campo]}</td>
                  ))}
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
        <div style={s.placeholder}>Selecione um arquivo .csv para visualizar e salvar</div>
      )}
    </div>
  );
}

// ─── Card 03.01.47.01 — Hecto por dia ────────────────────────────────────────

function parsearHecto(valor) {
  const str = String(valor ?? '').trim().replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function Card030147Hecto() {
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [dados, setDados] = useState(null); // [{ data, totalHecto }]
  const inputRef = useRef(null);

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith('.csv')) {
      setFase('erro');
      setMensagem('Selecione um arquivo .csv válido.');
      return;
    }
    setFase('idle');
    setMensagem('');
    setDados(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const texto = ev.target.result;
        const linhas = texto.split(/\r?\n/).filter(l => l.trim());
        if (linhas.length < 2) {
          setFase('erro');
          setMensagem('Arquivo vazio ou sem dados.');
          return;
        }
        const sep = linhas[0].includes(';') ? ';' : ',';

        // Agrupa por data somando Hecto, filtrando AK = "Pedido Normal"
        const mapa = new Map();
        for (let i = 1; i < linhas.length; i++) {
          const cols = splitLinha(linhas[i], sep);
          const tipoPedido = (cols[36] ?? '').replace(/^"|"$/g, '').trim();
          if (tipoPedido !== 'Pedido Normal') continue;
          const data   = (cols[24] ?? '').replace(/^"|"$/g, '').trim();
          const hecto  = parsearHecto((cols[35] ?? '').replace(/^"|"$/g, ''));
          if (!data) continue;
          mapa.set(data, (mapa.get(data) ?? 0) + hecto);
        }

        if (mapa.size === 0) {
          setFase('erro');
          setMensagem('Nenhuma linha com "Pedido Normal" encontrada.');
          return;
        }

        const resultado = [...mapa.entries()]
          .map(([data, totalHecto]) => ({ data, totalHecto: Math.round(totalHecto * 100) / 100 }))
          .sort((a, b) => {
            // Tenta ordenar por data — suporta DD/MM/AAAA e AAAA-MM-DD
            const parseData = (d) => {
              const partes = d.includes('/') ? d.split('/') : d.split('-');
              if (partes.length === 3) {
                return partes[0].length === 4
                  ? new Date(partes[0], partes[1] - 1, partes[2])
                  : new Date(partes[2], partes[1] - 1, partes[0]);
              }
              return new Date(d);
            };
            return parseData(a.data) - parseData(b.data);
          });

        setDados({ linhas: resultado, nomeArquivo: arquivo.name });
        setFase('preview');
      } catch {
        setFase('erro');
        setMensagem('Erro ao processar o arquivo.');
      }
    };
    reader.onerror = () => { setFase('erro'); setMensagem('Falha ao ler o arquivo.'); };
    reader.readAsText(arquivo, 'latin1');
    e.target.value = '';
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando');
    setMensagem('');
    try {
      // Limpa coleção antes de reimportar
      const snap = await getDocs(collection(db, 'relatorio_030147hecto'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Salva um documento por data
      for (let i = 0; i < dados.linhas.length; i += 450) {
        const batch = writeBatch(db);
        dados.linhas.slice(i, i + 450).forEach(linha => {
          batch.set(doc(collection(db, 'relatorio_030147hecto')), {
            data:        linha.data,
            totalHecto:  linha.totalHecto,
            importadoEm: new Date().toISOString(),
            nomeArquivo: dados.nomeArquivo,
          });
        });
        await batch.commit();
      }
      setFase('salvo');
      setMensagem(`${dados.linhas.length} data(s) salvas com sucesso.`);
      setDados(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setFase('erro');
      setMensagem(`Erro ao salvar no Firebase: ${err.message}`);
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
        <span style={{ fontSize: 22 }}>📊</span>
        <div>
          <div style={s.cardTitulo}>03.01.47.01 — Hecto por Dia</div>
          <div style={s.cardDescricao}>
            Lê colunas Y (Data) e AJ (Hecto), filtra AK = "Pedido Normal", soma por dia
          </div>
        </div>
      </div>

      <div style={s.uploadArea}>
        <input ref={inputRef} type="file" accept=".csv" id="file-030147hecto" style={{ display: 'none' }} onChange={handleArquivo} />
        <label htmlFor="file-030147hecto" style={s.botaoUpload}>📂 Selecionar CSV</label>

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
          📋 Arquivo: <strong>{dados.nomeArquivo}</strong> · <strong>{dados.linhas.length}</strong> data(s) com somatório de Hecto
        </div>
      )}

      {temPreview && dados && (
        <div style={s.tabelaWrapper}>
          <table style={s.tabela}>
            <thead>
              <tr>
                <th style={s.th}>Data</th>
                <th style={s.th}>Total Hecto</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.slice(0, 10).map((linha, i) => (
                <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                  <td style={s.td}>{linha.data}</td>
                  <td style={s.td}>{linha.totalHecto.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dados.linhas.length > 10 && (
            <div style={s.maisLinhas}>... e mais {dados.linhas.length - 10} data(s) não exibidas</div>
          )}
        </div>
      )}

      {fase === 'idle' && (
        <div style={s.placeholder}>Selecione um arquivo .csv para visualizar e salvar</div>
      )}
    </div>
  );
}

// ─── Card 03.02.37 — Troca ───────────────────────────────────────────────────

function parsearCSVTroca(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return { linhas: [], total: 0, ignoradas: 0, amostra: null };

  const sep = linhas[0].includes(';') ? ';' : ',';
  const dados = [];
  let ignoradas = 0;

  // Amostras dos valores brutos nas colunas de filtro (diagnóstico)
  const setsAmostra = { operacao: new Set(), status: new Set(), origem: new Set() };

  for (let i = 1; i < linhas.length; i++) {
    const cols = splitLinha(linhas[i], sep);
    const obj = {};
    CAMPOS_TROCA.forEach(({ idx, campo }) => {
      obj[campo] = (cols[idx] ?? '').replace(/^"|"$/g, '').trim();
    });

    const vazia = CAMPOS_TROCA.every(({ campo }) => !obj[campo]);
    if (vazia) continue;

    // Coleta amostras (até 6 valores únicos por coluna)
    if (setsAmostra.operacao.size < 6) setsAmostra.operacao.add(JSON.stringify(obj.operacao));
    if (setsAmostra.status.size   < 6) setsAmostra.status.add(JSON.stringify(obj.status));
    if (setsAmostra.origem.size   < 6) setsAmostra.origem.add(JSON.stringify(obj.origem));

    // Pré-filtros — comparação numérica para Operação, string para os demais
    const opNum = parseFloat(String(obj.operacao).trim().replace(',', '.'));
    if (opNum !== 5)                                               { ignoradas++; continue; }
    if (String(obj.status).trim().toUpperCase() !== 'A')          { ignoradas++; continue; }
    if (String(obj.origem).trim().toLowerCase() !== 'digitado')   { ignoradas++; continue; }

    dados.push(obj);
  }

  const amostra = {
    operacao: [...setsAmostra.operacao].map(v => JSON.parse(v)),
    status:   [...setsAmostra.status].map(v => JSON.parse(v)),
    origem:   [...setsAmostra.origem].map(v => JSON.parse(v)),
  };

  return { linhas: dados, total: dados.length, ignoradas, amostra };
}

function CardTroca() {
  const [fase,      setFase]      = useState('idle'); // idle | preview | salvando | salvo | erro
  const [mensagem,  setMensagem]  = useState('');
  const [dados,     setDados]     = useState(null);   // { linhas, total, ignoradas, nomeArquivo, amostra }
  const inputRef = useRef(null);

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith('.csv')) {
      setFase('erro');
      setMensagem('Selecione um arquivo .csv válido.');
      return;
    }
    setFase('idle');
    setMensagem('');
    setDados(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const texto = ev.target.result;
        const { linhas, total, ignoradas, amostra } = parsearCSVTroca(texto);
        if (total === 0) {
          // Guarda amostra para diagnóstico
          setDados({ linhas: [], total: 0, ignoradas, nomeArquivo: arquivo.name, amostra });
          setFase('erro');
          setMensagem('Nenhuma linha passou pelos pré-filtros. Veja abaixo os valores encontrados nas colunas de filtro.');
          return;
        }
        setDados({ linhas, total, ignoradas, nomeArquivo: arquivo.name, amostra });
        setFase('preview');
      } catch {
        setFase('erro');
        setMensagem('Erro ao processar o arquivo.');
      }
    };
    reader.onerror = () => { setFase('erro'); setMensagem('Falha ao ler o arquivo.'); };
    reader.readAsText(arquivo, 'UTF-8');
    e.target.value = '';
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando');
    setMensagem('');
    try {
      // Limpa coleção antes de reimportar
      const snap = await getDocs(collection(db, 'relatorio_troca'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Salva novo documento
      await addDoc(collection(db, 'relatorio_troca'), {
        importadoEm: new Date(),
        nomeArquivo: dados.nomeArquivo,
        totalLinhas: dados.total,
        linhas:      dados.linhas,
      });
      setFase('salvo');
      setMensagem(`${dados.total} linha(s) salvas (${dados.ignoradas} ignoradas pelos pré-filtros).`);
      setDados(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setFase('erro');
      setMensagem(`Erro ao salvar no Firebase: ${err.message}`);
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
        <span style={{ fontSize: 22 }}>🔄</span>
        <div>
          <div style={s.cardTitulo}>03.02.37 — Troca</div>
          <div style={s.cardDescricao}>
            Pré-filtros: Operação = 5 · Status = A · Origem = Digitado · {CAMPOS_TROCA.length} campos mapeados
          </div>
        </div>
      </div>

      <div style={s.uploadArea}>
        <input ref={inputRef} type="file" accept=".csv" id="file-troca" style={{ display: 'none' }} onChange={handleArquivo} />
        <label htmlFor="file-troca" style={s.botaoUpload}>📂 Selecionar CSV</label>

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

      {/* Diagnóstico — exibido quando nenhuma linha passa */}
      {fase === 'erro' && dados?.amostra && (
        <div style={{ border: '1px solid #fcd34d', backgroundColor: '#fffbeb', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>🔍 Diagnóstico — valores encontrados nas colunas de filtro:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <span style={{ fontWeight: 600, color: '#374151' }}>Operação (col E, idx 4) — esperado: </span>
              <code style={{ backgroundColor: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>"5"</code>
              <span style={{ color: '#374151' }}> · encontrado: </span>
              {dados.amostra.operacao.map((v, i) => (
                <code key={i} style={{ backgroundColor: '#fee2e2', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{v || '(vazio)'}</code>
              ))}
            </div>
            <div>
              <span style={{ fontWeight: 600, color: '#374151' }}>Status (col J, idx 9) — esperado: </span>
              <code style={{ backgroundColor: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>"A"</code>
              <span style={{ color: '#374151' }}> · encontrado: </span>
              {dados.amostra.status.map((v, i) => (
                <code key={i} style={{ backgroundColor: '#fee2e2', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{v || '(vazio)'}</code>
              ))}
            </div>
            <div>
              <span style={{ fontWeight: 600, color: '#374151' }}>Origem (col BO, idx 66) — esperado: </span>
              <code style={{ backgroundColor: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>"Digitado"</code>
              <span style={{ color: '#374151' }}> · encontrado: </span>
              {dados.amostra.origem.map((v, i) => (
                <code key={i} style={{ backgroundColor: '#fee2e2', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{v || '(vazio)'}</code>
              ))}
            </div>
          </div>
        </div>
      )}

      {temPreview && dados && (
        <div style={{ ...s.alerta, ...s.alertaInfo }}>
          📋 Arquivo: <strong>{dados.nomeArquivo}</strong> · <strong>{dados.total}</strong> linha(s) aprovadas
          {dados.ignoradas > 0 && <> · <strong>{dados.ignoradas}</strong> ignoradas pelos pré-filtros</>}
        </div>
      )}

      {temPreview && dados && (
        <div style={s.tabelaWrapper}>
          <table style={s.tabela}>
            <thead>
              <tr>
                {CAMPOS_TROCA.map(c => <th key={c.campo} style={s.th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {dados.linhas.slice(0, 10).map((linha, i) => (
                <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                  {CAMPOS_TROCA.map(c => <td key={c.campo} style={s.td}>{linha[c.campo]}</td>)}
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
        <div style={s.placeholder}>Selecione um arquivo .csv para visualizar e salvar</div>
      )}
    </div>
  );
}

// ─── Card genérico (Refugo) ───────────────────────────────────────────────────

function CardRefugo({ label, descricao, icon, id }) {
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith('.csv')) {
      setFase('erro');
      setMensagem('Selecione um arquivo .csv válido.');
      setPreview(null);
      return;
    }
    setFase('carregando');
    setMensagem('');
    setPreview(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const texto = ev.target.result;
        const linhas = texto.split(/\r?\n/).filter(l => l.trim());
        if (linhas.length < 2) { setFase('erro'); setMensagem('Arquivo vazio.'); return; }
        const sep = linhas[0].includes(';') ? ';' : ',';
        const cabecalho = linhas[0].split(sep).map(c => c.trim());
        const dados = linhas.slice(1).map(l => {
          const cols = l.split(sep).map(c => c.trim());
          const obj = {};
          cabecalho.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
          return obj;
        });
        setPreview({ cabecalho, linhas: dados, nomeArquivo: arquivo.name, total: dados.length });
        setFase('ok');
        setMensagem(`${dados.length} linha(s) carregadas.`);
      } catch {
        setFase('erro');
        setMensagem('Erro ao processar o arquivo.');
      }
    };
    reader.onerror = () => { setFase('erro'); setMensagem('Falha ao ler o arquivo.'); };
    reader.readAsText(arquivo, 'UTF-8');
    e.target.value = '';
  }

  function handleLimpar() {
    setFase('idle');
    setMensagem('');
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div>
          <div style={s.cardTitulo}>{label}</div>
          <div style={s.cardDescricao}>{descricao}</div>
        </div>
      </div>

      <div style={s.uploadArea}>
        <input ref={inputRef} type="file" accept=".csv" id={`file-${id}`} style={{ display: 'none' }} onChange={handleArquivo} />
        <label htmlFor={`file-${id}`} style={s.botaoUpload}>📂 Selecionar CSV</label>
        {preview && <button onClick={handleLimpar} style={s.botaoLimpar}>✕ Limpar</button>}
      </div>

      {fase === 'ok' && <div style={{ ...s.alerta, ...s.alertaSucesso }}>✅ {mensagem}</div>}
      {fase === 'erro' && <div style={{ ...s.alerta, ...s.alertaErro }}>❌ {mensagem}</div>}
      {fase === 'carregando' && <div style={{ ...s.alerta, color: '#6b7280' }}>⏳ Processando...</div>}

      {preview && (
        <div style={s.tabelaWrapper}>
          <table style={s.tabela}>
            <thead>
              <tr>{preview.cabecalho.map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {preview.linhas.slice(0, 10).map((linha, i) => (
                <tr key={i} style={i % 2 === 0 ? s.trPar : s.trImpar}>
                  {preview.cabecalho.map((h, j) => <td key={j} style={s.td}>{linha[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.total > 10 && (
            <div style={s.maisLinhas}>... e mais {preview.total - 10} linha(s) não exibidas</div>
          )}
        </div>
      )}

      {fase === 'idle' && (
        <div style={s.placeholder}>Selecione um arquivo .csv para visualizar</div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ImportarRelatoriosPrejuizo() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 }}>
          Importar Relatórios
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Selecione os arquivos CSV para cada relatório de prejuízo.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card030237 />
        <Card030147Hecto />
        <CardTroca />
        <CardRefugo
          id="refugo_afericao"
          label="Refugo fábrica - aferição"
          descricao="Relatório de refugo de fábrica (aferição)"
          icon="🏭"
        />
        <CardRefugo
          id="refugo_cobranca"
          label="Refugo fábrica - cobrança"
          descricao="Relatório de refugo de fábrica (cobrança)"
          icon="💰"
        />
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
  trPar: { backgroundColor: '#fff' },
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
