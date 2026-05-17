import { useState, useEffect, useCallback } from 'react';
import { getDocs, addDoc, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import {
  D, PageContainer, PageHeader, EmptyState, Tabela,
  sInput, sLabel, tdStyle,
} from '../../design';

const ABAS = [
  { key: 'portaria_destinos',            label: 'Destinos (Carretas)',         singular: 'destino' },
  { key: 'portaria_tipos_atendimento',   label: 'Tipos (Terceiros)',           singular: 'tipo' },
];

export default function CadastrosPortaria() {
  const { col, docRef } = useDb();
  const [abaAtiva, setAbaAtiva] = useSessionFilter('portaria:cad:aba', ABAS[0].key);

  const [itens, setItens] = useState([]);
  const [nome, setNome] = useState('');
  const [slaMin, setSlaMin] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editSla, setEditSla] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const snap = await getDocs(query(col(abaAtiva), orderBy('nome')));
      setItens(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      // Sem orderBy se a coleção estiver vazia ou sem campo
      const snap = await getDocs(col(abaAtiva));
      setItens(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    setCarregando(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva]);

  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar() {
    const n = nome.trim();
    if (!n) { alert('Informe o nome.'); return; }
    if (itens.some(i => (i.nome || '').toLowerCase() === n.toLowerCase())) {
      alert('Já existe um item com este nome.'); return;
    }
    const sla = parseInt(slaMin, 10);
    await addDoc(col(abaAtiva), {
      nome: n,
      slaMin: Number.isFinite(sla) && sla > 0 ? sla : null,
      ativo: true,
    });
    setNome(''); setSlaMin('');
    carregar();
  }

  function iniciarEdicao(item) {
    setEditandoId(item.id);
    setEditNome(item.nome || '');
    setEditSla(item.slaMin ? String(item.slaMin) : '');
  }

  async function salvarEdicao(id) {
    const n = editNome.trim();
    if (!n) return;
    const sla = parseInt(editSla, 10);
    await updateDoc(docRef(abaAtiva, id), {
      nome: n,
      slaMin: Number.isFinite(sla) && sla > 0 ? sla : null,
    });
    setEditandoId(null);
    carregar();
  }

  async function toggleAtivo(item) {
    await updateDoc(docRef(abaAtiva, item.id), { ativo: !(item.ativo !== false) });
    carregar();
  }

  async function excluir(id) {
    if (!window.confirm('Excluir este item? Registros existentes que usavam ele continuarão íntegros (com nome salvo).')) return;
    await deleteDoc(docRef(abaAtiva, id));
    carregar();
  }

  const abaInfo = ABAS.find(a => a.key === abaAtiva);

  return (
    <PageContainer maxWidth={920}>
      <PageHeader
        kicker="Portaria"
        titulo="Cadastros"
        sub="Destinos das viagens (carretas) e tipos de atendimento (terceiros). Cada item pode ter um SLA em minutos — usado para sinalizar atrasos no Painel e no Dashboard."
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {ABAS.map(a => {
          const ativo = a.key === abaAtiva;
          return (
            <button
              key={a.key}
              onClick={() => setAbaAtiva(a.key)}
              style={{
                padding: '8px 14px',
                background: ativo ? D.text : D.surface,
                color: ativo ? '#fff' : D.textSec,
                border: `1px solid ${ativo ? D.text : D.border}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: D.transition,
                fontFamily: D.font,
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Form: adicionar novo */}
      <div style={{
        background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius,
        padding: '16px 20px', boxShadow: D.shadow, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <label style={sLabel}>Nome do {abaInfo.singular}</label>
            <input
              style={{ ...sInput, width: '100%', marginTop: 5 }}
              placeholder={abaAtiva === 'portaria_destinos' ? 'Ex: Base Centro' : 'Ex: Reciclagem'}
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionar()}
            />
          </div>
          <div style={{ width: 140 }}>
            <label style={sLabel}>SLA (min)</label>
            <input
              style={{ ...sInput, width: '100%', marginTop: 5 }}
              type="number"
              min="1"
              placeholder="opcional"
              value={slaMin}
              onChange={e => setSlaMin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionar()}
            />
          </div>
          <button
            onClick={adicionar}
            style={{
              padding: '9px 18px',
              background: D.red, color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: D.font, transition: D.transition,
            }}
          >
            + Adicionar
          </button>
        </div>
      </div>

      {/* Tabela */}
      {carregando ? (
        <div style={{ padding: 40, textAlign: 'center', color: D.textMuted, fontSize: 13 }}>Carregando…</div>
      ) : itens.length === 0 ? (
        <EmptyState
          titulo={`Nenhum ${abaInfo.singular} cadastrado`}
          descricao={`Adicione o primeiro ${abaInfo.singular} usando o formulário acima.`}
        />
      ) : (
        <Tabela
          colunas={['Nome', 'SLA (min)', 'Ativo', 'Ações']}
          linhas={itens}
          renderLinha={(item, i) => {
            const emEdicao = editandoId === item.id;
            const ativo = item.ativo !== false;
            return (
              <tr key={item.id} style={{ background: i % 2 ? D.bg : '#fff' }}>
                <td style={tdStyle}>
                  {emEdicao ? (
                    <input style={{ ...sInput, padding: '4px 8px', fontSize: 12 }}
                      value={editNome} onChange={e => setEditNome(e.target.value)} />
                  ) : (
                    <span style={{ fontWeight: 500, color: D.text }}>{item.nome}</span>
                  )}
                </td>
                <td style={{ ...tdStyle, fontFamily: D.mono }}>
                  {emEdicao ? (
                    <input style={{ ...sInput, padding: '4px 8px', fontSize: 12, width: 80 }}
                      type="number" min="1"
                      value={editSla} onChange={e => setEditSla(e.target.value)} />
                  ) : (
                    item.slaMin ? `${item.slaMin} min` : <span style={{ color: D.textMuted }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <button onClick={() => toggleAtivo(item)} style={{
                    padding: '3px 9px', fontSize: 10.5, fontWeight: 700,
                    background: ativo ? D.greenSoft : '#f1f5f9',
                    color: ativo ? D.green : D.textMuted,
                    border: `1px solid ${ativo ? D.greenBorder : D.border}`,
                    borderRadius: 6, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase',
                  }}>
                    {ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td style={tdStyle}>
                  {emEdicao ? (
                    <>
                      <button onClick={() => salvarEdicao(item.id)} style={btnAcao(D.green)}>Salvar</button>
                      <button onClick={() => setEditandoId(null)} style={btnAcao(D.textMuted)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => iniciarEdicao(item)} style={btnAcao(D.blue)}>Editar</button>
                      <button onClick={() => excluir(item.id)} style={btnAcao(D.red)}>Excluir</button>
                    </>
                  )}
                </td>
              </tr>
            );
          }}
        />
      )}
    </PageContainer>
  );
}

function btnAcao(cor) {
  return {
    padding: '4px 10px', fontSize: 11, fontWeight: 600,
    background: 'transparent', color: cor, border: `1px solid ${cor}33`,
    borderRadius: 6, cursor: 'pointer', marginRight: 6, fontFamily: D.font,
  };
}
