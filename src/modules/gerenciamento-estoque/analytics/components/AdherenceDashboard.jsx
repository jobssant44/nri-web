import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { calculateAdherenceMetrics } from '../services';
import { HealthScoreCard } from './HealthScoreCard';
import { ExpiryAlertsList } from './ExpiryAlertsList';

export function AdherenceDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [period, setPeriod] = useState({ start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() });

  useEffect(() => {
    loadMetrics();
  }, [period]);

  async function loadMetrics() {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'inventory_logs'),
        where('timestamp', '>=', period.start),
        where('timestamp', '<=', period.end)
      );
      const snap = await getDocs(q);
      const allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(allLogs);
      const calculatedMetrics = calculateAdherenceMetrics(allLogs, period.start, period.end);
      setMetrics(calculatedMetrics);
    } catch (error) {
      console.error('Erro ao carregar metricas:', error);
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

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '15px',
    fontSize: '13px',
  };

  const thStyle = {
    backgroundColor: '#1D5A9E',
    color: 'white',
    padding: '10px',
    textAlign: 'left',
  };

  const tdStyle = {
    padding: '10px',
    borderBottom: '1px solid #ddd',
  };

  if (loading) {
    return <div style={containerStyle}>Carregando...</div>;
  }

  if (!metrics) {
    return <div style={containerStyle}>Nenhum dado disponivel</div>;
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '20px' }}>Dashboard de Aderencia</h2>

      <div style={gridStyle}>
        <HealthScoreCard metrics={metrics} />
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px' }}>
          <h4 style={{ color: '#1D5A9E' }}>Aderencia Geral</h4>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#22c55e' }}>{metrics.adherencePercentage}%</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{metrics.totalAdherent} de {metrics.totalCountings}</div>
        </div>
      </div>

      <div style={{ marginTop: '20px', backgroundColor: '#fff', padding: '20px', borderRadius: '8px' }}>
        <h3 style={{ color: '#1D5A9E' }}>Por Area</h3>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Area</th><th style={thStyle}>Total</th><th style={thStyle}>Aderentes</th><th style={thStyle}>%</th></tr></thead>
          <tbody>
            {Object.values(metrics.byArea).map(area => (
              <tr key={area.area}>
                <td style={tdStyle}>{area.area}</td>
                <td style={tdStyle}>{area.total}</td>
                <td style={tdStyle}>{area.adherent}</td>
                <td style={tdStyle} ><strong>{area.percentage}%</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ExpiryAlertsList logs={logs.filter(l => l.isCriticalDate || l.isExpired)} />
    </div>
  );
}