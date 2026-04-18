import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

function calcularData(dataStr, diasSubtrair) {
  if (!dataStr || dataStr.length !== 10) return '';
  const [d, m, y] = dataStr.split('/').map(Number);
  const data = new Date(y, m - 1, d);
  data.setDate(data.getDate() - diasSubtrair);
  return String(data.getDate()).padStart(2, '0') + '/' +
    String(data.getMonth() + 1).padStart(2, '0') + '/' +
    data.getFullYear();
}

const CSS_ETIQUETA = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 8mm; }
  body { font-family: Arial, sans-serif; }
  .pagina { height: 277mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
  .pagina:last-child { page-break-after: avoid; }
  .etiqueta { border: 2px solid #000; width: 100%; flex: 1; display: flex; flex-direction: column; margin-bottom: 4mm; }
  .etiqueta:last-child { margin-bottom: 0; }
  .linha1 { display: flex; align-items: stretch; border-bottom: 2px solid #000; flex: 0; }
  .curva { font-size: 80px; font-weight: bold; width: 100px; min-width: 100px; display: flex; align-items: center; justify-content: center; border-right: 2px solid #000; }
  .centro { flex: 1; padding: 8px; text-align: center; border-right: 2px solid #000; }
  .cod { font-size: 18px; font-weight: bold; text-decoration: underline; margin-bottom: 6px; }
  .cod span { font-size: 38px; }
  .nome { font-size: 16px; font-weight: bold; }
  .logo { width: 120px; min-width: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; gap: 4px; }
  .revenda { font-size: 13px; font-weight: bold; color: #1a5fa8; text-align: center; }
  .ambev { font-size: 24px; font-weight: bold; color: #1a5fa8; }
  .linha2 { border-bottom: 2px solid #000; padding: 0; text-align: center; flex: 1; display: flex; align-items: center; justify-content: center; }
  .venc-label { font-size: 28px; font-weight: bold; }
  .venc-data { font-size: 64px; font-weight: bold; margin-left: 10px; }
  .linha3 { display: flex; border-bottom: 2px solid #000; flex: 0; }
  .cel { flex: 1; padding: 8px; text-align: center; border-right: 1px solid #000; }
  .cel:last-child { border-right: none; }
  .cel-label { font-size: 14px; font-weight: bold; }
  .cel-valor { font-size: 16px; font-weight: bold; text-decoration: underline; }
  .linha4 { display: flex; flex: 0; }
  .col { flex: 1; padding: 8px; text-align: center; border-right: 1px solid #000; }
  .col:last-child { border-right: none; }
  .col-label { font-size: 12px; text-decoration: underline; }
  .col-valor { font-size: 14px; font-weight: bold; }
`;

function gerarBlocoEtiqueta(nri, produto) {
  const plt = parseInt(produto.qtdPlt || '0');
  const cx = parseInt(produto.qtdCx || '0');
  const cxPlt = parseInt(produto.cxPorPlt || '0');
  const qtdTT = cxPlt > 0 ? (plt * cxPlt) + cx : (plt + cx) || produto.quantidade || '';
  const preBloquio = calcularData(produto.validade, 45);
  const bloqueio = calcularData(produto.validade, 30);
  const curva = produto.curva || 'C';
  return `
    <div class="etiqueta">
      <div class="linha1">
        <div class="curva">${curva}</div>
        <div class="centro">
          <div class="cod">Cód: <span>${produto.codProduto}</span></div>
          <div class="nome">${produto.nomeProduto}</div>
        </div>
        <div class="logo">
          <div class="revenda">REVENDA CBM CARPINA</div>
          <div class="ambev">ambev</div>
        </div>
      </div>
      <div class="linha2">
        <span class="venc-label">Venc: </span>
        <span class="venc-data">${produto.validade}</span>
      </div>
      <div class="linha3">
        <div class="cel"><div class="cel-label">Receb.:</div><div class="cel-valor">${nri.dataRecebimento}</div></div>
        <div class="cel"><div class="cel-label">Pré-Bloq.:</div><div class="cel-valor">${preBloquio}</div></div>
        <div class="cel"><div class="cel-label">Bloqueio:</div><div class="cel-valor">${bloqueio}</div></div>
      </div>
      <div class="linha4">
        <div class="col"><div class="col-label">Conferente</div><div class="col-valor">${(nri.conferente || '').toUpperCase()}</div></div>
        <div class="col"><div class="col-label">Qtde TT</div><div class="col-valor">${qtdTT}</div></div>
        <div class="col"><div class="col-label">Origem</div><div class="col-valor">${(nri.origem || '').toUpperCase()}</div></div>
        <div class="col"><div class="col-label">Motorista</div><div class="col-valor">${(nri.motorista || '').toUpperCase()}</div></div>
        <div class="col"><div class="col-label">Placa do Veíc.</div><div class="col-valor">${(nri.placaCavalo || '').toUpperCase()}</div></div>
      </div>
    </div>`;
}

function imprimirEtiquetas(itens) {
  const paginas = itens.map(({ nri, produto }) => {
    const bloco = gerarBlocoEtiqueta(nri, produto);
    return `<div class="pagina">${bloco}${bloco}${bloco}</div>`;
  }).join('');
  const html = `<html><head><meta charset="utf-8"/><style>${CSS_ETIQUETA}</style></head><body>${paginas}</body></html>`;
  const janela = window.open('', '_blank');
  janela.document.write(html);
  janela.document.close();
  janela.focus();
  setTimeout(() => janela.print(), 500);
}

export default function NRIs({ usuario }) {
  const [nris, setNris] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState({});
  const [editandoValidade, setEditandoValidade] = useState(null);
  const [novaValidade, setNovaValidade] = useState('');

  useEffect(() => { carregarNRIs(); }, []);

  async function carregarNRIs() {
    setCarregando(true);
    const snap = await getDocs(collection(db, 'nris'));
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => {
      const ts = x => x.criadoEm ? new Date(x.criadoEm).getTime() : 0;
      return ts(b) - ts(a);
    });
    setNris(lista);
    setCarregando(false);
  }

  function parseDDMMAAAA(s) {
    if (!s || s.length !== 10) return null;
    const [d, m, y] = s.split('/');
    const dt = new Date(`${y}-${m}-${d}`);
    return isNaN(dt) ? null : dt;
  }

  async function excluir(id, nf) {
    if (!window.confirm(`Deseja excluir a NRI da NF: ${nf}?`)) return;
    await deleteDoc(doc(db, 'nris', id));
    carregarNRIs();
  }

  async function salvarValidade(nri, prodIndex) {
    if (!novaValidade || novaValidade.length !== 10) {
      alert('Informe a data no formato DD/MM/AAAA.'); return;
    }
    const novosProdutos = nri.produtos.map((p, i) =>
      i === prodIndex ? { ...p, validade: novaValidade } : p
    );
    try {
      await updateDoc(doc(db, 'nris', nri.id), { produtos: novosProdutos });
      setEditandoValidade(null);
      setNovaValidade('');
      carregarNRIs();
    } catch (e) { alert('Erro: ' + e.message); }
  }

  function toggleSelecao(nri, produto, idx) {
    const chave = `${nri.id}-${idx}`;
    setSelecionados(prev => {
      const novo = { ...prev };
      if (novo[chave]) delete novo[chave];
      else novo[chave] = { nri, produto };
      return novo;
    });
  }

  function cancelarSelecao() {
    setModoSelecao(false);
    setSelecionados({});
  }

  const dtInicio = parseDDMMAAAA(dataInicio);
  const dtFim = parseDDMMAAAA(dataFim);

  const filtradas = nris.filter(n => {
    const texto = filtro.toLowerCase();
    const passaTexto = !filtro || (
      n.notaFiscal?.includes(filtro) ||
      n.motorista?.toLowerCase().includes(texto) ||
      n.produtos?.some(p =>
        p.nomeProduto?.toLowerCase().includes(texto) ||
        p.validade?.includes(filtro)
      )
    );
    const dtNri = parseDDMMAAAA(n.dataRecebimento);
    const passaInicio = !dtInicio || !dtNri || dtNri >= dtInicio;
    const passaFim = !dtFim || !dtNri || dtNri <= dtFim;
    return passaTexto && passaInicio && passaFim;
  });

  const qtdSelecionados = Object.keys(selecionados).length;

  if (carregando) return <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Carregando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#333', margin: 0 }}>Consultar NRIs</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {modoSelecao ? (
            <button onClick={cancelarSelecao} style={btnSecundario}>✕ Cancelar seleção</button>
          ) : (
            <button onClick={() => setModoSelecao(true)} style={btnSelecionar}>☑ Selecionar etiquetas</button>
          )}
          <button onClick={carregarNRIs} style={btnSecundario}>🔄 Atualizar</button>
        </div>
      </div>

      <input
        style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
        placeholder="Buscar por NF, motorista, produto ou validade..."
        value={filtro}
        onChange={e => setFiltro(e.target.value)}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <input
          style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
          placeholder="De: DD/MM/AAAA"
          value={dataInicio}
          maxLength={10}
          onChange={e => setDataInicio(e.target.value)}
        />
        <input
          style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
          placeholder="Até: DD/MM/AAAA"
          value={dataFim}
          maxLength={10}
          onChange={e => setDataFim(e.target.value)}
        />
        {(dataInicio || dataFim) && (
          <button onClick={() => { setDataInicio(''); setDataFim(''); }} style={{ ...btnSecundario, color: '#aaa' }}>✕ Limpar</button>
        )}
      </div>

      {modoSelecao && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff8f8', border: '1px solid #E31837', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#555' }}>
            {qtdSelecionados === 0 ? 'Nenhuma etiqueta selecionada — expanda uma NRI e marque os produtos' : `${qtdSelecionados} etiqueta(s) selecionada(s)`}
          </span>
          <button
            onClick={() => imprimirEtiquetas(Object.values(selecionados))}
            disabled={qtdSelecionados === 0}
            style={qtdSelecionados === 0 ? btnDesabilitado : btnPDF}>
            📄 Gerar PDFs selecionados
          </button>
        </div>
      )}

      {filtradas.length === 0 && <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>Nenhuma NRI encontrada.</p>}

      {filtradas.map(item => (
        <div key={item.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 'bold', fontSize: 16, color: '#333' }}>NF: {item.notaFiscal}</span>
                <span style={{ fontSize: 13, color: '#999' }}>{item.dataRecebimento}</span>
              </div>
              <div style={{ fontSize: 13, color: '#555', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <span>🚗 Cavalo: {item.placaCavalo}</span>
                <span>🚛 Carreta: {item.placaCarreta}</span>
                <span>👤 Motorista: {item.motorista}</span>
                <span>📍 Origem: {item.origem}</span>
                <span>👷 Conferente: {item.conferente}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setExpandido(expandido === item.id ? null : item.id)} style={btnSecundario}>
                {expandido === item.id ? 'Recolher ▲' : `Ver ${item.produtos?.length || 0} produto(s) ▼`}
              </button>
              {usuario.nivel === 'supervisor' && !modoSelecao && (
                <button onClick={() => excluir(item.id, item.notaFiscal)} style={btnExcluir}>✕</button>
              )}
            </div>
          </div>

          {expandido === item.id && (
            <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9f9f9' }}>
                    {modoSelecao && <th style={thStyle}>Sel.</th>}
                    {['Código', 'Produto', 'Qtd PLT', 'Qtd CX', 'Validade', 'Etiqueta'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.produtos?.map((p, i) => {
                    const chaveSel = `${item.id}-${i}`;
                    const marcado = !!selecionados[chaveSel];
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #eee', backgroundColor: marcado ? '#fff3f3' : 'transparent' }}>
                        {modoSelecao && (
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => toggleSelecao(item, p, i)}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#E31837' }}
                            />
                          </td>
                        )}
                        <td style={{ padding: '8px 12px' }}>{p.codProduto}</td>
                        <td style={{ padding: '8px 12px' }}>{p.nomeProduto}</td>
                        <td style={{ padding: '8px 12px' }}>{p.qtdPlt || '-'}</td>
                        <td style={{ padding: '8px 12px' }}>{p.qtdCx || '-'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {editandoValidade === `${item.id}-${i}` ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input
                                value={novaValidade}
                                maxLength={10}
                                onChange={e => {
                                  const n = e.target.value.replace(/[^0-9]/g, '');
                                  let f = n;
                                  if (n.length > 2) f = n.slice(0,2) + '/' + n.slice(2);
                                  if (n.length > 4) f = n.slice(0,2) + '/' + n.slice(2,4) + '/' + n.slice(4,8);
                                  setNovaValidade(f);
                                }}
                                style={{ width: 110, padding: '4px 8px', border: '1px solid #E31837', borderRadius: 6, fontSize: 13 }}
                                placeholder="DD/MM/AAAA"
                              />
                              <button onClick={() => salvarValidade(item, i)} style={{ ...btnPDF, padding: '4px 10px' }}>✓</button>
                              <button onClick={() => { setEditandoValidade(null); setNovaValidade(''); }} style={{ ...btnSecundario, padding: '4px 10px' }}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#E31837', fontWeight: 'bold' }}>{p.validade}</span>
                              {usuario.nivel === 'supervisor' && !modoSelecao && (
                                <button onClick={() => { setEditandoValidade(`${item.id}-${i}`); setNovaValidade(p.validade || ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }} title="Editar validade">✏️</button>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {!modoSelecao && (
                            <button onClick={() => imprimirEtiquetas([{ nri: item, produto: p }])} style={btnPDFPequeno}>
                              📄 Etiqueta
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const card = { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #E31837' };
const thStyle = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#666' };
const btnSecundario = { padding: '8px 14px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnExcluir = { padding: '8px 12px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E31837', fontWeight: 'bold' };
const btnSelecionar = { padding: '8px 14px', backgroundColor: '#fff0f0', border: '1px solid #E31837', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#E31837', fontWeight: '600' };
const btnPDF = { padding: '8px 16px', backgroundColor: '#E31837', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 'bold' };
const btnPDFPequeno = { padding: '5px 10px', backgroundColor: '#E31837', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#fff' };
const btnDesabilitado = { padding: '8px 16px', backgroundColor: '#ccc', border: 'none', borderRadius: 8, cursor: 'not-allowed', fontSize: 13, color: '#fff', fontWeight: 'bold' };
