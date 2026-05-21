import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, addDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { useDb } from '../utils/db';
import { useUser } from '../context/UserContext';
import { useSessionFilter } from '../hooks/useSessionFilter';
import { NIVEIS_SUPERVISOR } from './admin/ConfigurarEmpresaPage';

function formatarInput(valor) {
  const digits = valor.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
}

function parsearData(str) {
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
}

const dataValida = str => parsearData(str) !== null;

export default function RegistroAbastecimentoPage() {
  const { col, docRef, db } = useDb();
  const { usuario } = useUser();
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editandoId, setEditandoId] = useState(null);
  const [editandoData, setEditandoData] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [excluindoFiltrados, setExcluindoFiltrados] = useState(false);
  const [reorganizandoReabs, setReorganizandoReabs] = useState(false);
  const [busca, setBusca] = useSessionFilter('regab:busca', '');
  const [filtroTipo, setFiltroTipo] = useSessionFilter('regab:tipo', 'todos');
  const [dataInicio, setDataInicio] = useSessionFilter('regab:inicio', '');
  const [dataFim, setDataFim] = useSessionFilter('regab:fim', '');

  const isSupervisor = NIVEIS_SUPERVISOR.includes(usuario?.nivel);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const snap = await getDocs(query(col('abastecimentos'), orderBy('criadoEm', 'desc')));
      setRegistros(snap.docs.map(d => ({ _id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  // Apaga em massa todos os registros que estão visíveis pela combinação atual
  // de filtros (busca + tipo + data início + data fim). Útil pra limpeza
  // cirúrgica: ex. "todos os reabs do dia 20/05/2026" → filtra tipo=reab +
  // data início/fim = 20/05/2026 + clica em "Excluir filtrados".
  async function excluirFiltrados(filtradosAtuais) {
    if (!filtradosAtuais || filtradosAtuais.length === 0) {
      alert('Nenhum registro para excluir. Ajuste os filtros.');
      return;
    }
    const resumo = [
      `${filtradosAtuais.length} registro(s)`,
      filtroTipo !== 'todos' && (filtroTipo === 'reabastecimento' ? 'tipo: Reabastecimento' : 'tipo: Ressuprimento'),
      busca && `busca: "${busca}"`,
      dataInicio && `de ${dataInicio}`,
      dataFim && `até ${dataFim}`,
    ].filter(Boolean).join(' · ');
    if (!window.confirm(`⚠️ Excluir ${resumo}?\n\nEsta ação não pode ser desfeita.`)) return;
    setExcluindoFiltrados(true);
    try {
      const ids = filtradosAtuais.map(r => r._id);
      for (let i = 0; i < ids.length; i += 450) {
        const batch = writeBatch(db);
        ids.slice(i, i + 450).forEach(id => batch.delete(docRef('abastecimentos', id)));
        await batch.commit();
      }
      setRegistros(prev => prev.filter(r => !ids.includes(r._id)));
      alert(`✅ ${ids.length} registro(s) excluído(s) com sucesso.`);
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    } finally {
      setExcluindoFiltrados(false);
    }
  }

  // Reorganiza as horas de TODOS os reabastecimentos do Firebase agrupando-os
  // por dia em uma janela de até 5 minutos dentro de [14:15, 16:25].
  // Cada dia recebe uma "base" aleatória; todos os reabs daquele dia ficam
  // entre [base, base+5min]. Simula o cenário real onde os reabs são
  // registrados quase ao mesmo tempo.
  async function reorganizarHorasReabs() {
    const reabs = registros.filter(r => r.tipo === 'reabastecimento');
    if (reabs.length === 0) {
      alert('Nenhum reabastecimento encontrado.');
      return;
    }
    const diasUnicos = new Set(reabs.map(r => r.dataOperacional)).size;
    if (!window.confirm(
      `🔄 Reorganizar horas de ${reabs.length} reabastecimento(s) em ${diasUnicos} dia(s) distinto(s)?\n\n` +
      `Cada dia receberá uma janela aleatória de 5 minutos dentro de 14:15–16:25.\n` +
      `Todos os reabs do mesmo dia ficarão agrupados nessa janela.\n\n` +
      `⚠️ Esta ação reescreve "hora" e "criadoEm" de TODOS os reabs. Irreversível.`
    )) return;

    setReorganizandoReabs(true);
    try {
      // Sorteia uma "base" aleatória por dia (14:15=855min até 16:20=980min, reserva 5min pra cima)
      const basePorDia = new Map();
      for (const r of reabs) {
        if (!basePorDia.has(r.dataOperacional)) {
          const base = 855 + Math.floor(Math.random() * (980 - 855 + 1));
          basePorDia.set(r.dataOperacional, base);
        }
      }

      // Atualiza em batches de 450 (limite Firestore é 500)
      let atualizados = 0;
      for (let i = 0; i < reabs.length; i += 450) {
        const batch = writeBatch(db);
        const lote = reabs.slice(i, i + 450);
        for (const r of lote) {
          const base = basePorDia.get(r.dataOperacional);
          const m   = base + Math.floor(Math.random() * 6); // 0–5 min depois
          const hh  = String(Math.floor(m / 60)).padStart(2, '0');
          const mm  = String(m % 60).padStart(2, '0');
          const hora = `${hh}:${mm}`;
          const [dd, mes, aaaa] = r.dataOperacional.split('/');
          const criadoEm = new Date(`${aaaa}-${mes}-${dd}T${hora}:00`).toISOString();
          batch.update(docRef('abastecimentos', r._id), { hora, criadoEm });
          // Atualiza no state local também
          r.hora = hora;
          r.criadoEm = criadoEm;
        }
        await batch.commit();
        atualizados += lote.length;
      }

      setRegistros([...registros]); // força re-render
      alert(`✅ ${atualizados} reabastecimento(s) reorganizado(s) em ${diasUnicos} dia(s).`);
    } catch (err) {
      alert('Erro ao reorganizar: ' + err.message);
    } finally {
      setReorganizandoReabs(false);
    }
  }

  function horaAleatoria(tipo) {
    // Ressuprimento: 00:30 – 05:30 | Reabastecimento: 08:30–11:00 ou 13:00–17:45
    let minTotal, maxTotal;
    if (tipo === 'ressuprimento') {
      minTotal = 30;   // 00:30
      maxTotal = 330;  // 05:30
    } else {
      // escolhe aleatoriamente entre os dois turnos
      const turno = Math.random() < 0.5 ? 0 : 1;
      if (turno === 0) { minTotal = 510; maxTotal = 660; }  // 08:30–11:00
      else             { minTotal = 780; maxTotal = 1065; } // 13:00–17:45
    }
    const min = Math.floor(Math.random() * (maxTotal - minTotal + 1)) + minTotal;
    const h = String(Math.floor(min / 60)).padStart(2, '0');
    const m = String(min % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  async function corrigirHoras() {
    const total = registros.filter(r => r.hora && r.hora.endsWith(':00')).length;
    if (total === 0) { alert('Nenhum registro com minutos zerados encontrado.'); return; }
    if (!window.confirm(`Encontrados ${total} registro(s) com minutos zerados (ex: 01:00, 09:00).\nDeseja corrigir com horários aleatórios por tipo?`)) return;
    setCorrigindo(true);
    try {
      const alvo = registros.filter(r => r.hora && r.hora.endsWith(':00'));
      for (let i = 0; i < alvo.length; i += 450) {
        const batch = writeBatch(db);
        alvo.slice(i, i + 450).forEach(r => {
          batch.update(docRef('abastecimentos', r._id), { hora: horaAleatoria(r.tipo) });
        });
        await batch.commit();
      }
      alert(`${total} registro(s) corrigidos com sucesso!`);
      carregar();
    } catch (err) {
      alert('Erro na correção: ' + err.message);
    }
    setCorrigindo(false);
  }

  async function salvarEdicao(id) {
    if (!dataValida(editandoData)) { alert('Data inválida. Use DD/MM/AAAA.'); return; }
    setSalvando(true);
    try {
      await updateDoc(docRef('abastecimentos', id), { dataOperacional: editandoData });
      setRegistros(prev => prev.map(r => r._id === id ? { ...r, dataOperacional: editandoData } : r));
      setEditandoId(null);
    } catch (err) {
      alert('Erro: ' + err.message);
    }
    setSalvando(false);
  }

  function lerCSV(file) {
    const reader = new FileReader();
    reader.onload = async e => {
      setImportando(true);
      try {
        const linhas = e.target.result.split('\n').filter(l => l.trim()).slice(1);
        const pSnap = await getDocs(col('produtos'));
        const prodMap = {};
        pSnap.docs.forEach(d => { prodMap[d.data().codigo] = d.data().nome; });

        let count = 0;
        let erros = 0;
        for (const linha of linhas) {
          const cols = linha.split(';').map(c => c.trim());
          const codigo = cols[0];
          const tipo = cols[1]?.toLowerCase();
          const qtd = parseInt(cols[2]);
          const dataOp = cols[3]?.replace(/\r/g, '');

          if (!codigo || !['reabastecimento', 'ressuprimento'].includes(tipo) || isNaN(qtd) || qtd < 1 || !dataValida(dataOp)) {
            erros++;
            continue;
          }

          const registro = {
            codProduto: codigo,
            nomeProduto: prodMap[codigo] || codigo,
            tipo,
            qtdPaletes: qtd,
            dataOperacional: dataOp,
            conferente: `Importação (${usuario.nome})`,
            hora: horaAleatoria(tipo),
            criadoEm: new Date().toISOString(),
          };
          await addDoc(col('abastecimentos'), registro);
          count++;
        }

        const msg = erros > 0
          ? `${count} registros importados. ${erros} linha(s) ignoradas (formato inválido).`
          : `${count} registros importados com sucesso!`;
        alert(msg);
        carregar();
      } catch (err) {
        alert('Erro na importação: ' + err.message);
      }
      setImportando(false);
    };
    reader.readAsText(file, 'UTF-8');
  }

  // Filtros
  const inicioParsed = parsearData(dataInicio);
  const fimParsed = parsearData(dataFim);
  const buscaLower = busca.toLowerCase();

  const filtrados = registros.filter(r => {
    if (filtroTipo !== 'todos' && r.tipo !== filtroTipo) return false;
    if (busca && !String(r.codProduto).toLowerCase().includes(buscaLower) && !(r.nomeProduto || '').toLowerCase().includes(buscaLower)) return false;
    if (inicioParsed || fimParsed) {
      const d = parsearData(r.dataOperacional);
      if (!d) return false;
      if (inicioParsed && d < inicioParsed) return false;
      if (fimParsed && d > fimParsed) return false;
    }
    return true;
  });

  const totalReab = filtrados.filter(r => r.tipo === 'reabastecimento').reduce((s, r) => s + (r.qtdPaletes || 1), 0);
  const totalRessp = filtrados.filter(r => r.tipo === 'ressuprimento').reduce((s, r) => s + (r.qtdPaletes || 1), 0);

  const corTipo = t => t === 'reabastecimento' ? '#1D5A9E' : '#E31837';
  const labelTipo = t => t === 'reabastecimento' ? '🌅 Reabastecimento' : '🌙 Ressuprimento';

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Carregando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Registro de Reabastecimento / Ressuprimento</h2>
        {/* Botões "Importar CSV Retroativo" e "Corrigir Minutos Zerados" ocultados — pra reativar, troque `false &&` por `isSupervisor &&` */}
        {false && isSupervisor && (
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <label style={{ ...btnSec, cursor: 'pointer', opacity: importando ? 0.6 : 1 }}>
              {importando ? '⏳ Importando...' : '📥 Importar CSV Retroativo'}
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) lerCSV(e.target.files[0]); e.target.value = ''; }} disabled={importando} />
            </label>
            <button
              onClick={corrigirHoras}
              disabled={corrigindo}
              style={{ ...btnSec, cursor: corrigindo ? 'not-allowed' : 'pointer', opacity: corrigindo ? 0.6 : 1, backgroundColor:'#fff7ed', borderColor:'#fed7aa', color:'#c2410c' }}
            >
              {corrigindo ? '⏳ Corrigindo...' : '🕐 Corrigir Minutos Zerados'}
            </button>
          </div>
        )}
      </div>

      {/* Box explicativo de formato CSV ocultado — pra reativar, troque `false &&` por `isSupervisor &&` */}
      {false && isSupervisor && (
        <div style={{ backgroundColor: '#f0f4ff', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: '#555', lineHeight: 1.7 }}>
          📋 <b>Formato CSV para importação:</b> Codigo ; Tipo ; QtdPaletes ; DataOperacional — separador ponto e vírgula, primeira linha é cabeçalho.<br />
          📌 <b>Regra da data:</b> <b>Ressuprimento</b> → DataOperacional = dia das vendas de referência (D+0). <b>Reabastecimento</b> → DataOperacional = dia do reabastecimento físico (o dashboard usa D-1 automático para buscar vendas).
        </div>
      )}

      {/* Filtros */}
      <div style={{ ...secao, marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍 Buscar produto..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ ...inp, width: 200 }}
          />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inp, width: 190 }}>
            <option value="todos">Todos os tipos</option>
            <option value="reabastecimento">🌅 Reabastecimento</option>
            <option value="ressuprimento">🌙 Ressuprimento</option>
          </select>
          <input style={{ ...inp, width: 130 }} placeholder="Início dd/mm/aaaa" value={dataInicio} onChange={e => setDataInicio(formatarInput(e.target.value))} />
          <span style={{ fontSize: 12, color: '#888' }}>até</span>
          <input style={{ ...inp, width: 130 }} placeholder="Fim dd/mm/aaaa" value={dataFim} onChange={e => setDataFim(formatarInput(e.target.value))} />
          <button
            onClick={() => { setBusca(''); setFiltroTipo('todos'); setDataInicio(''); setDataFim(''); }}
            style={{ ...btnSec, padding: '8px 12px' }}
          >
            ✕ Limpar
          </button>
          {/* Botão "Excluir filtrados" ocultado a pedido em 2026-05-21.
              A função excluirFiltrados() segue no código pra reativação rápida. */}
          {false && isSupervisor && filtrados.length > 0 && (busca || filtroTipo !== 'todos' || dataInicio || dataFim) && (
            <button
              onClick={() => excluirFiltrados(filtrados)}
              disabled={excluindoFiltrados}
              title="Apaga em massa todos os registros visíveis pela combinação atual de filtros"
              style={{
                padding: '8px 12px',
                backgroundColor: excluindoFiltrados ? '#eee' : '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                color: '#991b1b',
                fontSize: 13,
                fontWeight: 'bold',
                cursor: excluindoFiltrados ? 'not-allowed' : 'pointer',
                opacity: excluindoFiltrados ? 0.6 : 1,
              }}
            >
              {excluindoFiltrados ? '⏳ Excluindo...' : `🗑️ Excluir ${filtrados.length} filtrado(s)`}
            </button>
          )}
          {false && isSupervisor && (
            <button
              onClick={reorganizarHorasReabs}
              disabled={reorganizandoReabs}
              title="Reagrupa todos os reabastecimentos do Firebase: cada dia ganha uma janela aleatória de até 5 min dentro de 14:15–16:25, e todos os reabs daquele dia ficam nessa janela"
              style={{
                padding: '8px 12px',
                backgroundColor: reorganizandoReabs ? '#eee' : '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: 8,
                color: '#78350f',
                fontSize: 13,
                fontWeight: 'bold',
                cursor: reorganizandoReabs ? 'not-allowed' : 'pointer',
                opacity: reorganizandoReabs ? 0.6 : 1,
              }}
            >
              {reorganizandoReabs ? '⏳ Reorganizando...' : '🔄 Reorganizar horas dos reabs'}
            </button>
          )}
          <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {filtrados.length} registro(s) &nbsp;·&nbsp;
            <b style={{ color: '#1D5A9E' }}>{totalReab} plt reab.</b> &nbsp;·&nbsp;
            <b style={{ color: '#E31837' }}>{totalRessp} plt ressp.</b>
          </span>
        </div>
      </div>

      {/* Tabela */}
      <div style={secao}>
        {filtrados.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum registro encontrado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={th}>Data Operacional</th>
                  <th style={th}>Hora</th>
                  <th style={th}>Produto</th>
                  <th style={th}>Tipo</th>
                  <th style={{ ...th, textAlign: 'center' }}>Qtd Paletes</th>
                  <th style={th}>Conferente</th>
                  {/* Coluna "Ações" ocultada — único botão era "✏️ Data" (Editar Data),
                      removido a pedido. Pra reativar, restaure este <th> e o <td>
                      correspondente abaixo. */}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r, i) => {
                  const estaEditando = editandoId === r._id;
                  return (
                    <tr key={r._id} style={{ borderBottom: '1px solid #eee', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...td, fontWeight: '600', color: '#333', minWidth: 140 }}>
                        {estaEditando ? (
                          <input
                            autoFocus
                            style={{ ...inp, width: 120, padding: '5px 8px' }}
                            value={editandoData}
                            onChange={e => setEditandoData(formatarInput(e.target.value))}
                          />
                        ) : r.dataOperacional}
                      </td>
                      <td style={{ ...td, color: '#888', fontSize: 12 }}>{r.hora || '-'}</td>
                      <td style={td}>
                        <div style={{ fontWeight: '600' }}>{r.nomeProduto}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>Cód: {r.codProduto}</div>
                      </td>
                      <td style={td}>
                        <span style={{
                          color: corTipo(r.tipo), fontWeight: '600', fontSize: 12,
                          backgroundColor: r.tipo === 'reabastecimento' ? 'rgba(29,90,158,0.08)' : 'rgba(227,24,55,0.08)',
                          padding: '3px 8px', borderRadius: 4,
                        }}>
                          {labelTipo(r.tipo)}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 'bold' }}>{r.qtdPaletes}</td>
                      <td style={{ ...td, color: '#666', fontSize: 12 }}>{r.conferente}</td>
                      {/* Coluna "Ações" ocultada — botão "✏️ Data" removido a pedido.
                          O modo edição (estaEditando/salvarEdicao) continua no código
                          em caso de reativação futura. */}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const secao = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#666', fontWeight: '600', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px' };
const inp = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 };
const btnSec = { padding: '8px 14px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
