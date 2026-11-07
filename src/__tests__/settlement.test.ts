// src/__tests__/settlement.test.ts
import { describe, it, expect } from "vitest";
import { computeSettlementForPeriod, isWithinPeriod } from "@/settlement";

function expense(partial: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Despesa",
    amount: 1000,
    category: "Outros",
    paidBy: "A" as const,
    split: { a: 1, b: 1 },
    date: "2026-11-10",
    ...partial,
  };
}

describe("isWithinPeriod", () => {
  it("inclui as pontas do período", () => {
    expect(isWithinPeriod("2026-11-01", "2026-11-01", "2026-11-30")).toBe(true);
    expect(isWithinPeriod("2026-11-30", "2026-11-01", "2026-11-30")).toBe(true);
  });
  it("exclui datas fora do período", () => {
    expect(isWithinPeriod("2026-10-31", "2026-11-01", "2026-11-30")).toBe(false);
    expect(isWithinPeriod("2026-12-01", "2026-11-01", "2026-11-30")).toBe(false);
  });
});

describe("computeSettlementForPeriod", () => {
  it("período sem despesas: saldo 0, sem devedor, sem itens", () => {
    const r = computeSettlementForPeriod([], "2026-11-01", "2026-11-30");
    expect(r).toEqual({ saldoA: 0, debtor: null, amount: 0, items: [] });
  });

  it("despesa única 50/50 paga por A: B fica devendo metade pra A", () => {
    const expenses = [expense({ amount: 10000, paidBy: "A", split: { a: 1, b: 1 } })];
    const r = computeSettlementForPeriod(expenses, "2026-11-01", "2026-11-30");

    expect(r.saldoA).toBe(5000);
    expect(r.debtor).toBe("B");
    expect(r.amount).toBe(5000);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].amount).toBe(5000);
  });

  it("despesa paga por B: A fica devendo (saldoA negativo, debtor=A)", () => {
    const expenses = [expense({ amount: 10000, paidBy: "B", split: { a: 1, b: 1 } })];
    const r = computeSettlementForPeriod(expenses, "2026-11-01", "2026-11-30");

    expect(r.saldoA).toBe(-5000);
    expect(r.debtor).toBe("A");
    expect(r.amount).toBe(5000);
  });

  it("despesa fora do período (antes e depois) não entra no cálculo", () => {
    const expenses = [
      expense({ amount: 10000, date: "2026-10-31" }), // dia antes
      expense({ amount: 10000, date: "2026-12-01" }), // dia depois
    ];
    const r = computeSettlementForPeriod(expenses, "2026-11-01", "2026-11-30");
    expect(r.saldoA).toBe(0);
    expect(r.items).toEqual([]);
  });

  it("despesa deletada (soft delete) não entra no cálculo", () => {
    const expenses = [expense({ amount: 10000, deleted: true })];
    const r = computeSettlementForPeriod(expenses, "2026-11-01", "2026-11-30");
    expect(r.saldoA).toBe(0);
  });

  it("despesa de categoria 'Acerto' (acerto anterior) não entra de novo no cálculo", () => {
    const expenses = [expense({ amount: 10000, category: "Acerto" })];
    const r = computeSettlementForPeriod(expenses, "2026-11-01", "2026-11-30");
    expect(r.saldoA).toBe(0);
  });

  it("despesa pessoal (split 0:0) não afeta o saldo nem aparece nos itens", () => {
    const expenses = [
      expense({ amount: 10000, split: { a: 1, b: 1 } }), // 5000 pro saldo
      expense({ amount: 3000, split: { a: 0, b: 0 }, title: "Pessoal" }),
    ];
    const r = computeSettlementForPeriod(expenses, "2026-11-01", "2026-11-30");
    expect(r.saldoA).toBe(5000);
    expect(r.items.find((i) => i.title === "Pessoal")).toBeUndefined();
  });

  it("só os itens que puxam na direção final do saldo entram no detalhamento", () => {
    // A pagou 10000 (B deveria 5000 pra A) e B pagou 20000 (A deve 10000 pra B)
    // saldo final: A deve 5000 pra B (líquido) -> só a despesa paga por B deve aparecer
    const expenses = [
      expense({ amount: 10000, paidBy: "A", split: { a: 1, b: 1 }, title: "Pago por A" }),
      expense({ amount: 20000, paidBy: "B", split: { a: 1, b: 1 }, title: "Pago por B" }),
    ];
    const r = computeSettlementForPeriod(expenses, "2026-11-01", "2026-11-30");

    expect(r.saldoA).toBe(-5000);
    expect(r.debtor).toBe("A");
    expect(r.items.map((i) => i.title)).toEqual(["Pago por B"]);
  });

  it("itens vêm ordenados pelo maior valor absoluto primeiro", () => {
    const expenses = [
      expense({ amount: 2000, paidBy: "A", split: { a: 1, b: 1 }, title: "Pequena" }),
      expense({ amount: 20000, paidBy: "A", split: { a: 1, b: 1 }, title: "Grande" }),
    ];
    const r = computeSettlementForPeriod(expenses, "2026-11-01", "2026-11-30");
    expect(r.items.map((i) => i.title)).toEqual(["Grande", "Pequena"]);
  });

  it("período livre cruzando fronteira de mês calendário funciona normalmente", () => {
    const expenses = [
      expense({ amount: 10000, date: "2026-11-20", paidBy: "A", split: { a: 1, b: 1 } }),
      expense({ amount: 10000, date: "2026-12-05", paidBy: "A", split: { a: 1, b: 1 } }),
    ];
    const r = computeSettlementForPeriod(expenses, "2026-11-15", "2026-12-10");
    expect(r.saldoA).toBe(10000); // as duas despesas entram, 5000 + 5000
  });
});
