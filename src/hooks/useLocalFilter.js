import { useState, useCallback } from 'react';

/**
 * Igual ao useSessionFilter, mas persiste em localStorage — o valor SOBREVIVE a
 * fechar o navegador (o de sessão reseta ao fechar a aba). Usado nos filtros do
 * módulo Gestão de Prejuízo, que o usuário quer manter entre sessões.
 *
 * Drop-in do useState: mesma assinatura, suporta updater funcional.
 */
export function useLocalFilter(key, defaultValue) {
  const [value, setValueRaw] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;
      return JSON.parse(stored);
    } catch {
      return defaultValue;
    }
  });

  const setValue = useCallback((newValue) => {
    setValueRaw(prev => {
      const next = typeof newValue === 'function' ? newValue(prev) : newValue;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  return [value, setValue];
}
