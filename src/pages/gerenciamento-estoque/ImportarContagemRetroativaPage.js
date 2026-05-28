/**
 * Página wrapper pra Importação Retroativa de Coletas de Validade.
 *
 * Reusa o componente `ImportarContagemRetroativa` (que originalmente vivia
 * como aba dentro de Registrar Contagem). Agora é acessado pelo Hub central
 * de Importações em /importacoes.
 */
import React from 'react';
import { ImportarContagemRetroativa } from '../../modules/gerenciamento-estoque/inventory/components/ImportarContagemRetroativa';
import { HistoricoImportacoes } from '../../modules/gerenciamento-estoque/inventory/components/HistoricoImportacoes';
import { useSessionFilter } from '../../hooks/useSessionFilter';

export default function ImportarContagemRetroativaPage() {
  const [aba, setAba] = useSessionFilter('icr:aba', 'importar');

  const containerStyle = { maxWidth: '1100px', margin: '0 auto', padding: '20px' };
  const tabBar  = { display: 'flex', gap: '8px', borderBottom: '2px solid #e0e0e0', marginBottom: 0 };
  const tabStyle = (ativo) => ({
    padding: '12px 24px',
    backgroundColor: ativo ? '#E31837' : '#f0f0f0',
    color: ativo ? 'white' : '#333',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontWeight: ativo ? 'bold' : 'normal',
    fontSize: '14px',
  });
  const conteudo = {
    backgroundColor: '#fff',
    borderRadius: '0 8px 8px 8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '0',
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#E31837', marginBottom: '20px' }}>Importar Coletas de Validade</h1>

      <div style={tabBar}>
        <button style={tabStyle(aba === 'importar')}  onClick={() => setAba('importar')}>Importar</button>
        <button style={tabStyle(aba === 'historico')} onClick={() => setAba('historico')}>Histórico</button>
      </div>

      <div style={conteudo}>
        {aba === 'importar'  && <ImportarContagemRetroativa />}
        {aba === 'historico' && <HistoricoImportacoes />}
      </div>
    </div>
  );
}
