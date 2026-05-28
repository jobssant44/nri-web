import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, getDoc, addDoc, setDoc, doc, writeBatch } from 'firebase/firestore';
import { useDb } from '../utils/db';
import { invalidarCache } from '../utils/cache';
import { calcularABC, escolherMesParaCurvaAchatada } from './curva-abc/ImportarRelatorio';
import * as XLSX from 'xlsx';

// Helpers de agregação mensal (Curva ABC)
function mesKey(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
// Parser de data que extrai { ano, mes, dia } pra usar como chave mensal.
// Aceita os mesmos formatos do `parsearData` desta tela.
function parseDataYMD(valor) {
  const str = parsearData(valor);
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return { dia: parseInt(m[1], 10), mes: parseInt(m[2], 10), ano: parseInt(m[3], 10) };
}

function parsearData(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  // Serial numérico do Excel — usar Math.floor para evitar arredondamento para dia seguinte
  if (typeof valor === 'number') {
    const d = new Date(Math.floor((valor - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }

  const str = String(valor).trim().replace(/\r/g, '');

  // ISO AAAA-MM-DD
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  // Formato com barra ou traço: PP/SS/AAAA
  // O relatório 03.02.36.08 exporta em MM/DD/AAAA (americano).
  // Regra: se PP > 12 → obrigatoriamente é DD (formato DD/MM); se SS > 12 → obrigatoriamente é DD (formato MM/DD).
  // Quando ambos ≤ 12 (ambíguo), trata como MM/DD conforme o padrão deste relatório.
  const partes = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (partes) {
    const p1 = parseInt(partes[1]);
    const p2 = parseInt(partes[2]);
    let dd, mm;
    if (p1 > 12)      { dd = p1; mm = p2; }  // DD/MM
    else if (p2 > 12) { dd = p2; mm = p1; }  // MM/DD
    else              { dd = p2; mm = p1; }  // ambíguo → MM/DD (padrão do relatório)
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${partes[3]}`;
  }

  // PP/SS/AA (ano com 2 dígitos)
  const curto = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (curto) {
    const p1 = parseInt(curto[1]);
    const p2 = parseInt(curto[2]);
    const ano = parseInt(curto[3]) < 50 ? `20${curto[3]}` : `19${curto[3]}`;
    let dd, mm;
    if (p1 > 12)      { dd = p1; mm = p2; }
    else if (p2 > 12) { dd = p2; mm = p1; }
    else              { dd = p2; mm = p1; }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${ano}`;
  }

  return null;
}

function ordenarDatas(datas) {
  return [...datas].sort((a, b) => {
    const [dA, mA, aA] = a.split('/').map(Number);
    const [dB, mB, aB] = b.split('/').map(Number);
    return new Date(aA, mA-1, dA) - new Date(aB, mB-1, dB);
  });
}

export default function ImportarVendasPage() {
  const { col, docRef, db, rid, stamp } = useDb();
  const [pickingCodes, setPickingCodes] = useState(new Set());
  const [dados, setDados] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Barra de progresso: 0..100 + texto da etapa atual
  const [progresso, setProgresso]       = useState(0);
  const [progressoMsg, setProgressoMsg] = useState('');
  const inputRef = useRef();

  useEffect(() => { carregarPicking(); }, []);

  async function carregarPicking() {
    const [snapAntigo, snapMensal] = await Promise.all([
      getDocs(col('picking_config')),
      getDocs(col('picking_config_mensal')),
    ]);
    const codes = new Set();
    snapAntigo.docs.forEach(d => codes.add(String(d.data().codProduto)));
    snapMensal.docs.forEach(d => {
      (d.data().produtos || []).forEach(p => codes.add(String(p.codProduto)));
    });
    setPickingCodes(codes);
  }

  function processarArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setMensagem('');
    setDados(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const workbook = XLSX.read(ev.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rows.length < 2) { setMensagem('❌ Arquivo vazio ou sem dados'); return; }

        const tabela = {};
        const tabelaPrepicking = {};
        const tabelaAvulsas = {};
        // mesesData: agregação mensal pra Curva ABC (TODAS as linhas — separadas aberto/fechado)
        //   { 'YYYY-MM': { codigo: { codigo, nome, cxTotal, cxAberto, cxFechado, diasSet } } }
        const mesesData = {};
        let ignoradas = 0;
        let processadas = 0;
        let processadasPrepicking = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const paleteFechado = String(row[28] || '').trim().toLowerCase() === 'sim';

          const data      = parsearData(row[1]);                                        // B
          const ymd       = parseDataYMD(row[1]);                                       // { ano, mes, dia }
          const codigo    = String(row[19] || '').trim();                               // T
          const descricao = String(row[20] || '').trim();                               // U
          const qtd       = parseFloat(String(row[26] || '0').replace(',', '.')) || 0;  // AA
          const avulsas   = parseInt(String(row[27] || '0').replace(',', '.'))   || 0;  // AB

          if (!data || !codigo) continue;

          // ── Agregação mensal pra Curva ABC (TODAS as linhas com qtd > 0) ──
          if (ymd && qtd > 0 && descricao) {
            const chave = mesKey(ymd.ano, ymd.mes);
            if (!mesesData[chave]) mesesData[chave] = {};
            if (!mesesData[chave][codigo]) {
              mesesData[chave][codigo] = {
                codigo, nome: descricao,
                cxTotal: 0, cxAberto: 0, cxFechado: 0,
                diasSet: new Set(),
              };
            }
            const prod = mesesData[chave][codigo];
            prod.cxTotal += qtd;
            if (paleteFechado) prod.cxFechado += qtd;
            else               prod.cxAberto  += qtd;
            prod.diasSet.add(`${ymd.ano}-${String(ymd.mes).padStart(2,'0')}-${String(ymd.dia).padStart(2,'0')}`);
          }

          // ── Vendas detalhadas (só palete aberto = "Não") ──
          if (paleteFechado) { ignoradas++; continue; }

          // Unidades avulsas — todos os produtos
          if (avulsas > 0) {
            if (!tabelaAvulsas[codigo]) tabelaAvulsas[codigo] = { descricao, avulsas: {} };
            tabelaAvulsas[codigo].avulsas[data] = (tabelaAvulsas[codigo].avulsas[data] || 0) + avulsas;
          }

          if (pickingCodes.has(codigo)) {
            if (!tabela[codigo]) tabela[codigo] = { descricao, vendas: {} };
            tabela[codigo].vendas[data] = (tabela[codigo].vendas[data] || 0) + qtd;
            processadas++;
          } else {
            if (!tabelaPrepicking[codigo]) tabelaPrepicking[codigo] = { descricao, vendas: {} };
            tabelaPrepicking[codigo].vendas[data] = (tabelaPrepicking[codigo].vendas[data] || 0) + qtd;
            processadasPrepicking++;
          }
        }

        // Transforma mesesData em estrutura final pra Curva ABC
        const curvaABCMensal = {};
        for (const [chave, prodMap] of Object.entries(mesesData)) {
          const [anoStr, mesStr] = chave.split('-');
          const produtos = Object.values(prodMap)
            .map(p => ({
              codigo:        p.codigo,
              nome:          p.nome,
              cxTotal:       r2(p.cxTotal),
              cxAberto:      r2(p.cxAberto),
              cxFechado:     r2(p.cxFechado),
              diasComVendas: p.diasSet.size,
            }))
            .filter(p => p.cxTotal > 0);
          curvaABCMensal[chave] = {
            ano:           parseInt(anoStr,  10),
            mes:           parseInt(mesStr,  10),
            produtos,
            totalProdutos: produtos.length,
            totalCx:       r2(produtos.reduce((s, p) => s + p.cxTotal, 0)),
            importadoEm:   new Date().toISOString(),
          };
        }

        if (processadas === 0 && processadasPrepicking === 0) {
          setMensagem('⚠️ Nenhuma linha válida encontrada (verifique se a coluna AC contém "Não")');
          return;
        }

        const datasSet = new Set();
        Object.values(tabela).forEach(p => Object.keys(p.vendas).forEach(d => datasSet.add(d)));
        const datas = ordenarDatas([...datasSet]);

        const produtos = Object.entries(tabela)
          .map(([codigo, v]) => ({ codigo, descricao: v.descricao, vendas: v.vendas }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

        const datasSetPP = new Set();
        Object.values(tabelaPrepicking).forEach(p => Object.keys(p.vendas).forEach(d => datasSetPP.add(d)));
        const datasPrepicking = ordenarDatas([...datasSetPP]);

        const produtosPrepicking = Object.entries(tabelaPrepicking)
          .map(([codigo, v]) => ({ codigo, descricao: v.descricao, vendas: v.vendas }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

        const datasSetAv = new Set();
        Object.values(tabelaAvulsas).forEach(p => Object.keys(p.avulsas).forEach(d => datasSetAv.add(d)));
        const datasAvulsas = ordenarDatas([...datasSetAv]);

        const produtosAvulsas = Object.entries(tabelaAvulsas)
          .map(([codigo, v]) => ({ codigo, descricao: v.descricao, avulsas: v.avulsas }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

        setDados({ produtos, datas, produtosPrepicking, datasPrepicking, produtosAvulsas, datasAvulsas, curvaABCMensal });

        const mesesABC = Object.keys(curvaABCMensal).sort();
        setMensagem(
          `✅ Picking: ${processadas} linha(s) · ${produtos.length} produto(s) · ${datas.length} dia(s)` +
          (processadasPrepicking > 0 ? ` | Pré-Picking: ${produtosPrepicking.length} produto(s)` : '') +
          (produtosAvulsas.length > 0 ? ` | Avulsas: ${produtosAvulsas.length} produto(s)` : '') +
          (mesesABC.length > 0 ? ` | Curva ABC: ${mesesABC.length} mês/meses (${mesesABC.join(', ')})` : '') +
          (ignoradas > 0 ? ` · ${ignoradas} linha(s) ignorada(s) (palete fechado)` : '')
        );
      } catch (err) {
        setMensagem(`❌ Erro ao processar arquivo: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function salvar() {
    if (!dados) return;
    setSalvando(true);
    setMensagem('');
    setProgresso(0);
    setProgressoMsg('Iniciando...');
    try {
      // ── 1. Vendas (3 coleções do módulo Reab) ──
      setProgresso(5);
      setProgressoMsg('Salvando vendas (Picking + Pré-picking + Avulsas)...');
      const promises = [];
      if (dados.produtos.length > 0) {
        promises.push(addDoc(col('vendas_relatorio'), {
          importadoEm: new Date(),
          nomeArquivo,
          produtos: dados.produtos,
          datas: dados.datas,
        }));
      }
      if (dados.produtosPrepicking.length > 0) {
        promises.push(addDoc(col('vendas_prepicking'), {
          importadoEm: new Date(),
          nomeArquivo,
          produtos: dados.produtosPrepicking,
          datas: dados.datasPrepicking,
        }));
      }
      if (dados.produtosAvulsas.length > 0) {
        promises.push(addDoc(col('vendas_avulsas'), {
          importadoEm: new Date(),
          nomeArquivo,
          produtos: dados.produtosAvulsas,
          datas: dados.datasAvulsas,
        }));
      }
      await Promise.all(promises);
      setProgresso(25);

      // ── 2. Curva ABC (mesmo arquivo, agregação mensal) ──
      const curvaABCMensal = dados.curvaABCMensal || {};
      const chavesMes = Object.keys(curvaABCMensal).sort();
      if (chavesMes.length > 0) {
        // 2a. Salva um doc por mês — distribui progresso de 25% até 65%
        for (let idx = 0; idx < chavesMes.length; idx++) {
          const k = chavesMes[idx];
          setProgressoMsg(`Salvando Curva ABC mensal: ${k} (${idx + 1}/${chavesMes.length})...`);
          await setDoc(docRef('curva_abc_mensal', `${rid || 'global'}_${k}`), {
            ...curvaABCMensal[k],
            ...stamp(),
          });
          setProgresso(25 + Math.round(((idx + 1) / chavesMes.length) * 40));
        }
        // 2b. Atualiza índice de meses
        setProgressoMsg('Atualizando índice de meses...');
        const metaDocId  = rid || 'global';
        const snapIdx    = await getDoc(docRef('curva_abc_meta', metaDocId));
        const existentes = snapIdx.exists() ? (snapIdx.data().meses || []) : [];
        await setDoc(docRef('curva_abc_meta', metaDocId),
          { meses: [...new Set([...existentes, ...chavesMes])].sort() });
        setProgresso(70);
        // 2c. Atualiza curva_abc (achatado, usado pelo módulo NRI).
        //     Regra do user: prioridade mês atual → mês anterior → mais recente
        //     importado (fallback). Pareto sobre cxTotal.
        setProgressoMsg('Calculando Curva ABC achatada (Pareto)...');
        const mesEscolhido = escolherMesParaCurvaAchatada(curvaABCMensal);
        const curvaPorCx = mesEscolhido
          ? calcularABC(curvaABCMensal[mesEscolhido].produtos, 'cxTotal')
          : [];
        setProgresso(75);
        // Limpa curva_abc antiga e regrava
        setProgressoMsg('Limpando curva_abc anterior...');
        const snapAntigo = await getDocs(col('curva_abc'));
        const totalBatchesDelete = Math.ceil(snapAntigo.docs.length / 450) || 1;
        let batchIdxDel = 0;
        for (let i = 0; i < snapAntigo.docs.length; i += 450) {
          const batch = writeBatch(db);
          snapAntigo.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
          await batch.commit();
          batchIdxDel++;
          setProgresso(75 + Math.round((batchIdxDel / totalBatchesDelete) * 10));
        }
        setProgresso(85);
        setProgressoMsg(`Regravando ${curvaPorCx.length} produto(s) na curva_abc...`);
        const totalBatchesWrite = Math.ceil(curvaPorCx.length / 450) || 1;
        let batchIdxWr = 0;
        for (let i = 0; i < curvaPorCx.length; i += 450) {
          const batch = writeBatch(db);
          curvaPorCx.slice(i, i + 450).forEach(p =>
            batch.set(doc(col('curva_abc')), { codigo: p.codigo, curva: p._curva, ...stamp() })
          );
          await batch.commit();
          batchIdxWr++;
          setProgresso(85 + Math.round((batchIdxWr / totalBatchesWrite) * 14));
        }
      }

      // Invalida todos os caches relacionados para forçar releitura do Firebase
      setProgressoMsg('Invalidando cache local...');
      invalidarCache('vendasMap', 'vendasAllMap', 'prepicking:vendasMap', 'prepicking:avulsasMap');
      setProgresso(100);
      setProgressoMsg('Concluído!');
      setMensagem(`✅ Salvo: Vendas + Curva ABC (${chavesMes.length} mês/meses)`);
      setDados(null);
      setNomeArquivo('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setMensagem(`❌ Erro ao salvar: ${err.message}`);
    } finally {
      setSalvando(false);
      // Limpa a barra após um instante pra dar feedback visual de "100%"
      setTimeout(() => { setProgresso(0); setProgressoMsg(''); }, 800);
    }
  }

  function limpar() {
    setDados(null);
    setMensagem('');
    setNomeArquivo('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function limparTodosRelatorios() {
    const confirmar = window.confirm(
      '⚠️ Isso apagará TODOS os relatórios importados de vendas, pré-picking e avulsas do Firebase.\n\nTem certeza?'
    );
    if (!confirmar) return;
    setSalvando(true);
    setMensagem('');
    try {
      const colecoes = ['vendas_relatorio', 'vendas_prepicking', 'vendas_avulsas'];
      for (const nome of colecoes) {
        const snap = await getDocs(col(nome));
        for (let i = 0; i < snap.docs.length; i += 450) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      invalidarCache('vendasMap', 'vendasAllMap', 'prepicking:vendasMap', 'prepicking:avulsasMap');
      setMensagem('✅ Todos os relatórios foram apagados do Firebase e o cache foi limpo.');
    } catch (err) {
      setMensagem(`❌ Erro ao apagar: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  const cardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' };

  return (
    <div style={{ maxWidth: '100%', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#E31837', marginBottom: '4px' }}>📥 Importar 03.02.36.08</h1>

      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ padding: '10px 20px', backgroundColor: '#E31837', color: 'white', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
            📂 Selecionar Arquivo
            <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={processarArquivo} style={{ display: 'none' }} />
          </label>

          {nomeArquivo && <span style={{ fontSize: '13px', color: '#555' }}>📄 {nomeArquivo}</span>}

          {dados && (
            <>
              <button
                onClick={salvar}
                disabled={salvando}
                style={{ padding: '10px 20px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: salvando ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: salvando ? 0.6 : 1 }}
              >
                {salvando ? '⏳ Salvando...' : '💾 Salvar Relatório'}
              </button>
              <button
                onClick={limpar}
                style={{ padding: '10px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
              >
                🔄 Limpar
              </button>
            </>
          )}
        </div>

        {salvando && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>
                {progressoMsg || 'Processando...'}
              </span>
              <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{progresso}%</span>
            </div>
            <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progresso}%`,
                background: 'linear-gradient(90deg, #E31837 0%, #1D5A9E 100%)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {mensagem && (
          <div style={{
            marginTop: '12px', padding: '10px 14px', borderRadius: '4px', fontSize: '13px',
            backgroundColor: mensagem.startsWith('✅') ? '#dcfce7' : mensagem.startsWith('⚠️') ? '#fef3c7' : '#fee2e2',
            color: mensagem.startsWith('✅') ? '#166534' : mensagem.startsWith('⚠️') ? '#856404' : '#991b1b',
            borderLeft: `4px solid ${mensagem.startsWith('✅') ? '#22c55e' : mensagem.startsWith('⚠️') ? '#ffc107' : '#ef4444'}`,
          }}>
            {mensagem}
          </div>
        )}

        {dados && (
          <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#e3f2fd', borderRadius: '6px', fontSize: '13px', color: '#1d5a9e', borderLeft: '4px solid #1D5A9E' }}>
            📋 <strong>{dados.produtos.length} produto(s)</strong> prontos para salvar · período: <strong>{dados.datas[0]}</strong> até <strong>{dados.datas[dados.datas.length - 1]}</strong>
          </div>
        )}
      </div>

      {!dados && !mensagem && (
        <div style={{ ...cardStyle, color: '#999', textAlign: 'center', padding: '40px' }}>
          Selecione um arquivo Excel (.xlsx) para processar as vendas
        </div>
      )}

      {/* Zona de perigo */}
      <div style={{ ...cardStyle, borderLeft: '4px solid #ef4444', marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 'bold', color: '#991b1b', marginBottom: 10 }}>⚠️ Zona de Perigo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            onClick={limparTodosRelatorios}
            disabled={salvando}
            style={{ padding: '9px 18px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, opacity: salvando ? 0.6 : 1 }}
          >
            🗑️ Apagar todos os relatórios importados
          </button>
          <span style={{ fontSize: 12, color: '#999' }}>
            Remove tudo de <code>vendas_relatorio</code>, <code>vendas_prepicking</code> e <code>vendas_avulsas</code> + limpa o cache local
          </span>
        </div>
      </div>
    </div>
  );
}
