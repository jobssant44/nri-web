import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function ConfigPicking() {
  const [configs, setConfigs] = useState([]);
  const [baseProdutos, setBaseProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [novoForm, setNovoForm] = useState({ codProduto: '', nomeProduto: '', espacosPalete: '', mediaCxDia: '' });
  const [sugestoes, setSugestoes] = useState([]);
  const [showNovo, setShowNovo] = useState(false);
  const [importando, setImportando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    const [cSnap, pSnap] = await Promise.all([
      getDocs(collection(db, 'picking_config')),
      getDocs(collection(db, 'produtos')),
    ]);
    const prods = pSnap.docs.map(d => d.data());
    setBaseProdutos(prods);
    const cfgs = cSnap.docs.map(d => ({ _id: d.id, ...d.data() }));
    // enrich cxPorPlt from produtos
    const enriquecidos = cfgs.map(c => {
      const prod = prods.find(p => p.codigo === c.codProduto);
      return { ...c, cxPorPlt: c.cxPorPlt || prod?.cxPorPlt || '' };
    });
    enriquecidos.sort((a, b) => a.nomeProduto?.localeCompare(b.nomeProduto));
    setConfigs(enriquecidos);
    setCarregando(false);
  }

  function buscarProdutoForm(texto, campo) {
    if (campo === 'codigo') {
      const v = texto.replace(/[^0-9]/g, '');
      setNovoForm(f => ({ ...f, codProduto: v, nomeProduto: '' }));
      setSugestoes(v.length >= 2 ? baseProdutos.filter(p => p.codigo?.startsWith(v)).slice(0,5) : []);
    } else {
      setNovoForm(f => ({ ...f, nomeProduto: texto.toUpperCase(), codProduto: '' }));
      setSugestoes(texto.length >= 2 ? baseProdutos.filter(p => p.nome?.toLowerCase().includes(texto.toLowerCase())).slice(0,5) : []);
    }
  }

  function selecionarProdutoForm(p) {
    const cxPorPlt = p.cxPorPlt || '';
    setNovoForm(f => ({ ...f, codProduto: p.codigo, nomeProduto: p.nome, cxPorPlt }));
    setSugestoes([]);
  }

  async function salvarNovo() {
    if (!novoForm.codProduto || !novoForm.nomeProduto) { alert('Selecione um produto.'); return; }
    if (!novoForm.espacosPalete || !novoForm.mediaCxDia) { alert('Preencha espaços palete e média CX/dia.'); return; }
    const prod = baseProdutos.find(p => p.codigo === novoForm.codProduto);
    const novo = {
      codProduto: novoForm.codProduto,
      nomeProduto: novoForm.nomeProduto,
      espacosPalete: parseInt(novoForm.espacosPalete),
      mediaCxDia: parseInt(novoForm.mediaCxDia),
      cxPorPlt: prod?.cxPorPlt ? parseInt(prod.cxPorPlt) : '',
    };
    await addDoc(collection(db, 'picking_config'), novo);
    setShowNovo(false);
    setNovoForm({ codProduto: '', nomeProduto: '', espacosPalete: '', mediaCxDia: '' });
    carregar();
  }

  async function salvarEdicao(cfg) {
    await updateDoc(doc(db, 'picking_config', cfg._id), {
      espacosPalete: parseInt(cfg.espacosPalete),
      mediaCxDia: parseInt(cfg.mediaCxDia),
    });
    setEditando(null);
    carregar();
  }

  async function excluir(id, nome) {
    if (!window.confirm(`Remover configuração de "${nome}"?`)) return;
    await deleteDoc(doc(db, 'picking_config', id));
    carregar();
  }

  function lerCSV(file) {
    const reader = new FileReader();
    reader.onload = async e => {
      setImportando(true);
      const linhas = e.target.result.split('\n').filter(l => l.trim()).slice(1);
      const snap = await getDocs(collection(db, 'picking_config'));
      const existentes = {};
      snap.docs.forEach(d => { existentes[d.data().codProduto] = d.id; });
      const batch = writeBatch(db);
      let count = 0;
      for (const linha of linhas) {
        const cols = linha.split(';');
        const codigo = cols[0]?.trim();
        const nome = cols[1]?.trim();
        const espacos = parseInt(cols[2]?.trim());
        const media = parseInt(cols[3]?.trim());
        if (!codigo || isNaN(espacos) || isNaN(media)) continue;
        const prod = baseProdutos.find(p => p.codigo === codigo);
        const dados = { codProduto: codigo, nomeProduto: nome || prod?.nome || codigo, espacosPalete: espacos, mediaCxDia: media, cxPorPlt: prod?.cxPorPlt ? parseInt(prod.cxPorPlt) : '' };
        if (existentes[codigo]) {
          batch.update(doc(db, 'picking_config', existentes[codigo]), dados);
        } else {
          batch.set(doc(collection(db, 'picking_config')), dados);
        }
        count++;
      }
      await batch.commit();
      alert(`${count} produtos importados/atualizados com sucesso!`);
      setImportando(false);
      carregar();
    };
    reader.readAsText(file, 'UTF-8');
  }

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Carregando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Configurar Picking</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ ...btnSec, cursor: 'pointer', opacity: importando ? 0.6 : 1 }}>
            {importando ? 'Importando...' : '📥 Importar CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) lerCSV(e.target.files[0]); }} disabled={importando} />
          </label>
          <button onClick={() => setShowNovo(true)} style={btnPrimario}>+ Adicionar Produto</button>
        </div>
      </div>

      <div style={{ backgroundColor: '#f0f4ff', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: '#555' }}>
        📋 <b>Formato do CSV:</b> Código ; Nome ; Espaços Palete ; Média CX/dia — separador ponto e vírgula, primeira linha é cabeçalho. O campo CX/plt é puxado automaticamente da base de produtos.
      </div>

      {showNovo && (
        <div style={{ ...secao, marginBottom: 24, borderLeft: '4px solid #E31837' }}>
          <h3 style={{ ...secaoTitulo, color: '#E31837' }}>Novo Produto no Picking</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={lbl}>Código</label>
              <input style={inp} value={novoForm.codProduto} onChange={e => buscarProdutoForm(e.target.value, 'codigo')} placeholder="Código..." />
            </div>
            <div style={{ position: 'relative' }}>
              <label style={lbl}>Nome do Produto</label>
              <input style={inp} value={novoForm.nomeProduto} onChange={e => buscarProdutoForm(e.target.value, 'nome')} placeholder="Nome..." />
              {sugestoes.length > 0 && (
                <div style={dropdown}>
                  {sugestoes.map((p, i) => (
                    <div key={i} onClick={() => selecionarProdutoForm(p)} style={dropItem}>
                      <b style={{ color: '#E31837' }}>{p.codigo}</b> — {p.nome}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Espaços Palete</label>
              <input style={inp} type="number" min="1" value={novoForm.espacosPalete} onChange={e => setNovoForm(f => ({ ...f, espacosPalete: e.target.value }))} placeholder="Ex: 2" />
            </div>
            <div>
              <label style={lbl}>Média CX/dia</label>
              <input style={inp} type="number" min="1" value={novoForm.mediaCxDia} onChange={e => setNovoForm(f => ({ ...f, mediaCxDia: e.target.value }))} placeholder="Ex: 240" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={salvarNovo} style={btnPrimario}>✅ Salvar</button>
            <button onClick={() => { setShowNovo(false); setSugestoes([]); }} style={btnSec}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={secao}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ ...secaoTitulo, margin: 0 }}>Produtos Configurados ({configs.length})</h3>
        </div>
        {configs.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum produto configurado ainda.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                {['Código', 'Produto', 'Espaços Palete', 'CX/PLT', 'Cap. Picking (cx)', 'Média CX/dia', 'IV Esperado', 'Ações'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {configs.map((c, i) => {
                const cap = c.espacosPalete && c.cxPorPlt ? c.espacosPalete * parseInt(c.cxPorPlt) : null;
                const ivEsp = cap && c.mediaCxDia ? Math.max(0, Math.ceil(c.mediaCxDia / cap) - 1) : null;
                const estaEditando = editando?._id === c._id;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={td}>{c.codProduto}</td>
                    <td style={td}><b>{c.nomeProduto}</b></td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {estaEditando
                        ? <input type="number" min="1" value={editando.espacosPalete} onChange={e => setEditando(ed => ({ ...ed, espacosPalete: e.target.value }))} style={{ ...inp, width: 70, textAlign: 'center' }} />
                        : c.espacosPalete}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{c.cxPorPlt || '-'}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#555' }}>{cap || '-'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {estaEditando
                        ? <input type="number" min="1" value={editando.mediaCxDia} onChange={e => setEditando(ed => ({ ...ed, mediaCxDia: e.target.value }))} style={{ ...inp, width: 80, textAlign: 'center' }} />
                        : c.mediaCxDia}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 'bold', color: '#1D5A9E' }}>{ivEsp ?? '-'}</td>
                    <td style={{ ...td }}>
                      {estaEditando ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => salvarEdicao(editando)} style={{ ...btnPrimario, padding: '5px 12px', fontSize: 12 }}>✓ Salvar</button>
                          <button onClick={() => setEditando(null)} style={{ ...btnSec, padding: '5px 10px', fontSize: 12 }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setEditando({ ...c })} style={{ ...btnSec, padding: '5px 10px', fontSize: 12 }}>✏️</button>
                          <button onClick={() => excluir(c._id, c.nomeProduto)} style={{ ...btnExcluir, padding: '5px 10px', fontSize: 12 }}>✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#333', fontSize: 16, fontWeight: 'bold', marginBottom: 16, marginTop: 0 };
const lbl = { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#666', fontWeight: '600', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px' };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 };
const btnSec = { padding: '8px 14px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnExcluir = { backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', color: '#E31837', fontWeight: 'bold' };
const dropdown = { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: 8, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };
const dropItem = { padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: 13 };
