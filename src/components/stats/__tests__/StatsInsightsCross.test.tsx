// src/components/stats/__tests__/StatsInsightsCross.test.tsx
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

import StatsSection from "@/components/stats/StatsSection";
import InsightsSection from "@/components/stats/InsightsSection";
import { fromCents } from "@/lib/currency";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// getByText normaliza (colapsa) espaços — inclusive NBSP — do texto do DOM,
// mas não normaliza o padrão passado; por isso recriamos o mesmo espaço
// "normalizado" aqui e escapamos caracteres especiais de regex (ex.: "R$").
function money(cents: number, currency?: string) {
  return escapeRegExp(fromCents(cents, currency).replace(/\s+/g, " "));
}

function expense(partial: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Despesa",
    amount: 1000,
    category: "Outros",
    paidBy: "A",
    split: { a: 1, b: 1 },
    ...partial,
  };
}

function income(partial: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    person: "A",
    source: "Salário",
    amount: 1000,
    ...partial,
  };
}

beforeEach(() => {
  storeState.expenses = [];
  storeState.incomes = [];
  storeState.couple = { id: "casal-1", nameA: "Ana", nameB: "Bruno", currency: "BRL" };
});

describe("Cenário 27 — mesmos totais pro mesmo ym lado a lado", () => {
  it("StatsSection e InsightsSection mostram o mesmo saldo do mês", () => {
    const YM = "2026-06";
    storeState.incomes = [income({ amount: 10000, ym: YM })];
    storeState.expenses = [expense({ amount: 4000, ym: YM })];

    render(
      <div>
        <StatsSection ym={YM} />
        <InsightsSection ym={YM} />
      </div>
    );

    // StatsSection: "Sobra: R$60,00" / InsightsSection: StatBox "Sobra/Falta" = R$60,00
    expect(screen.getByText(new RegExp(`Sobra: ${money(6000)}`))).toBeInTheDocument();
    const sobraFaltaLabel = screen.getByText("Sobra/Falta");
    const sobraFaltaValue = (sobraFaltaLabel.parentElement as HTMLElement).querySelector(
      ".font-semibold"
    ) as HTMLElement;
    expect(sobraFaltaValue.textContent).toBe(fromCents(6000));
  });
});

describe("Cenário 28 — troca de ym não vaza dado do mês anterior", () => {
  it("ambos recalculam ao trocar o ym", () => {
    const YM1 = "2026-06";
    const YM2 = "2026-07";
    storeState.expenses = [
      expense({ amount: 4000, ym: YM1, category: "MesUm" }),
      expense({ amount: 9000, ym: YM2, category: "MesDois" }),
    ];

    const { rerender } = render(
      <div>
        <StatsSection ym={YM1} />
        <InsightsSection ym={YM1} />
      </div>
    );

    expect(screen.getAllByText("MesUm").length).toBeGreaterThan(0);
    expect(screen.queryByText("MesDois")).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Faltam: ${money(4000)}`))).toBeInTheDocument();

    rerender(
      <div>
        <StatsSection ym={YM2} />
        <InsightsSection ym={YM2} />
      </div>
    );

    expect(screen.getAllByText("MesDois").length).toBeGreaterThan(0);
    expect(screen.queryByText("MesUm")).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Faltam: ${money(9000)}`))).toBeInTheDocument();
  });
});
