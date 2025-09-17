export type Split = { a: number; b: number };

export type Expense = {
  id: string;
  coupleId: string;
  title: string;
  amount: number;            // cents
  paidBy: 'A' | 'B';
  date: string;              // YYYY-MM-DD
  category: string;
  split: Split;
  isFixed?: boolean;
  fixedKind?: 'Agua'|'Luz'|'Internet'|'Aluguel'|'Outros';
  isCard?: boolean;
  installments?: number;
  createdAt?: number;
  updatedAt?: number;
  deleted?: boolean;
};

export type Income = {
  id: string;
  person: 'A' | 'B';
  source: string;
  amount: number;            // cents
  month: string;             // YYYY-MM
};

export type Couple = {
  id: string;
  nameA: string;
  nameB: string;
  currency: string;
  incomes?: Income[];
  createdAt?: number;
  updatedAt?: number;
};
