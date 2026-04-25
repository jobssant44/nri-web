import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import * as XLSX from 'xlsx';

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
  const [pickingCodes, setPickingCodes] = useState(new Set());
  const [dados, setDados] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef();

  useEffect(() => { carregarPicking(); }, []);

  async function carregarPicking() {
    const snap = await getDocs(collection(db, 'picking_config'));
    setPickingCodes(new Set(snap.docs.map(d => String(d.data().codProduto))));
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
        let ignoradas = 0;
        let processadas = 0;
        let faltamPicking = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (String(row[4] || '').trim() === 'Sim') { ignoradas++; continue; }

          const data = parsearData(row[0]);
          const codigo = String(row[1] || '').trim();
          const descricao = String(row[2] || '').trim();
          const qtd = parseFloat(String(row[3] || '0').replace(',', '.')) || 0;

          if (!data || !codigo) continue;

          // Filtrar apenas produtos do picking_config
          if (!pickingCodes.has(codigo)) { faltamPicking++; continue; }

          if (!tabela[codigo]) tabela[codigo] = { descricao, vendas: {} };
          tabela[codigo].vendas[data] = (tabela[codigo].vendas[data] || 0) + qtd;
          processadas++;
        }

        if (processadas === 0) {
          setMensagem('⚠️ Nenhuma linha válida encontrada para produtos do picking');
          return;
        }

        const datasSet = new Set();
        Object.values(tabela).forEach(p => Object.keys(p.vendas).forEach(d => datasSet.add(d)));
        const datas = ordenarDatas([...datasSet]);

        const produtos = Object.entries(tabela)
          .map(([codigo, v]) => ({ codigo, descricao: v.descricao, vendas: v.vendas }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

        setDados({ produtos, datas });

        const extras = faltamPicking > 0 ? ` · ${faltamPicking} linha(s) ignorada(s) (produto fora do picking)` : '';
        setMensagem(`✅ ${processadas} linha(s) processada(s) · ${ignoradas} ignorada(s) (palete fechado)${extras} · ${produtos.length} produto(s) · ${datas.length} dia(s)`);
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
    try {
      await addDoc(collection(db, 'vendas_relatorio'), {
        importadoEm: new Date(),
        nomeArquivo,
        produtos: dados.produtos,
        datas: dados.datas,
      });
      setMensagem('✅ Relatório salvo com sucesso! Visualize na aba "Vendas".');
      setDados(null);
      setNomeArquivo('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setMensagem(`❌ Erro ao salvar: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  function limpar() {
    setDados(null);
    setMensagem('');
    setNomeArquivo('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const cardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' };

  return (
    <div style={{ maxWidth: '100%', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#E31837', marginBottom: '4px' }}>📥 Importar Vendas (03.02.36.08)</h1>
      <p style={{ color: '#666', marginBottom: '20px', fontSize: '13px' }}>
        Importa o relatório de vendas. Apenas produtos cadastrados no Picking Config são considerados. Paletes fechados são ignorados.
      </p>

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
    </div>
  );
}
