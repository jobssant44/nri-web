/**
 * CatalogosContext — cache em memória de coleções "frias" do Firestore.
 *
 * Coleções cobertas:
 *   - produtos         (eager: carrega 1x quando o usuário loga)
 *   - locations        (eager: carrega 1x quando o usuário loga)
 *   - picking_config   (lazy:  carrega na primeira chamada)
 *   - locations_mensal (lazy:  carrega por chaveMes, mantém mapa em cache)
 *
 * Por que isso? Cada uma dessas é lida em várias páginas. Sem cache, navegar
 * entre 5 telas pode disparar 5 fetches da mesma coleção (e até 5×16.940
 * reads no caso de `produtos`). Com o cache em memória, navegação fica
 * grátis (0 reads) até o usuário fechar a aba.
 *
 * O IndexedDB Persistence do SDK (já ativo) ajuda entre sessões, mas requer
 * round-trip ao servidor pra validar a coleção. Este cache evita até esse
 * round-trip dentro de uma mesma sessão.
 *
 * INVALIDAÇÃO: após importar produtos via 01.11, importar layout, etc., a
 * página que fez a importação deve chamar `invalidarProdutos()`/etc. pra
 * forçar reload na próxima leitura. Sem invalidação, o cache mostra dados
 * antigos até o usuário recarregar a aba.
 */

import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getDocs, query, where, orderBy, limit, startAfter } from 'firebase/firestore';
import { useDb } from '../utils/db';
import { useUser } from './UserContext';

// Tamanho da página pra fetches paginados de coleções grandes.
// O Firestore Emulator local tem back-channel limitado (~10k mensagens),
// então uma query única com 16k+ docs derruba a conexão. Paginar em batches
// de 1000 contorna isso e funciona idêntico em produção (mesmo total de reads).
const PAGE_SIZE = 1000;

/**
 * Lê uma coleção inteira em batches paginados de PAGE_SIZE docs.
 * Usa orderBy('__name__') (= doc ID) + startAfter pra paginar sem precisar
 * de campo indexado adicional.
 */
async function getAllDocsPaged(colRef) {
  const out = [];
  let lastDocSnap = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = lastDocSnap
      ? query(colRef, orderBy('__name__'), startAfter(lastDocSnap), limit(PAGE_SIZE))
      : query(colRef, orderBy('__name__'), limit(PAGE_SIZE));
    const snap = await getDocs(q);
    snap.docs.forEach(d => out.push({ id: d.id, ...d.data() }));
    if (snap.docs.length < PAGE_SIZE) break;
    lastDocSnap = snap.docs[snap.docs.length - 1];
  }
  return out;
}

const CatalogosContext = createContext(null);

