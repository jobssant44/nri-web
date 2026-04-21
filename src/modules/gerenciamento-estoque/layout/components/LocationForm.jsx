import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

export function LocationForm({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [areas, setAreas] = useState([]);
  const [formData, setFormData] = useState({
    area: '',
    street: '',
    palettePosition: '',
    assignedSkuId: '',
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

  // Carregar áreas únicas do Firebase
  useEffect(() => {
    carregarAreas();
  }, []);

  async function carregarAreas() {
    setLoadingAreas(true);
    try {
      const snap = await getDocs(collection(db, 'locations'));
      const areasSet = new Set();
      snap.docs.forEach((d) => {
        const area = d.data().area;
        if (area) areasSet.add(area);
      });
      const areasArray = Array.from(areasSet).sort();
      setAreas(areasArray);
    } catch (error) {
      console.error('Erro ao carregar áreas:', error);
    } finally {
      setLoadingAreas(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    setSuccess('');

    const newErrors = [];
    if (!formData.area.trim()) newErrors.push('Área obrigatória');
    if (!formData.street.trim()) newErrors.push('Rua obrigatória');
    if (!formData.palettePosition.trim()) newErrors.push('Posição obrigatória');
    if (!formData.assignedSkuId.trim()) newErrors.push('SKU obrigatório');

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      const area = formData.area.trim();
      const street = parseInt(formData.street.trim());
      const palettePosition = parseInt(formData.palettePosition.trim());
      const assignedSkuId = formData.assignedSkuId.trim();
      const capacity = parseInt(formData.capacity) || 1;

      // Gerar ID no formato A-1-1
      const docId = `${area}-${street}-${palettePosition}`;

      await setDoc(doc(db, 'locations', docId), {
        area,
        street,
        palettePosition,
        assignedSkuId,
        isActive: true,
        createdAt: new Date(),
      });

      setSuccess(`✅ Produto ${assignedSkuId} vinculado à localização ${docId}`);
      setFormData({
        area: formData.area, // Manter a área preenchida
        street: '',
        palettePosition: '',
        assignedSkuId: '',
      });
      onSuccess?.({ id: docId, area, street, palettePosition, assignedSkuId });

      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setErrors([`Erro ao salvar: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '20px' }}>📦 Vincular Produto à Localização</h2>

      {success && (
        <div
          style={{
            color: '#22c55e',
            marginBottom: '15px',
            fontWeight: 'bold',
            padding: '12px',
            backgroundColor: '#dcfce7',
            borderRadius: '4px',
          }}
        >
          {success}
        </div>
      )}

      {errors.length > 0 && (
        <div
          style={{
            color: '#991b1b',
            marginBottom: '15px',
            padding: '12px',
            backgroundColor: '#fee2e2',
            borderRadius: '4px',
          }}
        >
          {errors.map((err, idx) => (
            <div key={idx}>❌ {err}</div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={formGroupStyle}>
          <label style={labelStyle}>📍 Área</label>
          <select
            style={inputStyle}
            value={formData.area}
            onChange={(e) => setFormData({ ...formData, area: e.target.value })}
            disabled={loading || loadingAreas}
          >
            <option value="">-- Selecionar Área --</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
          {areas.length === 0 && !loadingAreas && (
            <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '5px' }}>
              ⚠️ Nenhuma área cadastrada. Cadastre primeiro em "Gerenciar Localizações"
            </p>
          )}
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>🛣️ Rua (número)</label>
          <input
            type="text"
            placeholder="Ex: 1, 2, 35..."
            value={formData.street}
            onChange={(e) => setFormData({ ...formData, street: e.target.value.replace(/\D/g, '') })}
            disabled={loading}
            style={inputStyle}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📦 Posição Palete (número)</label>
          <input
            type="text"
            placeholder="Ex: 1, 2, 209..."
            value={formData.palettePosition}
            onChange={(e) => setFormData({ ...formData, palettePosition: e.target.value.replace(/\D/g, '') })}
            disabled={loading}
            style={inputStyle}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📛 SKU (Produto)</label>
          <input
            type="text"
            placeholder="Ex: SKU_1695"
            value={formData.assignedSkuId}
            onChange={(e) => setFormData({ ...formData, assignedSkuId: e.target.value })}
            disabled={loading}
            style={inputStyle}
          />
        </div>

        <button style={buttonStyle} disabled={loading || loadingAreas}>
          {loading ? '⏳ Salvando...' : '✅ Vincular Produto'}
        </button>
      </form>

      <div
        style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: '#f0f9ff',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#0369a1',
        }}
      >
        <strong>ℹ️ ID Gerado:</strong> A localização receberá um ID automático no formato{' '}
        <strong>ÁREA-RUA-POSIÇÃO</strong> (ex: A-1-1)
      </div>
    </div>
  );
}
