import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

// Area types for warehouse locations
const AREA_TYPES = {
  EstoqueA: { label: 'Estoque A', icon: '📦' },
  EstoqueB: { label: 'Estoque B', icon: '📦' },
  EstoqueC: { label: 'Estoque C', icon: '📦' },
  Picking: { label: 'Picking', icon: '🎯' },
  AG: { label: 'AG (Amadurecimento Geral)', icon: '🌾' },
  Marketplace: { label: 'Marketplace', icon: '🛒' },
};

export function LocationForm({ locationId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    areaName: 'EstoqueA',
    street: '',
    palettePosition: '',
    assignedSkuId: '',
    capacity: 2,
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
  const labelStyle = { display: 'block', marginBottom: '5px', fontWeight: 'bold' };
  const inputStyle = { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' };
  const buttonStyle = { width: '100%', padding: '12px', backgroundColor: '#E31837', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const newErrors = [];
    if (!formData.street.trim()) newErrors.push('Rua obrigatoria');
    if (!formData.palettePosition.trim()) newErrors.push('Posicao obrigatoria');
    if (!formData.assignedSkuId.trim()) newErrors.push('SKU obrigatorio');

    if (newErrors.length > 0) {
      setErrors(newErrors);
      setLoading(false);
      return;
    }

    try {
      const data = {
        areaName: formData.areaName,
        street: formData.street.trim(),
        palettePosition: formData.palettePosition.trim(),
        assignedSkuId: formData.assignedSkuId.trim(),
        capacity: formData.capacity,
        isActive: true,
      };

      if (locationId) {
        await updateDoc(doc(db, 'locations', locationId), data);
      } else {
        const ref = await addDoc(collection(db, 'locations'), { ...data, createdAt: new Date() });
        onSuccess?.({ id: ref.id, ...data });
      }
      setSuccess('Salvo!');
    } catch (error) {
      setErrors(['Erro ao salvar']);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837' }}>Localizacao</h2>
      {success && <div style={{ color: '#22c55e' }}>{success}</div>}
      {errors.length > 0 && <div style={{ color: '#ef4444' }}>{errors[0]}</div>}
      <form onSubmit={handleSubmit}>
        <div style={formGroupStyle}>
          <label style={labelStyle}>📍 Área</label>
          <select style={inputStyle} value={formData.areaName} onChange={e => setFormData({...formData, areaName: e.target.value})}>
            {Object.keys(AREA_TYPES).map(k => <option key={k}>{k}</option>)}
          </select>
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>🛣️ Rua</label>
          <input
            type="text"
            placeholder="Ex: 01, 02, 03..."
            value={formData.street}
            onChange={e => setFormData({...formData, street: e.target.value})}
            style={inputStyle}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📍 Posição</label>
          <input
            type="text"
            placeholder="Ex: 001, 002, 003..."
            value={formData.palettePosition}
            onChange={e => setFormData({...formData, palettePosition: e.target.value})}
            style={inputStyle}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📦 SKU (Produto)</label>
          <input
            type="text"
            placeholder="Ex: SKU_12345"
            value={formData.assignedSkuId}
            onChange={e => setFormData({...formData, assignedSkuId: e.target.value})}
            style={inputStyle}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📊 Capacidade (paletes)</label>
          <input
            type="number"
            min="1"
            value={formData.capacity}
            onChange={e => setFormData({...formData, capacity: parseInt(e.target.value) || 1})}
            style={inputStyle}
          />
        </div>

        <button style={buttonStyle} disabled={loading}>{loading ? 'Salvando...' : '✅ Salvar'}</button>
      </form>
    </div>
  );
}