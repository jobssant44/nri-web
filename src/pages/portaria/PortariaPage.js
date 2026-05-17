import { useState, useEffect, useMemo } from 'react';
import {
  getDocs, addDoc, updateDoc, onSnapshot, query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { useUser } from '../../context/UserContext';
import {
  D, PageContainer, PageHeader, BotaoNav,
  sInput, sLabel,
} from '../../design';

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtDuracaoMin(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m} min`;
  return `${h}h ${m}min`;
}

function fmtHora(date) {
  if (!date) return '—';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDataHora(date) {
  if (!date) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

// ─── Página principal ──────────────────────────────────────────────────────
export default function PortariaPage() {
  const { col, docRef, stamp } = useDb();
  const { usuario } = useUser();

  const [agora, setAgora] = useState(new Date());
  const [ativos, setAtivos] = useState([]);          // todos em_andamento
  const [destinos, setDestinos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [cavalos, setCavalos] = useState([]);
  const [carretas, setCarretas] = useState([]);

  const [modal, setModal] = useState(null); // 'saida-carreta' | 'entrada-terceiro' | { fechar: registroId }

  // Cronômetro vivo
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Carrega cadastros auxiliares
  useEffect(() => {
    (async () => {
      const [snapD, snapT, snapM, snapC, snapCarr] = await Promise.all([
        getDocs(col('portaria_destinos')),
        getDocs(col('portaria_tipos_atendimento')),
        getDocs(col('motoristas')),
        getDocs(col('cavalos')),
        getDocs(col('carretas')),
      ]);
      setDestinos(snapD.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)));
      setTipos(snapT.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)));
      setMotoristas(snapM.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.valor || '').localeCompare(b.valor || '')));
      setCavalos(snapC.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.valor || '').localeCompare(b.valor || '')));
      setCarretas(snapCarr.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.valor || '').localeCompare(b.valor || '')));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe em tempo real aos registros em andamento
  useEffect(() => {
    const q = query(col('portaria_registros'), where('status', '==', 'em_andamento'));
    const unsub = onSnapshot(q, (snap) => {
      setAtivos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viagensAtivas = useMemo(
    () => ativos
      .filter(r => r.tipo === 'carreta_propria')
      .sort((a, b) => (tsToDate(a.entradaEm)?.getTime() || 0) - (tsToDate(b.entradaEm)?.getTime() || 0)),
    [ativos]
  );
  const terceirosAtivos = useMemo(
    () => ativos
      .filter(r => r.tipo === 'terceiro')
      .sort((a, b) => (tsToDate(a.entradaEm)?.getTime() || 0) - (tsToDate(b.entradaEm)?.getTime() || 0)),
    [ativos]
  );

  async function registrarSaidaCarreta(dados) {
    await addDoc(col('portaria_registros'), {
      ...stamp(),
      tipo: 'carreta_propria',
      status: 'em_andamento',
      entradaEm: Timestamp.fromDate(dados.dataHora || new Date()),
      saidaEm: null,
      duracaoMin: null,
      observacao: dados.observacao || '',
      registradoPor: { uid: usuario?.uid || null, nome: usuario?.nome || '' },
      carretaPlaca: dados.carretaPlaca,
      cavaloPlaca: dados.cavaloPlaca,
      motoristaNome: dados.motoristaNome,
      destinoId: dados.destinoId,
      destinoNome: dados.destinoNome,
      slaMin: dados.slaMin || null,
      createdAt: serverTimestamp(),
    });
    setModal(null);
  }

  async function registrarEntradaTerceiro(dados) {
    await addDoc(col('portaria_registros'), {
      ...stamp(),
      tipo: 'terceiro',
      status: 'em_andamento',
      entradaEm: Timestamp.fromDate(dados.dataHora || new Date()),
      saidaEm: null,
      duracaoMin: null,
      observacao: dados.observacao || '',
      registradoPor: { uid: usuario?.uid || null, nome: usuario?.nome || '' },
      placaVeiculo: dados.placaVeiculo,
      empresa: dados.empresa,
      motoristaNome: dados.motoristaNome,
      tipoAtendimentoId: dados.tipoAtendimentoId,
      tipoAtendimentoNome: dados.tipoAtendimentoNome,
      slaMin: dados.slaMin || null,
      notaFiscal: dados.notaFiscal || '',
      createdAt: serverTimestamp(),
    });
    setModal(null);
  }

  async function fecharRegistro(registro, observacaoExtra) {
    const agoraD = new Date();
    const entrada = tsToDate(registro.entradaEm);
    const duracaoMin = entrada ? Math.max(0, Math.round((agoraD - entrada) / 60000)) : 0;
    await updateDoc(docRef('portaria_registros', registro.id), {
      status: 'finalizado',
      saidaEm: Timestamp.fromDate(agoraD),
      duracaoMin,
      observacao: observacaoExtra
        ? (registro.observacao ? `${registro.observacao}\n${observacaoExtra}` : observacaoExtra)
        : registro.observacao || '',
      fechadoPor: { uid: usuario?.uid || null, nome: usuario?.nome || '' },
    });
    setModal(null);
  }

  async function cancelarRegistro(registro) {
    if (!window.confirm('Cancelar este registro? Ele será marcado como cancelado e sairá da lista de ativos.')) return;
    await updateDoc(docRef('portaria_registros', registro.id), {
      status: 'cancelado',
      fechadoPor: { uid: usuario?.uid || null, nome: usuario?.nome || '' },
    });
  }

  return (
    <PageContainer maxWidth={1200}>
      <PageHeader
        kicker="Portaria"
        titulo="Painel de Operação"
        sub={`${viagensAtivas.length} carreta(s) em viagem · ${terceirosAtivos.length} veículo(s) no pátio · ${fmtHora(agora)}`}
        acoes={
          <>
            <BotaoNav onClick={() => window.location.assign('/portaria/registros')}>Registros</BotaoNav>
            <BotaoNav onClick={() => window.location.assign('/portaria/dashboard')}>Dashboard</BotaoNav>
          </>
        }
      />

      {/* ── Botões de ação principais ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <BigActionButton
          cor={D.blue}
          icone="🚚"
          titulo="Saída de Carreta"
          sub="Registrar viagem (carreta saindo do CD)"
          onClick={() => setModal('saida-carreta')}
        />
        <BigActionButton
          cor={D.red}
          icone="🚙"
          titulo="Entrada de Terceiro"
          sub="Registrar chegada de fornecedor/visitante"
          onClick={() => setModal('entrada-terceiro')}
        />
      </div>

      {/* ── Em viagem agora ──────────────────────────────────────────── */}
      <SectionTitle titulo="🚚 Em viagem agora" cor={D.blue} contagem={viagensAtivas.length} />
      {viagensAtivas.length === 0 ? (
        <SemAtivos texto="Nenhuma carreta em viagem no momento." />
      ) : (
        <div style={gridCards}>
          {viagensAtivas.map(r => (
            <CardAtivo
              key={r.id}
              registro={r}
              agora={agora}
              cor={D.blue}
              titulo={`Carreta ${r.carretaPlaca || '—'}`}
              subL1={`🐎 ${r.cavaloPlaca || '—'}  ·  👤 ${r.motoristaNome || '—'}`}
              subL2={`📍 ${r.destinoNome || '—'}`}
              onFechar={() => setModal({ fechar: r.id })}
              onCancelar={() => cancelarRegistro(r)}
            />
          ))}
        </div>
      )}

      {/* ── No pátio agora ──────────────────────────────────────────── */}
      <div style={{ marginTop: 28 }}>
        <SectionTitle titulo="🚙 No pátio agora" cor={D.red} contagem={terceirosAtivos.length} />
        {terceirosAtivos.length === 0 ? (
          <SemAtivos texto="Nenhum veículo de terceiro no pátio." />
        ) : (
          <div style={gridCards}>
            {terceirosAtivos.map(r => (
              <CardAtivo
                key={r.id}
                registro={r}
                agora={agora}
                cor={D.red}
                titulo={`${r.placaVeiculo || '—'}`}
                subL1={`🏢 ${r.empresa || '—'}  ·  👤 ${r.motoristaNome || '—'}`}
                subL2={`🔖 ${r.tipoAtendimentoNome || '—'}${r.notaFiscal ? `  ·  NF ${r.notaFiscal}` : ''}`}
                onFechar={() => setModal({ fechar: r.id })}
                onCancelar={() => cancelarRegistro(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modais ──────────────────────────────────────────────────── */}
      {modal === 'saida-carreta' && (
        <ModalSaidaCarreta
          destinos={destinos} motoristas={motoristas} cavalos={cavalos} carretas={carretas}
          onClose={() => setModal(null)}
          onConfirm={registrarSaidaCarreta}
        />
      )}
      {modal === 'entrada-terceiro' && (
        <ModalEntradaTerceiro
          tipos={tipos}
          onClose={() => setModal(null)}
          onConfirm={registrarEntradaTerceiro}
        />
      )}
      {modal?.fechar && (
        <ModalFechar
          registro={ativos.find(r => r.id === modal.fechar)}
          agora={agora}
          onClose={() => setModal(null)}
          onConfirm={fecharRegistro}
        />
      )}
    </PageContainer>
  );
}

// ─── Botão grande ───────────────────────────────────────────────────────────
function BigActionButton({ cor, icone, titulo, sub, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `4px solid ${cor}`, borderRadius: D.radius,
      padding: '24px 26px', cursor: 'pointer',
      textAlign: 'left', boxShadow: D.shadow, transition: D.transition,
      fontFamily: D.font,
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = D.shadowMd; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = D.shadow; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 32 }}>{icone}</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: D.text, letterSpacing: -0.4 }}>{titulo}</div>
          <div style={{ fontSize: 12, color: D.textMuted, marginTop: 3 }}>{sub}</div>
        </div>
      </div>
    </button>
  );
}

// ─── Seções ─────────────────────────────────────────────────────────────────
function SectionTitle({ titulo, cor, contagem }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, background: cor, borderRadius: 2 }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2 }}>{titulo}</span>
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: cor,
        background: cor + '14', padding: '2px 8px', borderRadius: 99,
        fontFamily: D.mono,
      }}>{contagem}</span>
    </div>
  );
}

function SemAtivos({ texto }) {
  return (
    <div style={{
      background: D.surface, border: `1px dashed ${D.border}`,
      borderRadius: D.radius, padding: '22px 24px',
      color: D.textMuted, fontStyle: 'italic', fontSize: 12.5,
      textAlign: 'center',
    }}>
      {texto}
    </div>
  );
}

const gridCards = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 12,
};

// ─── Card de registro ativo ─────────────────────────────────────────────────
function CardAtivo({ registro, agora, cor, titulo, subL1, subL2, onFechar, onCancelar }) {
  const entrada = tsToDate(registro.entradaEm);
  const decorridoMin = entrada ? Math.floor((agora - entrada) / 60000) : 0;
  const sla = registro.slaMin || null;
  const atrasado = sla && decorridoMin > sla;
  const corStatus = atrasado ? D.red : decorridoMin > (sla || 1e9) * 0.8 ? D.amber : cor;

  return (
    <div style={{
      background: D.surface, border: `1px solid ${atrasado ? D.redBorder : D.border}`,
      borderLeft: `3px solid ${corStatus}`, borderRadius: D.radius,
      padding: '14px 16px', boxShadow: D.shadow, fontFamily: D.font,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -0.5 }}>
            {titulo}
          </div>
          <div style={{ fontSize: 11, color: D.textSec, marginTop: 4 }}>{subL1}</div>
          <div style={{ fontSize: 11, color: D.textSec, marginTop: 2 }}>{subL2}</div>
        </div>
        <div style={{
          padding: '4px 9px', borderRadius: 8, background: corStatus + '14',
          color: corStatus, fontSize: 11.5, fontWeight: 800, fontFamily: D.mono,
          whiteSpace: 'nowrap',
        }}>
          {fmtDuracaoMin(decorridoMin)}
        </div>
      </div>

      <div style={{ fontSize: 10, color: D.textMuted, fontFamily: D.mono }}>
        Saída {fmtHora(entrada)}{sla ? `  ·  SLA ${sla} min` : ''}{atrasado ? '  ·  ⚠️ ATRASADO' : ''}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button onClick={onFechar} style={{
          flex: 1, padding: '7px 10px', background: cor, color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: D.font, transition: D.transition,
        }}>
          ✓ Registrar saída
        </button>
        <button onClick={onCancelar} style={{
          padding: '7px 10px', background: 'transparent', color: D.textMuted,
          border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 11.5, fontWeight: 600,
          cursor: 'pointer', fontFamily: D.font,
        }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Modal: Saída de Carreta ───────────────────────────────────────────────
function ModalSaidaCarreta({ destinos, motoristas, cavalos, carretas, onClose, onConfirm }) {
  const [carretaPlaca, setCarretaPlaca] = useState('');
  const [cavaloPlaca, setCavaloPlaca] = useState('');
  const [motoristaNome, setMotoristaNome] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [usarHoraAtual, setUsarHoraAtual] = useState(true);
  const [horaManual, setHoraManual] = useState(formatHHMM(new Date()));

  function submeter() {
    if (!carretaPlaca || !motoristaNome || !destinoId) {
      alert('Preencha carreta, motorista e destino.'); return;
    }
    const destino = destinos.find(d => d.id === destinoId);
    onConfirm({
      carretaPlaca, cavaloPlaca, motoristaNome,
      destinoId, destinoNome: destino?.nome || '',
      slaMin: destino?.slaMin || null,
      observacao,
      dataHora: usarHoraAtual ? new Date() : combinarHoraComHoje(horaManual),
    });
  }

  return (
    <Modal titulo="🚚 Saída de Carreta" onClose={onClose} cor={D.blue}>
      <FormRow label="Carreta">
        <DataListInput valor={carretaPlaca} onChange={setCarretaPlaca} opcoes={carretas.map(c => c.valor)} placeholder="Placa da carreta" />
      </FormRow>
      <FormRow label="Cavalo">
        <DataListInput valor={cavaloPlaca} onChange={setCavaloPlaca} opcoes={cavalos.map(c => c.valor)} placeholder="Placa do cavalo (opcional)" />
      </FormRow>
      <FormRow label="Motorista">
        <DataListInput valor={motoristaNome} onChange={setMotoristaNome} opcoes={motoristas.map(c => c.valor)} placeholder="Nome do motorista" />
      </FormRow>
      <FormRow label="Destino">
        <select style={{ ...sInput, width: '100%' }} value={destinoId} onChange={e => setDestinoId(e.target.value)}>
          <option value="">— Selecione —</option>
          {destinos.map(d => <option key={d.id} value={d.id}>{d.nome}{d.slaMin ? ` (SLA ${d.slaMin} min)` : ''}</option>)}
        </select>
      </FormRow>
      <FormRow label="Hora de saída">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: D.textSec, cursor: 'pointer' }}>
            <input type="checkbox" checked={usarHoraAtual} onChange={e => setUsarHoraAtual(e.target.checked)} /> Agora
          </label>
          <input type="time" style={{ ...sInput, width: 120 }} disabled={usarHoraAtual}
            value={horaManual} onChange={e => setHoraManual(e.target.value)} />
        </div>
      </FormRow>
      <FormRow label="Observação">
        <textarea style={{ ...sInput, width: '100%', minHeight: 60, resize: 'vertical' }}
          value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="opcional" />
      </FormRow>
      <ModalActions onClose={onClose} onSubmit={submeter} cor={D.blue} labelSubmit="Confirmar saída" />
    </Modal>
  );
}

// ─── Modal: Entrada de Terceiro ────────────────────────────────────────────
function ModalEntradaTerceiro({ tipos, onClose, onConfirm }) {
  const [placa, setPlaca] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [motorista, setMotorista] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [observacao, setObservacao] = useState('');
  const [usarHoraAtual, setUsarHoraAtual] = useState(true);
  const [horaManual, setHoraManual] = useState(formatHHMM(new Date()));

  function submeter() {
    if (!placa || !tipoId) {
      alert('Preencha placa e tipo de atendimento.'); return;
    }
    const tipo = tipos.find(t => t.id === tipoId);
    onConfirm({
      placaVeiculo: placa.toUpperCase(),
      empresa, motoristaNome: motorista,
      tipoAtendimentoId: tipoId, tipoAtendimentoNome: tipo?.nome || '',
      slaMin: tipo?.slaMin || null,
      notaFiscal, observacao,
      dataHora: usarHoraAtual ? new Date() : combinarHoraComHoje(horaManual),
    });
  }

  return (
    <Modal titulo="🚙 Entrada de Terceiro" onClose={onClose} cor={D.red}>
      <FormRow label="Placa do veículo">
        <input style={{ ...sInput, width: '100%', textTransform: 'uppercase' }}
          value={placa} onChange={e => setPlaca(e.target.value)} placeholder="ABC1D23" />
      </FormRow>
      <FormRow label="Empresa">
        <input style={{ ...sInput, width: '100%' }}
          value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Ex: Reciclagem Ltda" />
      </FormRow>
      <FormRow label="Motorista">
        <input style={{ ...sInput, width: '100%' }}
          value={motorista} onChange={e => setMotorista(e.target.value)} placeholder="Nome (opcional)" />
      </FormRow>
      <FormRow label="Tipo de atendimento">
        <select style={{ ...sInput, width: '100%' }} value={tipoId} onChange={e => setTipoId(e.target.value)}>
          <option value="">— Selecione —</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}{t.slaMin ? ` (SLA ${t.slaMin} min)` : ''}</option>)}
        </select>
      </FormRow>
      <FormRow label="Nota fiscal">
        <input style={{ ...sInput, width: '100%' }}
          value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="opcional" />
      </FormRow>
      <FormRow label="Hora de entrada">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: D.textSec, cursor: 'pointer' }}>
            <input type="checkbox" checked={usarHoraAtual} onChange={e => setUsarHoraAtual(e.target.checked)} /> Agora
          </label>
          <input type="time" style={{ ...sInput, width: 120 }} disabled={usarHoraAtual}
            value={horaManual} onChange={e => setHoraManual(e.target.value)} />
        </div>
      </FormRow>
      <FormRow label="Observação">
        <textarea style={{ ...sInput, width: '100%', minHeight: 60, resize: 'vertical' }}
          value={observacao} onChange={e => setObservacao(e.target.value)} />
      </FormRow>
      <ModalActions onClose={onClose} onSubmit={submeter} cor={D.red} labelSubmit="Confirmar entrada" />
    </Modal>
  );
}

// ─── Modal: Fechar registro ────────────────────────────────────────────────
function ModalFechar({ registro, agora, onClose, onConfirm }) {
  const [observacao, setObservacao] = useState('');
  if (!registro) return null;

  const entrada = tsToDate(registro.entradaEm);
  const decorrido = entrada ? Math.floor((agora - entrada) / 60000) : 0;
  const sla = registro.slaMin;
  const atrasado = sla && decorrido > sla;
  const isCarreta = registro.tipo === 'carreta_propria';
  const cor = isCarreta ? D.blue : D.red;

  return (
    <Modal titulo={isCarreta ? '✓ Registrar retorno' : '✓ Registrar saída'} onClose={onClose} cor={cor}>
      <div style={{
        background: D.bg, border: `1px solid ${D.borderLight}`, borderRadius: 8,
        padding: '12px 14px', marginBottom: 14, fontSize: 12, color: D.textSec,
      }}>
        {isCarreta ? (
          <>
            <div><strong>Carreta:</strong> {registro.carretaPlaca}</div>
            <div><strong>Motorista:</strong> {registro.motoristaNome}</div>
            <div><strong>Destino:</strong> {registro.destinoNome}</div>
          </>
        ) : (
          <>
            <div><strong>Placa:</strong> {registro.placaVeiculo}</div>
            <div><strong>Empresa:</strong> {registro.empresa || '—'}</div>
            <div><strong>Tipo:</strong> {registro.tipoAtendimentoNome}</div>
          </>
        )}
        <div style={{ marginTop: 8 }}>
          <strong>Saída:</strong> {fmtDataHora(entrada)} &nbsp;·&nbsp;
          <strong>Duração:</strong>{' '}
          <span style={{ color: atrasado ? D.red : D.green, fontWeight: 700, fontFamily: D.mono }}>
            {fmtDuracaoMin(decorrido)}
          </span>
          {sla && <> &nbsp;·&nbsp; <strong>SLA:</strong> {sla} min</>}
          {atrasado && <span style={{ color: D.red, fontWeight: 700 }}> &nbsp;⚠️ Acima do SLA</span>}
        </div>
      </div>

      <FormRow label={atrasado ? 'Observação (motivo do atraso)' : 'Observação adicional'}>
        <textarea style={{ ...sInput, width: '100%', minHeight: 70, resize: 'vertical' }}
          value={observacao} onChange={e => setObservacao(e.target.value)}
          placeholder={atrasado ? 'Recomendado: descreva o motivo' : 'opcional'} />
      </FormRow>
      <ModalActions onClose={onClose} onSubmit={() => onConfirm(registro, observacao)} cor={cor} labelSubmit="Finalizar registro" />
    </Modal>
  );
}

// ─── Componentes do modal ──────────────────────────────────────────────────
function Modal({ titulo, cor, children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 16, animation: 'wjs-fadeUp 0.18s ease both',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: D.surface, borderRadius: D.radius, boxShadow: D.shadowMd,
        width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto',
        fontFamily: D.font,
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${D.borderLight}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 3, height: 14, background: cor, borderRadius: 2 }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: D.text }}>{titulo}</span>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            cursor: 'pointer', color: D.textMuted, fontSize: 18, padding: 0,
          }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ ...sLabel, display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ onClose, onSubmit, cor, labelSubmit }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
      <button onClick={onClose} style={{
        padding: '9px 16px', background: 'transparent', border: `1px solid ${D.border}`,
        borderRadius: 8, fontSize: 12.5, color: D.textSec, fontWeight: 600, cursor: 'pointer',
      }}>Cancelar</button>
      <button onClick={onSubmit} style={{
        padding: '9px 18px', background: cor, color: '#fff', border: 'none',
        borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}>{labelSubmit}</button>
    </div>
  );
}

// Input com sugestões (datalist)
function DataListInput({ valor, onChange, opcoes, placeholder }) {
  const listId = `dl-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <>
      <input
        style={{ ...sInput, width: '100%' }}
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
      />
      <datalist id={listId}>
        {opcoes.filter(Boolean).map(o => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

// ─── Utils ─────────────────────────────────────────────────────────────────
function formatHHMM(date) {
  return date.toTimeString().slice(0, 5);
}
function combinarHoraComHoje(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
