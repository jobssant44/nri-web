import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useSessionFilter } from '../hooks/useSessionFilter';

function formatarData(texto) {
  const n = texto.replace(/[^0-9]/g, '');
  if (n.length <= 2) return n;
  if (n.length <= 4) return n.slice(0,2) + '/' + n.slice(2);
  return n.slice(0,2) + '/' + n.slice(2,4) + '/' + n.slice(4,8);
}

function parsearData(str) {
  if (!str || !str.includes('/')) return null;
  const [d, m, y] = str.split('/');
  return new Date(Number(y), Number(m)-1, Number(d));
}

export default function Exportar() {
  const [dataInicio, setDataInicio] = useSessionFilter('exp:inicio', '');
  const [dataFim, setDataFim] = useSessionFilter('exp:fim', '');
  const [total, setTotal] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function exportar() {
    if (dataInicio.length !== 10 || dataFim.length !== 10) { alert('Preencha as datas corretamente.'); return; }
    const inicio = parsearData(dataInicio);
    const fim = parsearData(dataFim);
    fim.setHours(23,59,59);
    if (inicio > fim) { alert('Data inicial deve ser menor ou igual à final.'); return; }
    setCarregando(true);
    setTotal(null);
    try {
      const snap = await getDocs(collection(db, 'nris'));
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtradas = todas.filter(n => {
        const data = parsearData(n.dataRecebimento);
        return data && data >= inicio && data <= fim;
      });
      if (filtradas.length === 0) { alert('Nenhuma NRI encontrada no período.'); setCarregando(false); return; }

      const linhas = ['Data Recebimento;Nota Fiscal;Placa Cavalo;Placa Carreta;Motorista;Origem;Conferente;Cod Produto;Nome Produto;Qtd PLT;Qtd CX;Validade'];
      filtradas.forEach(n => {
        if (n.produtos?.length > 0) {
          n.produtos.forEach(p => {
            linhas.push([n.dataRecebimento||'', n.notaFiscal||'', n.placaCavalo||'', n.placaCarreta||'', n.motorista||'', n.origem||'', n.conferente||'', p.codProduto||'', p.nomeProduto||'', p.qtdPlt||'', p.qtdCx||'', p.validade||''].join(';'));
          });
        }
      });

      const csv = '\uFEFF' + linhas.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NRI_${dataInicio.replace(/\//g,'-')}_a_${dataFim.replace(/\//g,'-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setTotal(filtradas.length);
    } catch (e) { alert('Erro: ' + e.message); }
    setCarregando(false);
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Exportar CSV</h2>
      <div style={secao}>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>Selecione o período para exportar todas as NRIs.</p>
        <label style={lbl}>Data inicial (DD/MM/AAAA)</label>
        <input style={inp} value={dataInicio} onChange={e => setDataInicio(formatarData(e.target.value))} maxLength={10} placeholder="Ex: 01/04/2026" />
        <label style={lbl}>Data final (DD/MM/AAAA)</label>
        <input style={inp} value={dataFim} onChange={e => setDataFim(formatarData(e.target.value))} maxLength={10} placeholder="Ex: 30/04/2026" />
        <button onClick={exportar} disabled={carregando} style={{ ...btnPrimario, width: '100%', padding: 14, marginTop: 20, fontSize: 15 }}>
          {carregando ? 'Gerando...' : '📥 Exportar CSV'}
        </button>
        {total !== null && (
          <div style={{ backgroundColor: '#E1F5EE', borderRadius: 8, padding: 14, marginTop: 16, textAlign: 'center', color: '#085041', fontWeight: '500' }}>
            ✅ {total} NRI(s) exportada(s) com sucesso!
          </div>
        )}
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const lbl = { fontSize: 13, color: '#555', display: 'block', marginBottom: 4, marginTop: 12 };
const inp = { width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 };