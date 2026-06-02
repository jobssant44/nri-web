import { useState, useEffect } from 'react';
import { getDocs, addDoc, deleteDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useDb } from '../utils/db';
import { useUser } from '../context/UserContext';
import { useSessionFilter } from '../hooks/useSessionFilter';

const ABAS = [
  { key: 'motoristas', label: 'Motoristas' },
  { key: 'cavalos', label: 'Cavalos' },
  { key: 'carretas', label: 'Carretas' },
  { key: 'origens', label: 'Origens' },
  { key: 'pares', label: 'Pares (Cavalo↔Carreta)' },
];

// 5 pares iniciais definidos pelo Jobson em 02/06/26 — usado pelo botão
// "Popular padrão" da aba Pares quando ainda não há nenhum cadastrado.
const PARES_PADRAO = [
  { cavalo: 'RRE3F76', carreta: 'RRE8D86' },
  { cavalo: 'RRE3F66', carreta: 'RRE8E15' },
  { cavalo: 'RRE3F73', carreta: 'RRE8E22' },
  { cavalo: 'RRE3G97', carreta: 'RRE8E03' },
  { cavalo: 'RRE3F58', carreta: 'RRE8D97' },
];

// ID determinístico do doc — evita 2 docs com o mesmo par e dá deleção idempotente.
function parId(cavalo, carreta) {
  return `${String(cavalo).trim().toUpperCase()}__${String(carreta).trim().toUpperCase()}`;
}

