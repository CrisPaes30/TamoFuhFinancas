// src/components/stats/__tests__/InsightsSection.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { storeState } = vi.hoisted(() => ({
  storeState: {
    expenses: [] as any,
    incomes: [] as any,
    couple: null as any,
  },
}));

vi.mock("@/store", () => ({
  useStore: (selector?: (s: any) => any) => {
    const state = { ...storeState };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

import InsightsSection from "@/components/stats/InsightsSection";
import { fromCents } from "@/lib/currency";
import { addMonthsYM } from "@/lib/date";

// getByText normaliza (colapsa) espaços — inclusive NBSP — do texto do DOM;
// comparamos aqui com o mesmo espaço "normalizado" para evitar falso-negativo.
function money(cents: number, currency?: string) {
  return fromCents(cents, currency).replace(/\s+/g, " ");
}

const YM = "2026-06";

function expense(partial: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Despesa",
    amount: 1000,
    category: "Outros",
    paidBy: "A",
    split: { a: 1, b: 1 },
    ym: YM,
    ...partial,
  };
}

function income(partial: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    person: "A",
    source: "Salário",
    amount: 1000,
    ym: YM,
    ...partial,
  };
}

function statBoxValue(label: string): HTMLElement {
  const labelEl = screen.getByText(label);
  const box = labelEl.parentElement as HTMLElement;
  return box.querySelector(".font-semibold") as HTMLElement;
}

function tipsText(): string[] {
  return screen.getAllByRole("listitem").map((li) => li.textContent || "");
}

beforeEach(() => {
  storeState.expenses = [];
  storeState.incomes = [];
  storeState.couple = { id: "casal-1", nameA: "Ana", nameB: "Bruno", currency: "BRL" };
});

describe("Cenário 15 — estado vazio total", () => {
  it("6 StatBoxes em R$0,00, tips só 'ℹ️ Sem renda lançada', sem bloco de maior categoria/item", () => {
    render(<InsightsSection ym={YM} />);

    const zeros = screen.getAllByText((content) => content === money(0));
    expect(zeros.length).toBe(6);

    const tips = tipsText();
    expect(tips.length).toBe(1);
    expect(tips[0]).toContain("ℹ️");
    expect(tips[0]).toContain("Sem renda lançada");

    expect(screen.queryByText(/Maior categoria/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Maior item/)).not.toBeInTheDocument();
  });
});

describe("Cenário 16 — só renda, despesas=0", () => {
  it("Sobra/Falta verde = totalIn, dica ✅", () => {
    storeState.incomes = [income({ amount: 10000 })];

    render(<InsightsSection ym={YM} />);

    const value = statBoxValue("Sobra/Falta");
    expect(value.textContent).toBe(fromCents(10000));
    expect(value.className).toContain("emerald");
    expect(tipsText().some((t) => t.includes("✅"))).toBe(true);
  });
});

describe("Cenário 17 — sobra negativa", () => {
  it("StatBox rose, dica 🚨", () => {
    storeState.incomes = [income({ amount: 2000 })];
    storeState.expenses = [expense({ amount: 9000 })];

    render(<InsightsSection ym={YM} />);

    const value = statBoxValue("Sobra/Falta");
    expect(value.className).toContain("rose");
    expect(tipsText().some((t) => t.includes("🚨"))).toBe(true);
  });
});

describe("Cenário 18 — fixas + variáveis = despesas", () => {
  it("os valores batem", () => {
    storeState.expenses = [
      expense({ amount: 3000, isFixed: true }),
      expense({ amount: 2000, isFixed: false }),
    ];

    render(<InsightsSection ym={YM} />);

    expect(statBoxValue("Despesas").textContent).toBe(fromCents(5000));
    expect(statBoxValue("Fixas").textContent).toBe(fromCents(3000));
    expect(statBoxValue("Variáveis").textContent).toBe(fromCents(2000));
  });
});

describe("Cenário 19 — cartão como subconjunto correto", () => {
  it("StatBox Cartão soma só isCard:true", () => {
    storeState.expenses = [
      expense({ amount: 4000, isCard: true }),
      expense({ amount: 6000, isCard: false }),
    ];

    render(<InsightsSection ym={YM} />);

    expect(statBoxValue("Cartão").textContent).toBe(fromCents(4000));
  });
});

describe("Cenário 20 — múltiplas dicas simultâneas", () => {
  it("categoria dominante + cartão + desequilíbrio aparecem juntas", () => {
    storeState.incomes = [income({ amount: 20000 })];
    storeState.expenses = [
      expense({ category: "Mercado", amount: 7000, isCard: true, paidBy: "A" }),
      expense({ category: "Lazer", amount: 3000, isCard: false, paidBy: "B" }),
    ];

    render(<InsightsSection ym={YM} />);

    const tips = tipsText();
    expect(tips.some((t) => t.includes("🎯") && t.includes("Mercado"))).toBe(true);
    expect(tips.some((t) => t.includes("💳"))).toBe(true);
    expect(tips.some((t) => t.includes("⚖️") && t.includes("Ana"))).toBe(true);
  });
});

describe("Cenário 21 — maior categoria/item aparecem quando há despesas", () => {
  it("mostra nome e valor corretos", () => {
    storeState.expenses = [
      expense({ category: "Mercado", title: "Feira", amount: 4000 }),
      expense({ category: "Lazer", title: "Cinema", amount: 1000 }),
    ];

    render(<InsightsSection ym={YM} />);

    expect(screen.getByText(/Maior categoria:/)).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText(/Maior item:/)).toBeInTheDocument();
    expect(screen.getByText("Feira")).toBeInTheDocument();
  });
});

describe("Cenário 22 — maior categoria/item não aparecem quando mês vazio", () => {
  it("bloco não é renderizado", () => {
    render(<InsightsSection ym={YM} />);

    expect(screen.queryByText(/Maior categoria:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Maior item:/)).not.toBeInTheDocument();
  });
});

describe("Cenário 23 — histórico real via store (meses anteriores de verdade)", () => {
  it("lastMonthsYM+sliceByMonth geram a dica de desvio ⬆️ correta", () => {
    const prev1 = addMonthsYM(YM, -1);
    const prev2 = addMonthsYM(YM, -2);
    const prev3 = addMonthsYM(YM, -3);

    storeState.expenses = [
      expense({ amount: 10000, ym: prev1 }),
      expense({ amount: 10000, ym: prev2 }),
      expense({ amount: 10000, ym: prev3 }),
      expense({ amount: 12000, ym: YM }), // +20% vs média de 10000
    ];

    render(<InsightsSection ym={YM} />);

    expect(tipsText().some((t) => t.includes("⬆️"))).toBe(true);
  });

  it("gastos abaixo da média geram dica ⬇️", () => {
    const prev1 = addMonthsYM(YM, -1);
    const prev2 = addMonthsYM(YM, -2);
    const prev3 = addMonthsYM(YM, -3);

    storeState.expenses = [
      expense({ amount: 10000, ym: prev1 }),
      expense({ amount: 10000, ym: prev2 }),
      expense({ amount: 10000, ym: prev3 }),
      expense({ amount: 7000, ym: YM }), // -30% vs média de 10000
    ];

    render(<InsightsSection ym={YM} />);

    expect(tipsText().some((t) => t.includes("⬇️"))).toBe(true);
  });
});

describe("Cenário 24 — primeiro mês de uso (sem histórico)", () => {
  it("não gera dica de desvio, não quebra", () => {
    storeState.expenses = [expense({ amount: 12000, ym: YM })];

    render(<InsightsSection ym={YM} />);

    const tips = tipsText();
    expect(tips.some((t) => t.includes("⬆️"))).toBe(false);
    expect(tips.some((t) => t.includes("⬇️"))).toBe(false);
  });
});

describe("Cenário 25 — despesa pessoal (split 0:0)", () => {
  it("soma em Despesas totais e gera dica 👤", () => {
    storeState.expenses = [expense({ amount: 2000, split: { a: 0, b: 0 } })];

    render(<InsightsSection ym={YM} />);

    expect(statBoxValue("Despesas").textContent).toBe(fromCents(2000));
    expect(tipsText().some((t) => t.includes("👤"))).toBe(true);
  });
});

describe("Cenário 26 — fallback sem couple nas dicas com nomes", () => {
  it("usa 'Pessoa A'/'Pessoa B'", () => {
    storeState.couple = null;
    storeState.expenses = [
      expense({ amount: 8000, paidBy: "A" }),
      expense({ amount: 2000, paidBy: "B" }),
    ];

    render(<InsightsSection ym={YM} />);

    expect(tipsText().some((t) => t.includes("⚖️") && t.includes("Pessoa A"))).toBe(true);
  });
});
