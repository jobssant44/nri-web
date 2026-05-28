import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useDb } from '../../utils/db';

// ─── Constantes ───────────────────────────────────────────────────────────────

// EFC tem 2 metas separadas por tipo de frota:
//   - "EFC FF"   → Frotas Padronizadas (frota própria/contrato fixo)
//   - "EFC Spot" → demais frotas (avulsas/terceirizadas)
// Migração de dados antigos: chave "EFC" no Firestore é lida como "EFC FF" automaticamente.
const INDICADORES = ['EFC FF', 'EFC Spot', 'EFD', 'TI', 'PC Física', 'PC Financeira'];

const HORARIOS = (() => {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return opts;
})();

const PADRAO_HORARIO = Object.fromEntries(INDICADORES.map(k => [k, '00:00']));
const PADRAO_PERCENT = Object.fromEntries(INDICADORES.map(k => [k, 80]));

// ─── Componente de meta de horário ────────────────────────────────────────────

function MetaHorario({ label, valor, onChange }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div style={{ marginBottom: 16, position: 'relative' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </div>
      <button
        onClick={() => setAberto(p => !p)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '9px 14px',
          backgroundColor: '#fff',
          border: aberto ? '1.5px solid #1D5A9E' : '1.5px solid #d1d5db',
          borderRadius: 7,
          cursor: 'pointer',
          fontSize: 15,
          fontWeight: 700,
          color: '#1a1a2e',
          fontFamily: 'inherit',
          letterSpacing: 1,
          transition: 'border-color 0.15s',
        }}
      >
        <span>🕐 {valor}</span>
        <span style={{
          fontSize: 9,
          color: '#9ca3af',
          transition: 'transform 0.18s',
          transform: aberto ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>▼</span>
      </button>

      {aberto && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          border: '1.5px solid #1D5A9E',
          borderRadius: 7,
          zIndex: 50,
          maxHeight: 220,
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          scrollbarWidth: 'thin',
        }}>
          {HORARIOS.map(h => (
            <div
              key={h}
              onClick={() => { onChange(h); setAberto(false); }}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: h === valor ? 700 : 400,
                color: h === valor ? '#1D5A9E' : '#374151',
                backgroundColor: h === valor ? '#eff6ff' : 'transparent',
                cursor: 'pointer',
                letterSpacing: 0.8,
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={e => { if (h !== valor) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
              onMouseLeave={e => { if (h !== valor) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente de meta de porcentagem ────────────────────────────────────────

function MetaPercent({ label, valor, onChange }) {
  const cor = valor >= 80 ? '#16a34a' : valor >= 60 ? '#d97706' : '#dc2626';

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563', letterSpacing: 0.3 }}>{label}</span>
        <span style={{
          fontSize: 15,
          fontWeight: 700,
          color: cor,
          minWidth: 44,
          textAlign: 'right',
          letterSpacing: 0.5,
        }}>
          {valor}%
        </span>
      </div>

      {/* Barra de fundo */}
      <div style={{ position: 'relative', height: 8, borderRadius: 99 }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 99,
          backgroundColor: '#e5e7eb',
        }} />
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${valor}%`,
          borderRadius: 99,
          backgroundColor: cor,
          transition: 'width 0.1s, background-color 0.2s',
          pointerEvents: 'none',
        }} />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={valor}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            opacity: 0,
            cursor: 'pointer',
            height: '100%',
            margin: 0,
          }}
        />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 4,
        fontSize: 10,
        color: '#9ca3af',
      }}>
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MetasMPD() {
  const navigate = useNavigate();
  const { docRef, rid } = useDb();
  const docId = rid || 'global';
  const [horarios, setHorarios] = useState(PADRAO_HORARIO);
  const [percents, setPercents] = useState(PADRAO_PERCENT);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null); // { tipo: 'ok'|'erro', msg }
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    setHorarios(PADRAO_HORARIO);
    setPercents(PADRAO_PERCENT);
    async function carregar() {
      try {
        const snap = await getDoc(docRef('metas_mpd', docId));
        if (snap.exists()) {
          const d = snap.data();
          // Back-compat: chave antiga "EFC" vira "EFC FF" automaticamente.
          // Se já existir "EFC FF" salvo, preserva (não sobrescreve).
          if (d.horarios) {
            const h = { ...PADRAO_HORARIO, ...d.horarios };
            if (d.horarios['EFC'] && !d.horarios['EFC FF']) h['EFC FF'] = d.horarios['EFC'];
            delete h['EFC'];
            setHorarios(h);
          }
          if (d.percents) {
            const p = { ...PADRAO_PERCENT, ...d.percents };
            if (d.percents['EFC'] != null && d.percents['EFC FF'] == null) p['EFC FF'] = d.percents['EFC'];
            delete p['EFC'];
            setPercents(p);
          }
        }
      } catch {
        // sem metas salvas, usa padrão
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSalvar() {
    setSalvando(true);
    setFeedback(null);
    try {
      await setDoc(docRef('metas_mpd', docId), {
        horarios,
        percents,
        atualizadoEm: new Date().toISOString(),
      });
      setFeedback({ tipo: 'ok', msg: 'Metas salvas com sucesso.' });
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: `Erro ao salvar: ${err.message}` });
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: '#6b7280', fontSize: 14 }}>
        ⏳ Carregando metas...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <button
            onClick={() => navigate('/gestao-mpd/importar')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: '#6b7280',
              padding: '0 0 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#1a1a2e'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
          >
            ← Voltar para Importar Relatórios
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 }}>
            Metas MDP
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Defina as metas de horário e de porcentagem para os indicadores.
          </p>
        </div>
        <button
          onClick={handleSalvar}
          disabled={salvando}
          style={{
            padding: '10px 24px',
            backgroundColor: salvando ? '#9ca3af' : '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 700,
            cursor: salvando ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            letterSpacing: 0.3,
            flexShrink: 0,
            transition: 'background-color 0.15s',
          }}
        >
          {salvando ? '⏳ Salvando...' : '💾 Salvar Metas'}
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 7,
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 20,
          ...(feedback.tipo === 'ok'
            ? { backgroundColor: '#dcfce7', color: '#166534', borderLeft: '4px solid #22c55e' }
            : { backgroundColor: '#fee2e2', color: '#991b1b', borderLeft: '4px solid #ef4444' }),
        }}>
          {feedback.tipo === 'ok' ? '✅' : '❌'} {feedback.msg}
        </div>
      )}

      {/* Dois painéis lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* ── Painel Horário ── */}
        <div style={s.painel}>
          <div style={s.painelHeader}>
            <span style={s.painelIcone}>🕐</span>
            <div>
              <div style={s.painelTitulo}>Metas Tempo / Horário</div>
              <div style={s.painelSub}>Clique no indicador para selecionar o horário limite</div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            {INDICADORES.map(ind => (
              <MetaHorario
                key={ind}
                label={ind}
                valor={horarios[ind]}
                onChange={val => setHorarios(prev => ({ ...prev, [ind]: val }))}
              />
            ))}
          </div>
        </div>

        {/* ── Painel Porcentagem ── */}
        <div style={s.painel}>
          <div style={s.painelHeader}>
            <span style={s.painelIcone}>📊</span>
            <div>
              <div style={s.painelTitulo}>Metas %</div>
              <div style={s.painelSub}>Arraste a barra para definir o percentual mínimo</div>
            </div>
          </div>

          {INDICADORES.map(ind => (
            <MetaPercent
              key={ind}
              label={ind}
              valor={percents[ind]}
              onChange={val => setPercents(prev => ({ ...prev, [ind]: val }))}
            />
          ))}
        </div>

      </div>

      {/* Resumo */}
      <div style={{ ...s.painel, marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 14 }}>
          Resumo das Metas Configuradas
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={s.th}>Indicador</th>
                <th style={s.th}>Meta Horário</th>
                <th style={s.th}>Meta %</th>
              </tr>
            </thead>
            <tbody>
              {INDICADORES.map((ind, i) => {
                const p = percents[ind];
                const cor = p >= 80 ? '#16a34a' : p >= 60 ? '#d97706' : '#dc2626';
                return (
                  <tr key={ind} style={i % 2 === 0 ? { backgroundColor: '#fff' } : { backgroundColor: '#f9fafb' }}>
                    <td style={s.td}><strong>{ind}</strong></td>
                    <td style={{ ...s.td, fontWeight: 700, letterSpacing: 1 }}>{horarios[ind]}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: cor }}>{p}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = {
  painel: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 24,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  painelHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: '1px solid #f0f0f0',
  },
  painelIcone: { fontSize: 24, lineHeight: 1 },
  painelTitulo: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 3,
  },
  painelSub: {
    fontSize: 12,
    color: '#9ca3af',
  },
  th: {
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '8px 14px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 12,
  },
  td: {
    padding: '9px 14px',
    color: '#374151',
    borderTop: '1px solid #f0f0f0',
  },
};
