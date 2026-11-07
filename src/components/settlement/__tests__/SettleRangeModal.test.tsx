// src/components/settlement/__tests__/SettleRangeModal.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { previewSettlementMock, proposeSettlementMock } = vi.hoisted(() => ({
  previewSettlementMock: vi.fn(),
  proposeSettlementMock: vi.fn(async () => "novo-id"),
}));

vi.mock("@/store", () => ({
  useStore: (selector?: (s: any) => any) => {
    const state = {
      couple: {
        id: "casal-teste-1",
        nameA: "Ana",
        nameB: "Bruno",
        currency: "BRL",
      },
      expenses: [],
      previewSettlement: previewSettlementMock,
      proposeSettlement: proposeSettlementMock,
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

import SettleRangeModal from "@/components/settlement/SettleRangeModal";

function noDiff() {
  return { saldoA: 0, debtor: null, amount: 0, items: [] };
}

function withDiff(overrides: Partial<ReturnType<typeof noDiff>> = {}) {
  return {
    saldoA: 5000,
    debtor: "B" as const,
    amount: 5000,
    items: [
      {
        expenseId: "e1",
        title: "Mercado",
        date: "2026-11-05",
        category: "Mercado",
        amount: 5000,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  previewSettlementMock.mockReturnValue(withDiff());
});

describe("Popup de período — defaults e preview", () => {
  it("abre com o período default recebido (mês atual) e busca o preview", () => {
    render(
      <SettleRangeModal
        open
        onClose={() => {}}
        defaultStart="2026-11-01"
        defaultEnd="2026-11-30"
      />
    );

    expect(screen.getByLabelText("Início")).toHaveValue("2026-11-01");
    expect(screen.getByLabelText("Fim")).toHaveValue("2026-11-30");
    expect(previewSettlementMock).toHaveBeenCalledWith("2026-11-01", "2026-11-30");
    expect(screen.getByText("Mercado")).toBeInTheDocument();
  });

  it("recalcula o preview ao mudar as datas", async () => {
    const user = userEvent.setup();
    render(
      <SettleRangeModal
        open
        onClose={() => {}}
        defaultStart="2026-11-01"
        defaultEnd="2026-11-30"
      />
    );
    previewSettlementMock.mockClear();

    const inicio = screen.getByLabelText("Início");
    await user.clear(inicio);
    await user.type(inicio, "2026-11-10");

    expect(previewSettlementMock).toHaveBeenCalledWith("2026-11-10", "2026-11-30");
  });

  it("não quebra ao reabrir com defaults diferentes (ex.: outro mês selecionado no Dashboard)", () => {
    const { rerender } = render(
      <SettleRangeModal
        open={false}
        onClose={() => {}}
        defaultStart="2026-11-01"
        defaultEnd="2026-11-30"
      />
    );
    rerender(
      <SettleRangeModal
        open
        onClose={() => {}}
        defaultStart="2026-10-01"
        defaultEnd="2026-10-31"
      />
    );
    expect(screen.getByLabelText("Início")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Fim")).toHaveValue("2026-10-31");
  });
});

describe("Popup de período — sem diferença no período", () => {
  it("desabilita o botão de enviar e mostra mensagem", () => {
    previewSettlementMock.mockReturnValue(noDiff());
    render(
      <SettleRangeModal
        open
        onClose={() => {}}
        defaultStart="2026-11-01"
        defaultEnd="2026-11-30"
      />
    );

    expect(
      screen.getByText("Não há diferença a acertar neste período.")
    ).toBeInTheDocument();
    expect(screen.getByText("Enviar proposta")).toBeDisabled();
  });
});

describe("Popup de período — envio da proposta", () => {
  it("chama proposeSettlement com os valores do período e fecha o popup", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SettleRangeModal
        open
        onClose={onClose}
        defaultStart="2026-11-01"
        defaultEnd="2026-11-30"
      />
    );

    await user.click(screen.getByText("Enviar proposta"));

    expect(proposeSettlementMock).toHaveBeenCalledWith({
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("trata erro do store (ex.: proposta ativa já existente) sem quebrar a tela", async () => {
    const onClose = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    proposeSettlementMock.mockRejectedValueOnce(
      new Error("Já existe uma proposta de acerto em andamento para este período.")
    );
    const user = userEvent.setup();

    render(
      <SettleRangeModal
        open
        onClose={onClose}
        defaultStart="2026-11-01"
        defaultEnd="2026-11-30"
      />
    );

    await user.click(screen.getByText("Enviar proposta"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Já existe uma proposta de acerto em andamento para este período."
    );
    expect(onClose).not.toHaveBeenCalled();
    // tela continua de pé, botão ainda presente
    expect(screen.getByText("Enviar proposta")).toBeInTheDocument();

    alertSpy.mockRestore();
  });
});
