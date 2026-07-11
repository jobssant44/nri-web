import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { useDb } from '../utils/db';
import { useUser } from '../context/UserContext';
import { useCatalogos } from '../context/CatalogosContext';
import { useNavigate } from 'react-router-dom';

function hojeFormatado() {
  const d = new Date();
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

function formatarData(texto) {
  const n = texto.replace(/[^0-9]/g, '');
  if (n.length <= 2) return n;
  if (n.length <= 4) return n.slice(0,2) + '/' + n.slice(2);
  return n.slice(0,2) + '/' + n.slice(2,4) + '/' + n.slice(4,8);
}

function validarData(data) {
  if (data.length !== 10) return false;
  const [dia, mes, ano] = data.split('/').map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2024 || ano > 2099) return false;
  return new Date(ano, mes-1, dia).getMonth() === mes-1;
}

export default function NovaNRI() {
  const { col, docRef, stamp } = useDb();
  const { produtos: produtosCtx, obterCurvaAbc } = useCatalogos();
  const { usuario } = useUser();
  const navigate = useNavigate();
  const [notaFiscal, setNotaFiscal] = useState('');
  const [placaCavalo, setPlacaCavalo] = useState('');
  const [placaCarreta, setPlacaCarreta] = useState('');
  const [motorista, setMotorista] = useState('');
  const [origem, setOrigem] = useState('');
  const [dataRecebimento, setDataRecebimento] = useState(hojeFormatado());
  const [produtos, setProdutos] = useState([]);
  const [baseProdutos, setBaseProdutos] = useState([]);
  const [curvaMap, setCurvaMap] = useState({});
  const [listaMotoristas, setListaMotoristas] = useState([]);
  const [listaCavalos, setListaCavalos] = useState([]);
  const [listaCarretas, setListaCarretas] = useState([]);
  const [listaOrigens, setListaOrigens] = useState([]);
  // Lookups bidirecionais Cavalo↔Carreta carregados de `pares_placas`.
  // Cadastrados em /cadastros → aba "Pares". Vazio = sem auto-puxa.
  const [paresPorCavalo,  setParesPorCavalo]  = useState({});
  const [paresPorCarreta, setParesPorCarreta] = useState({});
  const [codProduto, setCodProduto] = useState('');
  const [nomeProduto, setNomeProduto] = useState('');
  const [qtdPlt, setQtdPlt] = useState('');
  const [qtdCx, setQtdCx] = useState('');
  const [validade, setValidade] = useState('');
  const [sugestoes, setSugestoes] = useState([]);
  const [salvando, setSalvando] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregarDados(); }, [produtosCtx]);

  async function carregarDados() {
    // produtos e curva_abc vêm do Context (cache em memória — evita reler
    // milhares de docs da curva a cada abertura). Demais coleções são pequenas.
    const [mSnap, cSnap, crSnap, oSnap, curvaMapCache, paresSnap] = await Promise.all([
      getDocs(col('motoristas')),
      getDocs(col('cavalos')),
      getDocs(col('carretas')),
      getDocs(col('origens')),
      obterCurvaAbc(),
      getDocs(col('pares_placas')),
    ]);
    setBaseProdutos(produtosCtx || []);
    setListaMotoristas(mSnap.docs.map(d => d.data().valor));
    setListaCavalos(cSnap.docs.map(d => d.data().valor));
    setListaCarretas(crSnap.docs.map(d => d.data().valor));
    setListaOrigens(oSnap.docs.map(d => d.data().valor));
    setCurvaMap(curvaMapCache || {});
    // Mapas bidirecionais pra auto-preencher placa do par no NovaNRI
    const mapCavalo  = {};
    const mapCarreta = {};
    paresSnap.docs.forEach(d => {
      const { cavalo, carreta } = d.data();
      if (cavalo && carreta) {
        mapCavalo[cavalo]   = carreta;
        mapCarreta[carreta] = cavalo;
      }
    });
    setParesPorCavalo(mapCavalo);
    setParesPorCarreta(mapCarreta);
  }

  // cxPorPlt do produto atualmente selecionado (paletização). Usado pra
  // sincronizar Qtd PLT ↔ Qtd CX. Retorna 0 se não houver produto ou
  // se ele não tem paletização cadastrada (auto-sync desativa nesse caso).
  function getCxPorPltAtual() {
    if (!codProduto) return 0;
    const p = baseProdutos.find(x => String(x.codigo).trim() === String(codProduto).trim());
    return parseInt(p?.paletizacao || p?.cxPorPlt || '0') || 0;
  }

  // Handlers sincronizados: PLT é a quantidade em paletes (pode ser decimal,
  // ex: 2,5). CX é a mesma quantidade em caixas (sempre inteiro). Digitar
  // um auto-preenche o outro via cxPorPlt. PDF imprime sempre CX.
  function onChangeQtdPlt(texto) {
    // Aceita dígitos, vírgula ou ponto. Normaliza vírgula → ponto pra parse.
    const limpo = texto.replace(/[^0-9,.]/g, '');
    setQtdPlt(limpo);
    const cxPlt = getCxPorPltAtual();
    if (cxPlt > 0) {
      const plt = parseFloat(limpo.replace(',', '.'));
      if (!isNaN(plt) && plt >= 0) {
        // Caixas é sempre inteiro (truncamento Math.round dá 0,5 plt × 100 → 50 cx exato)
        setQtdCx(String(Math.round(plt * cxPlt)));
      } else if (!limpo) {
        setQtdCx('');
      }
    }
  }

  function onChangeQtdCx(texto) {
    const limpo = texto.replace(/[^0-9]/g, '');
    setQtdCx(limpo);
    const cxPlt = getCxPorPltAtual();
    if (cxPlt > 0) {
      const cx = parseInt(limpo, 10);
      if (!isNaN(cx) && cx >= 0) {
        // PLT pode ser decimal (250 cx / 100 cxPorPlt = 2,5 plt).
        // Mantém até 2 casas decimais e mostra com vírgula (pt-BR).
        const plt = Math.round((cx / cxPlt) * 100) / 100;
        setQtdPlt(String(plt).replace('.', ','));
      } else if (!limpo) {
        setQtdPlt('');
      }
    }
  }

  function buscarProduto(texto, campo) {
    if (campo === 'codigo') {
      setCodProduto(texto.replace(/[^0-9]/g, ''));
      setNomeProduto('');
      setSugestoes(texto.length >= 2 ? baseProdutos.filter(p => String(p.codigo).startsWith(texto)).slice(0,5) : []);
    } else {
      setNomeProduto(texto.toUpperCase());
      setCodProduto('');
      setSugestoes(texto.length >= 2 ? baseProdutos.filter(p => (p.descricao || '').toLowerCase().includes(texto.toLowerCase())).slice(0,5) : []);
    }
  }

  function selecionarProduto(p) {
    setCodProduto(p.codigo);
    setNomeProduto(p.descricao || '');
    setSugestoes([]);
  }

  function adicionarProduto() {
    if (!codProduto || !nomeProduto) { alert('Selecione um produto.'); return; }

    // ── Validação rigorosa: o par código+nome deve existir EXATAMENTE na base ──
    // Evita que o usuário digite um código válido com nome diferente (ou vice-versa)
    // e adicione produto "fantasma". Compara case-insensitive e ignora espaços nas pontas.
    const produtoBase = baseProdutos.find(p =>
      String(p.codigo).trim()                        === String(codProduto).trim() &&
      String(p.descricao || '').trim().toUpperCase() === nomeProduto.trim().toUpperCase()
    );
    if (!produtoBase) {
      alert(
        '❌ Produto inválido!\n\n' +
        'O código e o nome digitados não correspondem a nenhum produto da base.\n\n' +
        'Use a busca para selecionar um produto válido (clique em uma das sugestões).'
      );
      return;
    }

    if (!qtdPlt && !qtdCx) { alert('Preencha ao menos Qtd PLT ou Qtd CX.'); return; }
    if (!validarData(validade)) { alert('Data de validade inválida.'); return; }

    const cxPorPlt = produtoBase.paletizacao || produtoBase.cxPorPlt || '';
    const curva    = curvaMap[String(codProduto)] || null;
    // Flag `modeloNovo: true` indica que qtdPlt e qtdCx são sincronizados
    // (mesma quantidade em unidades diferentes), em vez de somados como no
    // modelo antigo. Usado pela função imprimirEtiquetas (NRIs.js) pra
    // escolher a regra correta de geração de páginas.
    setProdutos([...produtos, { codProduto, nomeProduto, qtdPlt, qtdCx, validade, cxPorPlt, curva, modeloNovo: true }]);
    setCodProduto(''); setNomeProduto(''); setQtdPlt(''); setQtdCx(''); setValidade(''); setSugestoes([]);
  }

  function removerProduto(i) {
    setProdutos(produtos.filter((_, idx) => idx !== i));
  }

  async function salvar() {
    if (!notaFiscal || !placaCavalo || !placaCarreta || !motorista || !origem) { alert('Preencha todos os campos do cabeçalho.'); return; }
    if (!validarData(dataRecebimento)) { alert('Data de recebimento inválida.'); return; }
    if (produtos.length === 0) { alert('Adicione pelo menos um produto.'); return; }
    setSalvando(true);
    try {
      await addDoc(col('nris'), {
        notaFiscal, placaCavalo, placaCarreta, motorista, origem,
        conferente: usuario.nome, produtos, dataRecebimento,
        ...stamp(),
        criadoEm: new Date().toISOString(),
      });
      alert('NRI salva com sucesso!');
      navigate('/nris');
    } catch (e) { alert('Erro: ' + e.message); }
    setSalvando(false);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Título */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 600,
          color: '#1a1a2e',
          marginBottom: 4,
        }}>
          Nova NRI
        </h1>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 0 }}>
          Cadastro de novo recebimento de mercadoria
        </p>
      </div>

      {/* Seção: Cabeçalho */}
      <div style={secao}>
        <h3 style={secaoTitulo}>📝 Informações do Recebimento</h3>
        <div style={grid2}>
          <div>
            <label style={lbl}>Data de Recebimento</label>
            <input
              style={inp}
              value={dataRecebimento}
              onChange={e => setDataRecebimento(formatarData(e.target.value))}
              maxLength={10}
              placeholder="DD/MM/AAAA"
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <label style={lbl}>Nº da Nota Fiscal</label>
            <input
              style={inp}
              value={notaFiscal}
              onChange={e => setNotaFiscal(e.target.value.replace(/[^0-9]/g,''))}
              placeholder="Ex: 123456"
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <label style={lbl}>Placa do Cavalo</label>
            <select
              style={inp}
              value={placaCavalo}
              onChange={e => {
                const v = e.target.value;
                setPlacaCavalo(v);
                // Auto-puxa a carreta do par se houver. Sobrescreve qualquer
                // valor atual (decisão do user em 02/06/26). Selecionar vazio
                // (apagar) NÃO toca na carreta — fica como estava.
                if (v && paresPorCavalo[v]) setPlacaCarreta(paresPorCavalo[v]);
              }}
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            >
              <option value="">Selecione...</option>
              {listaCavalos.map((v,i) => <option key={i} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Placa da Carreta</label>
            <select
              style={inp}
              value={placaCarreta}
              onChange={e => {
                const v = e.target.value;
                setPlacaCarreta(v);
                // Lookup recíproco: carreta → cavalo do par. Selecionar vazio
                // NÃO toca no cavalo (regra simétrica à do campo acima).
                if (v && paresPorCarreta[v]) setPlacaCavalo(paresPorCarreta[v]);
              }}
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            >
              <option value="">Selecione...</option>
              {listaCarretas.map((v,i) => <option key={i} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Motorista</label>
            <select
              style={inp}
              value={motorista}
              onChange={e => setMotorista(e.target.value)}
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            >
              <option value="">Selecione...</option>
              {listaMotoristas.map((v,i) => <option key={i} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Origem</label>
            <select
              style={inp}
              value={origem}
              onChange={e => setOrigem(e.target.value)}
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            >
              <option value="">Selecione...</option>
              {listaOrigens.map((v,i) => <option key={i} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Conferente</label>
            <input
              style={{ ...inp, backgroundColor: '#f9f9f9', color: '#888' }}
              value={usuario.nome}
              disabled
            />
          </div>
        </div>
      </div>

      {/* Seção: Adicionar Produto */}
      <div style={secao}>
        <h3 style={secaoTitulo}>📦 Adicionar Produto</h3>
        <div style={grid2}>
          <div style={{ position: 'relative' }}>
            <label style={lbl}>Código do Produto</label>
            <input
              style={inp}
              value={codProduto}
              onChange={e => buscarProduto(e.target.value, 'codigo')}
              placeholder="Digite o código..."
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            />
            {sugestoes.length > 0 && (
              <div style={dropdown}>
                {sugestoes.map((p,i) => (
                  <div key={i} style={dropItem} onClick={() => selecionarProduto(p)}>
                    <strong style={{ color: '#E31837' }}>{p.codigo}</strong> — {p.descricao}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <label style={lbl}>Nome do Produto</label>
            <input
              style={inp}
              value={nomeProduto}
              onChange={e => buscarProduto(e.target.value, 'nome')}
              placeholder="Digite o nome..."
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            />
            {sugestoes.length > 0 && nomeProduto && (
              <div style={dropdown}>
                {sugestoes.map((p,i) => (
                  <div key={i} style={dropItem} onClick={() => selecionarProduto(p)}>
                    <strong style={{ color: '#E31837' }}>{p.codigo}</strong> — {p.descricao}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Qtd PLT</label>
            <input
              style={inp}
              value={qtdPlt}
              onChange={e => onChangeQtdPlt(e.target.value)}
              placeholder="0"
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <label style={lbl}>Qtd CX</label>
            <input
              style={inp}
              value={qtdCx}
              onChange={e => onChangeQtdCx(e.target.value)}
              placeholder="0"
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <label style={lbl}>Data de Validade</label>
            <input
              style={inp}
              value={validade}
              onChange={e => setValidade(formatarData(e.target.value))}
              maxLength={10}
              placeholder="DD/MM/AAAA"
              onFocus={(e) => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.08)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>
        <button
          onClick={adicionarProduto}
          style={btnPrimario}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#c41730';
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 8px 16px rgba(227, 24, 55, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#E31837';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
          }}
        >
          ➕ Adicionar Produto
        </button>
      </div>

      {/* Seção: Produtos adicionados */}
      {produtos.length > 0 && (
        <div style={secao}>
          <h3 style={secaoTitulo}>✅ Produtos adicionados ({produtos.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #e0e0e0' }}>
                  {['Código', 'Produto', 'Qtd PLT', 'Qtd CX', 'Validade', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#555', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {produtos.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>{p.codProduto}</td>
                    <td style={{ padding: '12px 14px' }}>{p.nomeProduto}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>{p.qtdPlt || '-'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>{p.qtdCx || '-'}</td>
                    <td style={{ padding: '12px 14px', color: '#BA7517', fontWeight: 'bold' }}>{p.validade}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        onClick={() => removerProduto(i)}
                        style={{
                          color: '#E31837',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: 16,
                        }}
                        title="Remover produto"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Botão Salvar */}
      <button
        onClick={salvar}
        disabled={salvando}
        style={{
          ...btnSalvar,
          opacity: salvando ? 0.6 : 1,
          cursor: salvando ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!salvando) {
            e.target.style.backgroundColor = '#c41730';
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 8px 16px rgba(227, 24, 55, 0.3)';
          }
        }}
        onMouseLeave={(e) => {
          if (!salvando) {
            e.target.style.backgroundColor = '#E31837';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
          }
        }}
      >
        {salvando ? '⏳ Salvando...' : '💾 Salvar NRI'}
      </button>
    </div>
  );
}

const secao = {
  backgroundColor: '#fff',
  borderRadius: 8,
  border: '1px solid #f0f0f0',
  padding: 24,
  marginBottom: 20,
};

const secaoTitulo = {
  color: '#1a1a2e',
  fontSize: 16,
  fontWeight: 600,
  marginTop: 0,
  marginBottom: 20,
};

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };

const lbl = {
  fontSize: 13,
  fontWeight: 600,
  color: '#333',
  display: 'block',
  marginBottom: 8,
};

const inp = {
  width: '100%',
  padding: '11px 14px',
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
  transition: 'all 0.2s',
  outline: 'none',
  fontFamily: 'inherit',
};

const btnPrimario = {
  padding: '12px 20px',
  backgroundColor: '#E31837',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  marginTop: 16,
  transition: 'all 0.2s',
};

const btnSalvar = {
  width: '100%',
  padding: '16px',
  backgroundColor: '#E31837',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 16,
  marginTop: 12,
  marginBottom: 12,
  transition: 'all 0.2s',
};

const dropdown = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  backgroundColor: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  zIndex: 100,
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  marginTop: 4,
};

const dropItem = {
  padding: '10px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid #f0f0f0',
  fontSize: 13,
  transition: 'all 0.15s',
};

// Adicionar hover effects aos items do dropdown (via inline handler na renderização)
dropItem['_hover'] = { backgroundColor: '#f9f9f9' };