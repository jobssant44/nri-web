import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

export function EditarLocalizacao() {
  const [localizacoes, setLocalizacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [message, setMessage] = useState('');

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '20px',
  };

  const thStyle = {
    backgroundColor: '#E31837',
    color: 'white',
    padding: '12px',
    textAlign: 'left',
    fontWeight: 'bold',
  };

  const tdStyle = {
    padding: '12px',
    borderBottom: '1px solid #ddd',
  };

  const containerStyle = {
    maxWidth: '1000px',
    margin: '20px auto',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  const buttonStyle = {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginRight: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
  };

  const editButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#1D5A9E',
    color: 'white',
  };

  const deleteButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#ef4444',
    color: 'white',
  };

  const saveButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#22c55e',
    color: 'white',
  };

  const cancelButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#6b7280',
    color: 'white',
  };

  const inputStyle = {
    padding: '6px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '12px',
    boxSizing: 'border-box',
  };

  useEffect(() => {
    carregarLocalizacoes();
  }, []);

  async function carregarLocalizacoes() {
    setLoading(true);
    setMessage('');
    try {
      const snap = await getDocs(collection(db, 'locations'));

      if (snap.empty) {
        setMessage('⚠️ Nenhuma localização encontrada no banco de dados');
        setLocalizacoes([]);
        setLoading(false);
        return;
      }

      const lista = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          area: data.area || '',
          street: typeof data.street === 'number' ? data.street : parseInt(data.street || 0),
          palettePosition: typeof data.palettePosition === 'number' ? data.palettePosition : parseInt(data.palettePosition || 0),
          createdAt: data.createdAt,
          isActive: data.isActive !== false,
        };
      });

      // Ordenar por área, depois rua, depois posição
      lista.sort((a, b) => {
        if (a.area !== b.area) return a.area.localeCompare(b.area);
        if (a.street !== b.street) return a.street - b.street;
        return a.palettePosition - b.palettePosition;
      });

      setLocalizacoes(lista);
      setMessage(`✅ ${lista.length} localização(ões) carregada(s)`);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Erro ao carregar localizações:', error);
      setMessage(`❌ Erro ao carregar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function iniciarEdicao(loc) {
    setEditingId(loc.id);
    setEditData({
      area: loc.area,
      street: loc.street,
      palettePosition: loc.palettePosition,
    });
  }

  async function salvarEdicao(id) {
    if (!editData.area || !editData.street || !editData.palettePosition) {
      setMessage('❌ Todos os campos são obrigatórios');
      return;
    }

    try {
      await updateDoc(doc(db, 'locations', id), {
        area: editData.area.toUpperCase(),
        street: parseInt(editData.street),
        palettePosition: parseInt(editData.palettePosition),
      });
      setMessage('✅ Localização atualizada com sucesso!');
      setEditingId(null);
      setEditData(null);
      carregarLocalizacoes();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`❌ Erro ao salvar: ${error.message}`);
    }
  }

  async function deletarLocalizacao(id) {
    if (!window.confirm(`Tem certeza que deseja deletar ${id}?`)) return;

    try {
      await deleteDoc(doc(db, 'locations', id));
      setMessage('✅ Localização deletada com sucesso!');
      carregarLocalizacoes();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`❌ Erro ao deletar: ${error.message}`);
    }
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '20px' }}>📋 Editar Localizações</h2>

      {message && (
        <div
          style={{
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '4px',
            backgroundColor: message.includes('✅') ? '#dcfce7' : message.includes('⚠️') ? '#fef3c7' : '#fee2e2',
            color: message.includes('✅') ? '#166534' : message.includes('⚠️') ? '#92400e' : '#991b1b',
            borderLeft: `4px solid ${message.includes('✅') ? '#22c55e' : message.includes('⚠️') ? '#f59e0b' : '#ef4444'}`,
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <p>⏳ Carregando localizações...</p>
        </div>
      ) : (
        <div style={{ marginBottom: '15px' }}>
          <button
            style={{ ...editButtonStyle, marginLeft: 0, marginRight: 0 }}
            onClick={carregarLocalizacoes}
            disabled={loading}
          >
            🔄 Recarregar Dados
          </button>
        </div>
      )}

      {!loading && localizacoes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <p>📭 Nenhuma localização cadastrada ainda.</p>
          <p style={{ fontSize: '12px', marginTop: '10px' }}>Vá até a aba "Cadastrar" para adicionar localizações.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Área</th>
                <th style={thStyle}>Rua</th>
                <th style={thStyle}>Posição</th>
                <th style={thStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {localizacoes.map((loc, idx) => (
                <tr key={loc.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                  <td style={tdStyle}>
                    <strong>{loc.id}</strong>
                  </td>
                  <td style={tdStyle}>
                    {editingId === loc.id ? (
                      <input
                        type="text"
                        maxLength="1"
                        value={editData.area}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            area: e.target.value.toUpperCase(),
                          })
                        }
                        style={{ ...inputStyle, width: '40px' }}
                      />
                    ) : (
                      loc.area
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingId === loc.id ? (
                      <input
                        type="text"
                        value={editData.street}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            street: e.target.value.replace(/\D/g, ''),
                          })
                        }
                        style={{ ...inputStyle, width: '60px' }}
                      />
                    ) : (
                      loc.street
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingId === loc.id ? (
                      <input
                        type="text"
                        value={editData.palettePosition}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            palettePosition: e.target.value.replace(/\D/g, ''),
                          })
                        }
                        style={{ ...inputStyle, width: '80px' }}
                      />
                    ) : (
                      loc.palettePosition
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingId === loc.id ? (
                      <>
                        <button
                          style={saveButtonStyle}
                          onClick={() => salvarEdicao(loc.id)}
                        >
                          ✅ Salvar
                        </button>
                        <button
                          style={cancelButtonStyle}
                          onClick={() => {
                            setEditingId(null);
                            setEditData(null);
                          }}
                        >
                          ❌ Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button style={editButtonStyle} onClick={() => iniciarEdicao(loc)}>
                          ✏️ Editar
                        </button>
                        <button
                          style={deleteButtonStyle}
                          onClick={() => deletarLocalizacao(loc.id)}
                        >
                          🗑️ Deletar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <strong>Total:</strong> {localizacoes.length} localização(ões) cadastrada(s)
      </div>
    </div>
  );
}
