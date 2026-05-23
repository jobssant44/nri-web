import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore,
  persistentLocalCache, persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Toggle controlado por env var. Vide CLAUDE.md > Emulator pra detalhes.
// Ativar com REACT_APP_USE_EMULATOR=true (use `npm run start:dev`).
const USE_EMULATOR = process.env.REACT_APP_USE_EMULATOR === 'true';

const firebaseConfig = {
  apiKey: "AIzaSyDGrbqUauCX_x3HCM-BVfgil3iWRp6nG5k",
  authDomain: "app-nri-e0598.firebaseapp.com",
  projectId: "app-nri-e0598",
  storageBucket: "app-nri-e0598.firebasestorage.app",
  messagingSenderId: "830481579610",
  appId: "1:830481579610:web:aff2e8b9de880c9d43a263"
};

const app = initializeApp(firebaseConfig);

// ─── Firestore ─────────────────────────────────────────────────────────────
// Em produção: cache persistente (IndexedDB) pra reduzir leituras.
// No Emulator: sem cache — dados são locais e voláteis, cache atrapalha
// (depois de editar via UI do emulator a 4000, o app continuaria vendo o doc
//  antigo do IndexedDB).
let _db;
if (USE_EMULATOR) {
  // Workaround obrigatório no emulator local. O WebChannel default + fetch
  // streams tem buffer de back-channel limitado a ~10k mensagens e derruba
  // a conexão em queries grandes (ex: ~16k produtos). A combinação certa é
  // `experimentalForceLongPolling` + `useFetchStreams: false` — força XHR
  // long polling em vez de WebChannel+fetch streams. Em produção continua
  // WebChannel normal (sem essas flags).
  // Ref: https://github.com/firebase/firebase-tools/issues/4256
  _db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });
  connectFirestoreEmulator(_db, 'localhost', 8080);
  // eslint-disable-next-line no-console
  console.log('%c[Firestore] 🔌 EMULATOR (localhost:8080) [long-polling XHR]', 'color:#E31837;font-weight:bold');
} else {
  // Cache persistente reduz drasticamente as leituras: a partir da 2ª visita,
  // docs que não mudaram são servidos do cache local sem consumir quota.
  // CACHE_SIZE_UNLIMITED: SDK gerencia despejos automaticamente.
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
}
export const db = _db;

// ─── Auth ──────────────────────────────────────────────────────────────────
export const auth = getAuth(app);
if (USE_EMULATOR) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  // eslint-disable-next-line no-console
  console.log('%c[Auth] 🔌 EMULATOR (localhost:9099)', 'color:#E31837;font-weight:bold');
}

// Secondary app instance — used only to create new users without signing out the current admin.
// Sem cache: é instância usada só pra criar usuários, baixíssimo volume.
const appSecundario = initializeApp(firebaseConfig, 'secundario');
export const authSecundario = getAuth(appSecundario);
if (USE_EMULATOR) {
  connectAuthEmulator(authSecundario, 'http://localhost:9099', { disableWarnings: true });
}
