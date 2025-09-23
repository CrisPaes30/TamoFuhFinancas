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

  // ⚙️ novos campos p/ recorrência e parcelado
  ym?: string;                 // "YYYY-MM" (denormalizado p/ filtros e queries)
  isFixed?: boolean;           // despesa fixa mensal
  fixedKind?: "Agua" | "Luz" | "Internet" | "Aluguel" | "Outros";
  isCard?: boolean;            // despesa de cartão
  installments?: number;       // total de parcelas (>= 1)
  installmentNumber?: number;  // nº desta ocorrência (1..installments)

  // 🔗 ligação de ocorrências
  groupId?: string;            // mesmo id para todas as ocorrências geradas
  ruleKind?: "fixed" | "installments"; // como foi gerada
  generated?: boolean;         // true nas cópias geradas automaticamente
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

/** ---------- Helpers de data/parcelas locais ---------- */
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
  // crypto.randomUUID disponível na maioria dos browsers modernos
  // fallback simples para dev
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

          // 🔧 self-heal
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

          // Expenses
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

          // Incomes
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
        const mustGenFixed = !mustGenInstallments && isFixed; // parcelado tem prioridade
        const gid = (mustGenInstallments || mustGenFixed) ? uuid() : undefined;
      
        const col = collection(db, "couples", cid, "expenses");
      
        // 🚗 Parcelado
        if (mustGenInstallments) {
          const yms = monthsForward(ymStart, installments);
          const parts = centsSplitEqually(data.amount, installments);
      
          for (let i = 0; i < installments; i++) {
            const docData = cleanUndefined({
              ...data,
              date:
                i === 0
                  ? normalizedDate
                  : Timestamp.fromDate(new Date(yms[i] + "-01T12:00:00")),
              ym: yms[i],
              amount: parts[i],
              isCard: true,
              installments,               // sempre número válido
              installmentNumber: i + 1,   // sempre número válido
              isFixed: false,
              fixedKind: undefined,       // será removido pelo cleanUndefined
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
      
        // 📆 Fixa até dezembro
        if (mustGenFixed) {
          const yms = endOfYearMonthsFrom(ymStart);
          for (let i = 0; i < yms.length; i++) {
            const docData = cleanUndefined({
              ...data,
              date:
                i === 0
                  ? normalizedDate
                  : Timestamp.fromDate(new Date(yms[i] + "-01T12:00:00")),
              ym: yms[i],
              isFixed: true,
              // NÃO envie installments/instalmentNumber como undefined
              isCard: false,
              installments: undefined,        // será removido
              installmentNumber: undefined,   // será removido
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
      
        // 🟢 Simples (1 doc)
        const docData = cleanUndefined({
          ...data,
          date: normalizedDate,
          ym: ymStart,
          // Se não for cartão, garanta que installments não vá undefined:
          installments: data.isCard ? Math.max(1, data.installments ?? 1) : 1,
          // Evite fixedKind undefined:
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
      
        // 🚿 remova undefineds antes de enviar
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
