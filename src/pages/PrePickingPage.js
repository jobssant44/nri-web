import { useState, useEffect, useRef } from 'react';
import { getDocs, query, orderBy } from 'firebase/firestore';
import { useDb } from '../utils/db';
import { useSessionFilter } from '../hooks/useSessionFilter';
import { lerCache, salvarCache, invalidarCache } from '../utils/cache';

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function parsearData(str) {
  if (!str) return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
}

function diasDoMes(mesAno) {
  if (!mesAno || !/^\d{2}\/\d{4}$/.test(mesAno)) return [];
  const [mes, ano] = mesAno.split('/').map(Number);
  if (mes < 1 || mes > 12) return [];
  const total = new Date(ano, mes, 0).getDate();
  const result = [];
  for (let d = 1; d <= total; d++) {
    result.push(`${String(d).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`);
  }
  return result;
}

function dataParaChaveMes(dataStr) {
  if (!dataStr) return null;
  const p = dataStr.split('/');
  if (p.length !== 3) return null;
  return `${p[2]}-${p[1]}`;
}

const HOJE = new Date(); HOJE.setHours(0,0,0,0);

export default function PrePickingPage() {
  const { col, docRef } = useDb();
  const [anoSelecionado, setAnoSelecionado]     = useSessionFilter('prepick:ano', '');
  const [mesNumSelecionado, setMesNumSelecionado] = useSessionFilter('prepick:mes', '');
  const [mesesDisponiveis, setMesesDisponiveis]   = useState([]);
  const [vendasMap, setVendasMap]                 = useState({});
  const [busca, setBusca]                         = useSessionFilter('prepick:busca', '');
  const [carregando, setCarregando]               = useState(true);
  const [avulsasMap, setAvulsasMap]               = useState({});
  const [dataOS, setDataOS]                       = useState(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
  });
  const [dataOSAvulsas, setDataOSAvulsas]         = useState(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
  });

  const topScrollRef      = useRef(null);
  const tableContainerRef = useRef(null);
  const tableRef          = useRef(null);

  const mes        = anoSelecionado && mesNumSelecionado ? `${mesNumSelecionado}/${anoSelecionado}` : '';
  const anos       = [...new Set(mesesDisponiveis.map(m => m.split('-')[0]))].sort();
  const mesesDoAno = mesesDisponiveis.filter(m => m.startsWith(anoSelecionado)).map(m => m.split('-')[1]).sort();
  const diasMes    = diasDoMes(mes);

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    const top       = topScrollRef.current;
    const container = tableContainerRef.current;
    const table     = tableRef.current;
    if (!top || !container || !table) return;
    const inner = top.firstChild;
    if (inner) inner.style.width = `${table.scrollWidth}px`;
    const syncFromTop   = () => { container.scrollLeft = top.scrollLeft; };
    const syncFromTable = () => { top.scrollLeft = container.scrollLeft; };
    top.addEventListener('scroll', syncFromTop);
    container.addEventListener('scroll', syncFromTable);
    return () => {
      top.removeEventListener('scroll', syncFromTop);
      container.removeEventListener('scroll', syncFromTable);
    };
  }, [mes]);

  async function carregar(forcarAtualizacao = false) {
    setCarregando(true);
    try {
      if (forcarAtualizacao) invalidarCache('prepicking:vendasMap', 'prepicking:avulsasMap');

      let vMap = lerCache('prepicking:vendasMap');
      let aMap = lerCache('prepicking:avulsasMap');

      const promises = [];
      if (!vMap) promises.push(
        getDocs(query(col('vendas_prepicking'), orderBy('importadoEm', 'asc'))).then(snap => {
          const m = {};
          snap.docs.forEach(d => {
            (d.data().produtos || []).forEach(p => {
              const cod = String(p.codigo);
              if (!m[cod]) m[cod] = { descricao: p.descricao, vendas: {} };
              Object.entries(p.vendas || {}).forEach(([data, qtd]) => { m[cod].vendas[data] = qtd; });
            });
          });
          vMap = m;
          if (Object.keys(m).length > 0) salvarCache('prepicking:vendasMap', m);
        })
      );
      if (!aMap) promises.push(
        getDocs(query(col('vendas_avulsas'), orderBy('importadoEm', 'asc'))).then(snap => {
          const m = {};
          snap.docs.forEach(d => {
            (d.data().produtos || []).forEach(p => {
              const cod = String(p.codigo);
              if (!m[cod]) m[cod] = { descricao: p.descricao, avulsas: {} };
              Object.entries(p.avulsas || {}).forEach(([data, qtd]) => { m[cod].avulsas[data] = qtd; });
            });
          });
          aMap = m;
          if (Object.keys(m).length > 0) salvarCache('prepicking:avulsasMap', m);
        })
      );
      await Promise.all(promises);

      const mesesSet = new Set();
      Object.values(vMap || {}).forEach(p => Object.keys(p.vendas).forEach(d => { const c = dataParaChaveMes(d); if (c) mesesSet.add(c); }));
      const meses = [...mesesSet].sort().reverse();
      setMesesDisponiveis(meses);
      setVendasMap(vMap || {});
      setAvulsasMap(aMap || {});

      const chaveAtual = anoSelecionado && mesNumSelecionado ? `${anoSelecionado}-${mesNumSelecionado}` : null;
      const chaveUsar  = (chaveAtual && meses.includes(chaveAtual)) ? chaveAtual : (meses[0] || null);
      if (chaveUsar) {
        const [ano, mesNum] = chaveUsar.split('-');
        setAnoSelecionado(ano);
        setMesNumSelecionado(mesNum);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  const linhas = Object.entries(vendasMap).map(([cod, { descricao, vendas }]) => {
    let totalVendas = 0;
    const daysData = diasMes.map(dateStr => {
      const qtd = vendas[dateStr] || 0;
      totalVendas += qtd;
      const d      = parsearData(dateStr);
      const isDom  = d.getDay() === 0;
      const isFuture = d > HOJE;
      return { dateStr, qtd, isDom, isFuture };
    });
    if (totalVendas === 0) return null;
    return { codProduto: cod, nomeProduto: descricao, daysData, totalVendas };
  }).filter(Boolean);

  const buscaLower      = busca.toLowerCase();
  const linhasFiltradas = busca
    ? linhas.filter(l => String(l.codProduto).includes(buscaLower) || (l.nomeProduto || '').toLowerCase().includes(buscaLower))
    : linhas;
  const linhasOrdenadas = [...linhasFiltradas].sort((a, b) => parseInt(a.codProduto) - parseInt(b.codProduto));

  function gerarOS() {
    if (!dataOS) { alert('Selecione uma data.'); return; }
    const [aaaa, mmOS, ddOS] = dataOS.split('-');
    const dataFormatada = `${ddOS}/${mmOS}/${aaaa}`;
    const dateObj = new Date(parseInt(aaaa), parseInt(mmOS)-1, parseInt(ddOS));
    if (dateObj.getDay() === 0) { alert('Domingo não tem operação.'); return; }

    const itens = [];
    for (const l of linhas) {
      const day = l.daysData.find(d => d.dateStr === dataFormatada);
      if (!day || day.isDom || day.isFuture || day.qtd <= 0) continue;
      itens.push({ codigo: l.codProduto, nome: l.nomeProduto, qtd: day.qtd });
    }

    if (itens.length === 0) {
      alert(`Nenhum produto com vendas em ${dataFormatada}.`);
      return;
    }

    const totalCx  = itens.reduce((s, i) => s + i.qtd, 0);
    const logoUrl  = window.location.origin + '/LogoCBM.png';
    const agora    = new Date();
    const geradoEm = `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;

    const linhasTabela = itens
      .sort((a, b) => parseInt(a.codigo) - parseInt(b.codigo))
      .map((item, idx) => `
        <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f4f8ff'}">
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#E31837;font-size:12px">${item.codigo}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;font-size:12px">${item.nome}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;font-size:15px;color:#1D5A9E">${item.qtd}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;color:#999;font-size:12px"></td>
        </tr>
      `).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>OS Pré-Picking ${dataFormatada}</title>
  <style>
    @media print {
      body { margin: 0; }
      @page { size: A4; margin: 14mm 12mm; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 0; margin: 0; }
    .page { padding: 14px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #E31837; padding-bottom: 8px; margin-bottom: 10px; }
    .logo-block { display: flex; align-items: center; gap: 10px; }
    .logo { height: 48px; object-fit: contain; }
    .company-name { font-size: 14px; font-weight: bold; color: #1D5A9E; line-height: 1.2; }
    .title-block { text-align: right; }
    .os-title { font-size: 17px; font-weight: bold; color: #1D5A9E; letter-spacing: 0.3px; }
    .os-date { font-size: 13px; color: #E31837; font-weight: bold; margin-top: 2px; }
    .os-sub { font-size: 10px; color: #999; margin-top: 1px; }
    .totals { display: flex; gap: 24px; background: #eef4ff; border: 1px solid #c0cce8; border-radius: 6px; padding: 7px 16px; margin-bottom: 10px; }
    .total-item { text-align: center; }
    .total-num { font-size: 24px; font-weight: bold; color: #1D5A9E; line-height: 1; }
    .total-label { font-size: 10px; color: #666; margin-top: 1px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1D5A9E; color: white; }
    thead th { padding: 5px 8px; text-align: center; font-size: 11px; font-weight: bold; border: 1px solid #1a4f8a; }
    thead th.left { text-align: left; }
    .footer { margin-top: 10px; font-size: 10px; color: #bbb; border-top: 1px solid #eee; padding-top: 6px; display: flex; justify-content: space-between; }
    .sign-area { margin-top: 20px; display: flex; gap: 30px; }
    .sign-box { flex: 1; border-top: 1px solid #999; padding-top: 4px; font-size: 10px; color: #666; text-align: center; }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-block">
      <img src="${logoUrl}" class="logo" onerror="this.style.display='none'" alt="CBM" />
      <div><div class="company-name">CBM Carpina</div></div>
    </div>
    <div class="title-block">
      <div class="os-title">Ordem de Serviço</div>
      <div class="os-title" style="font-size:14px;color:#555">Pré-Picking — Ambev</div>
      <div class="os-date">📅 ${dataFormatada}</div>
      <div class="os-sub">Gerado em ${geradoEm}</div>
    </div>
  </div>
  <div class="totals">
    <div class="total-item">
      <div class="total-num">${itens.length}</div>
      <div class="total-label">produtos</div>
    </div>
    <div class="total-item">
      <div class="total-num">${totalCx}</div>
      <div class="total-label">caixas vendidas</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:70px">Código</th>
        <th class="left">Produto</th>
        <th style="width:90px">Caixas</th>
        <th style="width:90px">Conferência</th>
      </tr>
    </thead>
    <tbody>${linhasTabela}</tbody>
  </table>
  <div class="sign-area">
    <div class="sign-box">Conferente Responsável</div>
    <div class="sign-box">Supervisor</div>
    <div class="sign-box">Hora de Início</div>
    <div class="sign-box">Hora de Conclusão</div>
  </div>
  <div class="footer">
    <span>CBM Carpina · Sistema de Gestão de Reabastecimento</span>
    <span>OS Pré-Picking — ${dataFormatada}</span>
  </div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=960,height=750');
    if (!w) { alert('Popup bloqueado! Permita popups para este site e tente novamente.'); return; }
    w.document.write(html);
    w.document.close();
  }

  function gerarOSAvulsas() {
    if (!dataOSAvulsas) { alert('Selecione uma data.'); return; }
    const [aaaa, mmOS, ddOS] = dataOSAvulsas.split('-');
    const dataFormatada = `${ddOS}/${mmOS}/${aaaa}`;
    const dateObj = new Date(parseInt(aaaa), parseInt(mmOS)-1, parseInt(ddOS));
    if (dateObj.getDay() === 0) { alert('Domingo não tem operação.'); return; }

    const itens = [];
    Object.entries(avulsasMap).forEach(([cod, { descricao, avulsas }]) => {
      const qtd = avulsas[dataFormatada] || 0;
      if (qtd > 0) itens.push({ codigo: cod, nome: descricao, qtd });
    });

    if (itens.length === 0) {
      alert(`Nenhum produto com unidades avulsas em ${dataFormatada}.`);
      return;
    }

    const totalUnidades = itens.reduce((s, i) => s + i.qtd, 0);
    const logoUrl  = window.location.origin + '/LogoCBM.png';
    const agora    = new Date();
    const geradoEm = `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;

    const linhasTabela = itens
      .sort((a, b) => parseInt(a.codigo) - parseInt(b.codigo))
      .map((item, idx) => `
        <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f4f8ff'}">
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#E31837;font-size:12px">${item.codigo}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;font-size:12px">${item.nome}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;font-size:15px;color:#1D5A9E">${item.qtd}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;color:#999;font-size:12px"></td>
        </tr>
      `).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>OS Marketplace e Unidades Avulsas ${dataFormatada}</title>
  <style>
    @media print { body { margin: 0; } @page { size: A4; margin: 14mm 12mm; } .no-print { display: none !important; } }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 0; margin: 0; }
    .page { padding: 14px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #E31837; padding-bottom: 8px; margin-bottom: 10px; }
    .logo-block { display: flex; align-items: center; gap: 10px; }
    .logo { height: 48px; object-fit: contain; }
    .company-name { font-size: 14px; font-weight: bold; color: #1D5A9E; line-height: 1.2; }
    .title-block { text-align: right; }
    .os-title { font-size: 17px; font-weight: bold; color: #1D5A9E; letter-spacing: 0.3px; }
    .os-date { font-size: 13px; color: #E31837; font-weight: bold; margin-top: 2px; }
    .os-sub { font-size: 10px; color: #999; margin-top: 1px; }
    .totals { display: flex; gap: 24px; background: #eef4ff; border: 1px solid #c0cce8; border-radius: 6px; padding: 7px 16px; margin-bottom: 10px; }
    .total-item { text-align: center; }
    .total-num { font-size: 24px; font-weight: bold; color: #1D5A9E; line-height: 1; }
    .total-label { font-size: 10px; color: #666; margin-top: 1px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1D5A9E; color: white; }
    thead th { padding: 5px 8px; text-align: center; font-size: 11px; font-weight: bold; border: 1px solid #1a4f8a; }
    thead th.left { text-align: left; }
    .footer { margin-top: 10px; font-size: 10px; color: #bbb; border-top: 1px solid #eee; padding-top: 6px; display: flex; justify-content: space-between; }
    .sign-area { margin-top: 20px; display: flex; gap: 30px; }
    .sign-box { flex: 1; border-top: 1px solid #999; padding-top: 4px; font-size: 10px; color: #666; text-align: center; }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-block">
      <img src="${logoUrl}" class="logo" onerror="this.style.display='none'" alt="CBM" />
      <div><div class="company-name">CBM Carpina</div></div>
    </div>
    <div class="title-block">
      <div class="os-title">Ordem de Serviço</div>
      <div class="os-title" style="font-size:14px;color:#555">Marketplace e Unidades Avulsas</div>
      <div class="os-date">📅 ${dataFormatada}</div>
      <div class="os-sub">Gerado em ${geradoEm}</div>
    </div>
  </div>
  <div class="totals">
    <div class="total-item">
      <div class="total-num">${itens.length}</div>
      <div class="total-label">produtos</div>
    </div>
    <div class="total-item">
      <div class="total-num">${totalUnidades}</div>
      <div class="total-label">unidades avulsas</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:70px">Código</th>
        <th class="left">Produto</th>
        <th style="width:90px">Unidades</th>
        <th style="width:90px">Conferência</th>
      </tr>
    </thead>
    <tbody>${linhasTabela}</tbody>
  </table>
  <div class="sign-area">
    <div class="sign-box">Conferente Responsável</div>
    <div class="sign-box">Supervisor</div>
    <div class="sign-box">Hora de Início</div>
    <div class="sign-box">Hora de Conclusão</div>
  </div>
  <div class="footer">
    <span>CBM Carpina · Sistema de Gestão de Reabastecimento</span>
    <span>OS Marketplace e Unidades Avulsas — ${dataFormatada}</span>
  </div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=960,height=750');
    if (!w) { alert('Popup bloqueado! Permita popups para este site e tente novamente.'); return; }
    w.document.write(html);
    w.document.close();
  }

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ Carregando...</div>;

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Pré-Picking</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>Ano:</label>
          <select
            value={anoSelecionado}
            onChange={e => {
              const novoAno = e.target.value;
              const mesesNoAno = mesesDisponiveis.filter(m => m.startsWith(novoAno)).map(m => m.split('-')[1]).sort();
              setAnoSelecionado(novoAno);
              setMesNumSelecionado(mesesNoAno[mesesNoAno.length-1] || '');
            }}
            style={inpStyle}
          >
            {anos.length === 0 && <option value="">—</option>}
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>Mês:</label>
          <select
            value={mesNumSelecionado}
            onChange={e => setMesNumSelecionado(e.target.value)}
            style={{ ...inpStyle, width: 130 }}
          >
            {mesesDoAno.length === 0 && <option value="">—</option>}
            {mesesDoAno.map(m => <option key={m} value={m}>{MESES_NOME[parseInt(m)-1]}</option>)}
          </select>

          <button onClick={() => carregar(true)} style={btnSec}>🔄 Atualizar</button>
          <input
            type="text"
            placeholder="🔍 Filtrar produto..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ ...inpStyle, width: 210 }}
          />
          {busca && <button onClick={() => setBusca('')} style={{ ...btnSec, padding: '7px 10px' }}>✕</button>}
        </div>
      </div>

      {/* OS Card */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderLeft: '4px solid #E31837' }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: '#E31837' }}>📋 OS de Pré-Picking</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Data da OS:</label>
          <input
            type="date"
            value={dataOS}
            onChange={e => setDataOS(e.target.value)}
            style={{ ...inpStyle, fontSize: 13, width: 150 }}
          />
        </div>
        <button
          onClick={gerarOS}
          style={{ padding: '8px 18px', backgroundColor: '#E31837', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
        >
          🖨️ Gerar OS de Pré-Picking - Ambev
        </button>
        <span style={{ fontSize: 11, color: '#aaa' }}>Gera os produtos com vendas no dia selecionado</span>
      </div>

      {/* OS Avulsas Card */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '12px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderLeft: '4px solid #1D5A9E' }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: '#1D5A9E' }}>🛒 OS de Marketplace e Unidades Avulsas</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Data da OS:</label>
          <input
            type="date"
            value={dataOSAvulsas}
            onChange={e => setDataOSAvulsas(e.target.value)}
            style={{ ...inpStyle, fontSize: 13, width: 150 }}
          />
        </div>
        <button
          onClick={gerarOSAvulsas}
          style={{ padding: '8px 18px', backgroundColor: '#1D5A9E', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
        >
          🖨️ Gerar OS de Marketplace e Unidades Avulsas
        </button>
        <span style={{ fontSize: 11, color: '#aaa' }}>Todos os produtos com unidades avulsas no dia selecionado</span>
      </div>

      {/* Planificador */}
      {!mes || diasMes.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#999' }}>
          {mesesDisponiveis.length === 0
            ? 'Nenhum dado de Pré-Picking. Reimporte o relatório 03.02.36.08 para capturar os produtos fora do picking.'
            : 'Selecione um mês válido.'}
        </div>
      ) : linhasOrdenadas.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#999' }}>
          Nenhum produto de Pré-Picking com vendas em {MESES_NOME[parseInt(mesNumSelecionado)-1]}/{anoSelecionado}.
        </div>
      ) : (
        <div style={card}>
          <div style={{ marginBottom: 10, fontSize: 11, color: '#888' }}>
            {linhasOrdenadas.length} produto(s){busca ? ` — filtro: "${busca}"` : ''} &nbsp;·&nbsp; {diasMes.length} dia(s) &nbsp;·&nbsp; domingos sem operação
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 30, pointerEvents: 'none', zIndex: 6 }}>
              <button
                onClick={() => tableContainerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                style={{ position: 'sticky', top: 'calc(50vh - 15px)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: 'none', backgroundColor: 'rgba(227,24,55,0.80)', color: 'white', cursor: 'pointer', fontSize: 13, boxShadow: '0 2px 6px rgba(0,0,0,0.30)', pointerEvents: 'all' }}>◀</button>
            </div>
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 30, pointerEvents: 'none', zIndex: 6 }}>
              <button
                onClick={() => tableContainerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                style={{ position: 'sticky', top: 'calc(50vh - 15px)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: 'none', backgroundColor: 'rgba(227,24,55,0.80)', color: 'white', cursor: 'pointer', fontSize: 13, boxShadow: '0 2px 6px rgba(0,0,0,0.30)', pointerEvents: 'all' }}>▶</button>
            </div>

            <div ref={topScrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', height: 14, marginBottom: 2 }}>
              <div style={{ height: 1 }} />
            </div>

            <div ref={tableContainerRef} style={{ overflowX: 'auto' }}>
              <table ref={tableRef} style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ ...thBase, ...thFixo, minWidth: 55 }}>Cód</th>
                    <th style={{ ...thBase, ...thFixo, textAlign: 'left', minWidth: 180 }}>Produto</th>
                    {diasMes.map(dateStr => {
                      const dow   = parsearData(dateStr).getDay();
                      const isDom = dow === 0;
                      return (
                        <th key={dateStr} style={{ ...thBase, backgroundColor: isDom ? '#9e9e9e' : '#E31837', color: '#fff', fontSize: 11, padding: '5px 3px' }}>
                          {dateStr.slice(0,2)}
                        </th>
                      );
                    })}
                    <th style={{ ...thBase, backgroundColor: '#a01025', color: '#fff', borderLeft: '3px solid #7a0010', minWidth: 65 }}>Total</th>
                  </tr>
                  <tr>
                    <th colSpan={2} style={{ backgroundColor: '#f5f5f5', padding: '2px', borderBottom: '1px solid #ddd' }} />
                    {diasMes.map(dateStr => {
                      const dow   = parsearData(dateStr).getDay();
                      const isDom = dow === 0;
                      return (
                        <th key={dateStr} style={{ backgroundColor: isDom ? '#bdbdbd' : '#f07080', color: isDom ? '#fff' : '#7a0010', padding: '2px', fontSize: 9, textAlign: 'center', fontWeight: 600 }}>
                          {DIAS_SEMANA[dow]}
                        </th>
                      );
                    })}
                    <th style={{ backgroundColor: '#f5f5f5', borderLeft: '3px solid #f5c0c8' }} />
                  </tr>
                </thead>
                <tbody>
                  {linhasOrdenadas.map((l, i) => (
                    <tr key={l.codProduto} style={{ backgroundColor: i%2===0 ? '#fff' : '#fff8f8', borderBottom: '1px solid #eee' }}>
                      <td style={{ ...tdBase, fontWeight: 'bold', color: '#E31837' }}>{l.codProduto}</td>
                      <td style={{ ...tdBase, textAlign: 'left' }}>{l.nomeProduto}</td>
                      {l.daysData.map(({ dateStr, qtd, isDom, isFuture }) => (
                        <td key={dateStr} style={{
                          ...tdBase,
                          backgroundColor: isDom ? '#f0f0f0' : undefined,
                          color: isDom ? '#bbb' : isFuture ? '#ccc' : qtd > 0 ? '#c0392b' : '#ddd',
                          fontWeight: qtd > 0 && !isDom ? 'bold' : 'normal',
                        }}>
                          {isDom ? '—' : qtd > 0 ? qtd : '—'}
                        </td>
                      ))}
                      <td style={{ ...tdBase, fontWeight: 'bold', color: '#E31837', backgroundColor: '#fff0f0', borderLeft: '3px solid #f5c0c8' }}>
                        {l.totalVendas || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 10, color: '#999', borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
            Valores = caixas vendidas por dia · — = sem venda · domingos sem operação
          </div>
        </div>
      )}
    </div>
  );
}

const inpStyle = { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };
const btnSec   = { padding: '7px 12px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const card     = { backgroundColor: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const thBase   = { padding: '5px 6px', fontWeight: 'bold', textAlign: 'center', position: 'sticky', top: 0, userSelect: 'none', zIndex: 1 };
const thFixo   = { backgroundColor: '#E31837', color: '#fff', borderRight: '1px solid #c0102a' };
const tdBase   = { padding: '4px 6px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee', textAlign: 'center', fontSize: 11 };
