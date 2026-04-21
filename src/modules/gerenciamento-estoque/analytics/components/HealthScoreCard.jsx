import React from 'react';

export function HealthScoreCard({ metrics }) {
  const score = 85;
  const containerStyle = {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    textAlign: 'center',
  };

  return (
    <div style={containerStyle}>
      <h3 style={{ color: '#1D5A9E' }}>Score de Saude</h3>
      <div style={{ fontSize: '48px', color: '#22c55e', fontWeight: 'bold' }}>{score}</div>
      <div style={{ fontSize: '12px', color: '#666' }}>Saude Geral (0-100)</div>
    </div>
  );
}