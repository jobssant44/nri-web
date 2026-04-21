import React, { useState } from 'react';
import { LocationForm } from '../../modules/gerenciamento-estoque/layout/components/LocationForm';
import { ImportarEnderecos } from '../../modules/gerenciamento-estoque/layout/components/ImportarEnderecos';

export default function EndereçamentoPage() {
  const [modo, setModo] = useState('manual'); // 'manual' ou 'importar'

  const containerStyle = {
    maxWidth: '900px',
    margin: '0 auto',
  };

  const tabStyle = (isActive) => ({
    padding: '12px 24px',
    backgroundColor: isActive ? '#E31837' : '#f0f0f0',
    color: isActive ? 'white' : '#333',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '14px',
    marginRight: '10px',
    transition: 'all 0.3s',
  });

  const tabContainerStyle = {
    display: 'flex',
    gap: '8px',
    marginBottom: '0',
    borderBottom: '2px solid #e0e0e0',
  };

  const contentStyle = {
    backgroundColor: '#fff',
    borderRadius: '0 8px 8px 8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '0',
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#E31837', marginBottom: '20px' }}>🎯 Endereçamento de Produtos</h1>

      {/* Abas de navegação */}
      <div style={tabContainerStyle}>
        <button
          style={tabStyle(modo === 'manual')}
          onClick={() => setModo('manual')}
        >
          ✏️ Vincular Manual
        </button>
        <button
          style={tabStyle(modo === 'importar')}
          onClick={() => setModo('importar')}
        >
          📥 Importar em Lote
        </button>
      </div>

      {/* Conteúdo das abas */}
      <div style={contentStyle}>
        {modo === 'manual' && <LocationForm onSuccess={() => console.log('Produto vinculado com sucesso')} />}
        {modo === 'importar' && <ImportarEnderecos onSuccess={() => setModo('manual')} />}
      </div>
    </div>
  );
}
