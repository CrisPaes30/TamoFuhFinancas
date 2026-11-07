// src/settlement.ts
//
// Lógica PURA de cálculo de acerto por período livre (início/fim), extraída
// e generalizada do que já existia embutido em Dashboard.tsx (que só
// calculava por ym/mês calendário). Usada tanto pela preview do popup
// "Acertar" quanto pela proposta real gravada em `settlements`.

import { computeShares } from "@/utils";
import { toYMD } from "@/lib/dateFmt";

export type SettlementExpenseLike = {
  id: string;
  title: string;
  amount: number;
  category: string;
  paidBy: "A" | "B";
  split: { a: number; b: number };
  date: any; // Timestamp | Date | string — normalizado via toYMD
  deleted?: boolean;
};

export type SettlementItem = {
  expenseId: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: string;
  amount: number; // valor absoluto da PARCELA que entra no acerto (delta)
};

export type SettlementCalc = {
  /** >0: B deve pra A. <0: A deve pra B. ===0: sem diferença. */
  saldoA: number;
  debtor: "A" | "B" | null;
  amount: number; // abs(saldoA), em centavos
  items: SettlementItem[];
};

/** true se a data (YYYY-MM-DD) cai dentro de [periodStart, periodEnd], inclusive nas pontas. */
export function isWithinPeriod(dateYMD: string, periodStart: string, periodEnd: string): boolean {
  return dateYMD >= periodStart && dateYMD <= periodEnd; // strings YYYY-MM-DD comparam lexicograficamente = cronologicamente
}

/**
 * Calcula o saldo (quem deve pra quem) de um período livre, a partir das
 * despesas já carregadas na store. Ignora despesas deletadas e despesas da
 * categoria "Acerto" (não entram no cálculo de um novo acerto).
 */
export function computeSettlementForPeriod(
  expenses: SettlementExpenseLike[],
  periodStart: string,
  periodEnd: string
): SettlementCalc {
  const inPeriod = expenses.filter(
    (e) =>
      !e.deleted &&
      e.category !== "Acerto" &&
      isWithinPeriod(toYMD(e.date), periodStart, periodEnd)
  );

  let saldoA = 0;
  const allItems: Array<SettlementItem & { delta: number }> = [];

  for (const e of inPeriod) {
    const amount = e.amount ?? 0;
    const a = e.split?.a ?? 50;
    const b = e.split?.b ?? 50;
    const paidBy = e.paidBy ?? "A";

    const { Va, Vb } = computeShares(amount, a, b, paidBy);
    // mesma convenção do Dashboard: se A pagou, B fica devendo Vb pra A (+saldoA);
    // se B pagou, A fica devendo Va pra B (-saldoA).
    const delta = paidBy === "A" ? Vb : -Va;
    saldoA += delta;

    if (delta !== 0) {
      allItems.push({
        expenseId: e.id,
        title: e.title || "(sem título)",
        date: toYMD(e.date),
        category: e.category || "Outros",
        amount: Math.abs(delta),
        delta,
      });
    }
  }

  const debtor: "A" | "B" | null = saldoA === 0 ? null : saldoA > 0 ? "B" : "A";

  // só os itens que "puxam" o saldo na mesma direção do resultado final entram
  // no detalhamento (mesmo critério já usado em Dashboard.saldoItems)
  const items = allItems
    .filter((it) => (saldoA > 0 ? it.delta > 0 : it.delta < 0))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .map(({ expenseId, title, date, category, amount }) => ({
      expenseId,
      title,
      date,
      category,
      amount,
    }));

  return { saldoA, debtor, amount: Math.abs(saldoA), items };
}
