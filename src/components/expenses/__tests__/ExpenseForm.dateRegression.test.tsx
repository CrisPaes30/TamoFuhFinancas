// src/components/expenses/__tests__/ExpenseForm.dateRegression.test.tsx
//
// Reproduz, de ponta a ponta (formulário -> store -> documento gravado), o
// bug relatado: uma despesa datada do DIA 1 de um mês é arquivada no mês
// ERRADO. Causa raiz: ExpenseForm fazia `new Date("2026-10-01")`, que o
// JS interpreta como UTC 00:00 — em fusos negativos (ex.: America/Sao_Paulo,
// UTC-3) isso recua pra "2026-09-30 21:00" local, um mês inteiro antes.
//
// Diferente dos outros testes de ExpenseForm, aqui NÃO mockamos @/store —
// usamos a store REAL (só o Firestore é mockado) pra expor o bug de verdade,
// já que ele só aparece quando ExpenseForm e store.addExpense interagem
// (ExpenseForm pré-converte a data pra Timestamp, o que faz a store pular a
// própria normalização seguindo por `data.date instanceof Timestamp`).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { addDocMock } = vi.hoisted(() => ({
  addDocMock: vi.fn(async (_col: any, data: any) => ({ id: "doc_1" })),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    addDoc: addDocMock,
    updateDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    doc: vi.fn(() => ({})),
    collection: vi.fn(() => ({})),
    arrayUnion: vi.fn((v: any) => ({ __op: "arrayUnion", v })),
    serverTimestamp: vi.fn(() => ({ __op: "serverTimestamp" })),
  };
});

import { useStore } from "@/store";
import ExpenseForm from "@/components/expenses/ExpenseForm";

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    couple: { id: "casal-teste-1", nameA: "Ana", nameB: "Bruno", currency: "BRL" } as any,
    profile: { uid: "uid-ana" } as any,
    expenses: [],
    incomes: [],
  });
});

describe("Regressão — despesa no dia 1 do mês tem que ficar NO MÊS CERTO", () => {
  it("dia 1/outubro/2026 é gravado com ym='2026-10' e date=dia 1 (não 2026-09/dia 30)", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm open onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Ex\.: Conta de água/i), "Aluguel outubro");
    await user.type(screen.getByPlaceholderText(/Valor \(ex\.: 120,00\)/i), "1000,00");

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, "2026-10-01");

    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(addDocMock).toHaveBeenCalledTimes(1);
    const payload = addDocMock.mock.calls[0][1];

    expect(payload.ym).toBe("2026-10");
    const savedDate: Date = payload.date.toDate();
    expect(savedDate.getFullYear()).toBe(2026);
    expect(savedDate.getMonth()).toBe(9); // outubro (0-indexado)
    expect(savedDate.getDate()).toBe(1);
  });
});
