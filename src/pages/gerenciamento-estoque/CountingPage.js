import React from 'react';
import { CountingForm } from '../../modules/gerenciamento-estoque/inventory/components/CountingForm';
import { ImportarContagemRetroativa } from '../../modules/gerenciamento-estoque/inventory/components/ImportarContagemRetroativa';
import { HistoricoImportacoes } from '../../modules/gerenciamento-estoque/inventory/components/HistoricoImportacoes';
import { useUser } from '../../context/UserContext';
import { useSessionFilter } from '../../hooks/useSessionFilter';

export default function CountingPage() {
  const { usuario } = useUser();
  const [aba, setAba] = useSessionFilter('count:aba', 'manual');

  const containerStyle = { maxWidth: '1100px', margin: '0 auto' };
  const tabContainer = {
    display: 'flex', gap: '8px', marginBottom: '0',
    borderBottom: '2px solid #e0e0e0',
  };
  const tabStyle = (active) => ({
    padding: '12px 24px',
    backgroundColor: active ? '#E31837' : '#f0f0f0',
    color: active ? 'white' : '#333',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontWeight: active ? 'bold' : 'normal',
    fontSize: '14px',
    transition: 'all 0.2s',
  });
  const conteudo = {
    backgroundColor: '#fff',
    borderRadius: '0 8px 8px 8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '0',
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#E31837', marginBottom: '20px' }}>Contagem de Estoque</h1>

      <div style={tabContainer}>
        <button style={tabStyle(aba === 'manual')} onClick={() => setAba('manual')}>
          Registrar manual
        </button>
        <button style={tabStyle(aba === 'retroativa')} onClick={() => setAba('retroativa')}>
          Importar retroativa
        </button>
        <button style={tabStyle(aba === 'historico')} onClick={() => setAba('historico')}>
          Importações
        </button>
      </div>

      <div style={conteudo}>
        {aba === 'manual' && <CountingForm conferente={usuario?.nome} />}
        {aba === 'retroativa' && <ImportarContagemRetroativa />}
        {aba === 'historico' && <HistoricoImportacoes />}
      </div>
    </div>
  );
}
