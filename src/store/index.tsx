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
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** ---------- Tipos ---------- */
export type Expense = {
  id: string;
  title: string;
  amount: number; // em centavos
  paidBy: "A" | "B";
  date: Timestamp;
  category: string;
  split: { a: number; b: number };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deleted?: boolean;

  ym?: string;
  isFixed?: boolean;
  fixedKind?: "Agua" | "Luz" | "Internet" | "Aluguel" | "Outros";
  isCard?: boolean;
  installments?: number;
  installmentNumber?: number;

  groupId?: string;
  ruleKind?: "fixed" | "installments";
  generated?: boolean;
};

export type Income = {
  id: string;
  person: "A" | "B";
  source: string;
  amount: number;   // centavos
  ym: string;       // YYYY-MM
  date: Timestamp;  // 1º dia do ym
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
  /** <- adicionado para refletir opções salvas */
  categories?: string[] | null;
};

export type UserProfile = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  coupleId?: string | null;
};

/** ---------- Estado & Ações ---------- */
type Store = {
  couple: Couple | null | undefined;
  profile: UserProfile | null;
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
  deleteExpense: (id: string, opts?: { hard?: boolean }) => Promise<void>; // ✅ novo

  addIncome: (data: Omit<Income, "id" | "createdAt" | "updatedAt" | "date">) => Promise<void>;
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
  const ac = a.categories ?? [];
  const bc = b.categories ?? [];
  const catsEq =
    ac.length === bc.length &&
    ac.every((v, i) => v === bc[i]);
  return (
    a.id === b.id &&
    a.nameA === b.nameA &&
    a.nameB === b.nameB &&
    a.currency === b.currency &&
    catsEq
  );
}

