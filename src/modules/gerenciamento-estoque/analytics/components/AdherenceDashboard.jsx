import React, { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

export function AdherenceDashboard() {
  const [loading, setLoading] = useState(false);
  const [metricas, setMetricas] = useState(null);
  const [detalhes, setDetalhes] = useState([]);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filtrosAplicados, setFiltrosAplicados] = useState(null);
  const [mensagem, setMensagem] = useState('');

  function formatarDataInput(valor) {
    const digits = valor.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function parseDataBR(dataStr) {
    if (!dataStr) return null;
    const match = dataStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, dia, mes, ano] = match;
    return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
  }

  function resolverData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor;
    if (typeof valor.toDate === 'function') return valor.toDate();
    const match = String(valor).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [, dia, mes, ano] = match;
      return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    }
    return null;
  }

  function somenteData(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  async function calcular() {
    const temInicio = dataInicio.trim();
    const temFim = dataFim.trim();

    if (!temInicio && !temFim) {
      setMensagem('❌ Selecione ao menos uma data para filtrar');
      return;
    }

    const dataInicioParsed = temInicio ? parseDataBR(temInicio) : null;
    const dataFimParsed = temFim ? parseDataBR(temFim) : null;

    if ((temInicio && !dataInicioParsed) || (temFim && !dataFimParsed)) {
      setMensagem('❌ Formato de data inválido. Use DD/MM/AAAA');
      return;
    }

    setLoading(true);
    setMensagem('');
    setMetricas(null);
    setDetalhes([]);

    try {
      // 1. Carregar localizações endereçadas
      const locationsSnap = await getDocs(collection(db, 'locations'));
      const assignedLocations = new Set();
      const correctLocationByProduct = {};
      locationsSnap.docs.forEach(d => {
        const loc = d.data();
        if (loc.assignedSkuId) {
          const key = `${loc.assignedSkuId}|${loc.area}|${String(loc.street)}|${String(loc.palettePosition)}`;
          assignedLocations.add(key);
          const label = `${loc.area}-${loc.street}-${loc.palettePosition}`;
          if (!correctLocationByProduct[loc.assignedSkuId]) {
            correctLocationByProduct[loc.assignedSkuId] = label;
          }
        }
      });

      // 2. Carregar contagens e filtrar por período
      const inventorySnap = await getDocs(collection(db, 'inventory_logs'));
      const logsFiltrados = inventorySnap.docs
        .map(d => d.data())
        .filter(log => {
          const dataLog = resolverData(log.createdAt || log.timestamp);
          if (!dataLog) return false;
          const dLog = somenteData(dataLog);
          if (dataInicioParsed && dLog < somenteData(dataInicioParsed)) return false;
          if (dataFimParsed && dLog > somenteData(dataFimParsed)) return false;
          return true;
        });

      // 3. Calcular aderência baseada nas contagens do período
      let aderentes = 0;
      let naoAderentes = 0;
      const resultadoDetalhes = [];

      for (const log of logsFiltrados) {
        const productId = String(log.productCode || log.productId || '');
        if (!productId) continue;

        const key = `${productId}|${log.area}|${String(log.street)}|${String(log.palettePosition)}`;

        // Usar snapshot histórico gravado no log quando disponível;
        // fallback para layout atual apenas em logs antigos (antes da implementação de snapshots)
        let isAderente;
        let localizacaoCorreta;
        if (log.assignedLocation !== undefined) {
          // Dado histórico confiável
          isAderente = log.assignedLocation === `${log.area}-${log.street}-${log.palettePosition}`;
          localizacaoCorreta = isAderente ? null : (log.assignedLocation || null);
        } else {
          // Log antigo: usar layout atual como fallback
          isAderente = assignedLocations.has(key);
          localizacaoCorreta = isAderente ? null : (correctLocationByProduct[productId] || null);
        }

        if (isAderente) {
          aderentes++;
        } else {
          naoAderentes++;
        }

        resultadoDetalhes.push({
          status: isAderente ? 'aderente' : 'não-aderente',
          localizacao: `${log.area}-${log.street}-${log.palettePosition}`,
          localizacaoCorreta,
          sku: productId,
          produto: log.productName || '',
          dataContagem: resolverData(log.createdAt || log.timestamp),
        });
      }

      const total = aderentes + naoAderentes;
      const percentual = total > 0 ? Math.round((aderentes / total) * 100) : 0;

      setMetricas({ total, aderentes, naoAderentes, percentual });
      setDetalhes(resultadoDetalhes);
      setFiltrosAplicados({ inicio: temInicio, fim: temFim });

      if (total === 0) {
        setMensagem('⚠️ Nenhuma contagem de produto endereçado encontrada no período');
      }
    } catch (error) {
      setMensagem(`❌ Erro: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function limpar() {
    setDataInicio('');
    setDataFim('');
    setMetricas(null);
    setDetalhes([]);
    setFiltrosAplicados(null);
    setMensagem('');
  }

  // ========== ESTILOS ==========
  const containerStyle = { maxWidth: '1200px', margin: '20px auto', padding: '20px', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' };
  const cardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' };
  const metricaCardStyle = { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center' };
  const metricaTituloStyle = { fontSize: '12px', color: '#666', marginBottom: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const metricaValorStyle = { fontSize: '36px', fontWeight: 'bold', color: '#E31837', marginBottom: '5px' };
  const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '12px' };
  const thStyle = { backgroundColor: '#E31837', color: 'white', padding: '12px', textAlign: 'left', fontWeight: 'bold' };
  const tdStyle = { padding: '10px 12px', borderBottom: '1px solid #ddd' };
  const inputStyle = { padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', width: '130px' };
  const badgeAderenteStyle = { display: 'inline-block', padding: '4px 12px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' };
  const badgeNaoAderenteStyle = { display: 'inline-block', padding: '4px 12px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' };

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#E31837', marginBottom: '10px' }}>📊 Aderência ao Layout</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Mede a aderência com base nas contagens registradas no período selecionado
      </p>

      {/* FILTRO DE DATA */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>📅 Filtrar data:</label>
          <input
            type="text"
            placeholder="dd/mm/aaaa"
            value={dataInicio}
            onChange={e => setDataInicio(formatarDataInput(e.target.value))}
            disabled={loading}
            style={inputStyle}
            title="Data inicial (dd/mm/aaaa)"
          />
          <span style={{ fontSize: '12px', color: '#666' }}>até</span>
          <input
            type="text"
            placeholder="dd/mm/aaaa"
            value={dataFim}
            onChange={e => setDataFim(formatarDataInput(e.target.value))}
            disabled={loading}
            style={inputStyle}
            title="Data final (dd/mm/aaaa)"
          />
          <button
            onClick={calcular}
            disabled={loading}
            style={{ padding: '10px 16px', backgroundColor: '#1D5A9E', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
          >
            {loading ? '⏳ Calculando...' : '⏳ Aplicar'}
          </button>
          <button
            onClick={limpar}
            disabled={loading}
            style={{ padding: '10px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
          >
            🔄 Limpar
          </button>
        </div>

        {filtrosAplicados && (
          <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: '#e3f2fd', color: '#1d5a9e', borderRadius: '4px', fontSize: '12px', borderLeft: '4px solid #1d5a9e' }}>
            🎯 <strong>Período:</strong> {filtrosAplicados.inicio || 'início'} a {filtrosAplicados.fim || 'fim'}
          </div>
        )}

        {mensagem && (
          <div style={{ marginTop: '10px', padding: '12px', borderRadius: '4px', backgroundColor: mensagem.startsWith('❌') ? '#fee2e2' : '#fef3c7', color: mensagem.startsWith('❌') ? '#991b1b' : '#856404', borderLeft: `4px solid ${mensagem.startsWith('❌') ? '#ef4444' : '#ffc107'}`, fontSize: '13px' }}>
            {mensagem}
          </div>
        )}
      </div>

      {/* CARDS DE MÉTRICAS */}
      {metricas && (
        <>
          <div style={gridStyle}>
            <div style={metricaCardStyle}>
              <div style={metricaTituloStyle}>Total de Contagens</div>
              <div style={metricaValorStyle}>{metricas.total}</div>
              <div style={{ fontSize: '12px', color: '#999' }}>registros no período</div>
            </div>

            <div style={{ ...metricaCardStyle, borderTop: '4px solid #22c55e' }}>
              <div style={metricaTituloStyle}>✅ Aderentes</div>
              <div style={{ ...metricaValorStyle, color: '#22c55e' }}>{metricas.aderentes}</div>
              <div style={{ fontSize: '12px', color: '#166534' }}>
                {metricas.total > 0 ? Math.round((metricas.aderentes / metricas.total) * 100) : 0}% das contagens
              </div>
            </div>

            <div style={{ ...metricaCardStyle, borderTop: '4px solid #ef4444' }}>
              <div style={metricaTituloStyle}>❌ Não Aderentes</div>
              <div style={{ ...metricaValorStyle, color: '#ef4444' }}>{metricas.naoAderentes}</div>
              <div style={{ fontSize: '12px', color: '#991b1b' }}>
                {metricas.total > 0 ? Math.round((metricas.naoAderentes / metricas.total) * 100) : 0}% das contagens
              </div>
            </div>

            <div style={{ ...metricaCardStyle, borderTop: '4px solid #1D5A9E' }}>
              <div style={metricaTituloStyle}>📈 Percentual de Aderência</div>
              <div style={{ ...metricaValorStyle, color: '#1D5A9E' }}>{metricas.percentual}%</div>
              <div style={{ fontSize: '12px', color: metricas.percentual >= 80 ? '#166534' : '#991b1b', fontWeight: 'bold' }}>
                {metricas.percentual >= 80 ? '✅ Bom' : metricas.percentual >= 60 ? '⚠️ Aceitável' : '❌ Baixo'}
              </div>
            </div>
          </div>

          {/* TABELA DE DETALHES */}
          {detalhes.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ color: '#E31837', marginBottom: '15px' }}>📋 Detalhes das Contagens</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>SKU / Código</th>
                      <th style={thStyle}>Produto</th>
                      <th style={thStyle}>Localização Contada</th>
                      <th style={thStyle}>Data Contagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhes.map((item, idx) => (
                      <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                        <td style={tdStyle}>
                          <span style={item.status === 'aderente' ? badgeAderenteStyle : badgeNaoAderenteStyle}>
                            {item.status === 'aderente' ? '✅ Aderente' : '❌ Não Aderente'}
                          </span>
                        </td>
                        <td style={tdStyle}>{item.sku}</td>
                        <td style={tdStyle}>{item.produto || '—'}</td>
                        <td style={tdStyle}>
                          {item.status === 'não-aderente' && item.localizacaoCorreta ? (
                            <span>
                              <strong style={{ color: '#991b1b' }}>{item.localizacao}</strong>
                              <span style={{ margin: '0 6px', color: '#999' }}>→</span>
                              <strong style={{ color: '#166534' }}>{item.localizacaoCorreta}</strong>
                            </span>
                          ) : item.status === 'não-aderente' ? (
                            <span>
                              <strong style={{ color: '#991b1b' }}>{item.localizacao}</strong>
                              <span style={{ marginLeft: '6px', fontSize: '11px', color: '#856404', backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: '4px' }}>sem endereço</span>
                            </span>
                          ) : (
                            <strong>{item.localizacao}</strong>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {item.dataContagem ? item.dataContagem.toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!metricas && !loading && (
        <div style={cardStyle}>
          <p style={{ color: '#999' }}>Selecione um período e clique em <strong>Aplicar</strong> para calcular a aderência.</p>
        </div>
      )}
    </div>
  );
}
