import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useNavigate } from 'react-router-dom';

function hojeFormatado() {
  const d = new Date();
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

function formatarData(texto) {
  const n = texto.replace(/[^0-9]/g, '');
  if (n.length <= 2) return n;
  if (n.length <= 4) return n.slice(0,2) + '/' + n.slice(2);
  return n.slice(0,2) + '/' + n.slice(2,4) + '/' + n.slice(4,8);
}

function validarData(data) {
  if (data.length !== 10) return false;
  const [dia, mes, ano] = data.split('/').map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2024 || ano > 2099) return false;
  return new Date(ano, mes-1, dia).getMonth() === mes-1;
}

export default function NovaNRI({ usuario }) {
  const navigate = useNavigate();
  const [notaFiscal, setNotaFiscal] = useState('');
  const [placaCavalo, setPlacaCavalo] = useState('');
  const [placaCarreta, setPlacaCarreta] = useState('');
  const [motorista, setMotorista] = useState('');
  const [origem, setOrigem] = useState('');
  const [dataRecebimento, setDataRecebimento] = useState(hojeFormatado());
  const [produtos, setProdutos] = useState([]);
  const [baseProdutos, setBaseProdutos] = useState([]);
  const [listaMotoristas, setListaMotoristas] = useState([]);
  const [listaCavalos, setListaCavalos] = useState([]);
  const [listaCarretas, setListaCarretas] = useState([]);
  const [listaOrigens, setListaOrigens] = useState([]);
  const [codProduto, setCodProduto] = useState('');
  const [nomeProduto, setNomeProduto] = useState('');
  const [qtdPlt, setQtdPlt] = useState('');
  const [qtdCx, setQtdCx] = useState('');
  const [validade, setValidade] = useState('');
  const [sugestoes, setSugestoes] = useState([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    const [pSnap, mSnap, cSnap, crSnap, oSnap] = await Promise.all([
      getDocs(collection(db, 'produtos')),
      getDocs(collection(db, 'motoristas')),
      getDocs(collection(db, 'cavalos')),
      getDocs(collection(db, 'carretas')),
      getDocs(collection(db, 'origens')),
    ]);
    setBaseProdutos(pSnap.docs.map(d => d.data()));
    setListaMotoristas(mSnap.docs.map(d => d.data().valor));
    setListaCavalos(cSnap.docs.map(d => d.data().valor));
    setListaCarretas(crSnap.docs.map(d => d.data().valor));
    setListaOrigens(oSnap.docs.map(d => d.data().valor));
  }

  function buscarProduto(texto, campo) {
    if (campo === 'codigo') {
      setCodProduto(texto.replace(/[^0-9]/g, ''));
      setNomeProduto('');
      setSugestoes(texto.length >= 2 ? baseProdutos.filter(p => p.codigo.startsWith(texto)).slice(0,5) : []);
    } else {
      setNomeProduto(texto.toUpperCase());
      setCodProduto('');
      setSugestoes(texto.length >= 2 ? baseProdutos.filter(p => p.nome.toLowerCase().includes(texto.toLowerCase())).slice(0,5) : []);
    }
  }

  function selecionarProduto(p) {
    setCodProduto(p.codigo);
    setNomeProduto(p.nome);
    setSugestoes([]);
  }

  function adicionarProduto() {
    if (!codProduto || !nomeProduto) { alert('Selecione um produto.'); return; }
    if (!qtdPlt && !qtdCx) { alert('Preencha ao menos Qtd PLT ou Qtd CX.'); return; }
    if (!validarData(validade)) { alert('Data de validade inválida.'); return; }
    const produtoBase = baseProdutos.find(p => p.codigo === codProduto);
    const cxPorPlt = produtoBase?.cxPorPlt || '';
    setProdutos([...produtos, { codProduto, nomeProduto, qtdPlt, qtdCx, validade, cxPorPlt }]);
    setCodProduto(''); setNomeProduto(''); setQtdPlt(''); setQtdCx(''); setValidade(''); setSugestoes([]);
  }

  function removerProduto(i) {
    setProdutos(produtos.filter((_, idx) => idx !== i));
  }

  async function salvar() {
    if (!notaFiscal || !placaCavalo || !placaCarreta || !motorista || !origem) { alert('Preencha todos os campos do cabeçalho.'); return; }
    if (!validarData(dataRecebimento)) { alert('Data de recebimento inválida.'); return; }
    if (produtos.length === 0) { alert('Adicione pelo menos um produto.'); return; }
    setSalvando(true);
    try {
      await addDoc(collection(db, 'nris'), {
        notaFiscal, placaCavalo, placaCarreta, motorista, origem,
        conferente: usuario.nome, produtos, dataRecebimento,
        criadoEm: new Date().toISOString(),
      });
      alert('NRI salva com sucesso!');
      navigate('/nris');
    } catch (e) { alert('Erro: ' + e.message); }
    setSalvando(false);
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Nova NRI</h2>

      <div style={secao}>
        <h3 style={secaoTitulo}>Cabeçalho</h3>
        <div style={grid2}>
          <div>
            <label style={lbl}>Data de Recebimento</label>
            <input style={inp} value={dataRecebimento} onChange={e => setDataRecebimento(formatarData(e.target.value))} maxLength={10} placeholder="DD/MM/AAAA" />
          </div>
          <div>
            <label style={lbl}>Nº da Nota Fiscal</label>
            <input style={inp} value={notaFiscal} onChange={e => setNotaFiscal(e.target.value.replace(/[^0-9]/g,''))} placeholder="Ex: 123456" />
          </div>
          <div>
            <label style={lbl}>Placa do Cavalo</label>
            <select style={inp} value={placaCavalo} onChange={e => setPlacaCavalo(e.target.value)}>
              <option value="">Selecione...</option>
              {listaCavalos.map((v,i) => <option key={i} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Placa da Carreta</label>
            <select style={inp} value={placaCarreta} onChange={e => setPlacaCarreta(e.target.value)}>
              <option value="">Selecione...</option>
              {listaCarretas.map((v,i) => <option key={i} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Motorista</label>
            <select style={inp} value={motorista} onChange={e => setMotorista(e.target.value)}>
              <option value="">Selecione...</option>
              {listaMotoristas.map((v,i) => <option key={i} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Origem</label>
            <select style={inp} value={origem} onChange={e => setOrigem(e.target.value)}>
              <option value="">Selecione...</option>
              {listaOrigens.map((v,i) => <option key={i} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Conferente</label>
            <input style={{ ...inp, backgroundColor: '#f0f0f0', color: '#999' }} value={usuario.nome} disabled />
          </div>
        </div>
      </div>

      <div style={secao}>
        <h3 style={secaoTitulo}>Adicionar Produto</h3>
        <div style={grid2}>
          <div style={{ position: 'relative' }}>
            <label style={lbl}>Código do Produto</label>
            <input style={inp} value={codProduto} onChange={e => buscarProduto(e.target.value, 'codigo')} placeholder="Digite o código..." />
            {sugestoes.length > 0 && (
              <div style={dropdown}>
                {sugestoes.map((p,i) => (
                  <div key={i} style={dropItem} onClick={() => selecionarProduto(p)}>
                    <strong style={{ color: '#E31837' }}>{p.codigo}</strong> — {p.nome}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <label style={lbl}>Nome do Produto</label>
            <input style={inp} value={nomeProduto} onChange={e => buscarProduto(e.target.value, 'nome')} placeholder="Digite o nome..." />
            {sugestoes.length > 0 && nomeProduto && (
              <div style={dropdown}>
                {sugestoes.map((p,i) => (
                  <div key={i} style={dropItem} onClick={() => selecionarProduto(p)}>
                    <strong style={{ color: '#E31837' }}>{p.codigo}</strong> — {p.nome}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Qtd PLT</label>
            <input style={inp} value={qtdPlt} onChange={e => setQtdPlt(e.target.value.replace(/[^0-9]/g,''))} placeholder="0" />
          </div>
          <div>
            <label style={lbl}>Qtd CX</label>
            <input style={inp} value={qtdCx} onChange={e => setQtdCx(e.target.value.replace(/[^0-9]/g,''))} placeholder="0" />
          </div>
          <div>
            <label style={lbl}>Data de Validade</label>
            <input style={inp} value={validade} onChange={e => setValidade(formatarData(e.target.value))} maxLength={10} placeholder="DD/MM/AAAA" />
          </div>
        </div>
        <button onClick={adicionarProduto} style={{ ...btnPrimario, marginTop: 16 }}>+ Adicionar Produto</button>
      </div>

      {produtos.length > 0 && (
        <div style={secao}>
          <h3 style={secaoTitulo}>Produtos adicionados ({produtos.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                {['Código', 'Produto', 'Qtd PLT', 'Qtd CX', 'Validade', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtos.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 12px' }}>{p.codProduto}</td>
                  <td style={{ padding: '8px 12px' }}>{p.nomeProduto}</td>
                  <td style={{ padding: '8px 12px' }}>{p.qtdPlt || '-'}</td>
                  <td style={{ padding: '8px 12px' }}>{p.qtdCx || '-'}</td>
                  <td style={{ padding: '8px 12px', color: '#E31837', fontWeight: 'bold' }}>{p.validade}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <button onClick={() => removerProduto(i)} style={{ color: '#E31837', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button onClick={salvar} disabled={salvando} style={{ ...btnPrimario, width: '100%', padding: 16, fontSize: 16, marginTop: 8 }}>
        {salvando ? 'Salvando...' : 'Salvar NRI'}
      </button>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#E31837', fontSize: 15, fontWeight: 'bold', marginTop: 0, marginBottom: 16 };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
const lbl = { fontSize: 13, color: '#555', display: 'block', marginBottom: 4 };
const inp = { width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
const btnPrimario = { padding: '10px 20px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 };
const dropdown = { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: 8, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };
const dropItem = { padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: 13 };