/**
 * AlertWidget - Componente reutilizável para exibir alertas
 *
 * Exibe alertas de validação, divergência, validade, etc.
 * Suporta múltiplos tipos de alerta com cores e ícones diferentes.
 */

import React from 'react';

const ALERT_COLORS = {
  error: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', icon: '❌' },
  warning: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', icon: '⚠️' },
  info: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', icon: 'ℹ️' },
};

export function AlertWidget({
  alerts,
  onDismiss,
  compact = false,
}) {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {alerts.map((alert, i) => {
          const colors = ALERT_COLORS[alert.severity];
          return (
            <span
              key={i}
              style={{
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {colors.icon} {alert.message.substring(0, 50)}...
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {alerts.map((alert, index) => {
        const colors = ALERT_COLORS[alert.severity];
        return (
          <div
            key={index}
            style={{
              backgroundColor: colors.bg,
              border: `2px solid ${colors.border}`,
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            {/* Ícone */}
            <div style={{ fontSize: 24, flexShrink: 0 }}>{colors.icon}</div>

            {/* Conteúdo */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {alert.message}
              </div>

              {/* Ações sugeridas */}
              {alert.suggestedActions && alert.suggestedActions.length > 0 && (
                <div style={{ fontSize: 12, color: colors.text, opacity: 0.8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Ações sugeridas:
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {alert.suggestedActions.map((action, i) => (
                      <button
                        key={i}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: colors.border,
                          border: 'none',
                          borderRadius: 6,
                          color: colors.text,
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 11,
                          transition: 'all .2s',
                        }}
                        onMouseEnter={(e) => {
                          const target = e.target;
                          target.style.opacity = '0.8';
                        }}
                        onMouseLeave={(e) => {
                          const target = e.target;
                          target.style.opacity = '1';
                        }}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fechar */}
            {onDismiss && (
              <button
                onClick={() => onDismiss(index)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                  color: colors.text,
                  opacity: 0.6,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Resumo compacto de alertas (para headers)
 *
 * Exibe: "3 alertas: 1 erro, 2 avisos"
 */
export function AlertSummary({ alerts }: { alerts: CountingAlert[] }) {
  if (!alerts || alerts.length === 0) return null;

  const errors = alerts.filter((a) => a.severity === 'error').length;
  const warnings = alerts.filter((a) => a.severity === 'warning').length;
  const infos = alerts.filter((a) => a.severity === 'info').length;

  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} erro${errors > 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} aviso${warnings > 1 ? 's' : ''}`);
  if (infos > 0) parts.push(`${infos} info${infos > 1 ? 's' : ''}`);

  return (
    <div
      style={{
        padding: '8px 12px',
        backgroundColor: errors > 0 ? '#fee2e2' : '#fef3c7',
        border:
          errors > 0 ? '1px solid #fca5a5' : '1px solid #fcd34d',
        borderRadius: 6,
        fontSize: 13,
        color: errors > 0 ? '#991b1b' : '#92400e',
        fontWeight: 600,
      }}
    >
      {alerts.length} alerta{alerts.length > 1 ? 's' : ''}: {parts.join(', ')}
    </div>
  );
}
