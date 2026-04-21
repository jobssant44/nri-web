/**
 * Estilos reformulados para formulários (design minimalista)
 * Reutilizável em todos os componentes
 */

export const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
  transition: 'all 0.2s',
  outline: 'none',
  fontFamily: 'inherit',
};

export const inputFocusStyle = {
  borderColor: '#E31837',
  boxShadow: '0 0 0 3px rgba(227, 24, 55, 0.08)',
};

export const buttonPrimaryStyle = {
  padding: '11px 20px',
  backgroundColor: '#E31837',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  transition: 'all 0.2s',
};

export const buttonSecondaryStyle = {
  padding: '11px 20px',
  backgroundColor: '#f5f5f5',
  color: '#333',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
  transition: 'all 0.2s',
};

export const buttonDangerStyle = {
  padding: '11px 20px',
  backgroundColor: '#fee2e2',
  color: '#E31837',
  border: '1px solid #fca5a5',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  transition: 'all 0.2s',
};

export const selectStyle = {
  ...inputStyle,
};

export const textareaStyle = {
  ...inputStyle,
  minHeight: '100px',
  fontFamily: 'inherit',
  resize: 'vertical',
};

export const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#333',
  marginBottom: 8,
};

export const tableHeaderStyle = {
  backgroundColor: '#f9f9f9',
  borderBottom: '2px solid #e0e0e0',
};

export const tableHeaderCellStyle = {
  padding: '12px 14px',
  textAlign: 'left',
  color: '#555',
  fontWeight: 600,
  fontSize: 13,
};

export const tableCellStyle = {
  padding: '12px 14px',
  borderBottom: '1px solid #f0f0f0',
  fontSize: 13,
};

export const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: 8,
  border: '1px solid #f0f0f0',
  padding: 24,
  transition: 'all 0.2s',
};

export const alertStyle = (type = 'info') => {
  const colors = {
    success: { bg: '#dcfce7', border: '#86efac', text: '#166534' },
    error: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
    warning: { bg: '#fef3c7', border: '#fde047', text: '#92400e' },
    info: { bg: '#dbeafe', border: '#7dd3fc', text: '#0369a1' },
  };
  const color = colors[type] || colors.info;
  return {
    backgroundColor: color.bg,
    border: `1px solid ${color.border}`,
    color: color.text,
    borderRadius: 6,
    padding: '12px 14px',
    fontSize: 13,
  };
};
