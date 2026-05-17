/**
 * Importar contagens retroativas (CSV / Excel) — suporta MÚLTIPLOS arquivos.
 *
 * Convenção do nome: "XXX.DD.MM.YYYY.{xlsx|xls|csv}"
 *
 * Layout das colunas (0-indexed):
 *   A=0 Local · B=1 Endereço · C=2 Código · D=3 Descrição (ignorada) ·
 *   E=4 Quantidade · F=5 Vencimento
 *
 * Fluxo:
 *   1) Usuário escolhe N arquivos
 *   2) Cada arquivo é parseado em sequência (progress bar fase 1)
 *   3) Usuário vê o resumo de todos os arquivos e clica "Importar"
 *   4) Cada arquivo é gravado em sequência (progress bar fase 2)
 *   5) Resumo final
 */
import React, { useState } from 'react';
import { writeBatch, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useDb } from '../../../../utils/db';
import { useUser } from '../../../../context/UserContext';
import { getDocs, query, where } from 'firebase/firestore';
import {
  parsearDataDoNomeArquivo, monthKey,
  carregarMapaCurvaComFallback, calcularAderenteABC,
} from '../../shared/curvaLookup';

export function ImportarContagemRetroativa({ onSuccess }) {
  const { col, docRef, colRevenda, db, rid, stamp } = useDb();
  const { usuario } = useUser();

  // ─── Estado ───────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('idle'); // idle | parsing | ready | importing | done
  const [jobs, setJobs] = useState([]);       // [{ id, fileName, status, parsedDate, totalLinhas, dadosValidos, erros, message, batchId, importadas, fileObj }]
  const [progress, setProgress] = useState(0); // 0..100 (fase atual)
  const [globalMessage, setGlobalMessage] = useState('');

  // ─── Estilos ──────────────────────────────────────────────────────────
  const cs = {
    maxWidth: '960px', margin: '20px auto', padding: '20px',
    backgroundColor: '#fff', borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };
  const fileBox = {
    display: 'block', marginBottom: '15px', padding: '18px',
    border: '2px dashed #1D5A9E', borderRadius: '8px', cursor: 'pointer',
    backgroundColor: '#f0f9ff',
  };
  const btn = {
    padding: '12px 24px', backgroundColor: '#E31837', color: 'white',
    border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer',
    fontSize: '13px', marginRight: '8px',
  };
  const btnCancel = { ...btn, backgroundColor: '#6b7280' };

  // ─── Date / Quantity helpers ─────────────────────────────────────────
  function parseQuantidadeBR(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (!s) return NaN;
    if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, ''));
    return parseFloat(s);
  }
  function excelSerialToDate(serial) {
    const ms = (serial - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function parseValidade(cell) {
    if (cell == null || cell === '') return null;
    if (typeof cell === 'number' && Number.isFinite(cell)) return excelSerialToDate(cell);
    const s = String(cell).trim();
    const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) return new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
    return null;
  }
  // ─── Parse de UM arquivo ─────────────────────────────────────────────
  async function parsearArquivo(file) {
    const parsed = parsearDataDoNomeArquivo(file.name);
    if (!parsed) {
      throw new Error(`Nome inválido. Use XXX.DD.MM.YYYY (ex: CBB.01.05.2026.xlsx).`);
    }

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows || rows.length === 0) throw new Error('Arquivo vazio.');

    const primeira = rows[0];
    const temCabecalho = primeira && String(primeira[2] || '').match(/[a-zA-Zçã]/);
    const linhasUteis = (temCabecalho ? rows.slice(1) : rows)
      .filter(row => row && row.some(c => String(c).trim() !== ''));

    const [snapProd, snapLoc, snapMensal] = await Promise.all([
      getDocs(col('produtos')),
      getDocs(col('locations')),
      getDocs(query(col('locations_mensal'), where('chaveMes', '==', monthKey(parsed.ano, parsed.mes)))),
    ]);
    const produtosMap = {};
    snapProd.docs.forEach(d => {
      const x = d.data();
      if (x.codigo) produtosMap[String(x.codigo)] = x.descricao || x.nome || '';
    });
    const enderecosSet = new Set();
    snapLoc.docs.forEach(d => {
      const x = d.data();
      const endStr = x.endereco || (x.area != null ? `${x.area}-${x.street}-${x.palettePosition}` : d.id);
      if (endStr) enderecosSet.add(String(endStr).toUpperCase());
    });
    const mensaisMap = {};
    snapMensal.docs.forEach(d => {
      const x = d.data();
      if (x.endereco) mensaisMap[String(x.endereco).toUpperCase()] = x;
    });

    const { mapa: curvaMap, origem: curvaOrigem } = await carregarMapaCurvaComFallback({
      docRefFn: docRef, colFn: col, colRevendaFn: colRevenda, rid, ano: parsed.ano, mes: parsed.mes,
    });

    const errosArq = [];
    const valid = [];
    const enderecosNaoCadastrados = new Set();
    const codigosNaoCadastrados = new Set();

    linhasUteis.forEach((row, idx) => {
      const lineNumber = (temCabecalho ? idx + 2 : idx + 1);
      const localArquivo = String(row[0] || '').trim();
      const endereco     = String(row[1] || '').trim().toUpperCase();
      const codigo       = String(row[2] || '').trim();
      const qtdRaw       = row[4];
      const valRaw       = row[5];

      if (!codigo)   { errosArq.push(`Linha ${lineNumber}: código vazio`); return; }
      if (!endereco) { errosArq.push(`Linha ${lineNumber}: endereço vazio`); return; }

      const qt = parseQuantidadeBR(qtdRaw);
      if (!Number.isFinite(qt) || qt <= 0) {
        errosArq.push(`Linha ${lineNumber}: quantidade inválida "${qtdRaw}"`);
        return;
      }
      const validade = parseValidade(valRaw);
      const productName = produtosMap[codigo] || '';
      if (!productName) codigosNaoCadastrados.add(codigo);
      if (!enderecosSet.has(endereco)) enderecosNaoCadastrados.add(endereco);

      const mensal = mensaisMap[endereco] || null;
      const productCurva = curvaMap[codigo] || null;
      const enderecoCurva = mensal?.curva || null;

      valid.push({
        endereco, localArquivo,
        productCode: codigo, productName,
        quantidade: qt, unidade: 'caixa', validade,
        enderecoCurva, productCurva, curvaOrigem,
        produtoEsperadoCodigo: mensal?.produtoCodigo || null,
      });
    });

    return {
      parsedDate: parsed,
      totalLinhas: linhasUteis.length,
      dadosValidos: valid,
      erros: errosArq,
      curvaOrigem,
      warningEnderecos: enderecosNaoCadastrados.size,
      warningCodigos: codigosNaoCadastrados.size,
    };
  }

  // ─── Gravar UM job no Firebase ───────────────────────────────────────
  async function importarJob(job) {
    const CHUNK = 400;
    let total = 0;
    const chave = monthKey(job.parsedDate.ano, job.parsedDate.mes);
    const tsContagem = Timestamp.fromDate(job.parsedDate.data);

    const batchDocRef = docRef('import_batches', randomId());
    const batchId = batchDocRef.id;

    for (let i = 0; i < job.dadosValidos.length; i += CHUNK) {
      const wb = writeBatch(db);
      const slice = job.dadosValidos.slice(i, i + CHUNK);
      slice.forEach((it) => {
        const id = randomId();
        const refNew = docRef('inventory_logs', id);
        const aderenteABC = calcularAderenteABC(it.productCurva, it.enderecoCurva);
        wb.set(refNew, {
          batchId,
          endereco: it.endereco,
          localArquivo: it.localArquivo || null,
          ano: job.parsedDate.ano, mes: job.parsedDate.mes, chaveMes: chave,
          productCode: it.productCode,
          productName: it.productName,
          quantidade: it.quantidade,
          unidade: it.unidade,
          expiryDate: it.validade ? Timestamp.fromDate(it.validade) : null,
          enderecoCurva: it.enderecoCurva,
          productCurva: it.productCurva,
          curvaOrigem: it.curvaOrigem,
          aderenteABC,
          produtoEsperadoCodigo: it.produtoEsperadoCodigo,
          aderenteLayout: it.produtoEsperadoCodigo
            ? String(it.produtoEsperadoCodigo) === String(it.productCode)
            : null,
          conferente: usuario?.nome || 'Retroativo',
          timestamp: tsContagem,
          origem: 'retroativa',
          arquivo: job.fileName,
          criadoEm: serverTimestamp(),
          ...stamp(),
        });
      });
      await wb.commit();
      total += slice.length;
    }

    await setDoc(batchDocRef, {
      arquivo: job.fileName,
      dataContagem: tsContagem,
      ano: job.parsedDate.ano, mes: job.parsedDate.mes, chaveMes: chave,
      importadoEm: serverTimestamp(),
      importadoPor: { uid: usuario?.uid || null, nome: usuario?.nome || '' },
      totalImportadas: total,
      totalIgnoradas: job.erros.length,
      origem: 'retroativa',
      ...stamp(),
    });

    return { batchId, total };
  }

  // ─── Handlers ────────────────────────────────────────────────────────
  async function handleFiles(filesList) {
    const arr = Array.from(filesList);
    if (arr.length === 0) return;

    setGlobalMessage('');
    setProgress(0);
    setPhase('parsing');

    const initial = arr.map((f, i) => ({
      id: `job_${i}_${Date.now()}`,
      fileName: f.name,
      fileObj: f,
      status: 'queued',
      parsedDate: null, totalLinhas: 0, dadosValidos: [], erros: [],
      curvaOrigem: '', warningEnderecos: 0, warningCodigos: 0,
      message: '', importadas: 0, batchId: null,
    }));
    setJobs(initial);

    let current = [...initial];
    for (let i = 0; i < arr.length; i++) {
      current[i] = { ...current[i], status: 'parsing' };
      setJobs([...current]);
      try {
        const r = await parsearArquivo(arr[i]);
        current[i] = { ...current[i], ...r, status: 'parsed' };
      } catch (e) {
        current[i] = { ...current[i], status: 'parse-error', message: e.message };
      }
      setJobs([...current]);
      setProgress(Math.round(((i + 1) / arr.length) * 100));
    }

    const okCount = current.filter(j => j.status === 'parsed' && j.dadosValidos.length > 0).length;
    setPhase(okCount > 0 ? 'ready' : 'done');
    if (okCount === 0) {
      setGlobalMessage(`❌ Nenhum arquivo válido para importar.`);
    } else {
      setGlobalMessage(`✅ ${arr.length} arquivo(s) analisado(s). ${okCount} pronto(s) para importar.`);
    }
  }

  async function importarTudo() {
    const jobsParaImportar = jobs.filter(j => j.status === 'parsed' && j.dadosValidos.length > 0);
    if (jobsParaImportar.length === 0) return;

    setPhase('importing');
    setProgress(0);
    setGlobalMessage('');

    let current = [...jobs];
    let totalSucesso = 0, totalLinhas = 0;

    for (let i = 0; i < jobsParaImportar.length; i++) {
      const job = jobsParaImportar[i];
      const idx = current.findIndex(j => j.id === job.id);
      current[idx] = { ...current[idx], status: 'importing' };
      setJobs([...current]);
      try {
        const r = await importarJob(job);
        current[idx] = { ...current[idx], status: 'imported', importadas: r.total, batchId: r.batchId };
        totalSucesso++;
        totalLinhas += r.total;
      } catch (e) {
        current[idx] = { ...current[idx], status: 'import-error', message: e.message };
      }
      setJobs([...current]);
      setProgress(Math.round(((i + 1) / jobsParaImportar.length) * 100));
    }

    setPhase('done');
    setGlobalMessage(`✅ ${totalSucesso}/${jobsParaImportar.length} arquivo(s) importado(s) · ${totalLinhas} contagem(ns) gravada(s).`);
    onSuccess?.({ count: totalLinhas });
  }

  function limpar() {
    setJobs([]); setPhase('idle'); setProgress(0); setGlobalMessage('');
  }

  // ─── Estatísticas agregadas ──────────────────────────────────────────
  const totalLinhasValidas  = jobs.reduce((s, j) => s + (j.dadosValidos?.length || 0), 0);
  const totalLinhasErro     = jobs.reduce((s, j) => s + (j.erros?.length || 0), 0);
  const totalProntos        = jobs.filter(j => j.status === 'parsed' && j.dadosValidos.length > 0).length;
  const totalImportados     = jobs.filter(j => j.status === 'imported').length;

  const podeImportar = phase === 'ready' && totalProntos > 0;
  const isWorking = phase === 'parsing' || phase === 'importing';

  return (
    <div style={cs}>
      <h2 style={{ color: '#E31837', marginBottom: '6px' }}>Importar Contagem Retroativa</h2>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
        Aceita <strong>vários arquivos</strong> de uma vez. A data de cada contagem é lida do nome (<strong>XXX.DD.MM.YYYY</strong>).<br/>
        Colunas: <strong>A=Local · B=Endereço · C=Código · D=Descrição · E=Qtde · F=Validade</strong>
      </p>

      {globalMessage && (
        <div style={{
          padding: '10px 12px', marginBottom: '12px', borderRadius: '4px',
          backgroundColor: globalMessage.includes('✅') ? '#dcfce7' : '#fee2e2',
          color: globalMessage.includes('✅') ? '#166534' : '#991b1b',
          borderLeft: `4px solid ${globalMessage.includes('✅') ? '#22c55e' : '#ef4444'}`,
          fontSize: '13px',
        }}>{globalMessage}</div>
      )}

      {/* Input de arquivos */}
      {phase === 'idle' && (
        <label style={fileBox}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1D5A9E', marginBottom: '8px' }}>
            📂 Selecione um ou vários arquivos
          </div>
          <div style={{ fontSize: '12px', color: '#0369a1' }}>
            Pode segurar Ctrl/Shift para selecionar múltiplos. Formatos: CSV ou Excel.
          </div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </label>
      )}

      {/* Barra de progresso */}
      {(isWorking || (phase === 'ready' && jobs.length > 0) || phase === 'done') && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>
              {phase === 'parsing' && '⏳ Analisando arquivos...'}
              {phase === 'ready' && '✓ Análise concluída — revise abaixo e clique em Importar'}
              {phase === 'importing' && '⏳ Importando para o Firebase...'}
              {phase === 'done' && '✅ Processo finalizado'}
            </span>
            <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{progress}%</span>
          </div>
          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: phase === 'importing' ? '#22c55e' : phase === 'done' ? '#1D5A9E' : '#E31837',
              transition: 'width 0.2s ease, background 0.2s ease',
            }} />
          </div>
          {phase === 'ready' && (
            <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
              {totalProntos} arquivo(s) prontos · {totalLinhasValidas} linha(s) válida(s)
              {totalLinhasErro > 0 && ` · ${totalLinhasErro} linha(s) com erro serão ignoradas`}
            </div>
          )}
          {phase === 'done' && (
            <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
              {totalImportados}/{jobs.length} arquivo(s) importado(s) com sucesso.
            </div>
          )}
        </div>
      )}

      {/* Lista de arquivos */}
      {jobs.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: 8, marginBottom: 12, maxHeight: 420, overflowY: 'auto',
        }}>
          <div style={{
            background: '#f8fafc', padding: '8px 12px', fontSize: 11, fontWeight: 700,
            color: '#475569', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0,
          }}>
            Arquivos ({jobs.length})
          </div>
          {jobs.map((j, idx) => (
            <FileRow key={j.id} job={j} idx={idx} />
          ))}
        </div>
      )}

      {/* Ações */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {podeImportar && (
          <button style={btn} onClick={importarTudo} disabled={isWorking}>
            {`✅ Importar ${totalProntos} arquivo(s) (${totalLinhasValidas} linhas)`}
          </button>
        )}
        {phase !== 'idle' && !isWorking && (
          <button style={btnCancel} onClick={limpar}>
            {phase === 'done' ? 'Novo upload' : 'Cancelar'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Componente de cada linha (job) ─────────────────────────────────────
function FileRow({ job, idx }) {
  const statusInfo = STATUS_INFO[job.status] || { label: job.status, color: '#94a3b8', bg: '#f1f5f9' };
  return (
    <div style={{
      padding: '10px 12px',
      borderBottom: '1px solid #f1f5f9',
      backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa',
      display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
    }}>
      <div style={{
        flexShrink: 0, width: 110, padding: '3px 8px', borderRadius: 6,
        background: statusInfo.bg, color: statusInfo.color,
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
        textAlign: 'center', textTransform: 'uppercase',
      }}>{statusInfo.label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
          {job.fileName}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          {job.parsedDate && (
            <span>📅 {String(job.parsedDate.dia).padStart(2,'0')}/{String(job.parsedDate.mesNum).padStart(2,'0')}/{job.parsedDate.ano}</span>
          )}
          {job.totalLinhas > 0 && (
            <span> · {job.dadosValidos?.length || 0} válidas{job.erros?.length ? ` · ${job.erros.length} c/ erro` : ''}</span>
          )}
          {job.status === 'imported' && (
            <span style={{ color: '#16a34a' }}> · ✅ {job.importadas} importadas</span>
          )}
          {job.message && (
            <span style={{ color: '#dc2626' }}> · {job.message}</span>
          )}
          {job.curvaOrigem === 'fallback' && (
            <span style={{ color: '#92400e' }}> · ⚠ curva ABC do mês não importada (fallback)</span>
          )}
          {job.curvaOrigem === 'vazio' && (
            <span style={{ color: '#991b1b' }}> · ⚠ sem curva ABC disponível</span>
          )}
          {job.warningCodigos > 0 && (
            <span style={{ color: '#92400e' }}> · {job.warningCodigos} código(s) sem cadastro</span>
          )}
          {job.warningEnderecos > 0 && (
            <span style={{ color: '#92400e' }}> · {job.warningEnderecos} endereço(s) sem cadastro</span>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_INFO = {
  'queued':       { label: 'Na fila',     color: '#64748b', bg: '#f1f5f9' },
  'parsing':      { label: 'Lendo...',    color: '#0369a1', bg: '#dbeafe' },
  'parsed':       { label: 'Pronto',      color: '#166534', bg: '#dcfce7' },
  'parse-error':  { label: 'Erro leit.',  color: '#991b1b', bg: '#fee2e2' },
  'importing':    { label: 'Gravando...', color: '#0369a1', bg: '#dbeafe' },
  'imported':     { label: 'Importado',   color: '#166534', bg: '#dcfce7' },
  'import-error': { label: 'Erro grav.',  color: '#991b1b', bg: '#fee2e2' },
};

// id curto para batch.set / inventory_logs
function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
