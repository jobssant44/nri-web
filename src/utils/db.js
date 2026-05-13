import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useUser } from '../context/UserContext';

// Hook — returns helpers pre-bound to the currently selected empresa.
// When the user switches empresa via the sidebar selector, ALL queries
// automatically point to the new empresa without any page-level changes.
export function useDb() {
  const { usuario, empresaSelecionada, revendaSelecionada } = useUser();
  const eid = empresaSelecionada?.id ?? usuario?.empresaId ?? '__sem_empresa__';
  const rid = revendaSelecionada || null;

  return {
    // ── ID da revenda ativa (null quando "Todas" está selecionado).
    //    Use para compor chaves de documentos únicos por revenda.
    rid,

    // ── Coleção base (empresa) — use para leituras sem filtro de revenda
    //    e para TODAS as operações de escrita.
    col:    (nome)     => collection(db, 'empresas', eid, nome),
    docRef: (nome, id) => doc(db, 'empresas', eid, nome, id),
    db,

    // ── Coleção filtrada por revenda — use para leituras de dados operacionais.
    //    Se nenhuma revenda estiver selecionada, retorna a coleção completa.
    colRevenda: (nome) => {
      const c = collection(db, 'empresas', eid, nome);
      return rid ? query(c, where('revendaId', '==', rid)) : c;
    },

    // ── Carimbo de revenda — espalhe em todo documento novo.
    //    Usa revendaSelecionada (gerente/supervisor navegando) ou
    //    usuario.revendaId (conferente/operador na sua própria revenda).
    stamp: () => ({
      revendaId: rid ?? usuario?.revendaId ?? null,
    }),
  };
}

// Standalone helpers (for use outside components, e.g. in service files)
export function empresaCol(empresaId, nome) {
  return collection(db, 'empresas', empresaId, nome);
}
export function empresaDocRef(empresaId, nome, id) {
  return doc(db, 'empresas', empresaId, nome, id);
}
