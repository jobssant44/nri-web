/**
 * CountingForm - Formulário para registrar uma contagem de inventário
 *
 * Fluxo:
 * 1. Usuário escaneia/digita localização
 * 2. Sistema busca localização e mostra SKU esperado
 * 3. Usuário escaneia/digita produto
 * 4. Sistema valida SKU vs localização (em tempo real)
 * 5. Usuário informa quantidade e validade
 * 6. Clica "Registrar contagem"
 * 7. Sistema valida, calcula aderência, salva Firebase
 * 8. Exibe resultado com alertas
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import {
  registerCounting,
  getSuccessMessage,
  getNextActions,
  getCountingSummary,
} from '../services';
import { AlertWidget, AlertSummary } from '../../shared/AlertWidget';

const initialFormState = {
  locationId: '',
  location: null,
  productId: '',
  product: null,
  countedQuantity: 0,
  expiryDate: '',
  batchNumber: '',
  notes: '',
};

export function CountingForm({
  conferente,
  onSuccess,
  onError,
}) {
  const [form, setForm] = useState(initialFormState);
  const [validation, setValidation] = useState({
    loading: false,
    skuMatch: null,
    errors: [],
  });
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ─── Buscar Localização quando locationId muda ───────────────────

  useEffect(() => {
    if (!form.locationId.trim()) {
      setForm((prev) => ({ ...prev, location: null }));
      return;
    }

    const fetchLocation = async () => {
      try {
        setValidation((prev) => ({ ...prev, loading: true }));
        const snap = await getDoc(doc(db, 'locations', form.locationId));

        if (snap.exists()) {
          const loc = snap.data();
          setForm((prev) => ({ ...prev, location: loc }));
          setValidation((prev) => ({ ...prev, errors: [] }));
        } else {
          setValidation((prev) => ({
            ...prev,
            errors: [{ field: 'location', message: 'Localização não encontrada' }],
          }));
        }
      } catch (err) {
        setValidation((prev) => ({
          ...prev,
          errors: [
            {
              field: 'location',
              message: `Erro ao buscar: ${(err).message}`,
            },
          ],
        }));
      } finally {
        setValidation((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchLocation();
  }, [form.locationId]);

  // ─── Buscar Produto quando productId muda ──────────────────────

  useEffect(() => {
    if (!form.productId.trim()) {
      setForm((prev) => ({ ...prev, product: null }));
      setValidation((prev) => ({ ...prev, skuMatch: null }));
      return;
    }

    const fetchProduct = async () => {
      try {
        setValidation((prev) => ({ ...prev, loading: true }));
        const snap = await getDoc(doc(db, 'produtos', form.productId));

        if (snap.exists()) {
          const prod = snap.data();
          setForm((prev) => ({ ...prev, product: prod }));

          // Validar SKU vs Localização em tempo real
          if (form.location) {
            const match = prod.sku === form.location.assignedSkuId;
            setValidation((prev) => ({
              ...prev,
              skuMatch: match,
              errors: match
                ? []
                : [
                    {
                      field: 'product',
                      message: `SKU não corresponde: esperado ${form.location.assignedSkuId}, encontrado ${prod.sku}`,
                    },
                  ],
            }));
          } else {
            setValidation((prev) => ({ ...prev, skuMatch: null }));
          }
        } else {
          setValidation((prev) => ({
            ...prev,
            errors: [{ field: 'product', message: 'Produto não encontrado' }],
          }));
        }
      } catch (err) {
        setValidation((prev) => ({
          ...prev,
          errors: [
            {
              field: 'product',
              message: `Erro ao buscar: ${(err).message}`,
            },
          ],
        }));
      } finally {
        setValidation((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchProduct();
  }, [form.productId, form.location]);

  // ─── Validar quantidade ────────────────────────────────────────

  const isQuantityValid = form.countedQuantity > 0;

  // ─── Validar data de validade ─────────────────────────────────

  const parseExpiryDate = (dateStr): Date | null => {
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  const expiryDate = parseExpiryDate(form.expiryDate);
  const isExpiryValid = expiryDate !== null;

  // ─── Verificar se pode submeter ────────────────────────────────

  const canSubmit =
    form.location &&
    form.product &&
    isQuantityValid &&
    isExpiryValid &&
    validation.skuMatch !== false &&
    !submitting;

  // ─── Submeter formulário ──────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const countingResult = await registerCounting(
        {
          productId: form.product.id,
          productSku: form.product.sku,
          locationId: form.location.id,
          countedQuantity: form.countedQuantity,
          expiryDate: expiryDate,
          conferente,
          batchNumber: form.batchNumber || undefined,
          notes: form.notes || undefined,
        },
        async (id) => {
          const snap = await getDoc(doc(db, 'produtos', id));
          return snap.exists() ? (snap.data()) : null;
        },
        async (id) => {
          const snap = await getDoc(doc(db, 'locations', id));
          return snap.exists() ? (snap.data()) : null;
        },
        async (log) => {
          const ref = await addDoc(collection(db, 'inventory_logs'), log);
          return ref.id;
        },
      );

      setResult(countingResult);
      onSuccess?.(countingResult);

      // Limpar formulário após sucesso
      setTimeout(() => {
        setForm(initialFormState);
        setResult(null);
      }, 3000);
    } catch (err) {
      const error = err;
      onError?.(error);
      setValidation((prev) => ({
        ...prev,
        errors: [{ field: 'submit', message: error.message }],
      }));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────

  if (result) {
    const summary = getCountingSummary(result);
    return (
      <div
        style={{
          maxWidth: 600,
          backgroundColor: summary.status === 'success' ? '#e1f5ee' : '#fff3cd',
          border:
            summary.status === 'success'
              ? '2px solid #4caf50'
              : '2px solid #ffc107',
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>
          {summary.status === 'success' ? '✅' : '⚠️'}
        </div>
        <h3
          style={{
            color: summary.status === 'success' ? '#1b5e20' : '#856404',
            margin: '0 0 12px',
          }}
        >
          {getSuccessMessage(result)}
        </h3>

        {result.alerts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <AlertWidget alerts={result.alerts} compact />
          </div>
        )}

        <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          <strong>Aderência:</strong>{' '}
          {result.adherenceSummary.abcAdherent ? '100%' : '0%'} |{' '}
          <strong>Validade:</strong> {result.adherenceSummary.expiryStatus}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {getNextActions(result).map((action, i) => (
            <button
              key={i}
              onClick={() => {
                setForm(initialFormState);
                setResult(null);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: summary.status === 'success' ? '#4caf50' : '#ff9800',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        maxWidth: 600,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <h2 style={{ color: '#333', marginBottom: 24 }}>📝 Registrar Contagem</h2>

      {/* Alertas de validação */}
      {validation.errors.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <AlertWidget
            alerts={validation.errors.map((e) => ({
              type: 'PRODUCT_MISMATCH',
              message: e.message,
              severity: 'error',
            }))}
          />
        </div>
      )}

      {/* Localização */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#333' }}>
          📍 Localização (ID)
        </label>
        <input
          type="text"
          placeholder="loc_123"
          value={form.locationId}
          onChange={(e) => setForm({ ...form, locationId: e.target.value })}
          disabled={validation.loading}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #ddd',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
        {form.location && (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              backgroundColor: '#e8f5e9',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <strong>SKU esperado:</strong> {form.location.assignedSkuId}
            <br />
            <strong>Endereço:</strong> {form.location.areaName} › Rua{' '}
            {form.location.street} › Pos. {form.location.palettePosition}
          </div>
        )}
      </div>

      {/* Produto */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#333' }}>
          📦 Produto (ID)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="prod_123"
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            disabled={validation.loading || !form.location}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border:
                validation.skuMatch === false
                  ? '2px solid #ef4444'
                  : validation.skuMatch === true
                    ? '2px solid #4caf50'
                    : '1px solid #ddd',
              fontSize: 14,
            }}
          />
          {validation.loading && <span style={{ padding: '10px' }}>⏳</span>}
          {validation.skuMatch === true && (
            <span style={{ fontSize: 20 }}>✅</span>
          )}
          {validation.skuMatch === false && (
            <span style={{ fontSize: 20 }}>❌</span>
          )}
        </div>
        {form.product && (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              backgroundColor:
                validation.skuMatch === false ? '#ffebee' : '#e8f5e9',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <strong>SKU:</strong> {form.product.sku}
            <br />
            <strong>Nome:</strong> {form.product.name}
            <br />
            <strong>Curva:</strong> {form.product.curve} |{' '}
            <strong>Cx/Palete:</strong> {form.product.cxPorPalete}
          </div>
        )}
      </div>

      {/* Quantidade */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#333' }}>
          📊 Quantidade (caixas)
        </label>
        <input
          type="number"
          min="1"
          value={form.countedQuantity || ''}
          onChange={(e) =>
            setForm({ ...form, countedQuantity: parseInt(e.target.value) || 0 })
          }
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #ddd',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Data de Validade */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#333' }}>
          📅 Data de Validade (DD/MM/YYYY)
        </label>
        <input
          type="text"
          placeholder="31/12/2025"
          value={form.expiryDate}
          onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: isExpiryValid ? '1px solid #4caf50' : '1px solid #ddd',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Lote (opcional) */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#333' }}>
          🏷️ Número de Lote (opcional)
        </label>
        <input
          type="text"
          placeholder="LOTE_2024_001"
          value={form.batchNumber}
          onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #ddd',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Observações (opcional) */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#333' }}>
          📝 Observações (opcional)
        </label>
        <textarea
          placeholder="Ex: Palete quebrada em 10 caixas"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #ddd',
            fontSize: 14,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Botão Submeter */}
      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          width: '100%',
          padding: 14,
          backgroundColor: canSubmit ? '#1D5A9E' : '#ccc',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? '⏳ Registrando...' : '✅ Registrar Contagem'}
      </button>

      {!canSubmit && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#999', textAlign: 'center' }}>
          Preencha todos os campos obrigatórios para continuar
        </div>
      )}
    </form>
  );
}
