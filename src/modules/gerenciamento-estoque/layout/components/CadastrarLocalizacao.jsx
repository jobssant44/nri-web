import React, { useState } from 'react';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { useDb } from '../../../../utils/db';
import { nowYearMonth } from '../../shared/curvaLookup';

export function CadastrarLocalizacao({ onSuccess }) {
  const { docRef, stamp } = useDb();
  const [loading, setLoading] = useState(false);
  const [endereco, setEndereco] = useState('');
  const [errors, setErrors] = useState([]);
  const [success, setSuccess] = useState('');

  const { ano, mes } = nowYearMonth();
  const mesLabel = `${String(mes).padStart(2, '0')}/${ano}`;

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
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxSizing: 'border-box',
    fontSize: '15px',
    fontFamily: 'monospace',
    letterSpacing: '0.5px',
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
    fontSize: '14px',
  };

  function validar() {
    const errs = [];
    const e = endereco.trim().toUpperCase();
    if (!e) {
      errs.push('Endereço é obrigatório');
    } else if (!/^[A-Z0-9.\-_/]+$/.test(e)) {
      errs.push('Endereço pode conter apenas letras, números, "-", ".", "_", "/"');
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    setSuccess('');

    const errs = validar();
    if (errs.length > 0) { setErrors(errs); return; }

    setLoading(true);

    try {
      const enderecoFinal = endereco.trim().toUpperCase();

      await setDoc(docRef('locations', enderecoFinal), {
        endereco: enderecoFinal,
        isActive: true,
        criadoEm: serverTimestamp(),
        ...stamp(),
      }, { merge: true });

      setSuccess(`✅ Endereço ${enderecoFinal} cadastrado (mês de referência atual: ${mesLabel})`);
      setEndereco('');
      onSuccess?.({ endereco: enderecoFinal });
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setErrors([`Erro ao salvar: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '6px' }}>📍 Cadastrar Endereço</h2>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
        Mês de referência: <strong>{mesLabel}</strong> · A curva e o produto desse endereço podem ser preenchidos na aba "Editar" ou via "Importar".
      </p>

      {success && (
        <div style={{
          padding: '12px', marginBottom: '15px', borderRadius: '4px',
          backgroundColor: '#dcfce7', color: '#166534', borderLeft: '4px solid #22c55e',
        }}>
          {success}
        </div>
      )}

      {errors.length > 0 && (
        <div style={{
          padding: '12px', marginBottom: '15px', borderRadius: '4px',
          backgroundColor: '#fee2e2', color: '#991b1b', borderLeft: '4px solid #ef4444',
        }}>
          {errors.map((err, i) => <div key={i}>❌ {err}</div>)}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={formGroupStyle}>
          <label style={labelStyle}>📌 Endereço</label>
          <input
            type="text"
            placeholder="Ex: A-1-007"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value.toUpperCase())}
            disabled={loading}
            style={inputStyle}
            autoFocus
          />
          <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
            Texto livre — escolha o padrão que faz sentido pro armazém (ex: A-1-007, A.01.07, EST-A-RUA1-POS007).
          </div>
        </div>

        <button type="submit" style={buttonStyle} disabled={loading}>
          {loading ? '⏳ Salvando...' : '➕ Cadastrar Endereço'}
        </button>
      </form>
    </div>
  );
}
