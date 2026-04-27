import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import * as XLSX from 'xlsx';
import { useSessionFilter } from '../hooks/useSessionFilter';

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_MAP = {
  'janeiro':'01','fevereiro':'02','março':'03','marco':'03',
  'abril':'04','maio':'05','junho':'06','julho':'07',
  'agosto':'08','setembro':'09','outubro':'10','novembro':'11','dezembro':'12',
};

function chaveParaNome(chave) {
  if (!chave) return '';
  const [ano, mes] = chave.split('-');
  return `${MESES_NOME[parseInt(mes) - 1]}/${ano}`;
}

function parseMesAno(str) {
  if (!str) return null;
  const s = String(str).trim();
  const idx = s.lastIndexOf('/');
  if (idx === -1) return null;
  const nomeMes = s.slice(0, idx).toLowerCase().trim();
  const ano = s.slice(idx + 1).trim();
  const num = MESES_MAP[nomeMes];
  if (!num || !/^\d{4}$/.test(ano)) return null;
  return `${ano}-${num}`;
}

export default function ConfigPicking() {
  const [mesesDisponiveis, setMesesDisponiveis] = useState([]);
  const [anoSelecionado, setAnoSelecionado] = useSessionFilter('cfgpick:ano', '');
  const [mesNumSelecionado, setMesNumSelecionado] = useSessionFilter('cfgpick:mes', '');

  const mesSelecionado = anoSelecionado && mesNumSelecionado ? `${anoSelecionado}-${mesNumSelecionado}` : '';
  const anos = [...new Set(mesesDisponiveis.map(m => m.split('-')[0]))].sort();
  const mesesDoAno = mesesDisponiveis.filter(m => m.startsWith(anoSelecionado)).map(m => m.split('-')[1]).sort();
  const [configs, setConfigs] = useState([]);
  const [baseProdutos, setBaseProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [novoForm, setNovoForm] = useState({ codProduto: '', nomeProduto: '', espacosPalete: '' });
  const [sugestoes, setSugestoes] = useState([]);
  const [showNovo, setShowNovo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useSessionFilter('cfgpick:busca', '');
  const [ordenacao, setOrdenacao] = useSessionFilter('cfgpick:ord', { coluna: 'nomeProduto', direcao: 'asc' });

  useEffect(() => { carregarInicial(); }, []);

  async function carregarInicial() {
    setCarregando(true);
    const [mSnap, pSnap] = await Promise.all([
      getDocs(collection(db, 'picking_config_mensal')),
      getDocs(collection(db, 'produtos')),
    ]);
    const prods = pSnap.docs.map(d => d.data());
    setBaseProdutos(prods);
    const meses = mSnap.docs.map(d => d.id).sort().reverse();
    setMesesDisponiveis(meses);
    if (meses.length > 0) {
      const primeiro = meses[0];
      const [ano, mes] = primeiro.split('-');
      setAnoSelecionado(ano);
      setMesNumSelecionado(mes);
      const docData = mSnap.docs.find(d => d.id === primeiro)?.data();
      setConfigs(enriquecer(docData?.produtos || [], prods));
    }
    setCarregando(false);
  }

  function enriquecer(produtos, base = baseProdutos) {
    return produtos.map(c => {
      const prod = base.find(p => p.codigo === c.codProduto);
      return { ...c, cxPorPlt: c.cxPorPlt || prod?.cxPorPlt || '' };
    });
  }

  async function trocarMes(chave) {
    if (!chave) { setAnoSelecionado(''); setMesNumSelecionado(''); setConfigs([]); return; }
    setAnoSelecionado(chave.split('-')[0]);
    setMesNumSelecionado(chave.split('-')[1]);
    setEditando(null);
    setBusca('');
    const docSnap = await getDoc(doc(db, 'picking_config_mensal', chave));
    setConfigs(docSnap.exists() ? enriquecer(docSnap.data().produtos || []) : []);
  }

  function buscarProdutoForm(texto, campo) {
    if (campo === 'codigo') {
      const v = texto.replace(/[^0-9]/g, '');
      setNovoForm(f => ({ ...f, codProduto: v, nomeProduto: '' }));
      setSugestoes(v.length >= 2 ? baseProdutos.filter(p => p.codigo?.startsWith(v)).slice(0, 5) : []);
    } else {
      setNovoForm(f => ({ ...f, nomeProduto: texto.toUpperCase(), codProduto: '' }));
      setSugestoes(texto.length >= 2 ? baseProdutos.filter(p => p.nome?.toLowerCase().includes(texto.toLowerCase())).slice(0, 5) : []);
    }
  }

  function selecionarProdutoForm(p) {
    setNovoForm(f => ({ ...f, codProduto: p.codigo, nomeProduto: p.nome }));
    setSugestoes([]);
  }

  async function salvarNovo() {
    if (!mesSelecionado) { alert('Selecione um mês primeiro.'); return; }
    if (!novoForm.codProduto || !novoForm.nomeProduto) { alert('Selecione um produto.'); return; }
    if (!novoForm.espacosPalete) { alert('Preencha os espaços palete.'); return; }
    const prod = baseProdutos.find(p => p.codigo === novoForm.codProduto);
    const novo = {
      codProduto: novoForm.codProduto,
      nomeProduto: novoForm.nomeProduto,
      espacosPalete: parseInt(novoForm.espacosPalete),
      cxPorPlt: prod?.cxPorPlt ? parseInt(prod.cxPorPlt) : '',
    };
    const docRef = doc(db, 'picking_config_mensal', mesSelecionado);
    const docSnap = await getDoc(docRef);
    const existentes = docSnap.exists() ? (docSnap.data().produtos || []) : [];
    const atualizados = [...existentes.filter(p => p.codProduto !== novo.codProduto), novo];
    await setDoc(docRef, { mes: mesSelecionado, produtos: atualizados });
    setShowNovo(false);
    setNovoForm({ codProduto: '', nomeProduto: '', espacosPalete: '' });
    await trocarMes(mesSelecionado);
  }

  async function salvarEdicao(cfg) {
    const docRef = doc(db, 'picking_config_mensal', mesSelecionado);
    const docSnap = await getDoc(docRef);
    const produtos = (docSnap.data()?.produtos || []).map(p =>
      p.codProduto === cfg.codProduto ? { ...p, espacosPalete: parseInt(cfg.espacosPalete) } : p
    );
    await updateDoc(docRef, { produtos });
    setEditando(null);
    await trocarMes(mesSelecionado);
  }

  async function excluir(codProduto, nome) {
    if (!window.confirm(`Remover "${nome}" de ${chaveParaNome(mesSelecionado)}?`)) return;
    const docRef = doc(db, 'picking_config_mensal', mesSelecionado);
    const docSnap = await getDoc(docRef);
    const produtos = (docSnap.data()?.produtos || []).filter(p => p.codProduto !== codProduto);
    await updateDoc(docRef, { produtos });
    await trocarMes(mesSelecionado);
  }

  function importar(file) {
    const reader = new FileReader();
    reader.onload = async e => {
      setImportando(true);
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const grupos = {};
        for (const row of rows.slice(1)) {
          const mesStr = String(row[0]).trim();
          const codigo  = String(row[1]).trim();
          const nome    = String(row[2]).trim();
          const espacos = parseInt(String(row[3]).trim());
          if (!mesStr || !codigo || isNaN(espacos)) continue;
          const chave = parseMesAno(mesStr);
          if (!chave) continue;
          if (!grupos[chave]) grupos[chave] = [];
          const prod = baseProdutos.find(p => p.codigo === codigo);
          grupos[chave].push({
            codProduto: codigo,
            nomeProduto: nome || prod?.nome || codigo,
            espacosPalete: espacos,
            cxPorPlt: prod?.cxPorPlt ? parseInt(prod.cxPorPlt) : '',
          });
        }

        const chaves = Object.keys(grupos);
        if (chaves.length === 0) { alert('Nenhum dado válido encontrado no arquivo.'); return; }

        for (const [chave, produtos] of Object.entries(grupos)) {
          await setDoc(doc(db, 'picking_config_mensal', chave), { mes: chave, produtos });
        }

        const snap = await getDocs(collection(db, 'picking_config_mensal'));
        const meses = snap.docs.map(d => d.id).sort().reverse();
        setMesesDisponiveis(meses);
        const chaveRecente = chaves.sort().reverse()[0];
        const [ano, mes] = chaveRecente.split('-');
        setAnoSelecionado(ano);
        setMesNumSelecionado(mes);
        await trocarMes(chaveRecente);
        alert(`${chaves.length} mês(es) importado(s): ${chaves.map(chaveParaNome).join(', ')}`);
      } catch (err) {
        console.error(err);
        alert('Erro ao importar arquivo.');
      } finally {
        setImportando(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function alternarOrdenacao(coluna) {
    setOrdenacao(prev =>
      prev.coluna === coluna
        ? { coluna, direcao: prev.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: 'asc' }
    );
  }

  function seta(coluna) {
    if (ordenacao.coluna !== coluna) return <span style={{ color: '#ccc', marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{ordenacao.direcao === 'asc' ? '↑' : '↓'}</span>;
  }

  const buscaLower = busca.toLowerCase();
  const configsFiltrados = configs
    .filter(c =>
      !busca ||
      String(c.codProduto).toLowerCase().includes(buscaLower) ||
      (c.nomeProduto || '').toLowerCase().includes(buscaLower)
    )
    .sort((a, b) => {
      let vA = a[ordenacao.coluna] ?? '';
      let vB = b[ordenacao.coluna] ?? '';
      if (typeof vA === 'string') vA = vA.toLowerCase();
      if (typeof vB === 'string') vB = vB.toLowerCase();
      if (vA < vB) return ordenacao.direcao === 'asc' ? -1 : 1;
      if (vA > vB) return ordenacao.direcao === 'asc' ? 1 : -1;
      return 0;
    });

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Carregando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Configurar Picking</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>Ano:</label>
          <select
            value={anoSelecionado}
            onChange={e => {
              const novoAno = e.target.value;
              const mesesNoAno = mesesDisponiveis.filter(m => m.startsWith(novoAno)).map(m => m.split('-')[1]).sort();
              const novoMes = mesesNoAno[mesesNoAno.length - 1] || '';
              setAnoSelecionado(novoAno);
              setMesNumSelecionado(novoMes);
              if (novoMes) trocarMes(`${novoAno}-${novoMes}`);
            }}
            style={{ ...inp, width: 90, marginBottom: 0 }}
          >
            {anos.length === 0 && <option value="">—</option>}
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>Mês:</label>
          <select
            value={mesNumSelecionado}
            onChange={e => { setMesNumSelecionado(e.target.value); trocarMes(`${anoSelecionado}-${e.target.value}`); }}
            style={{ ...inp, width: 140, marginBottom: 0 }}
          >
            {mesesDoAno.length === 0 && <option value="">—</option>}
            {mesesDoAno.map(m => (
              <option key={m} value={m}>{MESES_NOME[parseInt(m) - 1]}</option>
            ))}
          </select>
          <label style={{ ...btnSec, cursor: 'pointer', opacity: importando ? 0.6 : 1 }}>
            {importando ? 'Importando...' : '📥 Importar'}
            <input
              type="file"
              accept=".xlsx,.csv"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; }}
              disabled={importando}
            />
          </label>
          <button
            onClick={() => setShowNovo(true)}
            disabled={!mesSelecionado}
            style={{ ...btnPrimario, opacity: mesSelecionado ? 1 : 0.5, cursor: mesSelecionado ? 'pointer' : 'not-allowed' }}
          >
            + Adicionar Produto
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: '#f0f4ff', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: '#555' }}>
        📋 <b>Formato do arquivo:</b> Mês (Janeiro/2026) | Código | Descrição | Espaços Palete — cabeçalho na 1ª linha.
        Aceita <b>.xlsx</b> e <b>.csv</b>. Um arquivo pode conter múltiplos meses.
      </div>

      {showNovo && mesSelecionado && (
        <div style={{ ...secao, marginBottom: 24, borderLeft: '4px solid #E31837' }}>
          <h3 style={{ ...secaoTitulo, color: '#E31837' }}>Novo Produto — {chaveParaNome(mesSelecionado)}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={lbl}>Código</label>
              <input style={inp} value={novoForm.codProduto} onChange={e => buscarProdutoForm(e.target.value, 'codigo')} placeholder="Código..." />
            </div>
            <div style={{ position: 'relative' }}>
              <label style={lbl}>Nome do Produto</label>
              <input style={inp} value={novoForm.nomeProduto} onChange={e => buscarProdutoForm(e.target.value, 'nome')} placeholder="Nome..." />
              {sugestoes.length > 0 && (
                <div style={dropdown}>
                  {sugestoes.map((p, i) => (
                    <div key={i} onClick={() => selecionarProdutoForm(p)} style={dropItem}>
                      <b style={{ color: '#E31837' }}>{p.codigo}</b> — {p.nome}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Espaços Palete</label>
              <input style={inp} type="number" min="1" value={novoForm.espacosPalete} onChange={e => setNovoForm(f => ({ ...f, espacosPalete: e.target.value }))} placeholder="Ex: 2" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={salvarNovo} style={btnPrimario}>✅ Salvar</button>
            <button onClick={() => { setShowNovo(false); setSugestoes([]); }} style={btnSec}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={secao}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ ...secaoTitulo, margin: 0 }}>
            {mesSelecionado
              ? `Produtos — ${chaveParaNome(mesSelecionado)} (${configsFiltrados.length}${busca ? ` de ${configs.length}` : ''})`
              : 'Nenhum mês selecionado'}
          </h3>
          {mesSelecionado && (
            <input
              type="text"
              placeholder="🔍 Buscar por código ou descrição..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ ...inp, width: 280, marginBottom: 0 }}
            />
          )}
        </div>

        {!mesSelecionado ? (
          <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Importe um arquivo para começar.</p>
        ) : configs.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum produto configurado para {chaveParaNome(mesSelecionado)}.</p>
        ) : configsFiltrados.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Nenhum produto encontrado para "{busca}".</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                {[
                  { label: 'Código',           col: 'codProduto' },
                  { label: 'Produto',           col: 'nomeProduto' },
                  { label: 'Espaços Palete',    col: 'espacosPalete' },
                  { label: 'CX/PLT',            col: 'cxPorPlt' },
                  { label: 'Cap. Picking (cx)', col: null },
                  { label: 'Ações',             col: null },
                ].map(({ label, col }) => (
                  <th
                    key={label}
                    style={{ ...th, cursor: col ? 'pointer' : 'default', userSelect: 'none' }}
                    onClick={() => col && alternarOrdenacao(col)}
                  >
                    {label}{col && seta(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {configsFiltrados.map((c, i) => {
                const cap = c.espacosPalete && c.cxPorPlt ? c.espacosPalete * parseInt(c.cxPorPlt) : null;
                const estaEditando = editando?.codProduto === c.codProduto;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={td}>{c.codProduto}</td>
                    <td style={td}><b>{c.nomeProduto}</b></td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {estaEditando
                        ? <input type="number" min="1" value={editando.espacosPalete} onChange={e => setEditando(ed => ({ ...ed, espacosPalete: e.target.value }))} style={{ ...inp, width: 70, textAlign: 'center' }} />
                        : c.espacosPalete}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{c.cxPorPlt || '-'}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#555' }}>{cap || '-'}</td>
                    <td style={td}>
                      {estaEditando ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => salvarEdicao(editando)} style={{ ...btnPrimario, padding: '5px 12px', fontSize: 12 }}>✓ Salvar</button>
                          <button onClick={() => setEditando(null)} style={{ ...btnSec, padding: '5px 10px', fontSize: 12 }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setEditando({ ...c })} style={{ ...btnSec, padding: '5px 10px', fontSize: 12 }}>✏️</button>
                          <button onClick={() => excluir(c.codProduto, c.nomeProduto)} style={{ ...btnExcluir, padding: '5px 10px', fontSize: 12 }}>✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const secao      = { backgroundColor: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const secaoTitulo = { color: '#333', fontSize: 16, fontWeight: 'bold', marginBottom: 16, marginTop: 0 };
const lbl        = { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 };
const inp        = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
const th         = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#666', fontWeight: '600', whiteSpace: 'nowrap' };
const td         = { padding: '10px 12px' };
const btnPrimario = { padding: '8px 16px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 };
const btnSec     = { padding: '8px 14px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnExcluir = { backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', color: '#E31837', fontWeight: 'bold' };
const dropdown   = { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: 8, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };
const dropItem   = { padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: 13 };
