// src/components/expenses/__tests__/ExpenseList.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { deleteExpenseMock, expensesState, profileState } = vi.hoisted(() => ({
  deleteExpenseMock: vi.fn(async () => {}),
  expensesState: { list: [] as any[] },
  profileState: { uid: "uid-ana" as string | undefined },
}));

vi.mock("@/store", () => ({
  useStore: (selector?: (s: any) => any) => {
    const state = {
      couple: { id: "casal-teste-1", currency: "BRL" },
      expenses: expensesState.list,
      deleteExpense: deleteExpenseMock,
      profile: { uid: profileState.uid },
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

import ExpenseList from "@/components/expenses/ExpenseList";

const YM = "2026-06";

function expense(partial: Partial<any>) {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Despesa",
    amount: 1000,
    date: new Date(2026, 5, 10),
    ym: YM,
    category: "Outros",
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  expensesState.list = [];
  profileState.uid = "uid-ana";
});

describe("Cenário L6 — mês vazio", () => {
  it("mostra 'Nenhuma despesa encontrada' e contador 0 de 0", () => {
    render(<ExpenseList ym={YM} />);
    expect(screen.getByText(/Nenhuma despesa encontrada em/i)).toBeInTheDocument();
    expect(screen.getByText("0 de 0")).toBeInTheDocument();
  });
});

describe("Cenário L7/L4 — filtra por mês e ignora despesas deletadas", () => {
  it("só lista despesas do ym pedido e não-deletadas", () => {
    expensesState.list = [
      expense({ title: "Mercado", ym: "2026-06" }),
      expense({ title: "Viagem", ym: "2026-07" }), // outro mês
      expense({ title: "Excluída", ym: "2026-06", deleted: true }), // soft-deleted
    ];
    render(<ExpenseList ym="2026-06" />);

    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByText("Viagem")).not.toBeInTheDocument();
    expect(screen.queryByText("Excluída")).not.toBeInTheDocument();
    expect(screen.getByText("1 de 1")).toBeInTheDocument();
  });
});

describe("Cenário L5 — busca", () => {
  it("filtra por título/categoria em tempo real, ignorando acentos/caixa", async () => {
    expensesState.list = [
      expense({ title: "Bolacha", category: "Mercado" }),
      expense({ title: "Academia", category: "Saúde" }),
    ];
    const user = userEvent.setup();
    render(<ExpenseList ym={YM} />);

    await user.type(screen.getByPlaceholderText(/Pesquisar despesa/i), "acade");

    expect(screen.getByText("Academia")).toBeInTheDocument();
    expect(screen.queryByText("Bolacha")).not.toBeInTheDocument();
  });
});

describe("Cenário — A insere, B vê (mesma lista, qualquer um dos dois olhando)", () => {
  it("despesa criada por Bruno aparece normalmente pra quem está vendo (Ana)", () => {
    expensesState.list = [expense({ title: "Bolacha", createdBy: "uid-bruno" })];
    profileState.uid = "uid-ana"; // Ana é quem está olhando a tela agora

    render(<ExpenseList ym={YM} />);
    expect(screen.getByText("Bolacha")).toBeInTheDocument();
  });
});

describe("Cenário — só o autor edita/exclui", () => {
  it("mostra editar/excluir para quem criou a despesa", () => {
    expensesState.list = [expense({ title: "Minha despesa", createdBy: "uid-ana" })];
    profileState.uid = "uid-ana";

    render(<ExpenseList ym={YM} />);
    expect(screen.getByTitle("Editar")).toBeInTheDocument();
    expect(screen.getByTitle("Excluir")).toBeInTheDocument();
  });

  it("esconde editar/excluir e mostra cadeado para quem NÃO criou a despesa", () => {
    expensesState.list = [expense({ title: "Despesa do Bruno", createdBy: "uid-bruno" })];
    profileState.uid = "uid-ana"; // Ana olhando uma despesa que o Bruno criou

    render(<ExpenseList ym={YM} />);
    expect(screen.queryByTitle("Editar")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Excluir")).not.toBeInTheDocument();
    expect(
      screen.getByTitle(/Somente quem criou esta despesa pode editá-la ou excluí-la/i)
    ).toBeInTheDocument();
  });

  it("despesa legada sem createdBy libera editar/excluir pra qualquer um (fail-open)", () => {
    expensesState.list = [expense({ title: "Despesa antiga" })]; // sem createdBy
    profileState.uid = "uid-ana";

    render(<ExpenseList ym={YM} />);
    expect(screen.getByTitle("Editar")).toBeInTheDocument();
    expect(screen.getByTitle("Excluir")).toBeInTheDocument();
  });

  it("clicar Excluir (confirmado) chama deleteExpense só quando autorizado", async () => {
    expensesState.list = [expense({ id: "doc-1", title: "Minha despesa", createdBy: "uid-ana" })];
    profileState.uid = "uid-ana";
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<ExpenseList ym={YM} />);
    await user.click(screen.getByTitle("Excluir"));

    expect(deleteExpenseMock).toHaveBeenCalledWith("doc-1");
    confirmSpy.mockRestore();
  });
});
