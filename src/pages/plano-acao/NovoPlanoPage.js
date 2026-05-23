/**
 * Novo Plano de Ação — Aderência à Curva ABC
 *
 * Fluxo:
 *   1. Usuário escolhe uma DATA de contagem do dropdown
 *   2. Preview: as ações geradas (1+ por curva destino, respeitando 250 chars)
 *   3. Botão "Gerar Plano" cria o doc em planos_acao com todas as ações
 *
 * O texto de cada ação consolida códigos + ruas onde foram contados + faixa
 * de ruas da curva destino (ex: "C01 a C13"). Se passar de 250 chars,
 * quebra em ações sequenciais cobrindo todos os produtos.
 *
 * Depois disso o usuário é redirecionado pro Painel.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocs, addDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useUser } from '../../context/UserContext';
import {
  D, PageContainer, PageHeader, EmptyState,
  FilterBar, FilterField, sInput, tdStyle,
} from '../../design';
import {
  gerarAcoesDaContagem, isPNC, curvaEfetiva,
  calcularStatusPlano, fmtData,
} from '../../modules/plano-acao/planoAcaoHelpers';
import { monthKey } from '../../modules/gerenciamento-estoque/shared/curvaLookup';
import { filtrarLogsAtivos } from '../../modules/gerenciamento-estoque/shared/inventoryLogsFilter';
import { useCatalogos } from '../../context/CatalogosContext';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

export default function NovoPlanoPage() {
  const { col, stamp } = useDb();
  const { usuario } = useUser();
  const navigate = useNavigate();

  // produtosMap e locations_mensal vêm do Context (cache em memória)
  const { produtosMap, obterLocationsMensal } = useCatalogos();
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [dataSel, setDataSel]         = useState('');
  const [salvando, setSalvando]       = useState(false);
  const [aviso, setAviso]             = useState('');
  // docs brutos de locations_mensal do mês selecionado — usado pra calcular
  // ruas vazias por (curva, área).
  const [locationsMensalDoMes, setLocationsMensalDoMes] = useState([]);
  const [loadingRuas, setLoadingRuas] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      // produtosMap já vem do Context, só fetcha inventory_logs aqui
      const snapLogs = await getDocs(col('inventory_logs'));
      // Soft delete: linhas com `excluido: true` são ignoradas em planos novos.
      setLogs(filtrarLogsAtivos(snapLogs.docs.map(d => ({ id: d.id, ...d.data() }))));
    } finally {
      setLoading(false);
    }
  }

  // Datas únicas de contagem (yyyy-mm-dd)
  const datasContagem = useMemo(() => {
    const set = new Set();
    logs.forEach(l => {
      const d = tsToDate(l.timestamp);
      if (d) set.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [logs]);

  // Logs da contagem selecionada (ignorando PNC, considerando só os que têm curva no endereço)
  const logsDaData = useMemo(() => {
    if (!dataSel) return [];
    return logs.filter(l => {
      const d = tsToDate(l.timestamp);
      if (!d) return false;
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return k === dataSel;
    });
  }, [logs, dataSel]);

  // Carrega locations_mensal do mês da contagem selecionada.
  // IMPORTANTE: NÃO incluir `col` nas dependências — `col` é uma função recriada
  // a cada render pelo `useDb()`, então incluí-la causa loop infinito de fetch
  // (re-render → novo `col` → useEffect dispara → re-render → ...).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dataSel) {
      setLocationsMensalDoMes([]);
      return;
    }
    const [y, m] = dataSel.split('-');
    const chave = monthKey(parseInt(y, 10), parseInt(m, 10));
    let cancelado = false;
    (async () => {
      setLoadingRuas(true);
      try {
        // Usa cache do CatalogosContext — 1 fetch por chaveMes, depois grátis
        const docs = await obterLocationsMensal(chave);
        if (!cancelado) setLocationsMensalDoMes(docs);
      } catch (e) {
        console.error('Falha ao carregar locations_mensal:', e);
        if (!cancelado) setLocationsMensalDoMes([]);
      } finally {
        if (!cancelado) setLoadingRuas(false);
      }
    })();
    return () => { cancelado = true; };
  }, [dataSel]);

  // Resumo
  const resumo = useMemo(() => {
    let total = 0, naoAderentes = 0, pnc = 0, indet = 0, aderentes = 0;
    logsDaData.forEach(l => {
      total++;
      if (isPNC(l)) { pnc++; return; }
      const curvaProd = curvaEfetiva(l);
      const curvaEnd  = l.enderecoCurva;
      if (!curvaEnd) { indet++; return; }
      if (curvaProd === curvaEnd) aderentes++;
      else naoAderentes++;
    });
    return { total, naoAderentes, aderentes, pnc, indet };
  }, [logsDaData]);

  const acoesPrevistas = useMemo(
    () => dataSel ? gerarAcoesDaContagem(logsDaData, produtosMap, locationsMensalDoMes) : [],
    [dataSel, logsDaData, produtosMap, locationsMensalDoMes]
  );

  const totalItensPrevistos = useMemo(
    () => acoesPrevistas.reduce((acc, a) => acc + a.totalItens, 0),
    [acoesPrevistas]
  );

  async function gerarPlano() {
    if (acoesPrevistas.length === 0) {
      setAviso('Nenhuma não-aderência encontrada nesta contagem.');
      return;
    }
    setSalvando(true);
    setAviso('');
    try {
      const status = calcularStatusPlano(acoesPrevistas);
      const [y, m, d] = dataSel.split('-');
      const dataContagemDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));

      const docRef = await addDoc(col('planos_acao'), {
        tipo: 'aderencia-abc',
        dataContagem: dataContagemDate,
        dataContagemStr: fmtData(dataContagemDate),
        criadoEm: serverTimestamp(),
        criadoPor: { uid: usuario?.uid || null, nome: usuario?.nome || '' },
        statusPlano: status.status,
        totalAcoes: status.total,
        totalConcluidas: status.concluidas,
        totalIneficazes: status.ineficazes,
        totalPendentes: status.pendentes,
        acoes: acoesPrevistas,
        ...stamp(),
      });

      navigate(`/plano-acao/painel?focus=${docRef.id}`);
    } catch (e) {
      setAviso('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <PageContainer maxWidth={1100}>
      <PageHeader
        kicker="Plano de Ação"
        titulo="Novo Plano — Aderência à Curva ABC"
        sub="Gera ações de movimentação para os produtos não-aderentes de uma contagem específica."
      />

      <FilterBar>
        <FilterField label="Data da Contagem">
          <select style={{ ...sInput, minWidth: 200 }} value={dataSel} onChange={e => setDataSel(e.target.value)}>
            <option value="">-- Selecione --</option>
            {datasContagem.map(d => {
              const [y, m, dia] = d.split('-');
              return <option key={d} value={d}>{`${dia}/${m}/${y}`}</option>;
            })}
          </select>
        </FilterField>
      </FilterBar>

      {aviso && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, borderRadius: 8,
          backgroundColor: D.amberSoft, border: `1px solid ${D.amberBorder}`,
          color: D.amber, fontSize: 13,
        }}>⚠️ {aviso}</div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: D.textMuted }}>Carregando contagens...</div>
      ) : logs.length === 0 ? (
        <EmptyState titulo="Nenhuma contagem registrada" descricao="Registre contagens em Estoque → Registrar Contagem antes de gerar um plano." />
      ) : !dataSel ? (
        <div style={{
          padding: 40, textAlign: 'center', color: D.textMuted,
          background: D.surface, border: `1px solid ${D.border}`, borderRadius: 12,
        }}>
          👆 Selecione uma data de contagem acima para ver o preview do plano.
        </div>
      ) : loadingRuas ? (
        <div style={{ padding: 60, textAlign: 'center', color: D.textMuted }}>
          Carregando layout do mês...
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <CardKpi label="Total contado"     valor={resumo.total}        cor={D.text} />
            <CardKpi label="✅ Aderentes"      valor={resumo.aderentes}     cor={D.green} />
            <CardKpi label="❌ Não Aderentes" valor={resumo.naoAderentes} cor={D.red} />
            <CardKpi label="⚠️ PNC/Indet."     valor={resumo.pnc + resumo.indet} cor={D.amber} sub="ignorados no plano" />
          </div>

          {/* Aviso se não temos layout do mês */}
          {locationsMensalDoMes.length === 0 && (
            <div style={{
              padding: '10px 14px', marginBottom: 14, borderRadius: 8,
              backgroundColor: D.amberSoft, border: `1px solid ${D.amberBorder}`,
              color: D.amber, fontSize: 13,
            }}>
              ⚠️ Nenhum layout encontrado em <code>locations_mensal</code> para esse mês. As recomendações de ruas destino não vão aparecer. Importe o layout do mês em <strong>Estoque → Importar Layout</strong>.
            </div>
          )}

          {/* Preview do plano */}
          {acoesPrevistas.length === 0 ? (
            <div style={{
              padding: 40, textAlign: 'center', background: D.greenSoft,
              border: `1px solid ${D.greenBorder}`, borderRadius: 12, color: D.green,
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
              <strong>100% aderente!</strong> Nenhuma ação necessária para essa contagem.
            </div>
          ) : (
            <>
              <div style={{
                padding: '14px 18px', marginBottom: 14, borderRadius: 8,
                background: D.surface, border: `1px solid ${D.border}`, boxShadow: D.shadow,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: D.textMuted, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                      Preview do plano
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: D.text, marginTop: 4 }}>
                      {acoesPrevistas.length} ação(ões) · {totalItensPrevistos} produto(s) a movimentar
                    </div>
                    <div style={{ fontSize: 11, color: D.textMuted, marginTop: 4 }}>
                      Limite de 250 caracteres por ação — quebra automática quando necessário.
                    </div>
                  </div>
                  <button
                    onClick={gerarPlano}
                    disabled={salvando}
                    style={{
                      padding: '12px 24px', background: D.red, color: '#fff',
                      border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14,
                      cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1,
                    }}
                  >
                    {salvando ? '⏳ Gerando...' : '✓ Gerar Plano de Ação'}
                  </button>
                </div>
              </div>

              {/* Lista de ações */}
              {acoesPrevistas.map((acao, idx) => (
                <AcaoPreviewCard key={acao.id} acao={acao} idx={idx} />
              ))}
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}

function AcaoPreviewCard({ acao, idx }) {
  const areaLabel = acao.areaDestino === 'P' ? 'Picking' : 'Estoque';
  const codigosUnicos = new Set(acao.itens.map(i => i.produtoCodigo)).size;
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `4px solid ${D.red}`, borderRadius: D.radius,
      padding: '18px 22px', marginBottom: 14, boxShadow: D.shadow,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap', marginBottom: 8,
      }}>
        <div style={{ fontSize: 11, color: D.textMuted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Ação #{idx + 1} · destino: {areaLabel} curva {acao.curvaDestino} · {codigosUnicos} código(s){codigosUnicos !== acao.totalItens ? ` em ${acao.totalItens} ocorrência(s)` : ''}
          {acao.totalRuasDisponiveis != null && ` · ${acao.totalRuasDisponiveis} rua(s) destino`}
        </div>
        <div style={{
          fontSize: 11, fontFamily: D.mono, fontWeight: 700,
          color: acao.texto.length > 250 ? D.red : D.textSec,
          background: D.bg, padding: '3px 8px', borderRadius: 4,
        }}>
          {acao.texto.length} / 250 chars
        </div>
      </div>

      <div style={{ fontSize: 14, color: D.text, lineHeight: 1.5, fontWeight: 600, marginBottom: 12 }}>
        {acao.texto}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Código</th>
              <th style={th}>Descrição</th>
              <th style={th}>Rua atual</th>
              <th style={th}>C.End</th>
              <th style={th}>C.Prod</th>
            </tr>
          </thead>
          <tbody>
            {acao.itens.map((it, i) => (
              <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700, color: D.textMuted }}>{i + 1}</td>
                <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{it.produtoCodigo}</td>
                <td style={{ ...tdStyle, fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.produtoNome}>
                  {it.produtoNome || <span style={{ color: D.textMuted }}>—</span>}
                </td>
                <td style={{ ...tdStyle, fontFamily: D.mono }}>{it.ruaAtual}</td>
                <td style={tdStyle}>
                  <CurvaBadge curva={it.curvaEnderecoAtual} />
                </td>
                <td style={tdStyle}>
                  <CurvaBadge curva={it.curvaProduto} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardKpi({ label, valor, cor, sub }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `3px solid ${cor}`, borderRadius: D.radius,
      padding: '14px 16px', boxShadow: D.shadow,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor, fontFamily: D.mono, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: D.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CurvaBadge({ curva }) {
  if (!curva) return <span style={{ color: D.textMuted }}>—</span>;
  const cor = curva === 'A' ? D.green : curva === 'B' ? D.amber : D.red;
  const bg  = curva === 'A' ? D.greenSoft : curva === 'B' ? D.amberSoft : D.redSoft;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      backgroundColor: bg, color: cor,
    }}>{curva}</span>
  );
}

const th = {
  background: '#0f172a', color: '#fff', padding: '8px 10px',
  textAlign: 'left', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
  position: 'sticky', top: 0,
};
