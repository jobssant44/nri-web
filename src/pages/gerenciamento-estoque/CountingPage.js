import React from 'react';
import { CountingForm } from '../../modules/gerenciamento-estoque/inventory/components/CountingForm';
import { useUser } from '../../context/UserContext';

export default function CountingPage() {
  const { usuario } = useUser();

  const containerStyle = {
    maxWidth: '900px',
    margin: '0 auto',
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#E31837', marginBottom: '20px' }}>Registrar Contagem de Estoque</h1>
      <CountingForm conferente={usuario?.nome} />
    </div>
  );
}