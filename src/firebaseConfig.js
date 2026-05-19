import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore,
  persistentLocalCache, persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDGrbqUauCX_x3HCM-BVfgil3iWRp6nG5k",
  authDomain: "app-nri-e0598.firebaseapp.com",
  projectId: "app-nri-e0598",
  storageBucket: "app-nri-e0598.firebasestorage.app",
  messagingSenderId: "830481579610",
  appId: "1:830481579610:web:aff2e8b9de880c9d43a263"
};

const app = initializeApp(firebaseConfig);

// ─── Firestore com cache persistente (IndexedDB) ──────────────────────────
// Reduz drasticamente as leituras: a partir da 2ª visita, docs que não
// mudaram são servidos do cache local sem consumir quota do Firestore.
// `persistentMultipleTabManager` permite várias abas abertas ao mesmo tempo
// (sem ele, só 1 aba teria cache; as demais funcionariam mas sem cache).
// CACHE_SIZE_UNLIMITED: o SDK gerencia despejos automaticamente; melhor
// pra evitar misses em coleções grandes (inventory_logs, vendas, etc.).
//
// Fallback: se algum navegador não suportar IndexedDB (raro hoje), cai
// pro Firestore sem cache (igual a antes).
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: CACHE_SIZE_UNLIMITED,
    }),
  });
} catch (e) {
  console.warn('[Firestore] Persistência local indisponível, usando memória:', e.message);
  _db = getFirestore(app);
}
export const db   = _db;
export const auth = getAuth(app);

// Secondary app instance — used only to create new users without signing out the current admin.
// Sem cache: é instância usada só pra criar usuários, baixíssimo volume.
const appSecundario = initializeApp(firebaseConfig, 'secundario');
export const authSecundario = getAuth(appSecundario);
