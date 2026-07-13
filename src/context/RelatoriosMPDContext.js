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

  // Geração do cache: incrementa a cada troca de usuário/revenda. Fetch em voo
  // carrega a geração em que nasceu — se mudou quando resolve, é descartado
  // (era da revenda anterior). fetchingGenRef marca qual geração tem fetch em
  // voo (uma geração antiga em voo não bloqueia o fetch da nova).
  const genRef = useRef(0);
  const fetchingGenRef = useRef(-1);

  const carregar = useCallback(async () => {
    if (!usuario) return; // sem auth, nem tenta — evita read sem permissão
    const gen = genRef.current;
    if (fetchingGenRef.current === gen) return; // já tem fetch desta geração
    fetchingGenRef.current = gen;
    setCarregando(true);
    setErro(null);
    try {
      const [snapLinhas, metaSnap, snapMot] = await Promise.all([
        getDocs(colRevenda('relatorio031120')),
        getDoc(docRef('metas_mpd', rid || 'global')),
        getDocs(col('relatoriomotoristas')),
      ]);
      if (genRef.current !== gen) return; // resultado de revenda/usuário antigo

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
      if (genRef.current === gen) setErro(e);
      console.warn('[RelatoriosMPDContext] erro ao carregar:', e?.message || e);
    } finally {
      if (genRef.current === gen) setCarregando(false);
      if (fetchingGenRef.current === gen) fetchingGenRef.current = -1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, rid]);

  // Reset quando usuário OU revenda mudam — os dados são por revenda
  // (colRevenda), então trocar de revenda invalida o cache. Antes só o
  // logout resetava: trocar revenda deixava dados STALE da revenda anterior.
  useEffect(() => {
    genRef.current += 1;
    setLinhas(null);
    setMotoristasMap(null);
    setMetas(null);
  }, [usuario, rid]);

  // Carrega sempre que o cache estiver vazio (mount, pós-reset, recarregar()).
  // Auto-recuperável: antes o recarregar() zerava `linhas` esperando este
  // efeito re-executar, mas `linhas` não estava nas deps — o botão Atualizar
  // deixava as telas MPD vazias pra sempre (bug corrigido em 2026-07-13).
  useEffect(() => {
    if (!usuario) return;
    if (linhas === null) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, rid, linhas, carregar]);

  // Força refetch (pós-importação e botão "Atualizar" das páginas)
  const recarregar = useCallback(() => {
    setLinhas(null);
    setMotoristasMap(null);
    setMetas(null);
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
