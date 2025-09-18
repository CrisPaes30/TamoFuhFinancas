// src/store/index.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/** ---------- Tipos ---------- */
export type Expense = {
  id: string;
  title: string;
  amount: number;                 // centavos
  paidBy: "A" | "B";
  date: Timestamp;                // sempre Timestamp
  category: string;
  split: { a: number; b: number };
  isFixed?: boolean;
  fixedKind?: "Agua" | "Luz" | "Internet" | "Aluguel" | "Outros";
  isCard?: boolean;
  installments?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deleted?: boolean;
};

export type Income = {
  id: string;
  person: "A" | "B";
  source: string;
  amount: number;                 // centavos
  month: string;                  // YYYY-MM
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Couple = {
  id: string;
  nameA?: string | null;
  nameB?: string | null;
  currency?: "BRL" | "USD" | "EUR" | null;
  members?: string[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type UserProfile = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  coupleId?: string | null;
};

/** ---------- Estado & Ações ---------- */
type Store = {
  couple: Couple | null | undefined; // undefined = carregando
  profile: UserProfile | null;       // null = sem user
  expenses: Expense[];
  incomes: Income[];

  setProfile: (p: UserProfile | null) => void;
  mergeCouple: (partial: Partial<Couple> | null) => void;

  createCouple: (input: {
    nameA: string;
    nameB: string;
    currency: NonNullable<Couple["currency"]>;
  }) => Promise<void>;
  joinCouple: (coupleId: string) => Promise<void>;

  addExpense: (data: Omit<Expense, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;

  addIncome: (data: Omit<Income, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateIncome: (id: string, data: Partial<Income>) => Promise<void>;
  removeIncome: (id: string) => Promise<void>;
};

/** ---------- Utils ---------- */
function shallowEqual(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}
function shallowCoupleEqual(a?: Couple | null, b?: Couple | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.nameA === b.nameA && a.nameB === b.nameB && a.currency === b.currency;
}

/** Listeners globais */
let unsubCouple: null | (() => void) = null;
let unsubExpenses: null | (() => void) = null;
let unsubIncomes: null | (() => void) = null;

function clearListeners() {
  try { unsubCouple?.(); } finally { unsubCouple = null; }
  try { unsubExpenses?.(); } finally { unsubExpenses = null; }
  try { unsubIncomes?.(); } finally { unsubIncomes = null; }
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      profile: null,
      couple: undefined, // carregando no boot
      expenses: [],
      incomes: [],

      setProfile: (p) => {
        const prevProfile = get().profile;
        const prevCoupleId = prevProfile?.coupleId ?? null;
        const nextCoupleId = p?.coupleId ?? null;

        if (shallowEqual(prevProfile, p) && prevCoupleId === nextCoupleId) return;

        const changedCouple = prevCoupleId !== nextCoupleId;

        if (changedCouple || !p) {
          clearListeners();
          set({ expenses: [], incomes: [] });
        }

        if (!p) {
          if (!shallowEqual(prevProfile, null) || get().couple !== null) {
            set({ profile: null, couple: null });
          }
          return;
        }

        if (!p.coupleId) {
          if (!shallowEqual(prevProfile, p) || get().couple !== null) {
            set({ profile: p, couple: null });
          }
          return;
        }

        if (!shallowEqual(prevProfile, p)) set({ profile: p });

        const currentCouple = get().couple;
        if (!currentCouple || currentCouple.id !== p.coupleId) {
          set({ couple: { id: p.coupleId } });
        }

        // 🔑 Reanexa listeners no primeiro boot (mesmo sem troca de casal)
        const needAttach = !!p.coupleId && (!unsubCouple || !unsubExpenses || !unsubIncomes);

        if (changedCouple || needAttach) {
          const cid = p.coupleId!;

          // 🔧 self-heal: garante que o usuário atual está em couples/{cid}.members
          // (ignora erro se regras bloquearem; nesse caso, faça inclusão via console)
          get().joinCouple(cid).catch(() => {});

          // Couple
          const cRef = doc(db, "couples", cid);
          unsubCouple = onSnapshot(
            cRef,
            (snap) => {
              if (!snap.exists()) {
                if (get().couple !== null) set({ couple: null, expenses: [], incomes: [] });
                return;
              }
              const data = snap.data() as any;
              const next: Couple = {
                id: cid,
                nameA: data?.nameA ?? null,
                nameB: data?.nameB ?? null,
                currency: (data?.currency ?? null) as any,
                createdAt: (data?.createdAt ?? null) as Timestamp | null,
                updatedAt: (data?.updatedAt ?? null) as Timestamp | null,
              };
              if (!shallowCoupleEqual(get().couple, next)) set({ couple: next });
            },
            (err) => console.error("[couple] onSnapshot error:", err)
          );

          // Expenses — usa 'date' (evita perder docs que não tenham createdAt)
          const expRef = collection(db, "couples", cid, "expenses");
          const expQ = query(expRef, orderBy("date", "desc"));
          unsubExpenses = onSnapshot(
            expQ,
            (snap) => {
              const list: Expense[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
              set({ expenses: list });
            },
            (err) => console.error("[expenses] onSnapshot error:", err)
          );

          // Incomes — ordena por 'month' (YYYY-MM)
          const incRef = collection(db, "couples", cid, "incomes");
          const incQ = query(incRef, orderBy("month", "desc"));
          unsubIncomes = onSnapshot(
            incQ,
            (snap) => {
              const list: Income[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
              set({ incomes: list });
            },
            (err) => console.error("[incomes] onSnapshot error:", err)
          );
        }
      },

      mergeCouple: (partial) => {
        if (partial === null) { if (get().couple !== null) set({ couple: null }); return; }
        const prev = get().couple ?? { id: "" };
        const next: Couple = { ...prev, ...partial };
        if (!shallowCoupleEqual(prev, next)) set({ couple: next });
      },

      // ---------- AÇÕES DE CASAL ----------
      async createCouple(input) {
        const p = get().profile;
        if (!p) throw new Error("Não autenticado.");

        const newRef = await addDoc(collection(db, "couples"), {
          nameA: input.nameA,
          nameB: input.nameB,
          currency: input.currency,
          members: [p.uid],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "users", p.uid), {
          coupleId: newRef.id,
          updatedAt: serverTimestamp(),
        });

        if (p.coupleId !== newRef.id) set({ profile: { ...p, coupleId: newRef.id } });
      },

      async joinCouple(coupleId: string) {
        const p = get().profile; if (!p) throw new Error("Não autenticado.");

        const cRef = doc(db, "couples", coupleId);
        const cSnap = await getDoc(cRef);
        if (!cSnap.exists()) throw new Error("Convite inválido: casal não encontrado.");

        const members: string[] = (cSnap.data()?.members || []) as string[];
        if (!members.includes(p.uid)) {
          await updateDoc(cRef, { members: [...members, p.uid], updatedAt: serverTimestamp() });
        }

        if (p.coupleId !== coupleId) {
          await updateDoc(doc(db, "users", p.uid), { coupleId, updatedAt: serverTimestamp() });
          set({ profile: { ...p, coupleId } });
        }
      },

      // ---------- DESPESAS ----------
      async addExpense(data) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");

        // normaliza 'date' em Timestamp
        const normalizedDate =
          data.date instanceof Timestamp
            ? data.date
            : Timestamp.fromDate(
                typeof (data as any).date === "string"
                  ? new Date((data as any).date)
                  : new Date((data as any).date ?? Date.now())
              );

        await addDoc(collection(db, "couples", cid, "expenses"), {
          ...data,
          date: normalizedDate,
          deleted: data.deleted ?? false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as any);
      },

      async updateExpense(id, data) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        const payload: any = { ...data, updatedAt: serverTimestamp() };

        if (data.date !== undefined) {
          payload.date =
            data.date instanceof Timestamp
              ? data.date
              : Timestamp.fromDate(
                  typeof (data as any).date === "string"
                    ? new Date((data as any).date)
                    : new Date((data as any).date ?? Date.now())
                );
        }

        await updateDoc(doc(db, "couples", cid, "expenses", id), payload);
      },

      async removeExpense(id) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        await deleteDoc(doc(db, "couples", cid, "expenses", id));
      },

      // ---------- RENDAS ----------
      async addIncome(data) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        await addDoc(collection(db, "couples", cid, "incomes"), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      },

      async updateIncome(id, data) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        await updateDoc(doc(db, "couples", cid, "incomes", id), {
          ...data,
          updatedAt: serverTimestamp(),
        } as any);
      },

      async removeIncome(id) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        await deleteDoc(doc(db, "couples", cid, "incomes", id));
      },
    }),
    {
      name: "tf-store",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persistimos só o essencial para evitar rehidratar listas grandes
      partialize: (s) => ({ profile: s.profile, couple: s.couple }),
      migrate: (p: any) => p,
    }
  )
);