export function CatalogosProvider({ children }) {
  const { col, rid } = useDb();
  const { usuario, empresa, empresaSelecionada } = useUser();

  // Estado das coleções (null = ainda não carregado)
  const [produtos,        setProdutos]        = useState(null);
  const [locations,       setLocations]       = useState(null);
  const [pickingConfig,   setPickingConfig]   = useState(null);
  // locations_mensal vira um mapa: { [chaveMes]: docs[] }
  const [locationsMensal, setLocationsMensal] = useState({});

  // Refs pra evitar fetches duplicados (race entre componentes que pedem
  // a mesma coleção simultaneamente)
  const fetchingRef = useRef({});

  // Identifica empresa atual (pra reset quando trocar)
  const empresaAtualId = empresaSelecionada?.id ?? empresa?.id ?? usuario?.empresaId ?? null;

  // ─── Reset quando o usuário muda ou empresa muda ────────────────────────
  // (eslint disable: `col` muda toda render por causa do useDb — deve ser
  // ignorado nas deps; usamos `empresaAtualId` como sinal real de troca)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setProdutos(null);
    setLocations(null);
    setPickingConfig(null);
    setLocationsMensal({});
    fetchingRef.current = {};
  }, [empresaAtualId, rid]);

  // ─── Eager load de produtos e locations ────────────────────────────────
  // Carrega assim que houver empresa válida. Se já tiver carregado, pula.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!empresaAtualId) return;
    if (produtos !== null && locations !== null) return;

    let cancelado = false;
    (async () => {
      try {
        const tasks = [];
        if (produtos === null && !fetchingRef.current.produtos) {
          fetchingRef.current.produtos = true;
          tasks.push(
            getAllDocsPaged(col('produtos')).then(lista => {
              if (cancelado) return;
              setProdutos(lista);
            }).finally(() => { fetchingRef.current.produtos = false; })
          );
        }
        if (locations === null && !fetchingRef.current.locations) {
          fetchingRef.current.locations = true;
          tasks.push(
            getAllDocsPaged(col('locations')).then(lista => {
              if (cancelado) return;
              setLocations(lista);
            }).finally(() => { fetchingRef.current.locations = false; })
          );
        }
        await Promise.all(tasks);
      } catch (e) {
        console.error('[CatalogosContext] falha no eager load:', e);
      }
    })();

    return () => { cancelado = true; };
  }, [empresaAtualId]);

  // ─── Helpers lazy ───────────────────────────────────────────────────────
  const obterPickingConfig = useCallback(async () => {
    if (pickingConfig !== null) return pickingConfig;
    if (fetchingRef.current.pickingConfig) return fetchingRef.current.pickingConfig;
    fetchingRef.current.pickingConfig = (async () => {
      const lista = await getAllDocsPaged(col('picking_config'));
      setPickingConfig(lista);
      delete fetchingRef.current.pickingConfig;
      return lista;
    })();
    return fetchingRef.current.pickingConfig;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickingConfig]);

  const obterLocationsMensal = useCallback(async (chaveMes) => {
    if (!chaveMes) return [];
    if (locationsMensal[chaveMes]) return locationsMensal[chaveMes];
    const fetchKey = `locationsMensal:${chaveMes}`;
    if (fetchingRef.current[fetchKey]) return fetchingRef.current[fetchKey];
    fetchingRef.current[fetchKey] = (async () => {
      const snap = await getDocs(query(col('locations_mensal'), where('chaveMes', '==', chaveMes)));
      const lista = snap.docs.map(d => d.data());
      setLocationsMensal(prev => ({ ...prev, [chaveMes]: lista }));
      delete fetchingRef.current[fetchKey];
      return lista;
    })();
    return fetchingRef.current[fetchKey];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsMensal]);

  // ─── Invalidações (chamar após importação/edição) ──────────────────────
  const invalidarProdutos        = useCallback(() => setProdutos(null), []);
  const invalidarLocations       = useCallback(() => setLocations(null), []);
  const invalidarPickingConfig   = useCallback(() => setPickingConfig(null), []);
  const invalidarLocationsMensal = useCallback((chaveMes) => {
    if (chaveMes) {
      setLocationsMensal(prev => {
        const novo = { ...prev };
        delete novo[chaveMes];
        return novo;
      });
    } else {
      setLocationsMensal({});
    }
  }, []);

  // ─── Helpers de conveniência (memoizados) ──────────────────────────────
  // Mapa { codigo: descricao } — usado por várias telas pra exibir nome
  // do produto a partir do código.
  const produtosMap = useMemo(() => {
    if (!produtos) return {};
    const m = {};
    produtos.forEach(p => {
      const cod = String(p.codigo || p.id || '').trim();
      if (cod) m[cod] = p.descricao || p.nome || '';
    });
    return m;
  }, [produtos]);

  // Mapa { codigo: cxPorPlt } — usado por planificador/dashboard pra cálculos
  const cxPorPltMap = useMemo(() => {
    if (!produtos) return {};
    const m = {};
    produtos.forEach(p => {
      const cod = String(p.codigo || p.id || '').trim();
      if (cod && p.paletizacao) m[cod] = Number(p.paletizacao);
    });
    return m;
  }, [produtos]);

  const value = useMemo(() => ({
    // Valores (podem ser null enquanto carrega)
    produtos, locations, pickingConfig, locationsMensal,
    produtosMap, cxPorPltMap,
    // Loaders lazy
    obterPickingConfig, obterLocationsMensal,
    // Invalidações
    invalidarProdutos, invalidarLocations, invalidarPickingConfig, invalidarLocationsMensal,
    // Estado de carregamento (true até os eager terminarem)
    carregandoCatalogos: produtos === null || locations === null,
  }), [
    produtos, locations, pickingConfig, locationsMensal,
    produtosMap, cxPorPltMap,
    obterPickingConfig, obterLocationsMensal,
    invalidarProdutos, invalidarLocations, invalidarPickingConfig, invalidarLocationsMensal,
  ]);

  return (
    <CatalogosContext.Provider value={value}>
      {children}
    </CatalogosContext.Provider>
  );
}

export function useCatalogos() {
  const ctx = useContext(CatalogosContext);
  if (!ctx) throw new Error('useCatalogos deve ser usado dentro de CatalogosProvider');
  return ctx;
}
