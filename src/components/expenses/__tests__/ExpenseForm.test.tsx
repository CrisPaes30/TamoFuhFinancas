// src/components/expenses/__tests__/ExpenseForm.test.tsx
//
// Testa o componente REAL ExpenseForm.tsx, mockando o store (zustand) e o Firestore.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { addExpenseMock, updateExpenseMock, updateDocMock, arrayUnionMock, CASAL_TESTE } = vi.hoisted(() => ({
  addExpenseMock: vi.fn(async () => {}),
  updateExpenseMock: vi.fn(async () => {}),
  updateDocMock: vi.fn(async () => {}),
  arrayUnionMock: vi.fn((...values: any[]) => ({ __op: "arrayUnion", values })),
  CASAL_TESTE: {
    id: "casal-teste-1",
    nameA: "Ana",
    nameB: "Bruno",
    currency: "BRL",
    categories: [] as string[],
  },
}));

vi.mock("@/store", () => ({
  useStore: () => ({
    couple: CASAL_TESTE,
    addExpense: addExpenseMock,
    updateExpense: updateExpenseMock,
  }),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    updateDoc: updateDocMock,
    doc: vi.fn(() => ({})),
    arrayUnion: arrayUnionMock,
  };
});

import ExpenseForm from "@/components/expenses/ExpenseForm";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Cenário #14 — Título vazio", () => {
  it("botão Salvar fica desabilitado sem título", () => {
    render(<ExpenseForm open onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: /^salvar$/i });
    expect(btn).toBeDisabled();
  });
});

describe("Cenário #13 — Valor inválido", () => {
  // Fix aplicado: toCents("abc")/"" retorna 0, e handleSave agora exige
  // cents > 0 (antes aceitava cents === 0), alertando o usuário em vez de
  // salvar uma despesa de R$0,00 silenciosamente.
  it("não chama addExpense e alerta quando o valor não é válido (texto)", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<ExpenseForm open onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Ex\.: Conta de água/i), "Teste valor inválido");
    await user.type(screen.getByPlaceholderText(/Valor \(ex\.: 120,00\)/i), "abc");

    const btn = screen.getByRole("button", { name: /^salvar$/i });
    expect(btn).not.toBeDisabled(); // título preenchido habilita o botão
    await user.click(btn);

    expect(addExpenseMock).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("valor válido"));
    alertSpy.mockRestore();
  });

  it("não chama addExpense quando o valor é zero", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<ExpenseForm open onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Ex\.: Conta de água/i), "Teste valor zero");
    await user.type(screen.getByPlaceholderText(/Valor \(ex\.: 120,00\)/i), "0,00");

    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(addExpenseMock).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe("Cenário #11 — Fixa e Cartão são mutuamente exclusivos", () => {
  it("marcar Cartão desmarca Despesa fixa automaticamente", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm open onClose={() => {}} />);

    const chkFixed = screen.getByLabelText(/Despesa fixa/i) as HTMLInputElement;
    const chkCard = screen.getByLabelText(/Compra no cartão de crédito/i) as HTMLInputElement;

    await user.click(chkFixed);
    expect(chkFixed.checked).toBe(true);

    await user.click(chkCard);
    expect(chkCard.checked).toBe(true);
    expect(chkFixed.checked).toBe(false); // exclusão mútua
  });
});

describe("Cenário #9 — Parcelas acima de 36 são limitadas (clamp)", () => {
  it("digitar 99 e sair do campo normaliza para 36", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm open onClose={() => {}} />);

    await user.click(screen.getByLabelText(/Compra no cartão de crédito/i));

    const parcelasInput = document.querySelector(
      'input[inputmode="numeric"]'
    ) as HTMLInputElement;
    await user.clear(parcelasInput);
    await user.type(parcelasInput, "99");
    fireEvent.blur(parcelasInput);

    expect(parcelasInput.value).toBe("36");
  });
});

describe("Cenário #15 — Categoria custom sem nome", () => {
  it("alerta e não salva quando 'Outros (especificar…)' fica vazio", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<ExpenseForm open onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Ex\.: Conta de água/i), "Despesa categoria custom");
    await user.type(screen.getByPlaceholderText(/Valor \(ex\.: 120,00\)/i), "50,00");

    const selects = screen.getAllByRole("combobox");
    const categorySelect = selects.find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.value === "__custom__")
    ) as HTMLSelectElement;
    await user.selectOptions(categorySelect, "__custom__");

    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining("Digite o nome da categoria")
    );
    expect(addExpenseMock).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe("Cenário #4 — Categoria personalizada + 'Salvar' categoria", () => {
  it("salva a despesa com a categoria custom e persiste via arrayUnion no casal", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm open onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Ex\.: Conta de água/i), "Ração do gato");
    await user.type(screen.getByPlaceholderText(/Valor \(ex\.: 120,00\)/i), "80,00");

    const selects = screen.getAllByRole("combobox");
    const categorySelect = selects.find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.value === "__custom__")
    ) as HTMLSelectElement;
    await user.selectOptions(categorySelect, "__custom__");

    await user.type(screen.getByPlaceholderText(/Ex\.: Compras do mês/i), "Pet");
    await user.click(screen.getByLabelText(/^Salvar$/i)); // checkbox "Salvar" da categoria

    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(addExpenseMock).toHaveBeenCalledTimes(1));
    const payload = addExpenseMock.mock.calls[0][0];
    expect(payload.category).toBe("Pet");
    expect(payload.amount).toBe(8000);

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    expect(arrayUnionMock).toHaveBeenCalledWith("Pet");
  });
});
