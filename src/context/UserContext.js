import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { NIVEIS_SUPERVISOR } from '../pages/admin/ConfigurarEmpresaPage';

const UserContext = createContext(null);

// Níveis que podem visualizar e alternar entre todas as empresas
export const NIVEIS_MULTI_EMPRESA = ['admin', 'gerente', 'diretor'];

export function UserProvider({ children }) {
  const [usuario,       setUsuario]       = useState(null);
  const [empresa,       setEmpresa]       = useState(null); // empresa própria do usuário (imutável)
  const [todasEmpresas, setTodasEmpresas] = useState([]);   // lista para gerente+
  const [carregando,    setCarregando]    = useState(true);

  // Contexto de navegação (persistido em localStorage)
  const [empresaSelecionada, setEmpresaSelecionadaRaw] = useState(null);
  const [revendaSelecionada, setRevendaSelecionadaRaw] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUsuario(null);
        setEmpresa(null);
        setTodasEmpresas([]);
        setEmpresaSelecionadaRaw(null);
        setRevendaSelecionadaRaw('');
        setCarregando(false);
        return;
      }

      try {
        // 1. Carrega índice global do usuário
        const globalSnap = await getDoc(doc(db, 'usuarios_global', firebaseUser.uid));
        if (!globalSnap.exists()) {
          setUsuario(null);
          setEmpresa(null);
          setCarregando(false);
          return;
        }

        const globalData = globalSnap.data();
        const empresaId  = globalData.empresaId;

        // 2. Carrega empresa própria do usuário
        const empresaSnap = await getDoc(doc(db, 'empresas', empresaId));
        const empresaData = empresaSnap.exists()
          ? { id: empresaId, ...empresaSnap.data() }
          : { id: empresaId, nome: '', modulos: [], revendas: [] };

        const usuarioFinal = {
          uid:       firebaseUser.uid,
          email:     firebaseUser.email,
          nome:      globalData.nome,
          nivel:     globalData.nivel,
          revendaId: globalData.revendaId || null,
          empresaId,
        };

        setUsuario(usuarioFinal);
        setEmpresa(empresaData);

        // 3. Gerente / Diretor / Admin: carrega todas as empresas
        let todas = [empresaData];
        if (NIVEIS_MULTI_EMPRESA.includes(globalData.nivel)) {
          try {
            const todasSnap = await getDocs(collection(db, 'empresas'));
            todas = todasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch {
            // Sem permissão ou offline — usa só a própria
          }
        }
        setTodasEmpresas(todas);

        // 4. Restaura empresa selecionada (localStorage) ou usa a própria
        const savedEmpId = localStorage.getItem('wjs-empresa-sel');
        const empSel = todas.find(e => e.id === savedEmpId) || empresaData;
        setEmpresaSelecionadaRaw(empSel);

        // 5. Restaura revenda selecionada — validando contra a empresa atual.
        //    Regras:
        //     a) Se savedRev existe e está nas revendas da empresa → usa.
        //     b) Senão, se a empresa tem exatamente 1 revenda → auto-seleciona
        //        (caso comum: empresa "indivisa" cuja única revenda fica
        //         oculta no sidebar porque só faz sentido mostrar quando há >1).
        //     c) Senão, se o usuário tem revendaId própria E ela existe na
        //        empresa → usa (operador/conferente vinculado).
        //     d) Caso contrário → vazio (consultas usam 'global').
        const savedRev = localStorage.getItem('wjs-revenda-sel') || '';
        const revendasDaEmp = (empSel?.revendas || []).filter(Boolean);
        const revendaIds = revendasDaEmp.map(r => typeof r === 'string' ? r : (r?.id || r?.nome || ''));

        let revAtiva = '';
        if (savedRev && revendaIds.includes(savedRev)) {
          revAtiva = savedRev;
        } else if (revendaIds.length === 1) {
          revAtiva = revendaIds[0];
        } else if (usuarioFinal.revendaId && revendaIds.includes(usuarioFinal.revendaId)) {
          revAtiva = usuarioFinal.revendaId;
        }

        // [DEBUG TEMPORÁRIO — Curva ABC vazia] remover quando confirmado o fix
        console.log('[WJS DEBUG][UserContext] resolve revenda', {
          empresaId: empSel?.id,
          empresaNome: empSel?.nome,
          revendasRaw: empSel?.revendas,
          revendaIds,
          savedRev,
          revendaIdDoUsuario: usuarioFinal?.revendaId,
          revAtivaResolvida: revAtiva,
        });

        // Sincroniza localStorage com a escolha resolvida
        if (revAtiva) {
          localStorage.setItem('wjs-revenda-sel', revAtiva);
        } else if (savedRev) {
          localStorage.removeItem('wjs-revenda-sel');
        }
        setRevendaSelecionadaRaw(revAtiva);

      } catch (err) {
        console.error('Erro ao carregar usuário:', err);
        setUsuario(null);
        setEmpresa(null);
      }

      setCarregando(false);
    });

    return unsub;
  }, []);

  // ── Setters públicos ─────────────────────────────────────────────

  function setEmpresaSelecionada(emp) {
    setEmpresaSelecionadaRaw(emp);
    localStorage.setItem('wjs-empresa-sel', emp.id);

    // Resolve revenda ativa para a nova empresa (mesma regra do bootstrap):
    // se a empresa tem exatamente 1 revenda, auto-seleciona — assim consultas
    // que usam o `rid` apontam pro lugar certo sem o usuário ter que escolher.
    const revs = (emp?.revendas || []).filter(Boolean)
      .map(r => typeof r === 'string' ? r : (r?.id || r?.nome || ''));
    let revAtiva = '';
    if (revs.length === 1) revAtiva = revs[0];
    else if (usuario?.revendaId && revs.includes(usuario.revendaId)) revAtiva = usuario.revendaId;

    if (revAtiva) localStorage.setItem('wjs-revenda-sel', revAtiva);
    else localStorage.removeItem('wjs-revenda-sel');
    setRevendaSelecionadaRaw(revAtiva);
  }

  function setRevendaSelecionada(rev) {
    setRevendaSelecionadaRaw(rev);
    if (rev) localStorage.setItem('wjs-revenda-sel', rev);
    else localStorage.removeItem('wjs-revenda-sel');
  }

  // ── Revendas disponíveis na empresa selecionada ─────────────────

  const revendasVisiveis = (() => {
    const emp = empresaSelecionada || empresa;
    if (!emp?.revendas || !usuario) return [];
    const todas = emp.revendas.filter(Boolean); // remove strings vazias
    if (NIVEIS_SUPERVISOR.includes(usuario.nivel)) return todas;
    // Operadores/conferentes veem só a própria revenda
    return todas.filter(r =>
      (typeof r === 'string' ? r : r?.id) === usuario.revendaId
    );
  })();

  return (
    <UserContext.Provider value={{
      usuario,
      empresa,
      carregando,
      todasEmpresas,
      empresaSelecionada,
      setEmpresaSelecionada,
      revendaSelecionada,
      setRevendaSelecionada,
      revendasVisiveis,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
