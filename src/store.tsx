import { createContext, useContext, useEffect, useState } from 'react';
import { db, type Couple, type Expense } from './db';

interface Store {
  couple?: Couple; setCouple(c: Couple): Promise<void>;
  expenses: Expense[];
  addExpense(e: Expense): Promise<void>;
  updateExpense(e: Expense): Promise<void>;
  removeExpense(id: string): Promise<void>;
  reload(): Promise<void>;
}

const Ctx = createContext<Store>(null as any);
export const useStore = () => useContext(Ctx);

export function Provider({ children }: { children: any }) {
  const [couple, setCoupleState] = useState<Couple>();
  const [expenses, setExpenses] = useState<Expense[]>([]);

  async function reload() {
    const c = await db.couples.toCollection().first();
    setCoupleState(c || undefined);
    if (c) setExpenses(await db.expenses.where('coupleId').equals(c.id).reverse().sortBy('date'));
    else setExpenses([]);
  }

  useEffect(() => { reload(); }, []);

  async function setCouple(c: Couple) { await db.couples.clear(); await db.couples.add(c); await reload(); }
  async function addExpense(e: Expense) { await db.expenses.add(e); await reload(); }
  async function updateExpense(e: Expense) { await db.expenses.put(e); await reload(); }
  async function removeExpense(id: string) { await db.expenses.update(id, { deleted: true }); await reload(); }

  return <Ctx.Provider value={{ couple, setCouple, expenses, addExpense, updateExpense, removeExpense, reload }}>{children}</Ctx.Provider>;
}

async function updateExpense(id: string, data: Partial<Expense>) {
  set((s) => {
    const idx = s.expenses.findIndex(e => e.id === id);
    if (idx >= 0) s.expenses[idx] = { ...s.expenses[idx], ...data };
  });
}
