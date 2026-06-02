// ─────────────────────────────────────────────────────────────────────────────
// RelatoriosMPDContext — cache em memória das 3 fontes compartilhadas por
// EFC, EFD, TI (Total/Físico/Financeiro) e Histograma.
//
// PROBLEMA: 6 páginas faziam o MESMO fetch de:
//   - colRevenda('relatorio031120')     (linhas — pode ser milhares)
//   - col('relatoriomotoristas')         (códigos→nomes)
//   - docRef('metas_mpd', rid|'global')  (metas de horário e %)
//
// Cada navegação entre as 6 páginas refazia tudo do zero — 6× o tráfego.
// Multiplicado por testes, refresh, troca de tipo TI = quota explodindo.
//
// SOLUÇÃO: carrega 1× por sessão, expõe via hook `useRelatoriosMPD()`.
// O reload é manual (botão "Atualizar" nas páginas chama `recarregar()`).
//
// Espelha o padrão de CatalogosContext (produtos/locations/etc).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getDocs, getDoc } from 'firebase/firestore';
import { useDb } from '../utils/db';
import { useUser } from './UserContext';

const RelatoriosMPDContext = createContext(null);

export function RelatoriosMPDProvider({ children }) {
  const { col, docRef, colRevenda, rid } = useDb();
  const { usuario } = useUser();

  // null = ainda não carregado. [] / {} = vazio mas carregado.
  const [linhas,         setLinhas]         = useState(null);
  const [motoristasMap,  setMotoristasMap]  = useState(null);
  const [metas,          setMetas]          = useState(null);
  const [carregando,     setCarregando]     = useState(false);
  const [erro,           setErro]           = useState(null);

  // Evita re-entrada se o useEffect dispara várias vezes (StrictMode/foco)
  const fetchingRef = useRef(false);

  const carregar = useCallback(async () => {
    if (fetchingRef.current) return;
    if (!usuario) return; // sem auth, nem tenta — evita read sem permissão
    fetchingRef.current = true;
    setCarregando(true);
    setErro(null);
    try {
      const [snapLinhas, metaSnap, snapMot] = await Promise.all([
        getDocs(colRevenda('relatorio031120')),
        getDoc(docRef('metas_mpd', rid || 'global')),
        getDocs(col('relatoriomotoristas')),
      ]);

      const novasLinhas = snapLinhas.docs.map(d => d.data());

      // Mapa { codigo: nome } com normalização de zeros à esquerda — mesma
      // lógica que estava duplicada nas 3 páginas MPD.
      const mmap = {};
      snapMot.docs.forEach(d => {
        const m = d.data();
        const cod     = String(m.codigoMotorista ?? '').trim().replace(/^0+(?=\d)/, '');
        const codBruto = String(m.codigoMotorista ?? '').trim();
        if (cod)      mmap[cod]      = m.nomeMotorista || '';
        if (codBruto && codBruto !== cod) mmap[codBruto] = m.nomeMotorista || '';
      });

      const novasMetas = metaSnap.exists() ? metaSnap.data() : { horarios: {}, percents: {} };

      setLinhas(novasLinhas);
      setMotoristasMap(mmap);
      setMetas(novasMetas);
    } catch (e) {
      setErro(e);
      console.warn('[RelatoriosMPDContext] erro ao carregar:', e?.message || e);
    } finally {
      setCarregando(false);
      fetchingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, rid]);

  // Eager load — carrega 1× quando o usuário loga (igual CatalogosContext)
  useEffect(() => {
    if (!usuario) {
      // Logout / troca de usuário → reseta cache
      setLinhas(null);
      setMotoristasMap(null);
      setMetas(null);
      return;
    }
    if (linhas === null && !fetchingRef.current) {
      carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, rid]);

  // Botão "Atualizar" das páginas chama isso — força refetch
  const recarregar = useCallback(() => {
    if (fetchingRef.current) return;
    setLinhas(null);   // dispara o useEffect acima → carregar()
  }, []);

  return (
    <RelatoriosMPDContext.Provider value={{
      // Defaults seguros: array/objeto vazio se ainda não carregou —
      // páginas não precisam testar null em todo cálculo derivado.
      linhas: linhas || [],
      motoristasMap: motoristasMap || {},
      metas: metas || { horarios: {}, percents: {} },
      carregando,
      erro,
      // pronto = true quando todos os 3 datasets já vieram
      pronto: linhas !== null && motoristasMap !== null && metas !== null,
      recarregar,
    }}>
      {children}
    </RelatoriosMPDContext.Provider>
  );
}

export function useRelatoriosMPD() {
  const ctx = useContext(RelatoriosMPDContext);
  if (!ctx) throw new Error('useRelatoriosMPD precisa estar dentro de <RelatoriosMPDProvider>');
  return ctx;
}
