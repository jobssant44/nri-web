import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useDb } from '../../utils/db';

const ABAS = [
  { key: 'colaboradores', label: 'Colaborador',  colecao: 'prejuizo_colaboradores', campo: 'nome',  tipo: 'texto'  },
  { key: 'areas',         label: 'Área',          colecao: 'prejuizo_areas',         campo: 'nome',  tipo: 'texto'  },
  { key: 'motivos',       label: 'Motivo',         colecao: 'prejuizo_motivos',        campo: 'nome',  tipo: 'texto'  },
  { key: 'meta_wqi',      label: 'Meta WQI',       colecao: 'prejuizo_meta_wqi',       campo: 'valor', tipo: 'numero' },
];

function CardCadastro({ aba }) {
  const { col, docRef, rid } = useDb();
  const metaDocId = rid || 'global';
  const [itens, setItens]         = useState([]);
  const [input, setInput]         = useState('');
  const [salvando, setSalvando]   = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editValor, setEditValor]   = useState('');
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [erro, setErro]           = useState('');

  useEffect(() => {
    carregar();
  }, [aba.colecao]);

  async function carregar() {
    const snap = await getDocs(col(aba.colecao));
    setItens(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function handleAdicionar() {
    const val = input.trim();
    if (!val) return;
    setSalvando(true);
    setErro('');
    try {
      if (aba.tipo === 'numero') {
        await setDoc(docRef(aba.colecao, metaDocId), { [aba.campo]: parseFloat(val.replace(',', '.')) });
      } else {
        await addDoc(col(aba.colecao), { [aba.campo]: val });
      }
      setInput('');
      await carregar();
    } catch (e) {
      setErro('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(id) {
    setExcluindo(id);
    try {
      await deleteDoc(docRef(aba.colecao,id));
      await carregar();
    } catch (e) {
      setErro('Erro ao excluir: ' + e.message);
    } finally {
      setExcluindo(null);
    }
  }

  function iniciarEdicao(item) {
    setEditandoId(item.id);
    setEditValor(String(item[aba.campo] ?? ''));
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditValor('');
  }

  async function handleSalvarEdicao(id) {
    const val = editValor.trim();
    if (!val) return;
    setSalvandoEdit(true);
    setErro('');
    try {
      if (aba.tipo === 'numero') {
        await setDoc(docRef(aba.colecao,id), { [aba.campo]: parseFloat(val.replace(',', '.')) });
      } else {
        await setDoc(docRef(aba.colecao,id), { [aba.campo]: val });
      }
      setEditandoId(null);
      setEditValor('');
      await carregar();
    } catch (e) {
      setErro('Erro ao salvar: ' + e.message);
    } finally {
      setSalvandoEdit(false);
    }
  }

  const isMeta = aba.tipo === 'numero';
  const metaAtual = isMeta ? itens.find(i => i.id === metaDocId) : null;

  return (
    <div style={s.card}>
      <div style={s.cardTitulo}>{aba.label}</div>

      {/* Formulário de adição */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type={isMeta ? 'number' : 'text'}
          placeholder={isMeta ? 'Ex: 0.50' : `Nome do ${aba.label.toLowerCase()}...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdicionar()}
          style={s.input}
        />
        <button
          onClick={handleAdicionar}
          disabled={salvando || !input.trim()}
          style={{ ...s.botaoAdicionar, opacity: salvando || !input.trim() ? 0.6 : 1 }}
        >
          {salvando ? '...' : isMeta ? 'Salvar' : '+ Adicionar'}
        </button>
      </div>

      {erro && <div style={s.erro}>{erro}</div>}

      {/* Lista */}
      {isMeta ? (
        <div>
          <div style={s.metaBox}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Meta atual:</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginLeft: 10 }}>
              {metaAtual ? `R$ ${String(metaAtual.valor).replace('.', ',')} / HL` : '—'}
            </span>
            {metaAtual && editandoId !== 'meta' && (
              <button onClick={() => iniciarEdicao(metaAtual)} style={{ ...s.botaoEditar, marginLeft: 'auto' }}>
                ✏ Editar
              </button>
            )}
          </div>
          {editandoId === metaDocId && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                type="number"
                value={editValor}
                onChange={e => setEditValor(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSalvarEdicao(metaDocId); if (e.key === 'Escape') cancelarEdicao(); }}
                style={{ ...s.input, flex: 1 }}
                autoFocus
              />
              <button onClick={() => handleSalvarEdicao(metaDocId)} disabled={salvandoEdit || !editValor.trim()} style={{ ...s.botaoAdicionar, opacity: salvandoEdit || !editValor.trim() ? 0.6 : 1 }}>
                {salvandoEdit ? '...' : 'Salvar'}
              </button>
              <button onClick={cancelarEdicao} style={s.botaoCancelar}>Cancelar</button>
            </div>
          )}
        </div>
      ) : (
        <div style={s.lista}>
          {itens.length === 0 ? (
            <div style={s.vazio}>Nenhum {aba.label.toLowerCase()} cadastrado.</div>
          ) : (
            itens.map(item => (
              <div key={item.id} style={s.item}>
                {editandoId === item.id ? (
                  <>
                    <input
                      type="text"
                      value={editValor}
                      onChange={e => setEditValor(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSalvarEdicao(item.id); if (e.key === 'Escape') cancelarEdicao(); }}
                      style={{ ...s.input, flex: 1, padding: '5px 10px', fontSize: 13 }}
                      autoFocus
                    />
                    <button onClick={() => handleSalvarEdicao(item.id)} disabled={salvandoEdit || !editValor.trim()} style={{ ...s.botaoAdicionar, padding: '5px 14px', fontSize: 12, opacity: salvandoEdit || !editValor.trim() ? 0.6 : 1 }}>
                      {salvandoEdit ? '...' : 'Salvar'}
                    </button>
                    <button onClick={cancelarEdicao} style={s.botaoCancelar}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: '#1a1a2e' }}>{item[aba.campo]}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => iniciarEdicao(item)} style={s.botaoEditar}>✏</button>
                      <button
                        onClick={() => handleExcluir(item.id)}
                        disabled={excluindo === item.id}
                        style={s.botaoExcluir}
                      >
                        {excluindo === item.id ? '...' : '✕'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function CadastrosPrejuizoPage() {
  const [abaAtiva, setAbaAtiva] = useState('colaboradores');
  const aba = ABAS.find(a => a.key === abaAtiva);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 4 }}>
          Cadastros — Gestão de Prejuízo
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          Gerencie colaboradores, áreas, motivos e metas do WQI.
        </p>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        {ABAS.map(a => (
          <button
            key={a.key}
            onClick={() => setAbaAtiva(a.key)}
            style={{
              padding: '9px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: abaAtiva === a.key ? 700 : 500,
              color: abaAtiva === a.key ? '#E31837' : '#6b7280',
              borderBottom: abaAtiva === a.key ? '2px solid #E31837' : '2px solid transparent',
              marginBottom: -2,
              transition: 'all 0.15s',
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <CardCadastro key={abaAtiva} aba={aba} />
    </div>
  );
}

const s = {
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 24,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardTitulo: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    color: '#1a1a2e',
    outline: 'none',
  },
  botaoAdicionar: {
    padding: '8px 18px',
    backgroundColor: '#E31837',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  lista: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 12px',
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    border: '1px solid #f0f0f0',
  },
  botaoExcluir: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9ca3af',
    fontSize: 12,
    padding: '2px 6px',
    borderRadius: 4,
    transition: 'color 0.12s',
  },
  vazio: {
    padding: '20px 0',
    textAlign: 'center',
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  metaBox: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 20px',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
  },
  erro: {
    padding: '8px 12px',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 12,
  },
};
