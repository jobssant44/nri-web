import React, { useState } from 'react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

export function CadastrarLocalizacao({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    area: '',
    street: '',
    palettePosition: '',
  });
  const [errors, setErrors] = useState([]);
  const [success, setSuccess] = useState('');

  const containerStyle = {
    maxWidth: '600px',
    margin: '20px auto',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  const formGroupStyle = { marginBottom: '15px' };
  const labelStyle = { display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' };
  const inputStyle = {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxSizing: 'border-box',
    fontSize: '14px',
  };
  const buttonStyle = {
    width: '100%',
    padding: '12px',
    backgroundColor: '#E31837',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
  };

  function validarEntrada() {
    const erros = [];

    const area = formData.area.trim().toUpperCase();
    if (!area) {
      erros.push('Área é obrigatória');
    } else if (area.length !== 1 || !/^[A-Z]$/.test(area)) {
      erros.push('Área deve ser uma única letra (A-Z)');
    }

    const rua = formData.street.trim();
    if (!rua) {
      erros.push('Rua é obrigatória');
    } else if (!/^\d+$/.test(rua)) {
      erros.push('Rua deve conter apenas números');
    }

    const posicao = formData.palettePosition.trim();
    if (!posicao) {
      erros.push('Posição Palete é obrigatória');
    } else if (!/^\d+$/.test(posicao)) {
      erros.push('Posição Palete deve conter apenas números');
    }

    return { valid: erros.length === 0, errors: erros };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    setSuccess('');

    const { valid, errors: validationErrors } = validarEntrada();
    if (!valid) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      const area = formData.area.trim().toUpperCase();
      const street = parseInt(formData.street.trim());
      const palettePosition = parseInt(formData.palettePosition.trim());

      // ID no formato A-1-1
      const docId = `${area}-${street}-${palettePosition}`;

      await setDoc(doc(db, 'locations', docId), {
        area,
        street,
        palettePosition,
        createdAt: new Date(),
        isActive: true,
      });

      setSuccess(`✅ Localização ${docId} cadastrada com sucesso!`);
      setFormData({ area: '', street: '', palettePosition: '' });
      onSuccess?.({ id: docId, area, street, palettePosition });

      // Limpar mensagem após 3 segundos
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setErrors([`Erro ao salvar: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '20px' }}>📍 Cadastrar Localização</h2>

      {success && (
        <div style={{ color: '#22c55e', marginBottom: '15px', fontWeight: 'bold' }}>
          {success}
        </div>
      )}

      {errors.length > 0 && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '15px',
          }}
        >
          {errors.map((err, idx) => (
            <div key={idx}>❌ {err}</div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={formGroupStyle}>
          <label style={labelStyle}>🔤 Área (uma letra: A-Z)</label>
          <input
            type="text"
            placeholder="Ex: A, B, C, D..."
            maxLength="1"
            value={formData.area}
            onChange={(e) => setFormData({ ...formData, area: e.target.value.toUpperCase() })}
            style={inputStyle}
            disabled={loading}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>🛣️ Rua (número)</label>
          <input
            type="text"
            placeholder="Ex: 1, 2, 35, 100..."
            value={formData.street}
            onChange={(e) => setFormData({ ...formData, street: e.target.value.replace(/\D/g, '') })}
            style={inputStyle}
            disabled={loading}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📦 Posição Palete (número)</label>
          <input
            type="text"
            placeholder="Ex: 1, 2, 209, 500..."
            value={formData.palettePosition}
            onChange={(e) => setFormData({ ...formData, palettePosition: e.target.value.replace(/\D/g, '') })}
            style={inputStyle}
            disabled={loading}
          />
        </div>

        <button style={buttonStyle} type="submit" disabled={loading}>
          {loading ? '⏳ Salvando...' : '✅ Cadastrar'}
        </button>
      </form>

      <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '4px', fontSize: '12px', color: '#0369a1' }}>
        <strong>ℹ️ ID Gerado:</strong> A localização receberá um ID automático no formato <strong>ÁREA-RUA-POSIÇÃO</strong> (ex: A-1-1)
      </div>
    </div>
  );
}
