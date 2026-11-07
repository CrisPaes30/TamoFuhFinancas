// src/pages/__tests__/Dashboard.test.tsx
//
// Cobre só a troca do fluxo "Acertar agora" (abre popup em vez de fechar na
// hora) e a regra de esconder o botão quando já existe um acerto ativo
// cobrindo o mês selecionado. Demais seções (ExpenseList/Stats/Insights/etc.)
// são mockadas como stubs — já têm testes próprios.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";

const { expensesState, settlementsState } = vi.hoisted(() => ({
  expensesState: { list: [] as any[] },
  settlementsState: { list: [] as any[] },
}));

// Fixa o "mês atual" do Dashboard sem usar fake timers (fake timers travam
// as esperas internas do userEvent em testes de clique).
vi.mock("@/lib/date", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/date")>();
  return { ...actual, getCurrentYM: () => "2026-11" };
});

vi.mock("@/store", () => ({
  useStore: (selector?: (s: any) => any) => {
    const state = {
      couple: { id: "casal-teste-1", nameA: "Ana", nameB: "Bruno", currency: "BRL" },
      expenses: expensesState.list,
      settlements: settlementsState.list,
      deleteExpense: vi.fn(async () => {}),
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

vi.mock("@/components/invite/ShareInviteBar", () => ({ default: () => null }));
vi.mock("@/components/expenses/ExpenseForm", () => ({ default: () => null }));
vi.mock("@/components/expenses/ExpenseList", () => ({ default: () => null }));
vi.mock("@/components/incomes/IncomeForm", () => ({ default: () => null }));
vi.mock("@/components/stats/StatsSection", () => ({ default: () => null }));
vi.mock("@/components/stats/InsightsSection", () => ({ default: () => null }));
vi.mock("@/components/settlement/SettlementBanner", () => ({
  default: () => <div data-testid="settlement-banner" />,
}));
vi.mock("@/components/settlement/SettleRangeModal", () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="settle-modal">
        {props.defaultStart} a {props.defaultEnd}
      </div>
    ) : null,
}));

import Dashboard from "@/pages/Dashboard";

function expense(partial: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Mercado",
    amount: 10000,
    category: "Mercado",
    paidBy: "A",
    split: { a: 1, b: 1 },
    date: Timestamp.fromDate(new Date(2026, 10, 10, 12)),
    ym: "2026-11",
    deleted: false,
    ...partial,
  };
}

function pendingSettlement(partial: Partial<any> = {}) {
  return {
    id: "settle-1",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    status: "pending",
    proposedBy: "uid-ana",
    proposedByName: "Ana",
    debtor: "B",
    amount: 5000,
    snapshot: [],
    responses: [],
    ...partial,
  };
}

beforeEach(() => {
  expensesState.list = [];
  settlementsState.list = [];
});

describe("Dashboard — sem acertos ativos (comportamento de hoje)", () => {
  it("mostra 'Acertar agora' normalmente quando settlements está vazio", () => {
    expensesState.list = [expense()];
    render(<Dashboard />);

    expect(screen.getByText("Acertar agora")).toBeInTheDocument();
    expect(screen.getByText("Acertar agora")).not.toBeDisabled();
    expect(screen.getByTestId("settlement-banner")).toBeInTheDocument();
  });

  it("clicar em 'Acertar agora' abre o popup de período (não fecha na hora)", async () => {
    expensesState.list = [expense()];
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(screen.queryByTestId("settle-modal")).not.toBeInTheDocument();
    await user.click(screen.getByText("Acertar agora"));

    expect(screen.getByTestId("settle-modal")).toBeInTheDocument();
    expect(screen.getByTestId("settle-modal").textContent).toBe(
      "2026-11-01 a 2026-11-30"
    );
  });

  it("desabilita 'Acertar agora' quando não há diferença no mês (saldo zero)", () => {
    expensesState.list = [
      expense({ split: { a: 1, b: 1 }, paidBy: "A", amount: 0 }),
    ];
    render(<Dashboard />);
    expect(screen.getByText("Acertar agora")).toBeDisabled();
  });
});

describe("Dashboard — já existe acerto ativo cobrindo o mês selecionado", () => {
  it("esconde 'Acertar agora' quando há proposta pending no período do mês", () => {
    expensesState.list = [expense()];
    settlementsState.list = [pendingSettlement()];
    render(<Dashboard />);

    expect(screen.queryByText("Acertar agora")).not.toBeInTheDocument();
    expect(screen.getByTestId("settlement-banner")).toBeInTheDocument();
  });

  it("esconde 'Acertar agora' quando há proposta contestada no período do mês", () => {
    expensesState.list = [expense()];
    settlementsState.list = [pendingSettlement({ status: "contested" })];
    render(<Dashboard />);

    expect(screen.queryByText("Acertar agora")).not.toBeInTheDocument();
  });

  it("NÃO esconde 'Acertar agora' quando a proposta ativa é de outro período", () => {
    expensesState.list = [expense()];
    settlementsState.list = [
      pendingSettlement({ periodStart: "2026-10-01", periodEnd: "2026-10-31" }),
    ];
    render(<Dashboard />);

    expect(screen.getByText("Acertar agora")).toBeInTheDocument();
  });

  it("NÃO esconde 'Acertar agora' quando a proposta do mesmo período está cancelada/fechada", () => {
    expensesState.list = [expense()];
    settlementsState.list = [
      pendingSettlement({ status: "cancelled" }),
      pendingSettlement({ id: "settle-2", status: "closed" }),
    ];
    render(<Dashboard />);

    expect(screen.getByText("Acertar agora")).toBeInTheDocument();
  });
});