/** ---------- Helpers de data ---------- */
function toYMFromTimestamp(ts: Timestamp): string {
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function addMonths(ym: string, delta: number): string {
  const [Y, M] = ym.split("-").map(Number);
  const base = new Date(Y, (M - 1) + delta, 1);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function endOfYearMonthsFrom(ymStart: string): string[] {
  const [Y, M] = ymStart.split("-").map(Number);
  const months: string[] = [];
  for (let i = 0; i <= (12 - M); i++) months.push(addMonths(ymStart, i));
  return months;
}
function monthsForward(ymStart: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(ymStart, i));
}
function centsSplitEqually(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const sobra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < sobra ? 1 : 0));
}
function uuid(): string {
  return (globalThis as any)?.crypto?.randomUUID?.() ?? `gid_${Math.random().toString(36).slice(2)}_${Date.now()}`;
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

/** ---------- Self-heal de membresia ---------- */
async function ensureMembership(cid: string, uid: string) {
  try {
    await updateDoc(doc(db, "couples", cid), {
      members: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.debug("[ensureMembership] ignorado:", e);
  }
}

/** ---------- Fallback automático de índice (expenses) ---------- */
function attachExpensesListener(
  cid: string,
  set: (partial: Partial<Pick<Store, "expenses">>) => void
) {
  const colRef = collection(db, "couples", cid, "expenses");
  const qWithIndex = query(colRef, orderBy("date", "desc"), orderBy("createdAt", "desc"));

  try { unsubExpenses?.(); } catch {}
  unsubExpenses = onSnapshot(
    qWithIndex,
    (snap) => {
      const list: Expense[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      set({ expenses: list });
    },
    (err: any) => {
      const needsIndex =
        err?.code === "failed-precondition" ||
        (typeof err?.message === "string" && /requires an index/i.test(err.message));

      if (!needsIndex) {
        console.error("[expenses] onSnapshot error:", err);
        return;
      }

      console.warn("[expenses] sem índice composto, caindo para orderBy(date) somente");
      try { unsubExpenses?.(); } catch {}
      const qSimple = query(colRef, orderBy("date", "desc"));
      unsubExpenses = onSnapshot(
        qSimple,
        (snap2) => {
          const list: Expense[] = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          set({ expenses: list });
        },
        (err2) => console.error("[expenses] fallback error:", err2)
      );
    }
  );
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      profile: null,
      couple: undefined,
      expenses: [],
      incomes: [],

      setProfile: (p) => {
        const prevProfile = get().profile;
        const prevCoupleId = prevProfile?.coupleId ?? null;
        const nextCoupleId = p?.coupleId ?? null;

        const listenersActive = !!(unsubCouple && unsubExpenses && unsubIncomes);
        if (shallowEqual(prevProfile, p) && prevCoupleId === nextCoupleId && listenersActive) return;

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

        const needRebindBecauseCache =
          !!p.coupleId && (get().couple === null || !listenersActive);

        const needAttach = !!p.coupleId && (!unsubCouple || !unsubExpenses || !unsubIncomes);

        if (changedCouple || needAttach || needRebindBecauseCache) {
          const cid = p.coupleId!;
          const uid = p.uid;

          ensureMembership(cid, uid).finally(() => {
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
                  // <- refletir categorias salvas
                  categories: (data?.categories ?? null) as string[] | null,
                };
                if (!shallowCoupleEqual(get().couple, next)) set({ couple: next });
              },
              (err) => console.error("[couple] onSnapshot error:", err)
            );

            // Expenses com fallback de índice
            attachExpensesListener(cid, (partial) => set(partial));

            // Incomes (ordenado por date)
            const incRef = collection(db, "couples", cid, "incomes");
            const incQ   = query(incRef, orderBy("date", "desc"));
            try { unsubIncomes?.(); } catch {}
            unsubIncomes = onSnapshot(
              incQ,
              (snap) => {
                const list: Income[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
                set({ incomes: list });
              },
              (err) => console.error("[incomes] onSnapshot error:", err)
            );
          });
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

        await updateDoc(cRef, {
          members: arrayUnion(p.uid),
          updatedAt: serverTimestamp(),
        });

        if (p.coupleId !== coupleId) {
          await updateDoc(doc(db, "users", p.uid), { coupleId, updatedAt: serverTimestamp() });
          set({ profile: { ...p, coupleId } });
        }
      },

      // ---------- DESPESAS ----------
      async addExpense(data) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");

        const normalizedDate =
          data.date instanceof Timestamp
            ? data.date
            : Timestamp.fromDate(
                typeof (data as any).date === "string"
                  ? new Date((data as any).date)
                  : new Date((data as any).date ?? Date.now())
              );

        const ymStart = toYMFromTimestamp(normalizedDate);

        const isCard = !!data.isCard;
        const installments = Math.max(1, data.installments ?? 1);
        const isFixed = !!data.isFixed;

        const mustGenInstallments = isCard && installments > 1;
        const mustGenFixed = !mustGenInstallments && isFixed;
        const gid = (mustGenInstallments || mustGenFixed) ? uuid() : undefined;

        const col = collection(db, "couples", cid, "expenses");

        if (mustGenInstallments) {
          const yms = monthsForward(ymStart, installments);
          const parts = centsSplitEqually(data.amount, installments);

          for (let i = 0; i < installments; i++) {
            const docData = cleanUndefined({
              ...data,
              date: i === 0 ? normalizedDate : Timestamp.fromDate(new Date(yms[i] + "-01T12:00:00")),
              ym: yms[i],
              amount: parts[i],
              isCard: true,
              installments,
              installmentNumber: i + 1,
              isFixed: false,
              fixedKind: undefined,
              ruleKind: "installments",
              groupId: gid,
              generated: i > 0,
              deleted: data.deleted ?? false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            await addDoc(col, docData as any);
          }
          return;
        }

        if (mustGenFixed) {
          const yms = endOfYearMonthsFrom(ymStart);
          for (let i = 0; i < yms.length; i++) {
            const docData = cleanUndefined({
              ...data,
              date: i === 0 ? normalizedDate : Timestamp.fromDate(new Date(yms[i] + "-01T12:00:00")),
              ym: yms[i],
              isFixed: true,
              isCard: false,
              installments: undefined,
              installmentNumber: undefined,
              ruleKind: "fixed",
              groupId: gid,
              generated: i > 0,
              deleted: data.deleted ?? false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            await addDoc(col, docData as any);
          }
          return;
        }

        const docData = cleanUndefined({
          ...data,
          date: normalizedDate,
          ym: ymStart,
          installments: data.isCard ? Math.max(1, data.installments ?? 1) : 1,
          fixedKind: data.isFixed ? data.fixedKind : undefined,
          deleted: data.deleted ?? false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await addDoc(col, docData as any);
      },

      async updateExpense(id, data) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        const payload: any = { ...data };

        if (data.date !== undefined) {
          const newTs =
            data.date instanceof Timestamp
              ? data.date
              : Timestamp.fromDate(
                  typeof (data as any).date === "string"
                    ? new Date((data as any).date)
                    : new Date((data as any).date ?? Date.now())
                );
          payload.date = newTs;
          payload.ym = toYMFromTimestamp(newTs);
        }

        const clean = cleanUndefined({
          ...payload,
          updatedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "couples", cid, "expenses", id), clean);
      },

      async removeExpense(id) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        await deleteDoc(doc(db, "couples", cid, "expenses", id));
      },

      async deleteExpense(id, opts) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        const ref = doc(db, "couples", cid, "expenses", id);

        if (opts?.hard) {
          await deleteDoc(ref);
        } else {
          await updateDoc(ref, {
            deleted: true,
            updatedAt: serverTimestamp(),
          });
        }
      },

      // ---------- RENDAS ----------
      async addIncome(data) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");
        await addDoc(collection(db, "couples", cid, "incomes"), {
          person: data.person,
          source: data.source,
          amount: data.amount,                                  // centavos
          ym: data.ym,                                          // "YYYY-MM"
          date: Timestamp.fromDate(new Date(`${data.ym}-01T00:00:00`)), // 1º dia
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      },

      async updateIncome(id, data) {
        const cid = get().couple?.id; if (!cid) throw new Error("Sem casal.");

        const patch: any = { ...data, updatedAt: serverTimestamp() };
        if (data.ym) {
          patch.date = Timestamp.fromDate(new Date(`${data.ym}-01T00:00:00`));
        }

        await updateDoc(doc(db, "couples", cid, "incomes", id), patch);
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
      // ✅ NÃO persistimos 'couple' para evitar reidratar null antigo
      partialize: (s) => ({ profile: s.profile }),
      migrate: (p: any) => p,
    }
  )
);
