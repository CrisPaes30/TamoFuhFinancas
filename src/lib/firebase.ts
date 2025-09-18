// src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  clearIndexedDbPersistence,
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

/** ---------- Config ---------- */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Fail-fast se faltar env
for (const [k, v] of Object.entries(firebaseConfig)) {
  if (!v) throw new Error(`Firebase env ${k} ausente/undefined`);
}

/** ---------- App singleton ---------- */
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

/** ---------- Firestore ----------
 * Dev: cache em memória (nada no IndexedDB) para evitar sujeira de cache.
 * Prod: cache persistente (IndexedDB) para melhor UX offline.
 */
const isDev = import.meta.env.DEV === true;
export const db = initializeFirestore(app, {
  localCache: isDev ? memoryLocalCache() : persistentLocalCache(),
});

/** ---------- Auth ---------- */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Mantém a sessão após reload/fechar/abrir navegador
await setPersistence(auth, browserLocalPersistence);

/** ---------- Helpers ---------- */
export function watchAuth(cb: (u: any) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function signInGoogle() {
  // (lazy import não é obrigatório aqui, mas mantive simples)
  return signInWithPopup(auth, googleProvider);
}

export async function logout() {
  await signOut(auth);
}

/** 💣 Dev: apaga TUDO local (cache/persistência) e recarrega */
export async function devNukeAll() {
  try {
    await signOut(auth);
  } catch {}

  try {
    // Limpa persistência do Firestore (IndexedDB)
    await clearIndexedDbPersistence(db);
  } catch {
    // Ignora se já não houver persistência ativa
  }

  // Deleta bancos conhecidos (fallback para browsers sem clearIndexedDbPersistence)
  try {
    const names = [
      "firebaseLocalStorageDb",
      "firebase-installations-database",
      "firebase-messaging-database",
      "firestore/[DEFAULT]/main",
    ];
    // lista dinâmica se suportado
    // @ts-ignore
    const listed =
      (await indexedDB.databases?.())
        ?.map((d: any) => d.name)
        .filter(Boolean) || [];
    const all = Array.from(new Set([...names, ...listed]));
    await Promise.all(
      all.map(
        (name) =>
          new Promise<void>((resolve) => {
            if (!name) return resolve();
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          })
      )
    );
  } catch {}

  try {
    localStorage.clear();
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}

  // Se for PWA / service worker
  try {
    // @ts-ignore
    if (self?.caches?.keys) {
      // @ts-ignore
      const keys = await caches.keys();
      await Promise.all(keys.map((k: string) => caches.delete(k)));
    }
  } catch {}
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}

  location.reload();
}