export default function Cadastros() {
  const { col, docRef } = useDb();
  const { usuario } = useUser();
  const [abaAtiva, setAbaAtiva] = useSessionFilter('cad:aba', 'motoristas');
  const [dados, setDados] = useState({ motoristas: [], cavalos: [], carretas: [], origens: [], pares: [] });
  const [novoItem, setNovoItem] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editandoValor, setEditandoValor] = useState('');

  // Estado da aba Pares — 2 dropdowns + flag de "populando" pra desabilitar botão
  const [novoCavalo, setNovoCavalo] = useState('');
  const [novaCarreta, setNovaCarreta] = useState('');
  const [populando, setPopulando] = useState(false);

  useEffect(() => { carregarTodos(); }, []);

  async function carregarTodos() {
    const [mSnap, cSnap, crSnap, oSnap, pSnap] = await Promise.all([
      getDocs(col('motoristas')),
      getDocs(col('cavalos')),
      getDocs(col('carretas')),
      getDocs(col('origens')),
      getDocs(col('pares_placas')),
    ]);
    setDados({
      motoristas: mSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      cavalos: cSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      carretas: crSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      origens: oSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      pares: pSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  }

  // ─── Aba Pares ───────────────────────────────────────────────────────────
  async function adicionarPar() {
    const c = novoCavalo.trim().toUpperCase();
    const ca = novaCarreta.trim().toUpperCase();
    if (!c || !ca) { alert('Selecione cavalo e carreta.'); return; }
    // Detecta duplicata (mesmo par) — UI já bloqueia, mas garantia extra
    if (dados.pares.some(p => p.cavalo === c && p.carreta === ca)) {
      alert('Esse par já está cadastrado.'); return;
    }
    await setDoc(docRef('pares_placas', parId(c, ca)), {
      cavalo: c,
      carreta: ca,
      criadoEm: serverTimestamp(),
      criadoPor: usuario?.nome || '',
    });
    setNovoCavalo('');
    setNovaCarreta('');
    carregarTodos();
  }

  async function excluirPar(id) {
    if (!window.confirm('Excluir este par?')) return;
    await deleteDoc(docRef('pares_placas', id));
    carregarTodos();
  }

  // One-shot: insere os 5 pares iniciais. Botão só aparece quando lista vazia.
  async function popularPadrao() {
    if (dados.pares.length > 0) return;
    setPopulando(true);
    try {
      for (const { cavalo, carreta } of PARES_PADRAO) {
        await setDoc(docRef('pares_placas', parId(cavalo, carreta)), {
          cavalo, carreta,
          criadoEm: serverTimestamp(),
          criadoPor: usuario?.nome || '',
        });
      }
      await carregarTodos();
    } catch (e) {
      alert('Erro ao popular pares: ' + (e?.message || e));
    } finally {
      setPopulando(false);
    }
  }

  async function adicionar() {
    if (!novoItem.trim()) return;
    if (dados[abaAtiva].some(i => i.valor.toLowerCase() === novoItem.trim().toLowerCase())) {
      alert('Item já cadastrado.'); return;
    }
    await addDoc(col(abaAtiva), { valor: novoItem.trim() });
    setNovoItem('');
    carregarTodos();
  }

  async function excluir(id) {
    if (!window.confirm('Deseja excluir este item?')) return;
    await deleteDoc(docRef(abaAtiva, id));
    carregarTodos();
  }

  async function salvarEdicao(id) {
    if (!editandoValor.trim()) return;
    await updateDoc(docRef(abaAtiva, id), { valor: editandoValor.trim() });
    setEditandoId(null);
    carregarTodos();
  }

  return (
    <div>
      <h2 style={{ color: '#333', marginBottom: 24 }}>Cadastros</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => { setAbaAtiva(a.key); setNovoItem(''); setEditandoId(null); }}
            style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid #ddd', cursor: 'pointer', fontWeight: '500', fontSize: 14, backgroundColor: abaAtiva === a.key ? '#E31837' : '#fff', color: abaAtiva === a.key ? '#fff' : '#555' }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Aba Pares — UI especial: 2 dropdowns + lista "Cavalo → Carreta" */}
      {abaAtiva === 'pares' ? (
        <div style={secao}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              style={{ flex: 1, minWidth: 180, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, backgroundColor: '#fff' }}
              value={novoCavalo}
              onChange={e => setNovoCavalo(e.target.value)}
            >
              <option value="">Selecione o cavalo...</option>
              {dados.cavalos.map(c => <option key={c.id} value={c.valor}>{c.valor}</option>)}
            </select>
            <span style={{ color: '#999', fontWeight: 'bold' }}>↔</span>
            <select
              style={{ flex: 1, minWidth: 180, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, backgroundColor: '#fff' }}
              value={novaCarreta}
              onChange={e => setNovaCarreta(e.target.value)}
            >
              <option value="">Selecione a carreta...</option>
              {dados.carretas.map(c => <option key={c.id} value={c.valor}>{c.valor}</option>)}
            </select>
            <button onClick={adicionarPar} style={btnPrimario}>+ Adicionar par</button>
          </div>

          {/* One-shot pra popular os 5 pares iniciais — só aparece com lista vazia */}
          {dados.pares.length === 0 && (
            <div style={{ marginBottom: 16, padding: 16, background: '#fff7f7', border: '1px dashed #E31837', borderRadius: 8, textAlign: 'center' }}>
              <p style={{ margin: 0, marginBottom: 12, color: '#666', fontSize: 13 }}>
                Nenhum par cadastrado. Use o botão abaixo para inserir os 5 pares iniciais (RRE3F76↔RRE8D86 etc).
              </p>
              <button
                onClick={popularPadrao}
                disabled={populando}
                style={{ ...btnPrimario, opacity: populando ? 0.6 : 1, cursor: populando ? 'not-allowed' : 'pointer' }}
              >
                {populando ? 'Populando…' : '⚡ Popular padrão (5 pares)'}
              </button>
            </div>
          )}

          {dados.pares.length === 0 && <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum par cadastrado.</p>}

          {dados.pares.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee', gap: 12 }}>
              <span style={{ flex: 1, fontSize: 15, color: '#333', fontFamily: 'monospace' }}>
                <strong>{p.cavalo}</strong> ↔ <strong>{p.carreta}</strong>
              </span>
              <button onClick={() => excluirPar(p.id)} style={btnExcluir}>Excluir</button>
            </div>
          ))}
        </div>
      ) : (
        <div style={secao}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
              value={novoItem} onChange={e => setNovoItem(e.target.value)}
              placeholder={`Novo ${abaAtiva.slice(0,-1)}...`}
              onKeyDown={e => e.key === 'Enter' && adicionar()}
            />
            <button onClick={adicionar} style={btnPrimario}>+ Adicionar</button>
          </div>

          {dados[abaAtiva].length === 0 && <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum item cadastrado.</p>}

          {dados[abaAtiva].map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee', gap: 12 }}>
              {editandoId === item.id ? (
                <>
                  <input style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                    value={editandoValor} onChange={e => setEditandoValor(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && salvarEdicao(item.id)}
                    autoFocus
                  />
                  <button onClick={() => salvarEdicao(item.id)} style={btnPrimario}>Salvar</button>
                  <button onClick={() => setEditandoId(null)} style={btnSecundario}>Cancelar</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 15, color: '#333' }}>{item.valor}</span>
                  <button onClick={() => { setEditandoId(item.id); setEditandoValor(item.valor); }} style={btnSecundario}>Editar</button>
                  <button onClick={() => excluir(item.id)} style={btnExcluir}>Excluir</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 };
const btnSecundario = { padding: '8px 16px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnExcluir = { padding: '8px 16px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E31837' };