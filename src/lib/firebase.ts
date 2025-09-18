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

/** ---------- Config das ENVs ---------- */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,        // ex: tamo-fuhh.appspot.com
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// fail-fast só nos campos essenciais; se não usar Storage, pode deixar vazio
for (const key of ["apiKey", "authDomain", "projectId", "appId", "messagingSenderId"]) {
  // @ts-ignore
  if (!firebaseConfig[key]) throw new Error(`Firebase env ${key} ausente/undefined`);
}

/** ---------- App singleton ---------- */
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

/** ---------- Firestore ---------- */
const isDev = import.meta.env.DEV === true;
export const db = initializeFirestore(app, {
  localCache: isDev ? memoryLocalCache() : persistentLocalCache(),
});

/** ---------- Auth ---------- */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// ⚠️ Sem top-level await (evita quebra no build)
setPersistence(auth, browserLocalPersistence).catch((e) => {
  if (import.meta.env.DEV) console.warn("setPersistence falhou (dev):", e);
});

/** ---------- Helpers ---------- */
export function watchAuth(cb: (u: any) => void) {
  return onAuthStateChanged(auth, cb);
}
export async function signInGoogle() {
  return signInWithPopup(auth, googleProvider);
}
export async function logout() {
  await signOut(auth);
}

/** 💣 Dev: limpar caches locais — protegido para rodar só no browser */
export async function devNukeAll() {
  if (typeof window === "undefined") return; // evita rodar em build/SSR
  try { await signOut(auth); } catch {}

  try { await clearIndexedDbPersistence(db); } catch {}
  try {
    // @ts-ignore
    const listed = (await indexedDB.databases?.())?.map((d: any) => d.name).filter(Boolean) || [];
    const names = new Set<string>([
      "firebaseLocalStorageDb",
      "firebase-installations-database",
      "firebase-messaging-database",
      "firestore/[DEFAULT]/main",
      ...listed,
    ]);
    await Promise.all(
      [...names].map(
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

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
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
