import { useState, useEffect } from 'react';
import { getDocs, query, where } from 'firebase/firestore';
import { useDb } from '../utils/db';

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function dataParaChaveMes(dataStr) {
  if (!dataStr) return null;
  const p = dataStr.split('/');
  if (p.length !== 3) return null;
  return `${p[2]}-${p[1]}`;
}

function formatarMes(chave) {
  if (!chave) return '';
  const [ano, mes] = chave.split('-');
  return `${MESES_NOME[parseInt(mes) - 1].slice(0, 3)}/${ano.slice(2)}`;
}

export default function ResultadoIV() {
  const { col } = useDb();
  const [carregando, setCarregando]         = useState(true);
  const [erro, setErro]                     = useState('');
  const [pickingPorMes, setPickingPorMes]   = useState({});
  const [abastecimentos, setAbastecimentos] = useState([]);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      // Limita abastecimentos a 6 meses (suficiente pra comparativos de resultado).
      const corte = new Date();
      corte.setMonth(corte.getMonth() - 6);
      const [snapPicking, snapAbasts] = await Promise.all([
        getDocs(col('picking_config_mensal')),
        getDocs(query(col('abastecimentos'),
          where('criadoEm', '>=', corte.toISOString()))),
      ]);

      const ppm = {};
      snapPicking.docs.forEach(d => {
        ppm[d.id] = (d.data().produtos || []).map(p => ({
          codProduto:    String(p.codProduto),
          nomeProduto:   p.nomeProduto || String(p.codProduto),
          espacosPalete: parseInt(p.espacosPalete) || 0,
        }));
      });
      setPickingPorMes(ppm);
      setAbastecimentos(snapAbasts.docs.map(d => d.data()));
    } catch (e) {
      setErro('Erro ao carregar dados: ' + e.message);
    } finally {
      setCarregando(false);
    }
  }

  // ── Meses em ordem cronológica ─────────────────────────────────────────────
  const mesesOrd = Object.keys(pickingPorMes).sort();

  // ── Mapa: cod → { mes → espacos } ──────────────────────────────────────────
  const espacosHistorico = {};
  const nomesProdutos    = {};
  for (const mes of mesesOrd) {
    for (const p of pickingPorMes[mes]) {
      if (!espacosHistorico[p.codProduto]) espacosHistorico[p.codProduto] = {};
      espacosHistorico[p.codProduto][mes] = p.espacosPalete;
      nomesProdutos[p.codProduto] = p.nomeProduto;
    }
  }

  // ── Detecta produtos com PELO MENOS UM AUMENTO entre meses consecutivos ───
  //
  // Vai além da comparação primeiro × último: percorre todas as transições
  // mês-a-mês e marca qualquer aumento, mesmo que tenha tido decréscimo depois.
  // Também registra em quais meses houve a mudança positiva pra destacar visualmente.
  //
  const produtosComAumento = [];
  for (const cod in espacosHistorico) {
    const valoresPorMes = mesesOrd
      .map(m => ({ mes: m, valor: espacosHistorico[cod][m] }))
      .filter(x => x.valor !== undefined);
    if (valoresPorMes.length < 2) continue;

    const mesesMudanca = {}; // { mes → delta (positivo ou negativo) }
    let teveAumento = false;
    for (let i = 1; i < valoresPorMes.length; i++) {
      const delta = valoresPorMes[i].valor - valoresPorMes[i - 1].valor;
      if (delta !== 0) {
        mesesMudanca[valoresPorMes[i].mes] = delta;
        if (delta > 0) teveAumento = true;
      }
    }
    if (!teveAumento) continue;

    produtosComAumento.push({
      cod,
      nome:        nomesProdutos[cod],
      primeiro:    valoresPorMes[0].valor,
      ultimo:      valoresPorMes[valoresPorMes.length - 1].valor,
      mesesMudanca,
      saldo:       valoresPorMes[valoresPorMes.length - 1].valor - valoresPorMes[0].valor,
    });
  }
  // Ordena pelos que mais ganharam espaço primeiro (saldo desc, e depois cód)
  produtosComAumento.sort((a, b) => b.saldo - a.saldo || a.cod.localeCompare(b.cod));

  // ── Ressup por mês por produto (só dos produtos filtrados) ─────────────────
  const codsFiltrados = new Set(produtosComAumento.map(p => p.cod));
  const ressupMap = {}; // cod → { mes → paletes }
  abastecimentos
    .filter(a => a.tipo === 'ressuprimento')
    .forEach(a => {
      const cod = String(a.codProduto);
      if (!codsFiltrados.has(cod)) return;
      const mes = dataParaChaveMes(a.dataOperacional);
      if (!mes) return;
      if (!ressupMap[cod]) ressupMap[cod] = {};
      ressupMap[cod][mes] = (ressupMap[cod][mes] || 0) + (a.qtdPaletes || 1);
    });

  // ── Totais por mês (rodapé) ────────────────────────────────────────────────
  const totaisPorMes = {};
  mesesOrd.forEach(m => {
    totaisPorMes[m] = produtosComAumento.reduce((s, p) => s + (ressupMap[p.cod]?.[m] || 0), 0);
  });
  const totalGeral = produtosComAumento.reduce(
    (s, p) => s + mesesOrd.reduce((ss, m) => ss + (ressupMap[p.cod]?.[m] || 0), 0),
    0
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (carregando) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>⏳ Carregando dados...</div>;
  }

  if (erro) {
    return (
      <div style={{ padding: 20, backgroundColor: '#fee2e2', borderRadius: 8, color: '#991b1b' }}>
        {erro}
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: '#333', margin: 0 }}>📈 Resultado — Produtos que ganharam espaço no picking</h2>
        <p style={{ fontSize: 13, color: '#888', marginTop: 6, marginBottom: 0 }}>
          Histórico de ressuprimentos mês a mês dos produtos cuja quantidade de espaços no picking foi
          aumentada em algum momento. Os meses em que houve mudança ficam destacados.
        </p>
      </div>

      {mesesOrd.length < 2 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#999' }}>
          São necessários pelo menos 2 meses com Picking Config salvo para comparar mudanças.<br />
          Atualmente: <b>{mesesOrd.length}</b> mês(es) registrado(s).
        </div>
      ) : produtosComAumento.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: '#999' }}>
          Nenhum produto teve aumento de espaços entre meses consecutivos.
        </div>
      ) : (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={titulo}>
              {produtosComAumento.length} produto(s) com aumento · {mesesOrd.length} meses · Total: <b style={{ color: '#1D5A9E' }}>{totalGeral}</b> plt ressup
            </h3>
            <span style={{ fontSize: 11, color: '#888' }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }} />
              célula azul = mês com aumento &nbsp;·&nbsp;
              <span style={{ display: 'inline-block', width: 12, height: 12, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 3, verticalAlign: 'middle', marginRight: 4 }} />
              célula vermelha = mês com redução
            </span>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 700, whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ backgroundColor: '#1a1a2e' }}>
                  <th style={{ ...thFixo, textAlign: 'left', minWidth: 260, position: 'sticky', left: 0, zIndex: 2 }}>Produto</th>
                  <th style={{ ...thFixo, textAlign: 'center', minWidth: 80 }}>Antes → Depois</th>
                  {mesesOrd.map(m => (
                    <th key={m} style={{ ...thMes, minWidth: 70 }}>{formatarMes(m)}</th>
                  ))}
                  {/* Coluna "Total" ocultada — pra reativar, descomente */}
                  {/* <th style={{ ...thFixo, textAlign: 'center', minWidth: 70, borderLeft: '3px solid #7a0010' }}>Total</th> */}
                </tr>
              </thead>
              <tbody>
                {produtosComAumento.map((p, i) => {
                  const total = mesesOrd.reduce((s, m) => s + (ressupMap[p.cod]?.[m] || 0), 0);
                  const bgRow = i % 2 === 0 ? '#fff' : '#fafafa';
                  return (
                    <tr key={p.cod} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', backgroundColor: bgRow, position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #e5e7eb' }}>
                        <div style={{ fontWeight: '600', color: '#333' }}>{p.nome}</div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>Cód: {p.cod}</div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', backgroundColor: bgRow }}>
                        <span style={{ color: '#64748b' }}>{p.primeiro}</span>
                        <span style={{ color: '#aaa', margin: '0 4px' }}>→</span>
                        <span style={{ color: '#1D5A9E', fontWeight: 'bold' }}>{p.ultimo}</span>
                        <div style={{ fontSize: 10, color: p.saldo > 0 ? '#1D5A9E' : '#E31837', fontWeight: 'bold', marginTop: 2 }}>
                          {p.saldo > 0 ? `+${p.saldo}` : p.saldo}
                        </div>
                      </td>
                      {mesesOrd.map(m => {
                        const valor = ressupMap[p.cod]?.[m] || 0;
                        const delta = p.mesesMudanca[m]; // undefined, positivo ou negativo
                        let bgCell = bgRow;
                        if (delta > 0)      bgCell = '#dbeafe';
                        else if (delta < 0) bgCell = '#fee2e2';
                        return (
                          <td key={m} style={{
                            padding: '8px 6px',
                            textAlign: 'center',
                            backgroundColor: bgCell,
                            fontWeight: valor > 0 ? 'bold' : 'normal',
                            color: valor > 0 ? '#E31837' : '#ccc',
                            position: 'relative',
                          }}>
                            {valor > 0 ? valor : '—'}
                            {delta !== undefined && (
                              <div style={{
                                position: 'absolute',
                                top: 1, right: 3,
                                fontSize: 8,
                                color: delta > 0 ? '#1D5A9E' : '#E31837',
                                fontWeight: 'bold',
                              }}>
                                {delta > 0 ? `+${delta}` : delta}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {/* Coluna "Total" ocultada — pra reativar, descomente */}
                      {/* <td style={{
                        padding: '8px 10px',
                        textAlign: 'center',
                        backgroundColor: total > 0 ? '#fff0f0' : bgRow,
                        fontWeight: 'bold',
                        color: total > 0 ? '#E31837' : '#ccc',
                        borderLeft: '3px solid #f5c0c8',
                      }}>
                        {total || '—'}
                      </td> */}
                    </tr>
                  );
                })}
              </tbody>
              {/* Linha "Total por mês" ocultada — pra reativar, descomente o <tfoot> abaixo */}
              {/* <tfoot>
                <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#555', position: 'sticky', left: 0, backgroundColor: '#f8fafc', borderRight: '1px solid #e5e7eb' }}>
                    Total por mês
                  </td>
                  <td style={{ padding: '10px', backgroundColor: '#f8fafc' }} />
                  {mesesOrd.map(m => (
                    <td key={m} style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 'bold', color: totaisPorMes[m] > 0 ? '#1D5A9E' : '#aaa' }}>
                      {totaisPorMes[m] || '—'}
                    </td>
                  ))}
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#1D5A9E', borderLeft: '3px solid #c0cff0', backgroundColo

r: '#eef2ff' }}>
                    {totalGeral}
                  </td>
                </tr>
              </tfoot> */}
            </table>
          </div>

          <p style={{ fontSize: 10, color: '#888', marginTop: 10, lineHeight: 1.4 }}>
            <b>Como ler:</b> cada linha é um produto que ganhou espaço no picking em algum momento. Os valores nas
            colunas dos meses são os <b>paletes ressupridos</b> naquele mês. Células coloridas indicam o mês exato
            em que a quantidade de espaços foi alterada (o pequeno número no canto superior direito mostra a variação).
            Se o ressuprimento caiu nos meses seguintes ao aumento, a mudança teve impacto positivo.
          </p>
        </div>
      )}
    </div>
  );
}

const card  = { backgroundColor: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const titulo = { color: '#333', fontSize: 14, fontWeight: 'bold', margin: 0 };
const thFixo = { backgroundColor: '#E31837', color: '#fff', padding: '10px 8px', fontWeight: 'bold', borderRight: '1px solid #c0102a' };
const thMes  = { backgroundColor: '#1D5A9E', color: '#fff', padding: '10px 4px', fontWeight: 'bold', textAlign: 'center', borderRight: '1px solid #164a8a' };
