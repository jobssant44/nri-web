import { useState, useCallback } from 'react';

export function useSessionFilter(key, defaultValue) {
  const [value, setValueRaw] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored === null) return defaultValue;
      return JSON.parse(stored);
    } catch {
      return defaultValue;
    }
  });

  const setValue = useCallback((newValue) => {
    setValueRaw(prev => {
      const next = typeof newValue === 'function' ? newValue(prev) : newValue;
      try { sessionStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  return [value, setValue];
}
