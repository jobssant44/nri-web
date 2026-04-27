import React, { useState } from 'react';
import { useSessionFilter } from '../../hooks/useSessionFilter';
import { CadastrarLocalizacao } from '../../modules/gerenciamento-estoque/layout/components/CadastrarLocalizacao';
import { EditarLocalizacao } from '../../modules/gerenciamento-estoque/layout/components/EditarLocalizacao';
import { ImportarLocalizacoes } from '../../modules/gerenciamento-estoque/layout/components/ImportarLocalizacoes';

export default function GerenciarLocalizacoesPage() {
  const [aba, setAba] = useSessionFilter('geroloc:aba', 'cadastrar');

  const containerStyle = {
    maxWidth: '1000px',
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
      <h1 style={{ color: '#E31837', marginBottom: '20px' }}>📍 Gerenciar Localizações</h1>

      {/* Abas */}
      <div style={tabContainerStyle}>
        <button
          style={tabStyle(aba === 'cadastrar')}
          onClick={() => setAba('cadastrar')}
        >
          ➕ Cadastrar
        </button>
        <button
          style={tabStyle(aba === 'editar')}
          onClick={() => setAba('editar')}
        >
          ✏️ Editar
        </button>
        <button
          style={tabStyle(aba === 'importar')}
          onClick={() => setAba('importar')}
        >
          📥 Importar
        </button>
      </div>

      {/* Conteúdo */}
      <div style={contentStyle}>
        {aba === 'cadastrar' && <CadastrarLocalizacao />}
        {aba === 'editar' && <EditarLocalizacao />}
        {aba === 'importar' && <ImportarLocalizacoes />}
      </div>
    </div>
  );
}
