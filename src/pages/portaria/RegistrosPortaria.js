import { useState, useEffect, useMemo } from 'react';
import { getDocs, query, orderBy, limit, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useUser } from '../../context/UserContext';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import { NIVEIS_SUPERVISOR } from '../admin/ConfigurarEmpresaPage';
import {
  D, PageContainer, PageHeader, EmptyState, BotaoNav, BotaoClear,
  FilterBar, FilterField, Tabela, sInput, tdStyle,
} from '../../design';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function fmtDataHora(d) {
  if (!d) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtData(d) {
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR');
}

function fmtDuracao(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

function paraISODate(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function RegistrosPortaria() {
  const { col, docRef } = useDb();
  const { usuario } = useUser();
  const isSupervisor = NIVEIS_SUPERVISOR.includes(usuario?.nivel);

  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [fTipo, setFTipo] = useSessionFilter('portaria:reg:tipo', 'todos');
  const [fStatus, setFStatus] = useSessionFilter('portaria:reg:status', 'todos');
  const [fDataIni, setFDataIni] = useSessionFilter('portaria:reg:di', '');
  const [fDataFim, setFDataFim] = useSessionFilter('portaria:reg:df', '');
  const [fBusca, setFBusca] = useSessionFilter('portaria:reg:q', '');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const snap = await getDocs(query(col('portaria_registros'), orderBy('entradaEm', 'desc'), limit(2000)));
      setRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      const snap = await getDocs(col('portaria_registros'));
      setRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    setCarregando(false);
  }

  const filtrados = useMemo(() => {
    const di = fDataIni ? new Date(fDataIni + 'T00:00:00') : null;
    const df = fDataFim ? new Date(fDataFim + 'T23:59:59') : null;
    const q = fBusca.trim().toLowerCase();
    return registros.filter(r => {
      if (fTipo !== 'todos' && r.tipo !== fTipo) return false;
      if (fStatus !== 'todos' && r.status !== fStatus) return false;
      const entrada = tsToDate(r.entradaEm);
      if (di && entrada && entrada < di) return false;
      if (df && entrada && entrada > df) return false;
      if (q) {
        const hay = [
          r.carretaPlaca, r.cavaloPlaca, r.placaVeiculo,
          r.motoristaNome, r.empresa, r.destinoNome, r.tipoAtendimentoNome,
          r.notaFiscal, r.observacao,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [registros, fTipo, fStatus, fDataIni, fDataFim, fBusca]);

  const totais = useMemo(() => {
    const finalizados = filtrados.filter(r => r.status === 'finalizado' && Number.isFinite(r.duracaoMin));
    const carretas = finalizados.filter(r => r.tipo === 'carreta_propria');
    const terceiros = finalizados.filter(r => r.tipo === 'terceiro');
    const avg = arr => arr.length ? Math.round(arr.reduce((s, r) => s + r.duracaoMin, 0) / arr.length) : null;
    return {
      total: filtrados.length,
      emAndamento: filtrados.filter(r => r.status === 'em_andamento').length,
      tmv: avg(carretas),
      tma: avg(terceiros),
      qtCarretas: carretas.length,
      qtTerceiros: terceiros.length,
    };
  }, [filtrados]);

  function limparFiltros() {
    setFTipo('todos'); setFStatus('todos'); setFDataIni(''); setFDataFim(''); setFBusca('');
  }

  async function excluir(id) {
    if (!isSupervisor) return;
    if (!window.confirm('Excluir este registro? Esta ação é permanente.')) return;
    await deleteDoc(docRef('portaria_registros', id));
    carregar();
  }

  async function reabrir(r) {
    if (!isSupervisor) return;
    if (!window.confirm('Reabrir este registro? Ele voltará para "em andamento" e perderá a hora de saída.')) return;
    await updateDoc(docRef('portaria_registros', r.id), {
      status: 'em_andamento', saidaEm: null, duracaoMin: null,
    });
    carregar();
  }

  function exportarCSV() {
    if (!filtrados.length) { alert('Nada para exportar.'); return; }
    const cabecalho = [
      'Tipo', 'Status', 'Entrada', 'Saída', 'Duração (min)', 'SLA (min)',
      'Carreta', 'Cavalo', 'Motorista', 'Destino',
      'Placa', 'Empresa', 'Tipo Atendimento', 'NF',
      'Observação', 'Registrado por',
    ];
    const linhas = filtrados.map(r => [
      r.tipo === 'carreta_propria' ? 'Carreta' : 'Terceiro',
      r.status || '',
      fmtDataHora(tsToDate(r.entradaEm)),
      fmtDataHora(tsToDate(r.saidaEm)),
      r.duracaoMin ?? '',
      r.slaMin ?? '',
      r.carretaPlaca || '', r.cavaloPlaca || '',
      r.motoristaNome || '',
      r.destinoNome || '',
      r.placaVeiculo || '', r.empresa || '',
      r.tipoAtendimentoNome || '', r.notaFiscal || '',
      (r.observacao || '').replace(/[\r\n]+/g, ' | '),
      r.registradoPor?.nome || '',
    ]);
    const csv = [cabecalho, ...linhas]
      .map(linha => linha.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portaria_${paraISODate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const colunas = [
    'Tipo', 'Status', 'Entrada', 'Saída', 'Duração',
    'Veículo / Carreta', 'Motorista', 'Destino / Tipo', 'Obs',
    'Ações',
  ];

  return (
    <PageContainer maxWidth={1280}>
      <PageHeader
        kicker="Portaria"
        titulo="Registros"
        sub={`${totais.total} registro(s) · ${totais.emAndamento} em andamento`}
        acoes={
          <>
            <BotaoNav onClick={() => window.location.assign('/portaria')}>Operação</BotaoNav>
            <BotaoNav onClick={() => window.location.assign('/portaria/dashboard')}>Dashboard</BotaoNav>
            <button onClick={exportarCSV} style={{
              padding: '8px 16px', background: D.surface, border: `1px solid ${D.border}`,
              borderRadius: 8, fontSize: 12, color: D.textSec, fontWeight: 500, cursor: 'pointer',
              fontFamily: D.font,
            }}>📤 CSV</button>
          </>
        }
      />

      <FilterBar>
        <FilterField label="Tipo">
          <select style={sInput} value={fTipo} onChange={e => setFTipo(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="carreta_propria">Carretas próprias</option>
            <option value="terceiro">Terceiros</option>
          </select>
        </FilterField>
        <FilterField label="Status">
          <select style={sInput} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="em_andamento">Em andamento</option>
            <option value="finalizado">Finalizado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </FilterField>
        <FilterField label="De">
          <input type="date" style={sInput} value={fDataIni} onChange={e => setFDataIni(e.target.value)} />
        </FilterField>
        <FilterField label="Até">
          <input type="date" style={sInput} value={fDataFim} onChange={e => setFDataFim(e.target.value)} />
        </FilterField>
        <FilterField label="Buscar (placa, empresa, motorista...)">
          <input style={{ ...sInput, minWidth: 240 }} value={fBusca} onChange={e => setFBusca(e.target.value)} placeholder="Digite para filtrar" />
        </FilterField>
        {(fTipo !== 'todos' || fStatus !== 'todos' || fDataIni || fDataFim || fBusca) && (
          <BotaoClear onClick={limparFiltros} />
        )}
      </FilterBar>

      {/* Resumo dos filtrados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MiniKPI label="TMV (carretas)" valor={fmtDuracao(totais.tmv)} sub={`${totais.qtCarretas} viagem(ns)`} cor={D.blue} />
        <MiniKPI label="TMA (terceiros)" valor={fmtDuracao(totais.tma)} sub={`${totais.qtTerceiros} atendimento(s)`} cor={D.red} />
        <MiniKPI label="Em andamento" valor={String(totais.emAndamento)} sub="ativos agora" cor={D.amber} />
        <MiniKPI label="Total filtrado" valor={String(totais.total)} sub="registros" cor={D.text} />
      </div>

      {carregando ? (
        <div style={{ padding: 40, textAlign: 'center', color: D.textMuted }}>Carregando…</div>
      ) : filtrados.length === 0 ? (
        registros.length === 0 ? (
          <EmptyState
            titulo="Nenhum registro de portaria"
            descricao="Comece registrando saídas de carreta ou entradas de terceiros no Painel de Operação."
          />
        ) : (
          <EmptyState titulo="Nenhum resultado" descricao="Ajuste os filtros acima para ver registros." />
        )
      ) : (
        <Tabela
          colunas={colunas}
          linhas={filtrados}
          renderLinha={(r, i) => {
            const isCarr = r.tipo === 'carreta_propria';
            const entrada = tsToDate(r.entradaEm);
            const saida = tsToDate(r.saidaEm);
            const atrasado = r.slaMin && r.duracaoMin && r.duracaoMin > r.slaMin;
            return (
              <tr key={r.id} style={{ background: i % 2 ? D.bg : '#fff' }}>
                <td style={tdStyle}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: isCarr ? D.blueSoft : D.redSoft,
                    color: isCarr ? D.blue : D.red,
                    letterSpacing: 0.5,
                  }}>
                    {isCarr ? 'CARRETA' : 'TERCEIRO'}
                  </span>
                </td>
                <td style={tdStyle}>
                  <StatusBadge status={r.status} />
                </td>
                <td style={{ ...tdStyle, fontFamily: D.mono, fontSize: 11.5 }}>{fmtDataHora(entrada)}</td>
                <td style={{ ...tdStyle, fontFamily: D.mono, fontSize: 11.5 }}>{fmtDataHora(saida)}</td>
                <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700, color: atrasado ? D.red : D.text }}>
                  {fmtDuracao(r.duracaoMin)}
                  {atrasado && <span title="Acima do SLA" style={{ marginLeft: 4 }}>⚠️</span>}
                </td>
                <td style={tdStyle}>
                  <div style={{ fontFamily: D.mono, fontWeight: 700, color: D.text }}>
                    {isCarr ? (r.carretaPlaca || '—') : (r.placaVeiculo || '—')}
                  </div>
                  <div style={{ fontSize: 10.5, color: D.textMuted }}>
                    {isCarr ? (r.cavaloPlaca ? `Cavalo ${r.cavaloPlaca}` : '') : (r.empresa || '')}
                  </div>
                </td>
                <td style={tdStyle}>{r.motoristaNome || '—'}</td>
                <td style={tdStyle}>{(isCarr ? r.destinoNome : r.tipoAtendimentoNome) || '—'}</td>
                <td style={{ ...tdStyle, fontSize: 11, maxWidth: 220, whiteSpace: 'normal', color: D.textMuted }}>
                  {r.observacao || ''}
                </td>
                <td style={tdStyle}>
                  {isSupervisor && (
                    <>
                      {r.status === 'finalizado' && (
                        <button onClick={() => reabrir(r)} style={btnIcone(D.amber)}>Reabrir</button>
                      )}
                      <button onClick={() => excluir(r.id)} style={btnIcone(D.red)}>Excluir</button>
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

function MiniKPI({ label, valor, sub, cor }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `3px solid ${cor}`, borderRadius: D.radius,
      padding: '14px 16px', boxShadow: D.shadow,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: D.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -0.5 }}>{valor}</div>
      <div style={{ fontSize: 10.5, color: D.textMuted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    em_andamento: { label: 'Em andamento', cor: D.amber, bg: D.amberSoft, border: D.amberBorder },
    finalizado:   { label: 'Finalizado',  cor: D.green, bg: D.greenSoft, border: D.greenBorder },
    cancelado:    { label: 'Cancelado',   cor: D.textMuted, bg: '#f1f5f9', border: D.border },
  };
  const v = map[status] || { label: status || '—', cor: D.textMuted, bg: '#f1f5f9', border: D.border };
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
      padding: '2px 8px', borderRadius: 6,
      background: v.bg, color: v.cor, border: `1px solid ${v.border}`,
    }}>{v.label}</span>
  );
}

function btnIcone(cor) {
  return {
    padding: '4px 10px', fontSize: 11, fontWeight: 600,
    background: 'transparent', color: cor, border: `1px solid ${cor}33`,
    borderRadius: 6, cursor: 'pointer', marginRight: 6, fontFamily: D.font,
  };
}

// (Reservado pra futuro — evitar warning de import não usado)
void Timestamp;
void fmtData;
