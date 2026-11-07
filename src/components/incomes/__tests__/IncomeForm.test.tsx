// src/components/incomes/__tests__/IncomeForm.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { addIncomeMock, updateIncomeMock, removeIncomeMock, CASAL_TESTE, incomesState } = vi.hoisted(() => ({
  addIncomeMock: vi.fn(async () => {}),
  updateIncomeMock: vi.fn(async () => {}),
  removeIncomeMock: vi.fn(async () => {}),
  CASAL_TESTE: { id: "casal-teste-1", nameA: "Ana", nameB: "Bruno", currency: "BRL" },
  incomesState: { list: [] as any[] },
}));

// IncomeForm usa o padrão seletor do zustand: useStore((s) => s.algumaCoisa).
// O mock precisa suportar tanto chamada com seletor quanto sem (destructuring).
vi.mock("@/store", () => ({
  useStore: (selector?: (s: any) => any) => {
    const state = {
      couple: CASAL_TESTE,
      incomes: incomesState.list,
      addIncome: addIncomeMock,
      updateIncome: updateIncomeMock,
      removeIncome: removeIncomeMock,
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

import IncomeForm from "@/components/incomes/IncomeForm";

// IncomeForm abre sempre filtrado no mês atual do sistema (new Date()).
const d = new Date();
const CURRENT_YM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

beforeEach(() => {
  vi.clearAllMocks();
  incomesState.list = [];
});

describe("Cenário — Renda inválida (valor <= 0)", () => {
  it("não chama addIncome quando o valor é zero ou inválido", async () => {
    const user = userEvent.setup();
    render(<IncomeForm open onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Salário, Freela/i), "Freela");
    await user.type(screen.getByPlaceholderText(/Valor \(ex\.: 2\.500,00\)/i), "0,00");
    await user.click(screen.getByRole("button", { name: /adicionar renda/i }));

    expect(addIncomeMock).not.toHaveBeenCalled();
  });
});

describe("Cenário — Adicionar renda válida", () => {
  it("chama addIncome com os centavos corretos e o mês selecionado", async () => {
    const user = userEvent.setup();
    render(<IncomeForm open onClose={() => {}} />);

    const fonteInput = screen.getByPlaceholderText(/Salário, Freela/i);
    await user.clear(fonteInput); // já vem com "Salário" por padrão
    await user.type(fonteInput, "Salário");
    await user.type(screen.getByPlaceholderText(/Valor \(ex\.: 2\.500,00\)/i), "2.500,00");
    await user.click(screen.getByRole("button", { name: /adicionar renda/i }));

    expect(addIncomeMock).toHaveBeenCalledTimes(1);
    const payload = addIncomeMock.mock.calls[0][0];
    expect(payload.amount).toBe(250000);
    expect(payload.source).toBe("Salário");
    expect(payload.person).toBe("A");
  });
});

describe("Cenário — Editar renda existente", () => {
  it("carrega os valores da renda no formulário e salva via updateIncome", async () => {
    incomesState.list = [
      { id: "inc-1", person: "B", source: "Freela", amount: 30000, ym: CURRENT_YM },
    ];
    const user = userEvent.setup();
    render(<IncomeForm open onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^editar$/i }));

    expect(screen.getByDisplayValue("Freela")).toBeInTheDocument();
    expect(screen.getByDisplayValue("300,00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(updateIncomeMock).toHaveBeenCalledWith(
      "inc-1",
      expect.objectContaining({ amount: 30000, source: "Freela", person: "B" })
    );
  });
});

describe("Cenário — Excluir renda", () => {
  it("pede confirmação e chama removeIncome", async () => {
    incomesState.list = [
      { id: "inc-1", person: "A", source: "Bônus", amount: 10000, ym: CURRENT_YM },
    ];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<IncomeForm open onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^excluir$/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(removeIncomeMock).toHaveBeenCalledWith("inc-1");
    confirmSpy.mockRestore();
  });
});
