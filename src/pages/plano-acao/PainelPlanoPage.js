/**
 * Painel de Planos de Ação
 *
 * Lista todos os planos cronologicamente (mais recente em cima).
 * Cada card mostra: tipo, data da contagem, status agregado, % concluído.
 * Expande para mostrar as ações e marcar status (concluída / ineficaz / pendente).
 *
 * Suporta:
 *   - Filtro por status do plano
 *   - Excluir um plano inteiro (supervisor)
 *   - Atualizar status de cada ação inline
 *   - Observação por ação
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  getDocs, updateDoc, deleteDoc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useUser } from '../../context/UserContext';
import { NIVEIS_SUPERVISOR } from '../admin/ConfigurarEmpresaPage';
import {
  D, PageContainer, PageHeader, EmptyState,
  FilterBar, FilterField, sInput,
} from '../../design';
import {
  calcularStatusPlano, fmtDataHora,
} from '../../modules/plano-acao/planoAcaoHelpers';

export default function PainelPlanoPage() {
  const { col, docRef } = useDb();
  const { usuario } = useUser();
  const isSupervisor = NIVEIS_SUPERVISOR.includes(usuario?.nivel);
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');

  const [planos, setPlanos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expandido, setExpandido] = useState(focusId || null);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [salvandoAcao, setSalvandoAcao] = useState(null); // id da ação sendo atualizada
  const [obsTemp, setObsTemp]   = useState({});

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      let snap;
      try {
        snap = await getDocs(query(col('planos_acao'), orderBy('criadoEm', 'desc')));
      } catch {
        snap = await getDocs(col('planos_acao'));
      }
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.criadoEm?.toDate?.()?.getTime() || 0;
          const tb = b.criadoEm?.toDate?.()?.getTime() || 0;
          return tb - ta;
        });
      setPlanos(lista);
    } finally {
      setLoading(false);
    }
  }

  const planosFiltrados = useMemo(() => {
    if (filtroStatus === 'todos') return planos;
    return planos.filter(p => p.statusPlano === filtroStatus);
  }, [planos, filtroStatus]);

  async function atualizarAcao(plano, acaoIdx, novoStatus, observacao) {
    setSalvandoAcao(`${plano.id}_${acaoIdx}`);
    try {
      const novasAcoes = plano.acoes.map((a, i) => {
        if (i !== acaoIdx) return a;
        return {
          ...a,
          status: novoStatus,
          observacao: observacao != null ? observacao : a.observacao,
          executadoEm: novoStatus !== 'pendente' ? new Date() : null,
          executadoPor: novoStatus !== 'pendente' ? { uid: usuario?.uid || null, nome: usuario?.nome || '' } : null,
        };
      });
      const stats = calcularStatusPlano(novasAcoes);
      await updateDoc(docRef('planos_acao', plano.id), {
        acoes: novasAcoes,
        statusPlano: stats.status,
        totalConcluidas: stats.concluidas,
        totalIneficazes: stats.ineficazes,
        totalPendentes: stats.pendentes,
        atualizadoEm: serverTimestamp(),
      });
      // Atualiza local
      setPlanos(prev => prev.map(p => p.id === plano.id
        ? { ...p, acoes: novasAcoes, statusPlano: stats.status,
            totalConcluidas: stats.concluidas, totalIneficazes: stats.ineficazes, totalPendentes: stats.pendentes }
        : p));
    } catch (e) {
      alert('Erro ao atualizar: ' + e.message);
    } finally {
      setSalvandoAcao(null);
    }
  }

  async function excluirPlano(plano) {
    if (!isSupervisor) return;
    if (!window.confirm(`Excluir o plano da contagem de ${plano.dataContagemStr}? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteDoc(docRef('planos_acao', plano.id));
      setPlanos(prev => prev.filter(p => p.id !== plano.id));
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }

  return (
    <PageContainer maxWidth={1300}>
      <PageHeader
        kicker="Plano de Ação"
        titulo="Painel de Planos"
        sub="Acompanhe e conclua as ações geradas a partir das contagens."
        acoes={
          <Link to="/plano-acao/novo" style={{
            padding: '10px 20px', background: D.red, color: '#fff',
            borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 13,
          }}>
            + Novo Plano
          </Link>
        }
      />

      <FilterBar>
        <FilterField label="Status">
          <select style={sInput} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="aberto">Em andamento</option>
            <option value="concluido">Concluídos</option>
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: D.textMuted }}>Carregando...</div>
      ) : planos.length === 0 ? (
        <EmptyState
          titulo="Nenhum plano criado ainda"
          descricao="Clique em '+ Novo Plano' para gerar a partir de uma contagem com não-aderências."
        />
      ) : planosFiltrados.length === 0 ? (
        <EmptyState titulo="Nenhum plano com esse filtro" descricao="Mude o status acima para ver outros planos." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {planosFiltrados.map(plano => (
            <PlanoCard
              key={plano.id}
              plano={plano}
              expandido={expandido === plano.id}
              onToggleExpand={() => setExpandido(expandido === plano.id ? null : plano.id)}
              onChangeAcao={(idx, status, obs) => atualizarAcao(plano, idx, status, obs)}
              onExcluir={() => excluirPlano(plano)}
              isSupervisor={isSupervisor}
              salvandoAcao={salvandoAcao}
              obsTemp={obsTemp}
              setObsTemp={setObsTemp}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function PlanoCard({ plano, expandido, onToggleExpand, onChangeAcao, onExcluir, isSupervisor, salvandoAcao, obsTemp, setObsTemp }) {
  const stats = calcularStatusPlano(plano.acoes || []);
  const tipoLabel = plano.tipo === 'aderencia-abc' ? 'Aderência à Curva ABC' : plano.tipo;
  const concluido = stats.status === 'concluido';

  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `4px solid ${concluido ? D.green : D.amber}`,
      borderRadius: D.radius, boxShadow: D.shadow, overflow: 'hidden',
    }}>
      {/* Header clicável */}
      <div
        onClick={onToggleExpand}
        style={{
          padding: '16px 20px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, color: D.textMuted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {tipoLabel} · Contagem {plano.dataContagemStr}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: D.text, marginTop: 4 }}>
            {stats.total} ação(ões){' '}
            <span style={{ fontSize: 13, fontWeight: 600, color: D.textSec }}>
              · criado em {fmtDataHora(plano.criadoEm)}
            </span>
          </div>
          {plano.criadoPor?.nome && (
            <div style={{ fontSize: 11, color: D.textMuted, marginTop: 2 }}>
              por {plano.criadoPor.nome}
            </div>
          )}
        </div>

        {/* Mini KPIs de status */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <MiniBadge label="Concluídas"  valor={stats.concluidas} cor={D.green} />
          <MiniBadge label="Ineficazes"  valor={stats.ineficazes} cor={D.red} />
          <MiniBadge label="Pendentes"   valor={stats.pendentes}  cor={D.amber} />
          <div style={{
            padding: '6px 12px', borderRadius: 8, fontFamily: D.mono, fontWeight: 800,
            background: concluido ? D.greenSoft : D.amberSoft,
            color: concluido ? D.green : D.amber,
            fontSize: 14, minWidth: 60, textAlign: 'center',
          }}>
            {stats.percConcluidas}%
          </div>
          <span style={{ fontSize: 18, color: D.textMuted, marginLeft: 4 }}>
            {expandido ? '▴' : '▾'}
          </span>
        </div>
      </div>

      {/* Conteúdo expandido */}
      {expandido && (
        <div style={{ borderTop: `1px solid ${D.borderLight}` }}>
          {(plano.acoes || []).map((acao, idx) => (
            <AcaoLinha
              key={acao.id || idx}
              acao={acao}
              idx={idx}
              planoId={plano.id}
              onChange={(status, obs) => onChangeAcao(idx, status, obs)}
              salvando={salvandoAcao === `${plano.id}_${idx}`}
              obsTemp={obsTemp}
              setObsTemp={setObsTemp}
            />
          ))}
          {isSupervisor && (
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${D.borderLight}`, textAlign: 'right' }}>
              <button
                onClick={onExcluir}
                style={{
                  padding: '7px 14px', background: 'transparent', color: D.red,
                  border: `1px solid ${D.redBorder}`, borderRadius: 6,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >🗑️ Excluir plano inteiro</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AcaoLinha({ acao, idx, planoId, onChange, salvando, obsTemp, setObsTemp }) {
  const cor = acao.status === 'concluida' ? D.green
            : acao.status === 'ineficaz' ? D.red
            : D.amber;
  const bgRow = acao.status === 'concluida' ? D.greenSoft
              : acao.status === 'ineficaz' ? D.redSoft
              : '#fff';
  const obsKey = `${planoId}_${idx}`;
  const obsValor = obsTemp[obsKey] !== undefined ? obsTemp[obsKey] : (acao.observacao || '');

  // Detecta formato:
  //  - novo (consolidado): tem array `itens` com todos os produtos
  //  - antigo (por produto): tem campos diretos (produtoCodigo, ruaAtual...)
  const ehConsolidada = Array.isArray(acao.itens);

  return (
    <div style={{
      padding: '14px 20px', borderBottom: `1px solid ${D.borderLight}`,
      backgroundColor: bgRow, opacity: salvando ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          minWidth: 26, height: 26, borderRadius: 13,
          background: cor, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, fontFamily: D.mono,
        }}>{idx + 1}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: D.text, lineHeight: 1.55, marginBottom: 8, fontWeight: 600 }}>
            {acao.texto}
          </div>

          {ehConsolidada ? (
            <ListaItensConsolidados itens={acao.itens} />
          ) : (
            /* Retrocompatibilidade: planos antigos (1 ação por produto) */
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: D.textMuted, flexWrap: 'wrap' }}>
              <span><strong style={{ color: D.textSec }}>Cód:</strong> <span style={{ fontFamily: D.mono }}>{acao.produtoCodigo}</span></span>
              <span>•</span>
              <span><strong style={{ color: D.textSec }}>Rua:</strong> <span style={{ fontFamily: D.mono }}>{acao.ruaAtual}</span></span>
              <span>•</span>
              <span><strong style={{ color: D.textSec }}>C.End:</strong> {acao.curvaEnderecoAtual}</span>
              <span>→</span>
              <span><strong style={{ color: D.textSec }}>C.Prod:</strong> {acao.curvaProduto}</span>
            </div>
          )}

          {acao.executadoEm && (
            <div style={{ fontSize: 11, color: cor, marginTop: 8 }}>
              {acao.status === 'concluida' ? '✓ Concluída' : '✗ Ineficaz'} em {fmtDataHora(acao.executadoEm)}
              {acao.executadoPor?.nome ? ` por ${acao.executadoPor.nome}` : ''}
            </div>
          )}

          {/* Botões de status + observação */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <BtnStatus
              ativo={acao.status === 'concluida'}
              cor={D.green}
              label="✓ Concluída"
              onClick={() => onChange('concluida', obsValor)}
            />
            <BtnStatus
              ativo={acao.status === 'ineficaz'}
              cor={D.red}
              label="✗ Ineficaz"
              onClick={() => onChange('ineficaz', obsValor)}
            />
            <BtnStatus
              ativo={acao.status === 'pendente'}
              cor={D.amber}
              label="⋯ Pendente"
              onClick={() => onChange('pendente', obsValor)}
            />

            <input
              type="text"
              placeholder="Observação (opcional)..."
              value={obsValor}
              onChange={(e) => setObsTemp({ ...obsTemp, [obsKey]: e.target.value })}
              onBlur={(e) => {
                if (e.target.value !== (acao.observacao || '')) {
                  onChange(acao.status, e.target.value);
                }
              }}
              style={{
                ...sInput, flex: '1 1 240px', minWidth: 200, fontSize: 12,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniBadge({ label, valor, cor }) {
  if (valor === 0) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 8px', borderRadius: 6, background: cor + '14',
      fontSize: 11, fontFamily: D.mono, color: cor, fontWeight: 700,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600 }}>{label}:</span>
      <span style={{ fontSize: 12, fontWeight: 800 }}>{valor}</span>
    </div>
  );
}

function ListaItensConsolidados({ itens }) {
  const [expandido, setExpandido] = useState(false);
  const mostrarLimite = 5;
  const mostrar = expandido ? itens : itens.slice(0, mostrarLimite);
  const restante = itens.length - mostrar.length;

  return (
    <div style={{
      background: '#fff', border: `1px solid ${D.borderLight}`,
      borderRadius: 8, overflow: 'hidden', marginTop: 4,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: D.font }}>
        <thead>
          <tr style={{ background: D.bg }}>
            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: D.textMuted, fontSize: 10, letterSpacing: 0.5 }}>CÓDIGO</th>
            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: D.textMuted, fontSize: 10, letterSpacing: 0.5 }}>DESCRIÇÃO</th>
            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: D.textMuted, fontSize: 10, letterSpacing: 0.5 }}>RUA ATUAL</th>
            <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: D.textMuted, fontSize: 10, letterSpacing: 0.5 }}>DE</th>
            <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: D.textMuted, fontSize: 10, letterSpacing: 0.5 }}>PARA</th>
          </tr>
        </thead>
        <tbody>
          {mostrar.map((it, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${D.borderLight}` }}>
              <td style={{ padding: '6px 10px', fontFamily: D.mono, fontWeight: 700, color: D.text }}>{it.produtoCodigo}</td>
              <td style={{ padding: '6px 10px', color: D.textSec, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.produtoNome}>
                {it.produtoNome || <span style={{ color: D.textMuted }}>—</span>}
              </td>
              <td style={{ padding: '6px 10px', fontFamily: D.mono, color: D.textSec }}>{it.ruaAtual}</td>
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                <MiniCurva curva={it.curvaEnderecoAtual} />
              </td>
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                <MiniCurva curva={it.curvaProduto} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length > mostrarLimite && (
        <button
          onClick={() => setExpandido(!expandido)}
          style={{
            width: '100%', padding: '8px', background: D.bg, border: 'none',
            borderTop: `1px solid ${D.borderLight}`,
            fontSize: 11, color: D.red, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {expandido ? '▲ Mostrar menos' : `▼ Ver mais ${restante} produto(s)`}
        </button>
      )}
    </div>
  );
}

function MiniCurva({ curva }) {
  if (!curva) return <span style={{ color: D.textMuted, fontSize: 11 }}>—</span>;
  const cor = curva === 'A' ? D.green : curva === 'B' ? D.amber : D.red;
  const bg  = curva === 'A' ? D.greenSoft : curva === 'B' ? D.amberSoft : D.redSoft;
  return (
    <span style={{
      display: 'inline-block', minWidth: 22,
      padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      backgroundColor: bg, color: cor,
    }}>{curva}</span>
  );
}

function BtnStatus({ ativo, cor, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
        background: ativo ? cor : 'transparent',
        color: ativo ? '#fff' : cor,
        border: `1px solid ${cor}${ativo ? '' : '60'}`,
        cursor: 'pointer',
      }}
    >{label}</button>
  );
}
