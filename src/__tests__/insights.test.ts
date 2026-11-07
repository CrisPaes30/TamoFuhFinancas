// src/__tests__/insights.test.ts
import { describe, it, expect } from "vitest";
import { sliceByMonth, analyzeMonth, lastMonthsYM, type Expense, type Income } from "@/insights";

function exp(partial: Partial<Expense> & { amount: number; date: Date }): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Despesa",
    category: "Outros",
    paidBy: "A",
    split: { a: 1, b: 1 },
    ...partial,
  } as Expense;
}
function inc(partial: Partial<Income> & { amount: number; date: Date }): Income {
  return {
    id: Math.random().toString(36).slice(2),
    person: "A",
    source: "Salário",
    ...partial,
  } as Income;
}

const NAMES = { A: "Ana", B: "Bruno" };

describe("sliceByMonth", () => {
  it("filtra despesas e rendas só do mês pedido, ignorando deletadas", () => {
    const expenses = [
      exp({ amount: 1000, date: new Date(2026, 5, 10) }), // jun
      exp({ amount: 2000, date: new Date(2026, 6, 10) }), // jul
      exp({ amount: 3000, date: new Date(2026, 5, 20), deleted: true }), // jun, deletada
    ];
    const incomes = [
      inc({ amount: 5000, date: new Date(2026, 5, 1) }),
      inc({ amount: 6000, date: new Date(2026, 6, 1) }),
    ];

    const slice = sliceByMonth(expenses, incomes, "2026-06");
    expect(slice.expenses).toHaveLength(1);
    expect(slice.expenses[0].amount).toBe(1000);
    expect(slice.incomes).toHaveLength(1);
    expect(slice.incomes[0].amount).toBe(5000);
  });
});

describe("lastMonthsYM", () => {
  it("gera N meses regressivos a partir de uma data de referência", () => {
    const out = lastMonthsYM(3, new Date(2026, 0, 15)); // jan/2026
    expect(out).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});

describe("analyzeMonth — totais e dicas", () => {
  it("saved negativo (despesas > renda) gera dica de alerta 🚨", () => {
    const month = {
      ym: "2026-06",
      expenses: [exp({ amount: 10000, date: new Date(2026, 5, 1) })],
      incomes: [inc({ amount: 5000, date: new Date(2026, 5, 1) })],
    };
    const { totals, tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(totals.saved).toBe(-5000);
    expect(tips.some((t) => t.includes("🚨"))).toBe(true);
  });

  it("saved positivo gera dica de sobra ✅", () => {
    const month = {
      ym: "2026-06",
      expenses: [exp({ amount: 3000, date: new Date(2026, 5, 1) })],
      incomes: [inc({ amount: 10000, date: new Date(2026, 5, 1) })],
    };
    const { tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(tips.some((t) => t.includes("✅"))).toBe(true);
  });

  it("sem renda lançada gera dica informativa ℹ️", () => {
    const month = {
      ym: "2026-06",
      expenses: [exp({ amount: 3000, date: new Date(2026, 5, 1) })],
      incomes: [] as Income[],
    };
    const { tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(tips.some((t) => t.includes("ℹ️"))).toBe(true);
  });

  it("gastos 20% acima da média dos últimos 3 meses gera dica ⬆️", () => {
    const history = [
      { ym: "2026-03", expenses: [exp({ amount: 10000, date: new Date(2026, 2, 1) })], incomes: [] },
      { ym: "2026-04", expenses: [exp({ amount: 10000, date: new Date(2026, 3, 1) })], incomes: [] },
      { ym: "2026-05", expenses: [exp({ amount: 10000, date: new Date(2026, 4, 1) })], incomes: [] },
    ];
    const month = {
      ym: "2026-06",
      expenses: [exp({ amount: 12000, date: new Date(2026, 5, 1) })], // +20% vs média 10000
      incomes: [],
    };
    const { tips } = analyzeMonth(month, NAMES, "BRL", history);
    expect(tips.some((t) => t.includes("⬆️"))).toBe(true);
  });

  it("categoria dominante (>30% do total) gera dica 🎯", () => {
    const month = {
      ym: "2026-06",
      expenses: [
        exp({ amount: 4000, category: "Mercado", date: new Date(2026, 5, 1) }),
        exp({ amount: 1000, category: "Lazer", date: new Date(2026, 5, 2) }),
      ],
      incomes: [],
    };
    const { top, tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(top.topCat?.[0]).toBe("Mercado");
    expect(tips.some((t) => t.includes("🎯") && t.includes("Mercado"))).toBe(true);
  });

  it("maior item (>25% do total) gera dica 🧾", () => {
    const month = {
      ym: "2026-06",
      expenses: [
        exp({ amount: 3000, title: "Notebook", date: new Date(2026, 5, 1) }),
        exp({ amount: 1000, title: "Café", date: new Date(2026, 5, 2) }),
      ],
      incomes: [],
    };
    const { tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(tips.some((t) => t.includes("🧾") && t.includes("Notebook"))).toBe(true);
  });

  it("cartão >=50% dos gastos gera dica 💳", () => {
    const month = {
      ym: "2026-06",
      expenses: [
        exp({ amount: 6000, isCard: true, date: new Date(2026, 5, 1) }),
        exp({ amount: 4000, date: new Date(2026, 5, 2) }),
      ],
      incomes: [],
    };
    const { tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(tips.some((t) => t.includes("💳"))).toBe(true);
  });

  it("fixas >=60% dos gastos gera dica 🏠", () => {
    const month = {
      ym: "2026-06",
      expenses: [
        exp({ amount: 7000, isFixed: true, date: new Date(2026, 5, 1) }),
        exp({ amount: 3000, date: new Date(2026, 5, 2) }),
      ],
      incomes: [],
    };
    const { tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(tips.some((t) => t.includes("🏠"))).toBe(true);
  });

  it("despesas pessoais (0:0) geram dica 👤 e não entram no acerto", () => {
    const month = {
      ym: "2026-06",
      expenses: [exp({ amount: 2000, split: { a: 0, b: 0 }, date: new Date(2026, 5, 1) })],
      incomes: [],
    };
    const { totals, tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(totals.personal).toBe(2000);
    expect(tips.some((t) => t.includes("👤"))).toBe(true);
  });

  it("desequilíbrio de pagamento (>=30%) gera dica ⚖️ nomeando quem pagou mais", () => {
    const month = {
      ym: "2026-06",
      expenses: [
        exp({ amount: 8000, paidBy: "A", date: new Date(2026, 5, 1) }),
        exp({ amount: 2000, paidBy: "B", date: new Date(2026, 5, 2) }),
      ],
      incomes: [],
    };
    const { totals, tips } = analyzeMonth(month, NAMES, "BRL", []);
    expect(totals.paidA).toBe(8000);
    expect(totals.paidB).toBe(2000);
    expect(tips.some((t) => t.includes("⚖️") && t.includes("Ana"))).toBe(true);
  });
});
