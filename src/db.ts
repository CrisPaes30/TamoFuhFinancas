import Dexie, { Table } from 'dexie';

export interface Couple {
  id: string;
  nameA: string;
  nameB: string;
  currency: string;
  weights?: { a: number; b: number };
  createdAt: number;
}

export interface Expense {
  id: string;
  coupleId: string;
  title: string;
  amount: number; // centavos
  paidBy: 'A' | 'B';
  date: string; // yyyy-mm-dd
  category?: string;
  split: { a: number; b: number };
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
}

class TamoFuuhDB extends Dexie {
  couples!: Table<Couple, string>;
  expenses!: Table<Expense, string>;
  constructor() {
    super('tamo-fuuh');
    this.version(1).stores({
      couples: 'id, createdAt',
      expenses: 'id, coupleId, date, createdAt, updatedAt, deleted'
    });
  }
}

export const db = new TamoFuuhDB();