import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDGrbqUauCX_x3HCM-BVfgil3iWRp6nG5k",
  authDomain: "app-nri-e0598.firebaseapp.com",
  projectId: "app-nri-e0598",
  storageBucket: "app-nri-e0598.firebasestorage.app",
  messagingSenderId: "830481579610",
  appId: "1:830481579610:web:aff2e8b9de880c9d43a263"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);