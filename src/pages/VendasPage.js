import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useSessionFilter } from '../hooks/useSessionFilter';

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function chaveParaNome(chave) {
  if (!chave) return '';
  const [ano, mes] = chave.split('-');
  return `${MESES_NOME[parseInt(mes) - 1]}/${ano}`;
}

function dataParaChave(dataStr) {
  // "14/04/2026" → "2026-04"
  if (!dataStr) return null;
  const partes = dataStr.split('/');
  if (partes.length !== 3) return null;
  return `${partes[2]}-${partes[1]}`;
}

function ordenarDatas(datas) {
  return [...datas].sort((a, b) => {
    const [dA, mA, aA] = a.split('/').map(Number);
    const [dB, mB, aB] = b.split('/').map(Number);
    return new Date(aA, mA-1, dA) - new Date(aB, mB-1, dB);
  });
}

function calcularDadosMes(relatorios, mesSelecionado) {
  if (!mesSelecionado || relatorios.length === 0) return { produtos: [], datas: [] };

  // relatorios já vêm ordenados por importadoEm asc → o mais recente sobrescreve o anterior
  const vMap = {};
  relatorios.forEach(r => {
    (r.produtos || []).forEach(p => {
      const cod = String(p.codigo);
      Object.entries(p.vendas || {}).forEach(([data, qty]) => {
        if (dataParaChave(data) !== mesSelecionado) return;
        if (!vMap[cod]) vMap[cod] = { descricao: p.descricao, vendas: {} };
        vMap[cod].vendas[data] = qty;
      });
    });
  });

  const datasSet = new Set();
  Object.values(vMap).forEach(p => Object.keys(p.vendas).forEach(d => datasSet.add(d)));
  const datas = ordenarDatas([...datasSet]);
  const produtos = Object.entries(vMap)
    .map(([codigo, v]) => ({ codigo, descricao: v.descricao, vendas: v.vendas }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  return { produtos, datas };
}

export default function VendasPage() {
  const [relatorios, setRelatorios] = useState([]);
  const [mesesDisponiveis, setMesesDisponiveis] = useState([]);
  const [anoSelecionado, setAnoSelecionado] = useSessionFilter('vendas:ano', '');
  const [mesNumSelecionado, setMesNumSelecionado] = useSessionFilter('vendas:mes', '');
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useSessionFilter('vendas:busca', '');

  const mesSelecionado = anoSelecionado && mesNumSelecionado ? `${anoSelecionado}-${mesNumSelecionado}` : '';

  // Anos disponíveis: ordenados do mais antigo para o mais recente
  const anos = [...new Set(mesesDisponiveis.map(m => m.split('-')[0]))].sort();

  // Meses disponíveis para o ano selecionado: ordenados Jan→Dez
  const mesesDoAno = mesesDisponiveis
    .filter(m => m.startsWith(anoSelecionado))
    .map(m => m.split('-')[1])
    .sort();

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const snap = await getDocs(query(collection(db, 'vendas_relatorio'), orderBy('importadoEm', 'asc')));
      const lista = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      setRelatorios(lista);

      const mesesSet = new Set();
      lista.forEach(r => {
        (r.datas || []).forEach(d => {
          const chave = dataParaChave(d);
          if (chave) mesesSet.add(chave);
        });
      });
      const meses = [...mesesSet].sort().reverse();
      setMesesDisponiveis(meses);
      if (meses.length > 0) {
        const [ano, mes] = meses[0].split('-'); // mais recente
        setAnoSelecionado(ano);
        setMesNumSelecionado(mes);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  const { produtos, datas } = calcularDadosMes(relatorios, mesSelecionado);

  const produtosFiltrados = produtos.filter(p => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return String(p.codigo).toLowerCase().includes(b) || (p.descricao || '').toLowerCase().includes(b);
  });

  const cardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' };

  if (carregando) return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>⏳ Carregando...</div>;

  if (relatorios.length === 0) return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#E31837', marginBottom: '10px' }}>📊 Vendas</h1>
      <div style={{ ...cardStyle, textAlign: 'center', padding: '40px', color: '#999' }}>
        Nenhum relatório importado ainda. Use a aba <strong>Importar Vendas 03.02.36.08</strong> para importar.
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: '100%', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#E31837', marginBottom: '4px' }}>📊 Vendas</h1>
      <p style={{ color: '#666', marginBottom: '20px', fontSize: '13px' }}>
        Quantidade de caixas vendidas por produto por dia (apenas produtos do Picking Config)
      </p>

      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Ano:</label>
          <select
            value={anoSelecionado}
            onChange={e => {
              const novoAno = e.target.value;
              const mesesNoAno = mesesDisponiveis.filter(m => m.startsWith(novoAno)).map(m => m.split('-')[1]).sort();
              setAnoSelecionado(novoAno);
              setMesNumSelecionado(mesesNoAno[mesesNoAno.length - 1] || '');
              setBusca('');
            }}
            style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', minWidth: '90px' }}
          >
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Mês:</label>
          <select
            value={mesNumSelecionado}
            onChange={e => { setMesNumSelecionado(e.target.value); setBusca(''); }}
            style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', minWidth: '130px' }}
          >
            {mesesDoAno.map(m => (
              <option key={m} value={m}>{MESES_NOME[parseInt(m) - 1]}</option>
            ))}
          </select>

          {mesSelecionado && datas.length > 0 && (
            <div style={{ fontSize: '12px', color: '#666' }}>
              <strong>{datas[0]}</strong> até <strong>{datas[datas.length - 1]}</strong>
              &nbsp;·&nbsp;<strong>{datas.length}</strong> dia(s)
              &nbsp;·&nbsp;<strong>{produtos.length}</strong> produto(s)
            </div>
          )}

          {mesSelecionado && (
            <input
              type="text"
              placeholder="🔍 Buscar por código ou descrição..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', width: 260, marginLeft: 'auto' }}
            />
          )}
        </div>
      </div>

      {mesSelecionado && datas.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px', color: '#999' }}>
          Nenhum dado de venda para {chaveParaNome(mesSelecionado)}.
        </div>
      )}

      {mesSelecionado && datas.length > 0 && (
        <div style={cardStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th style={{ ...thFixo, minWidth: '70px' }}>Código</th>
                  <th style={{ ...thFixo, minWidth: '220px', textAlign: 'left' }}>Descrição</th>
                  {datas.map(d => (
                    <th key={d} style={thData}>{d.slice(0, 5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.map((prod, idx) => (
                  <tr key={prod.codigo} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                    <td style={{ ...tdFixo, fontWeight: 'bold', color: '#E31837' }}>{prod.codigo}</td>
                    <td style={{ ...tdFixo, textAlign: 'left' }}>{prod.descricao}</td>
                    {datas.map(d => {
                      const qtd = prod.vendas?.[d];
                      return (
                        <td key={d} style={{ ...tdValor, color: qtd ? '#1D5A9E' : '#ccc' }}>
                          {qtd ? qtd.toLocaleString('pt-BR') : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const thFixo = {
  backgroundColor: '#E31837', color: 'white', padding: '10px 14px', fontWeight: 'bold',
  textAlign: 'center', position: 'sticky', top: 0, borderRight: '1px solid #c0102a',
};
const thData = {
  backgroundColor: '#1D5A9E', color: 'white', padding: '10px 8px', fontWeight: 'bold',
  textAlign: 'center', position: 'sticky', top: 0, borderRight: '1px solid #164a8a', minWidth: '72px',
};
const tdFixo = {
  padding: '8px 14px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee', textAlign: 'center',
};
const tdValor = {
  padding: '8px 8px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee',
  textAlign: 'center', fontWeight: 'bold',
};
