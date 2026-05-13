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

        // 5. Restaura revenda selecionada
        const savedRev = localStorage.getItem('wjs-revenda-sel') || '';
        setRevendaSelecionadaRaw(savedRev);

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
    setRevendaSelecionadaRaw(''); // reseta revenda ao trocar empresa
    localStorage.setItem('wjs-empresa-sel', emp.id);
    localStorage.removeItem('wjs-revenda-sel');
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
