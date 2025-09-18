// src/components/auth/RequireAuth.tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, getDocFromServer, onSnapshot, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db, signInGoogle } from "@/lib/firebase";
import { useStore } from "@/store";
import Logo from "@/components/Logo";
import { fixDanglingCoupleId } from "@/services/fixDanglingCouple";

type Child = ReactNode | (() => ReactNode);
type Props = { children: Child; fallback?: JSX.Element };

function shallowEqual(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

export default function RequireAuth({ children, fallback }: Props) {
  const [phase, setPhase] = useState<"auth-loading"|"no-user"|"user-loading"|"ready">("auth-loading");
  const [uid, setUid] = useState("");

  // anti-loop refs
  const lastProfileRef = useRef<any>(null);
  const lastCoupleIdRef = useRef<string | null>(null);

  // 1) Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUid("");
        lastProfileRef.current = null;
        lastCoupleIdRef.current = null;
        // zera store sem derrubar para login antes de terminar a fase
        useStore.setState({ profile: null, couple: null, expenses: [], incomes: [] });
        setPhase("no-user");
        return;
      }
      setUid(u.uid);
      setPhase("user-loading");
    });
    return () => unsub();
  }, []);

  // 2) users/{uid}: cria se faltar, corrige coupleId, server-first + realtime
  useEffect(() => {
    if (!uid) return;

    const uref = doc(db, "users", uid);
    let off = () => {};

    (async () => {
      // cria doc se não existir
      const first = await getDoc(uref);
      if (!first.exists()) {
        await setDoc(uref, {
          uid,
          coupleId: null,
          displayName: auth.currentUser?.displayName || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // limpa coupleId órfão (best-effort)
      try { await fixDanglingCoupleId(uid); } catch {}

      // pega server-first (evita cache)
      try {
        const s = await getDocFromServer(uref);
        const data = s.exists() ? s.data() : null;
        if (!shallowEqual(data, lastProfileRef.current)) {
          useStore.getState().setProfile(data as any);
          lastProfileRef.current = data;
          lastCoupleIdRef.current = (data as any)?.coupleId ?? null;
        }
      } catch {
        // offline: segue para realtime
      }

      // realtime
      off = onSnapshot(uref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        if (!shallowEqual(data, lastProfileRef.current)) {
          useStore.getState().setProfile(data as any);
          lastProfileRef.current = data;
          lastCoupleIdRef.current = (data as any)?.coupleId ?? null;
        }
        setPhase("ready");
      });
    })();

    return () => off();
  }, [uid]);

  // 3) couples/{id}: se perfil aponta, assina casal
  useEffect(() => {
    const coupleId = lastCoupleIdRef.current;
    if (!coupleId) return;

    const cref = doc(db, "couples", coupleId);
    const off = onSnapshot(cref, { includeMetadataChanges: true }, async (snap) => {
      if (!snap.exists()) {
        try {
          const s = await getDocFromServer(cref);
          if (!s.exists()) {
            if (uid) {
              await updateDoc(doc(db, "users", uid), { coupleId: null, updatedAt: serverTimestamp() });
            }
            useStore.setState((st) => ({
              ...st,
              couple: null,
              profile: st.profile ? { ...st.profile, coupleId: null } : null,
              expenses: [], incomes: [],
            }));
            lastCoupleIdRef.current = null;
          }
        } catch {}
        return;
      }

      const d = snap.data() as any;
      useStore.getState().mergeCouple({
        id: coupleId,
        nameA: d?.nameA ?? null,
        nameB: d?.nameB ?? null,
        currency: d?.currency ?? null,
      });
    });

    return () => off();
  }, [uid]);

  // ---- UI ----
  if (phase === "auth-loading" || phase === "user-loading") {
    return fallback ?? <div className="p-4 text-xs opacity-70">carregando…</div>;
  }

  if (phase === "no-user") {
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden px-4">
        <div className="pointer-events-none absolute inset-0 opacity-40"
             style={{ background:"radial-gradient(600px 300px at 50% 20%, rgba(56,189,248,0.15), rgba(0,0,0,0))" }} />
        <div className="relative w-full max-w-md">
          <div className="bg-slate-900/70 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/5">
            <div className="flex flex-col items-center text-center">
              <Logo size={110} />
              <div className="mt-3 text-[11px] uppercase tracking-wider text-slate-400">
                Gerencie suas finanças de forma compartilhada
              </div>
              <button
                onClick={() => signInGoogle().catch(console.error)}
                className="mt-5 inline-flex w-full justify-center items-center gap-3 rounded-lg px-4 py-3
                           font-semibold text-white bg-[#1a73e8] hover:bg-[#1765cc] active:bg-[#145ab8]
                           shadow-md focus:outline-none focus:ring-4 focus:ring-[#1a73e8]/35 transition"
                aria-label="Entrar com Google"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-5 w-5" />
                Entrar com Google
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // aceita children como função ou nó
  const rendered = typeof children === "function" ? (children as () => ReactNode)() : children;
  return <>{rendered}</>;
}
