// src/lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache,
  clearIndexedDbPersistence,
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  setPersistence,
  inMemoryPersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// fail-fast se faltar env
for (const [k, v] of Object.entries(firebaseConfig)) {
  if (!v) throw new Error(`Firebase env ${k} ausente/undefined`);
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 🔒 DEV: Firestore em memória (NADA vai para IndexedDB)
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 🔒 DEV: Auth sem persistência (memória apenas)
setPersistence(auth, inMemoryPersistence).catch(() => {});

// Helpers
export function watchAuth(cb: (u: any) => void) {
  return onAuthStateChanged(auth, cb);
}
export async function signInGoogle() {
  await signInWithPopup(auth, googleProvider);
}
export async function logout() {
  await signOut(auth);
}

/** 💣 Dev: apaga TUDO que seja cache/local e recarrega */
export async function devNukeAll() {
  try { await signOut(auth); } catch {}
  try { await clearIndexedDbPersistence(db); } catch {}

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
    const listed = (await indexedDB.databases?.())?.map((d: any) => d.name).filter(Boolean) || [];
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

  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}

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
