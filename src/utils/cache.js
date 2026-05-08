const TTL_MS = 15 * 60 * 1000; // 15 minutos

export function lerCache(chave) {
  try {
    const raw = localStorage.getItem(`cache:${chave}`);
    if (!raw) return null;
    const { dados, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(`cache:${chave}`);
      return null;
    }
    return dados;
  } catch {
    return null;
  }
}

export function salvarCache(chave, dados) {
  try {
    localStorage.setItem(`cache:${chave}`, JSON.stringify({ dados, savedAt: Date.now() }));
  } catch {
    // QuotaExceededError — ignora silenciosamente
  }
}

export function invalidarCache(...chaves) {
  chaves.forEach(c => localStorage.removeItem(`cache:${c}`));
}
