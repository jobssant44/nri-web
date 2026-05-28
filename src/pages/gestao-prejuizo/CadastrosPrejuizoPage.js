import { useState, useEffect } from 'react';
import { getDocs, addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import {
  D, sInput, sBtnPrimary,
  PageContainer, PageHeader,
} from '../../design';

const ABAS = [
  { key: 'colaboradores',   label: 'Colaborador',      colecao: 'prejuizo_colaboradores',   campo: 'nome',  tipo: 'texto'  },
  { key: 'areas',           label: 'Área',              colecao: 'prejuizo_areas',           campo: 'nome',  tipo: 'texto'  },
  { key: 'motivos',         label: 'Motivo',             colecao: 'prejuizo_motivos',          campo: 'nome',  tipo: 'texto'  },
  { key: 'meta_wqi',        label: 'Meta WQI',           colecao: 'prejuizo_meta_wqi',         campo: 'valor', tipo: 'numero' },
  { key: 'meta_troca',      label: 'Meta Troca',         colecao: 'prejuizo_meta_troca',       campo: 'valor', tipo: 'numero' },
  { key: 'meta_reposicao',  label: 'Meta Reposição',     colecao: 'prejuizo_meta_reposicao',   campo: 'valor', tipo: 'numero' },
];

function CardCadastro({ aba }) {
  const { col, docRef, rid } = useDb();
  const metaDocId = rid || 'global';
  const [itens, setItens]               = useState([]);
  const [input, setInput]               = useState('');
  const [salvando, setSalvando]         = useState(false);
  const [excluindo, setExcluindo]       = useState(null);
  const [editandoId, setEditandoId]     = useState(null);
  const [editValor, setEditValor]       = useState('');
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [erro, setErro]                 = useState('');

  useEffect(() => { carregar(); }, [aba.colecao]);

  async function carregar() {
    const snap = await getDocs(col(aba.colecao));
    setItens(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function handleAdicionar() {
    const val = input.trim();
    if (!val) return;
    setSalvando(true); setErro('');
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
      await deleteDoc(docRef(aba.colecao, id));
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
    setSalvandoEdit(true); setErro('');
    try {
      const valor = aba.tipo === 'numero' ? parseFloat(val.replace(',', '.')) : val;
      await setDoc(docRef(aba.colecao, id), { [aba.campo]: valor });
      setEditandoId(null);
      setEditValor('');
      await carregar();
    } catch (e) {
      setErro('Erro ao salvar: ' + e.message);
    } finally {
      setSalvandoEdit(false);
    }
  }

  const isMeta    = aba.tipo === 'numero';
  const metaAtual = isMeta ? itens.find(i => i.id === metaDocId) : null;

  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: D.radius, padding: 24, boxShadow: D.shadow,
      animation: 'wjs-fadeUp 0.3s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2, fontFamily: D.font }}>
          {aba.label}
        </span>
      </div>

      {/* Formulário de adição */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type={isMeta ? 'number' : 'text'}
          placeholder={isMeta ? 'Ex: 0.50' : `Nome do ${aba.label.toLowerCase()}...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdicionar()}
          style={{ ...sInput, flex: 1 }}
        />
        <button
          onClick={handleAdicionar}
          disabled={salvando || !input.trim()}
          style={{ ...sBtnPrimary, opacity: (salvando || !input.trim()) ? 0.6 : 1, cursor: (salvando || !input.trim()) ? 'not-allowed' : 'pointer' }}
        >
          {salvando ? '...' : isMeta ? 'Salvar' : '+ Adicionar'}
        </button>
      </div>

      {erro && (
        <div style={{
          padding: '8px 12px', backgroundColor: D.redSoft,
          color: D.red, borderRadius: 8, fontSize: 13,
          marginBottom: 12, border: `1px solid ${D.redBorder}`,
          fontFamily: D.font,
        }}>
          {erro}
        </div>
      )}

      {/* Lista */}
      {isMeta ? (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '16px 20px', backgroundColor: D.bg,
            borderRadius: 8, border: `1px solid ${D.border}`,
          }}>
            <span style={{ fontSize: 13, color: D.textSec, fontFamily: D.font }}>Meta atual:</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: D.text, marginLeft: 10, fontFamily: D.mono }}>
              {metaAtual ? `R$ ${String(metaAtual.valor).replace('.', ',')} / HL` : '—'}
            </span>
            {metaAtual && editandoId !== metaDocId && (
              <button onClick={() => iniciarEdicao(metaAtual)} style={btnAcao(D.textSec, 'auto')}>
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
                style={{ ...sInput, flex: 1 }}
                autoFocus
              />
              <button onClick={() => handleSalvarEdicao(metaDocId)} disabled={salvandoEdit || !editValor.trim()} style={{ ...sBtnPrimary, opacity: (salvandoEdit || !editValor.trim()) ? 0.6 : 1 }}>
                {salvandoEdit ? '...' : 'Salvar'}
              </button>
              <button onClick={cancelarEdicao} style={btnSecundario}>Cancelar</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {itens.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: D.textMuted, fontStyle: 'italic', fontFamily: D.font }}>
              Nenhum {aba.label.toLowerCase()} cadastrado.
            </div>
          ) : (
            itens.map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px', backgroundColor: D.bg,
                borderRadius: 8, border: `1px solid ${D.borderLight}`,
                fontFamily: D.font,
              }}>
                {editandoId === item.id ? (
                  <>
                    <input
                      type="text"
                      value={editValor}
                      onChange={e => setEditValor(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSalvarEdicao(item.id); if (e.key === 'Escape') cancelarEdicao(); }}
                      style={{ ...sInput, flex: 1, padding: '5px 10px', fontSize: 13 }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                      <button onClick={() => handleSalvarEdicao(item.id)} disabled={salvandoEdit || !editValor.trim()} style={{ ...sBtnPrimary, padding: '5px 14px', fontSize: 12, opacity: (salvandoEdit || !editValor.trim()) ? 0.6 : 1 }}>
                        {salvandoEdit ? '...' : 'Salvar'}
                      </button>
                      <button onClick={cancelarEdicao} style={btnSecundario}>Cancelar</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: D.text }}>{item[aba.campo]}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => iniciarEdicao(item)} style={btnAcao(D.textSec)}>✏</button>
                      <button
                        onClick={() => handleExcluir(item.id)}
                        disabled={excluindo === item.id}
                        style={btnAcao(D.red)}
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
    <PageContainer maxWidth={720}>
      <PageHeader
        kicker="Gestão de Prejuízo"
        titulo="Cadastros"
        sub="Gerencie colaboradores, áreas, motivos e metas (R$/HL) de WQI, Troca e Reposição."
      />

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `2px solid ${D.border}` }}>
        {ABAS.map(a => (
          <button
            key={a.key}
            onClick={() => setAbaAtiva(a.key)}
            style={{
              padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontFamily: D.font,
              fontWeight: abaAtiva === a.key ? 700 : 500,
              color: abaAtiva === a.key ? D.red : D.textSec,
              borderBottom: abaAtiva === a.key ? `2px solid ${D.red}` : '2px solid transparent',
              marginBottom: -2,
              transition: D.transition,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <CardCadastro key={abaAtiva} aba={aba} />
    </PageContainer>
  );
}

// ── helpers locais de botão ──
const btnAcao = (cor, marginLeft) => ({
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: cor,
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 4,
  transition: D.transition,
  fontFamily: D.font,
  marginLeft: marginLeft ?? undefined,
});

const btnSecundario = {
  padding: '5px 14px',
  background: 'transparent',
  border: `1px solid ${D.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: D.textSec,
  cursor: 'pointer',
  fontWeight: 500,
  fontFamily: D.font,
};
