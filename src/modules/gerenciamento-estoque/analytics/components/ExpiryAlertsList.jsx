import React from 'react';

export function ExpiryAlertsList({ logs }) {
  const containerStyle = {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  return (
    <div style={containerStyle}>
      <h3 style={{ color: '#E31837' }}>Alertas de Validade</h3>
      {logs.length === 0 ? (
        <div style={{ color: '#22c55e' }}>✅ Sem alertas</div>
      ) : (
        <div>Total: {logs.length} alertas</div>
      )}
    </div>
  );
}