import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

export function AdherenceDashboard() {
  const [loading, setLoading] = useState(true);
  const [metricas, setMetricas] = useState(null);
  const [detalhes, setDetalhes] = useState([]);

  useEffect(() => {
    calcularAderecencia();
  }, []);

  async function calcularAderecencia() {
    setLoading(true);
    try {
      // 1. Carregar todos os produtos endereçados (locations)
      const locationsSnap = await getDocs(collection(db, 'locations'));
      const locationsData = locationsSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));

      // 2. Carregar todos os registros de contagem (inventory_logs)
      const inventorySnap = await getDocs(collection(db, 'inventory_logs'));
      const inventoryData = inventorySnap.docs.map(d => d.data());

      // 3. Calcular aderência
      const resultadoDetalhes = [];
      let produtosAderentes = 0;
      let produtosNaoAderentes = 0;

      for (const location of locationsData) {
        const { area, street, palettePosition, assignedSkuId } = location;
        const locationId = `${area}-${street}-${palettePosition}`;

        // Procurar se esse produto foi contado NESSA localização
        const foiContado = inventoryData.some(log =>
          (log.productCode === assignedSkuId || log.productId === assignedSkuId) &&
          log.area === area &&
          log.street === street &&
          log.palettePosition === palettePosition
        );

        if (foiContado) {
          produtosAderentes++;
          resultadoDetalhes.push({
            status: 'aderente',
            locationId,
            sku: assignedSkuId,
            localizacao: `${area}-${street}-${palettePosition}`,
          });
        } else {
          produtosNaoAderentes++;
          resultadoDetalhes.push({
            status: 'não-aderente',
            locationId,
            sku: assignedSkuId,
            localizacao: `${area}-${street}-${palettePosition}`,
          });
        }
      }

      const totalProdutos = produtosAderentes + produtosNaoAderentes;
      const percentualAderencia = totalProdutos > 0 ? Math.round((produtosAderentes / totalProdutos) * 100) : 0;

      setMetricas({
        totalProdutos,
        produtosAderentes,
        produtosNaoAderentes,
        percentualAderencia,
      });

      setDetalhes(resultadoDetalhes);
    } catch (error) {
      console.error('Erro ao calcular aderência:', error);
    } finally {
      setLoading(false);
    }
  }

  const containerStyle = {
    maxWidth: '1200px',
    margin: '20px auto',
    padding: '20px',
    backgroundColor: '#f5f5f5',
    fontFamily: 'Arial, sans-serif',
  };

  const cardStyle = {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '20px',
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  };

  const metricaCardStyle = {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    textAlign: 'center',
  };

  const metricaTituloStyle = {
    fontSize: '12px',
    color: '#666',
    marginBottom: '10px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const metricaValorStyle = {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#E31837',
    marginBottom: '5px',
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '15px',
    fontSize: '12px',
  };

  const thStyle = {
    backgroundColor: '#E31837',
    color: 'white',
    padding: '12px',
    textAlign: 'left',
    fontWeight: 'bold',
  };

  const tdStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid #ddd',
  };

  const badgeAderenteStyle = {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 'bold',
  };

  const badgeNaoAderenteStyle = {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 'bold',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <h1 style={{ color: '#E31837' }}>⏳ Carregando...</h1>
        <p>Aguarde enquanto as métricas são calculadas...</p>
      </div>
    );
  }

  if (!metricas) {
    return (
      <div style={containerStyle}>
        <h1 style={{ color: '#E31837' }}>📊 Aderência ao Layout</h1>
        <div style={cardStyle}>
          <p style={{ color: '#999' }}>Nenhum dado disponível. Cadastre produtos em "Endereçamento de Produtos" e registre contagens para ver as métricas.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#E31837', marginBottom: '10px' }}>📊 Aderência ao Layout</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Avalia a conformidade entre produtos endereçados e produtos contados nas localizações corretas
      </p>

      {/* CARDS DE MÉTRICAS PRINCIPAIS */}
      <div style={gridStyle}>
        {/* Card: Total de Produtos */}
        <div style={metricaCardStyle}>
          <div style={metricaTituloStyle}>Total de Produtos Endereçados</div>
          <div style={metricaValorStyle}>{metricas.totalProdutos}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>produtos no layout</div>
        </div>

        {/* Card: Produtos Aderentes */}
        <div style={{ ...metricaCardStyle, borderTop: '4px solid #22c55e' }}>
          <div style={metricaTituloStyle}>✅ Produtos Aderentes</div>
          <div style={{ ...metricaValorStyle, color: '#22c55e' }}>{metricas.produtosAderentes}</div>
          <div style={{ fontSize: '12px', color: '#166534' }}>
            {metricas.totalProdutos > 0 ? Math.round((metricas.produtosAderentes / metricas.totalProdutos) * 100) : 0}% da quantidade
          </div>
        </div>

        {/* Card: Produtos Não Aderentes */}
        <div style={{ ...metricaCardStyle, borderTop: '4px solid #ef4444' }}>
          <div style={metricaTituloStyle}>❌ Produtos Não Aderentes</div>
          <div style={{ ...metricaValorStyle, color: '#ef4444' }}>{metricas.produtosNaoAderentes}</div>
          <div style={{ fontSize: '12px', color: '#991b1b' }}>
            {metricas.totalProdutos > 0 ? Math.round((metricas.produtosNaoAderentes / metricas.totalProdutos) * 100) : 0}% da quantidade
          </div>
        </div>

        {/* Card: Percentual de Aderência */}
        <div style={{ ...metricaCardStyle, borderTop: '4px solid #1D5A9E', gridColumn: 'span 1' }}>
          <div style={metricaTituloStyle}>📈 Percentual de Aderência</div>
          <div style={{ ...metricaValorStyle, color: '#1D5A9E' }}>{metricas.percentualAderencia}%</div>
          <div style={{
            fontSize: '12px',
            color: metricas.percentualAderencia >= 80 ? '#166534' : '#991b1b',
            fontWeight: 'bold',
          }}>
            {metricas.percentualAderencia >= 80 ? '✅ Bom' : metricas.percentualAderencia >= 60 ? '⚠️ Aceitável' : '❌ Baixo'}
          </div>
        </div>
      </div>

      {/* EXPLICAÇÃO DA LÓGICA */}
      <div style={cardStyle}>
        <h3 style={{ color: '#333', marginBottom: '10px' }}>ℹ️ Como funciona?</h3>
        <ul style={{ color: '#666', fontSize: '13px', lineHeight: '1.6', marginLeft: '20px' }}>
          <li><strong>Produto Aderente:</strong> Foi cadastrado em uma localização via "Endereçamento de Produtos" E foi contado nessa mesma localização em "Registrar Contagem"</li>
          <li><strong>Produto Não Aderente:</strong> Foi cadastrado em uma localização mas NÃO foi encontrado contado naquela mesma localização</li>
          <li><strong>Percentual:</strong> (Total Aderentes / Total de Produtos) × 100</li>
        </ul>
      </div>

      {/* TABELA DE DETALHES */}
      {detalhes.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ color: '#E31837', marginBottom: '15px' }}>📋 Detalhes de Cada Produto</h3>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Localização</th>
                  <th style={thStyle}>SKU / Código</th>
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
                    <td style={tdStyle}><strong>{item.localizacao}</strong></td>
                    <td style={tdStyle}>{item.sku}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
