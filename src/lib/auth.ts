// src/lib/auth.ts
import { signInWithPopup, signOut, User } from "firebase/auth";
import { auth, googleProvider, db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export async function loginWithGoogle() {
  const res = await signInWithPopup(auth, googleProvider);
  const u = res.user;
  await ensureUserDoc(u);
  return u;
}

export function logout() {
  return signOut(auth);
}

/** Garante users/{uid} com campos base. */
export async function ensureUserDoc(u: User) {
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: u.displayName ?? "",
      email: u.email ?? "",
      photoURL: u.photoURL ?? "",
      coupleId: null,
      role: "owner", // default; pode virar "member" ao entrar por convite
      createdAt: serverTimestamp(),
    });
  } else {
    // Atualiza info básica (sem quebrar coupleId/role)
    await setDoc(
      ref,
      {
        displayName: u.displayName ?? "",
        email: u.email ?? "",
        photoURL: u.photoURL ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

/** Lê o perfil do usuário */
export async function getUserProfile(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return { id: uid, ...(snap.data() || {}) } as {
    id: string;
    coupleId: string | null;
    role?: "owner" | "member";
    displayName?: string;
    email?: string;
    photoURL?: string;
  };
}
