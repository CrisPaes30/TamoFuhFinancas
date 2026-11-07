// src/components/settlement/__tests__/SettlementBanner.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";

const { respondSettlementMock, cancelSettlementMock, settlementsState, profileState } =
  vi.hoisted(() => ({
    respondSettlementMock: vi.fn(async () => {}),
    cancelSettlementMock: vi.fn(async () => {}),
    settlementsState: { list: [] as any[] },
    profileState: { uid: "uid-ana" as string | undefined },
  }));

vi.mock("@/store", () => ({
  useStore: (selector?: (s: any) => any) => {
    const state = {
      couple: { id: "casal-teste-1", nameA: "Ana", nameB: "Bruno", currency: "BRL" },
      settlements: settlementsState.list,
      profile: { uid: profileState.uid },
      respondSettlement: respondSettlementMock,
      cancelSettlement: cancelSettlementMock,
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

import SettlementBanner from "@/components/settlement/SettlementBanner";

function settlement(partial: Partial<any> = {}) {
  return {
    id: "settle-1",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    status: "pending",
    proposedBy: "uid-ana",
    proposedByName: "Ana",
    debtor: "B",
    amount: 5000,
    snapshot: [
      {
        expenseId: "e1",
        title: "Mercado",
        date: "2026-11-05",
        category: "Mercado",
        amount: 5000,
      },
    ],
    responses: [
      { by: "uid-ana", byName: "Ana", action: "propose", at: Timestamp.now() },
    ],
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  settlementsState.list = [];
  profileState.uid = "uid-ana";
});

describe("Banner de acerto — sem propostas ativas", () => {
  it("não renderiza nada quando settlements está vazio", () => {
    const { container } = render(<SettlementBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não renderiza nada quando só há acertos fechados/cancelados", () => {
    settlementsState.list = [
      settlement({ status: "closed" }),
      settlement({ id: "s2", status: "cancelled" }),
    ];
    const { container } = render(<SettlementBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Banner de acerto — eu propus", () => {
  it("pending: mostra 'aguardando confirmação' e botão Cancelar proposta", () => {
    settlementsState.list = [settlement({ status: "pending", proposedBy: "uid-ana" })];
    profileState.uid = "uid-ana";

    render(<SettlementBanner />);

    expect(
      screen.getByText("Aguardando confirmação de seu parceiro(a).")
    ).toBeInTheDocument();
    expect(screen.getByText("Cancelar proposta")).toBeInTheDocument();
    expect(screen.queryByText("Concordar")).not.toBeInTheDocument();
  });

  it("contested: mostra a nota de contestação e botão Cancelar proposta", () => {
    settlementsState.list = [
      settlement({
        status: "contested",
        proposedBy: "uid-ana",
        responses: [
          { by: "uid-ana", byName: "Ana", action: "propose", at: Timestamp.now() },
          {
            by: "uid-bruno",
            byName: "Bruno",
            action: "contest",
            note: "Faltou a parcela do mercado",
            at: Timestamp.now(),
          },
        ],
      }),
    ];
    profileState.uid = "uid-ana";

    render(<SettlementBanner />);

    expect(
      screen.getByText("Seu parceiro(a) contestou esta proposta.")
    ).toBeInTheDocument();
    expect(screen.getByText("Faltou a parcela do mercado")).toBeInTheDocument();
    expect(screen.getByText("Cancelar proposta")).toBeInTheDocument();
  });

  it("clicar em Cancelar proposta chama cancelSettlement com o id", async () => {
    settlementsState.list = [settlement({ id: "s-cancel", proposedBy: "uid-ana" })];
    profileState.uid = "uid-ana";
    const user = userEvent.setup();

    render(<SettlementBanner />);
    await user.click(screen.getByText("Cancelar proposta"));

    expect(cancelSettlementMock).toHaveBeenCalledWith("s-cancel");
  });
});

describe("Banner de acerto — o outro propôs, eu preciso responder", () => {
  it("pending: mostra o detalhamento e os botões Concordar/Contestar", () => {
    settlementsState.list = [
      settlement({ proposedBy: "uid-bruno", proposedByName: "Bruno" }),
    ];
    profileState.uid = "uid-ana";

    render(<SettlementBanner />);

    expect(screen.getByText("Proposto por Bruno")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("Concordar")).toBeInTheDocument();
    expect(screen.getByText("Contestar")).toBeInTheDocument();
    expect(screen.queryByText("Cancelar proposta")).not.toBeInTheDocument();
  });

  it("clicar em Concordar chama respondSettlement(id, 'agree')", async () => {
    settlementsState.list = [
      settlement({ id: "s-agree", proposedBy: "uid-bruno", proposedByName: "Bruno" }),
    ];
    profileState.uid = "uid-ana";
    const user = userEvent.setup();

    render(<SettlementBanner />);
    await user.click(screen.getByText("Concordar"));

    expect(respondSettlementMock).toHaveBeenCalledWith("s-agree", "agree");
  });

  it("clicar em Contestar abre o campo de nota e envia com respondSettlement(id, 'contest', nota)", async () => {
    settlementsState.list = [
      settlement({ id: "s-contest", proposedBy: "uid-bruno", proposedByName: "Bruno" }),
    ];
    profileState.uid = "uid-ana";
    const user = userEvent.setup();

    render(<SettlementBanner />);
    await user.click(screen.getByText("Contestar"));

    const textarea = screen.getByPlaceholderText(
      /Explique o motivo da contestação/i
    );
    await user.type(textarea, "Essa parcela já foi paga à parte");
    await user.click(screen.getByText("Enviar contestação"));

    expect(respondSettlementMock).toHaveBeenCalledWith(
      "s-contest",
      "contest",
      "Essa parcela já foi paga à parte"
    );
  });

  it("erro do store ao responder é tratado sem quebrar a tela (alert)", async () => {
    settlementsState.list = [
      settlement({ id: "s-err", proposedBy: "uid-bruno", proposedByName: "Bruno" }),
    ];
    profileState.uid = "uid-ana";
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    respondSettlementMock.mockRejectedValueOnce(new Error("Esta proposta já foi encerrada."));
    const user = userEvent.setup();

    render(<SettlementBanner />);
    await user.click(screen.getByText("Concordar"));

    expect(alertSpy).toHaveBeenCalledWith("Esta proposta já foi encerrada.");
    expect(screen.getByText("Concordar")).toBeInTheDocument();

    alertSpy.mockRestore();
  });
});

describe("Banner de acerto — múltiplas propostas ativas simultâneas", () => {
  it("lista todas as propostas ativas, não só a primeira", () => {
    settlementsState.list = [
      settlement({
        id: "s-nov",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        proposedBy: "uid-ana",
      }),
      settlement({
        id: "s-out",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        proposedBy: "uid-bruno",
        proposedByName: "Bruno",
        status: "pending",
      }),
    ];
    profileState.uid = "uid-ana";

    render(<SettlementBanner />);

    expect(screen.getByText("01/11/2026 a 30/11/2026")).toBeInTheDocument();
    expect(screen.getByText("01/10/2026 a 31/10/2026")).toBeInTheDocument();
  });
});
