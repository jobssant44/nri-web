import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

function diaOperacional() {
  const agora = new Date();
  if (agora.getHours() < 7) agora.setDate(agora.getDate() - 1);
  return String(agora.getDate()).padStart(2,'0') + '/' +
    String(agora.getMonth()+1).padStart(2,'0') + '/' + agora.getFullYear();
}

function detectarTipo() {
  const h = new Date().getHours();
  return (h >= 22 || h < 4) ? 'ressuprimento' : 'reabastecimento';
}

export default function LancarAbastecimento({ usuario }) {
  const [baseProdutos, setBaseProdutos] = useState([]);
  const [codProduto, setCodProduto] = useState('');
  const [nomeProduto, setNomeProduto] = useState('');
  const [sugestoes, setSugestoes] = useState([]);
  const [tipo, setTipo] = useState(detectarTipo());
  const [qtdPaletes, setQtdPaletes] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const [lancamentosHoje, setLancamentosHoje] = useState([]);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    const [pSnap, aSnap] = await Promise.all([
      getDocs(collection(db, 'produtos')),
      getDocs(collection(db, 'abastecimentos')),
    ]);
    setBaseProdutos(pSnap.docs.map(d => d.data()));
    const hoje = diaOperacional();
    const lista = aSnap.docs.map(d => d.data())
      .filter(a => a.dataOperacional === hoje)
      .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
    setLancamentosHoje(lista);
  }

  function buscarProduto(texto, campo) {
    if (campo === 'codigo') {
      setCodProduto(texto.replace(/[^0-9]/g, ''));
      setNomeProduto('');
      setSugestoes(texto.length >= 2 ? baseProdutos.filter(p => p.codigo?.startsWith(texto)).slice(0,5) : []);
    } else {
      setNomeProduto(texto.toUpperCase());
      setCodProduto('');
      setSugestoes(texto.length >= 2 ? baseProdutos.filter(p => p.nome?.toLowerCase().includes(texto.toLowerCase())).slice(0,5) : []);
    }
  }

  function selecionarProduto(p) {
    setCodProduto(p.codigo);
    setNomeProduto(p.nome);
    setSugestoes([]);
  }

  async function lancar() {
    if (!codProduto || !nomeProduto) { alert('Selecione um produto.'); return; }
    if (!qtdPaletes || parseInt(qtdPaletes) < 1) { alert('Informe a quantidade de paletes.'); return; }
    setSalvando(true);
    try {
      const agora = new Date();
      const hora = String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0');
      const registro = {
        codProduto, nomeProduto, tipo,
        qtdPaletes: parseInt(qtdPaletes),
        conferente: usuario.nome,
        dataOperacional: diaOperacional(),
        hora,
        criadoEm: agora.toISOString(),
      };
      await addDoc(collection(db, 'abastecimentos'), registro);
      setLancamentosHoje(prev => [registro, ...prev]);
      setCodProduto(''); setNomeProduto(''); setQtdPaletes('1');
    } catch (e) { alert('Erro: ' + e.message); }
    setSalvando(false);
  }

  const corTipo = t => t === 'reabastecimento' ? '#1D5A9E' : '#E31837';
  const labelTipo = t => t === 'reabastecimento' ? '🌅 Reabastecimento' : '🌙 Ressuprimento';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Lançar Abastecimento</h2>
        <span style={{ fontSize: 13, color: '#999' }}>Dia operacional: <b>{diaOperacional()}</b></span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div style={secao}>
          <h3 style={secaoTitulo}>Produto</h3>

          <label style={lbl}>Código do Produto</label>
          <input
            style={inp}
            placeholder="Digite o código..."
            value={codProduto}
            onChange={e => buscarProduto(e.target.value, 'codigo')}
          />

          <label style={lbl}>Nome do Produto</label>
          <div style={{ position: 'relative' }}>
            <input
              style={inp}
              placeholder="Digite o nome..."
              value={nomeProduto}
              onChange={e => buscarProduto(e.target.value, 'nome')}
            />
            {sugestoes.length > 0 && (
              <div style={dropdownStyle}>
                {sugestoes.map((p, i) => (
                  <div key={i} onClick={() => selecionarProduto(p)} style={dropdownItem}>
                    <span style={{ fontWeight: 'bold', color: '#E31837', marginRight: 10 }}>{p.codigo}</span>
                    <span>{p.nome}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label style={lbl}>Tipo</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['reabastecimento', 'ressuprimento'].map(t => (
              <button key={t} onClick={() => setTipo(t)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                cursor: 'pointer', fontWeight: '600', fontSize: 13,
                backgroundColor: tipo === t ? corTipo(t) : '#eee',
                color: tipo === t ? '#fff' : '#666',
              }}>
                {labelTipo(t)}
              </button>
            ))}
          </div>

          <label style={lbl}>Quantidade de Paletes</label>
          <input
            style={inp}
            type="number"
            min="1"
            value={qtdPaletes}
            onChange={e => setQtdPaletes(e.target.value.replace(/[^0-9]/g, ''))}
          />

          <button onClick={lancar} disabled={salvando} style={{ ...btnPrimario, width: '100%', marginTop: 8, opacity: salvando ? 0.6 : 1 }}>
            {salvando ? 'Salvando...' : '✅ Confirmar Lançamento'}
          </button>
        </div>

        <div style={secao}>
          <h3 style={secaoTitulo}>Lançamentos de Hoje</h3>
          {lancamentosHoje.length === 0 && (
            <p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: 20 }}>Nenhum lançamento hoje.</p>
          )}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {lancamentosHoje.map((l, i) => (
              <div key={i} style={{ borderLeft: `4px solid ${corTipo(l.tipo)}`, backgroundColor: '#f9f9f9', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: 14, color: '#333' }}>{l.nomeProduto}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>{l.hora}</span>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  Cód: {l.codProduto} · {l.qtdPaletes} plt · {l.conferente}
                  <span style={{ marginLeft: 8, color: corTipo(l.tipo), fontWeight: '600' }}>{labelTipo(l.tipo)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#333', fontSize: 16, fontWeight: 'bold', marginBottom: 16, marginTop: 0 };
const lbl = { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, marginTop: 12 };
const inp = { width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
const btnPrimario = { padding: '12px 20px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 };
const dropdownStyle = { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: 8, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };
const dropdownItem = { padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: 13 };
