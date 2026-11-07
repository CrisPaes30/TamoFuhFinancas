// src/store/__tests__/settlement.test.ts
//
// Testa a state machine REAL de acertos (proposeSettlement/respondSettlement/
// cancelSettlement) em src/store/index.tsx, contra Firestore MOCK, e a trava
// de edição de despesas num período em negociação/fechado (assertPeriodNotLocked).

import { describe, it, expect, vi, beforeEach } from "vitest";

import { Timestamp } from "firebase/firestore";

const {
  addDocMock,
  updateDocMock,
  deleteDocMock,
  docMock,
  collectionMock,
  arrayUnionMock,
  serverTimestampMock,
  runTransactionMock,
  txSettlementsLookup,
} = vi.hoisted(() => {
  const addDocMock = vi.fn(async (_col: any, _data: any) => ({
    id: `doc_${addDocMock.mock.calls.length - 1}`,
  }));
  // respondSettlement("agree") grava a despesa + fecha o settlement numa
  // runTransaction (atomicidade). O mock delega tx.set/tx.update pros MESMOS
  // trackers addDocMock/updateDocMock, pra reaproveitar as asserções já
  // existentes; tx.get lê o settlement "ao vivo" via este lookup (plugado
  // em beforeEach, já que useStore só existe depois do import dinâmico).
  const txSettlementsLookup: { current: () => any[] } = { current: () => [] };
  const runTransactionMock = vi.fn(async (_db: any, updater: (tx: any) => Promise<void>) => {
    const tx = {
      get: async (ref: any) => {
        const id = String(ref.__path).split("/").pop();
        const found = txSettlementsLookup.current().find((s: any) => s.id === id);
        return { exists: () => !!found, data: () => found };
      },
      set: (ref: any, data: any) => addDocMock(ref, data),
      update: (ref: any, data: any) => updateDocMock(ref, data),
    };
    await updater(tx);
  });
  return {
    addDocMock,
    updateDocMock: vi.fn(async (_ref: any, _data: any) => {}),
    deleteDocMock: vi.fn(async (_ref: any) => {}),
    docMock: vi.fn((...args: any[]) => ({ __path: args.filter((a) => typeof a === "string").join("/") })),
    collectionMock: vi.fn((...args: any[]) => ({ __path: args.filter((a) => typeof a === "string").join("/") })),
    arrayUnionMock: vi.fn((...values: any[]) => ({ __op: "arrayUnion", values })),
    serverTimestampMock: vi.fn(() => ({ __op: "serverTimestamp" })),
    runTransactionMock,
    txSettlementsLookup,
  };
});

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    addDoc: addDocMock,
    updateDoc: updateDocMock,
    deleteDoc: deleteDocMock,
    doc: docMock,
    collection: collectionMock,
    arrayUnion: arrayUnionMock,
    serverTimestamp: serverTimestampMock,
    runTransaction: runTransactionMock,
    onSnapshot: vi.fn(() => () => {}),
    query: vi.fn((...args: any[]) => args),
    orderBy: vi.fn(),
    getDoc: vi.fn(),
  };
});

const CASAL_TESTE = {
  id: "casal-teste-1",
  nameA: "Ana",
  nameB: "Bruno",
  currency: "BRL" as const,
  categories: [] as string[],
};
const PROFILE_ANA = { uid: "uid-ana", displayName: "Ana", coupleId: CASAL_TESTE.id };
const PROFILE_BRUNO = { uid: "uid-bruno", displayName: "Bruno", coupleId: CASAL_TESTE.id };

function expense(partial: Partial<any> = {}): any {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Despesa",
    amount: 10000,
    category: "Outros",
    paidBy: "A",
    split: { a: 1, b: 1 },
    date: Timestamp.fromDate(new Date(2026, 10, 10, 12)), // 10/nov/2026 ao meio-dia local
    deleted: false,
    ...partial,
  };
}

let useStore: typeof import("@/store").useStore;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  ({ useStore } = await import("@/store"));
  txSettlementsLookup.current = () => useStore.getState().settlements;
  useStore.setState({
    couple: CASAL_TESTE as any,
    expenses: [expense()],
    incomes: [],
    settlements: [],
    profile: PROFILE_ANA as any,
  });
});

describe("previewSettlement", () => {
  it("calcula sem gravar nada no Firestore", () => {
    const calc = useStore.getState().previewSettlement("2026-11-01", "2026-11-30");
    expect(calc.debtor).toBe("B"); // split 1:1 pago por A -> B deve 50%
    expect(calc.amount).toBe(5000);
    expect(addDocMock).not.toHaveBeenCalled();
  });
});

describe("proposeSettlement", () => {
  it("Ana propõe: cria doc 'pending' com snapshot congelado e responses[0]='propose'", async () => {
    const id = await useStore.getState().proposeSettlement({
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    });

    expect(id).toBe("doc_0");
    expect(addDocMock).toHaveBeenCalledTimes(1);
    const payload = addDocMock.mock.calls[0][1];
    expect(payload.status).toBe("pending");
    expect(payload.proposedBy).toBe("uid-ana");
    expect(payload.debtor).toBe("B");
    expect(payload.amount).toBe(5000);
    expect(payload.snapshot).toHaveLength(1);
    expect(payload.responses).toEqual([
      expect.objectContaining({ by: "uid-ana", action: "propose" }),
    ]);
  });

  it("rejeita propor quando não há diferença a acertar no período", async () => {
    useStore.setState({ expenses: [] }); // sem despesas -> saldo 0
    await expect(
      useStore.getState().proposeSettlement({ periodStart: "2026-11-01", periodEnd: "2026-11-30" })
    ).rejects.toThrow(/não há diferença/i);
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it("rejeita segunda proposta ativa para o mesmo período exato", async () => {
    useStore.setState({
      settlements: [
        {
          id: "s1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          status: "pending",
          proposedBy: "uid-ana",
          debtor: "B",
          amount: 5000,
          snapshot: [],
          responses: [],
        } as any,
      ],
    });

    await expect(
      useStore.getState().proposeSettlement({ periodStart: "2026-11-01", periodEnd: "2026-11-30" })
    ).rejects.toThrow(/já existe uma proposta/i);
  });
});

describe("respondSettlement — agree", () => {
  const PENDING = {
    id: "s1",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    status: "pending" as const,
    proposedBy: "uid-ana",
    debtor: "B" as const,
    amount: 5000,
    snapshot: [],
    responses: [{ by: "uid-ana", action: "propose", at: {} }],
  };

  it("Bruno concorda: gera a despesa de Acerto e fecha a proposta ATOMICAMENTE (runTransaction)", async () => {
    useStore.setState({ settlements: [PENDING as any], profile: PROFILE_BRUNO as any });

    await useStore.getState().respondSettlement("s1", "agree");

    // tudo aconteceu dentro de uma única runTransaction (não dois writes soltos)
    expect(runTransactionMock).toHaveBeenCalledTimes(1);

    // gerou a despesa de Acerto (via tx.set, roteado pro mesmo tracker de addDoc)
    expect(addDocMock).toHaveBeenCalledTimes(1);
    const expenseRefArg = addDocMock.mock.calls[0][0];
    const expensePayload = addDocMock.mock.calls[0][1];
    expect(expensePayload.category).toBe("Acerto");
    expect(expensePayload.amount).toBe(5000);
    expect(expensePayload.paidBy).toBe("B"); // devedor "paga" o acerto
    expect(expensePayload.split).toEqual({ a: 0, b: 1 });
    expect(expensePayload.createdBy).toBe("uid-bruno");

    // fechou a proposta e linkou o id (gerado via uuid() antes da transação,
    // não depende do retorno de addDoc) da despesa gerada ao mesmo doc
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const settlementPayload = updateDocMock.mock.calls[0][1];
    expect(settlementPayload.status).toBe("closed");
    const expenseIdFromRef = String(expenseRefArg.__path).split("/").pop();
    expect(settlementPayload.resultExpenseId).toBe(expenseIdFromRef);
  });

  it("rejeita (dentro da transação) se a proposta já foi fechada por outra resposta concorrente", async () => {
    useStore.setState({
      settlements: [{ ...PENDING, status: "closed" } as any],
      profile: PROFILE_BRUNO as any,
    });

    // já é rejeitado antes mesmo de entrar na transação (checagem local com
    // o estado já sincronizado via listener) — mas o teste abaixo cobre o
    // caso de condição de corrida genuína, em que o estado LOCAL ainda diz
    // "pending" mas o servidor (lido dentro da tx) já diz "closed"
    await expect(useStore.getState().respondSettlement("s1", "agree")).rejects.toThrow(
      /já foi encerrada/i
    );
  });

  it("condição de corrida: tx.get() revela que a proposta já foi fechada no servidor entre o check local e a transação", async () => {
    useStore.setState({ settlements: [PENDING as any], profile: PROFILE_BRUNO as any });
    // simula: o servidor já tem "closed" no momento em que a transação lê,
    // mesmo que o estado local (useStore) ainda ache "pending"
    txSettlementsLookup.current = () => [{ ...PENDING, status: "closed" }];

    await expect(useStore.getState().respondSettlement("s1", "agree")).rejects.toThrow(
      /já foi encerrada/i
    );
    expect(addDocMock).not.toHaveBeenCalled();
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("quem propôs NÃO pode responder à própria proposta", async () => {
    useStore.setState({ settlements: [PENDING as any], profile: PROFILE_ANA as any });

    await expect(useStore.getState().respondSettlement("s1", "agree")).rejects.toThrow(
      /não pode responder/i
    );
    expect(addDocMock).not.toHaveBeenCalled();
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("não permite responder a uma proposta já fechada", async () => {
    useStore.setState({
      settlements: [{ ...PENDING, status: "closed" } as any],
      profile: PROFILE_BRUNO as any,
    });

    await expect(useStore.getState().respondSettlement("s1", "agree")).rejects.toThrow(
      /já foi encerrada/i
    );
  });
});

describe("respondSettlement — contest", () => {
  it("Bruno contesta: status vira 'contested', nota registrada, nenhuma despesa gerada", async () => {
    useStore.setState({
      settlements: [
        {
          id: "s1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          status: "pending",
          proposedBy: "uid-ana",
          debtor: "B",
          amount: 5000,
          snapshot: [],
          responses: [],
        } as any,
      ],
      profile: PROFILE_BRUNO as any,
    });

    await useStore.getState().respondSettlement("s1", "contest", "Essa conta de internet não é minha.");

    expect(addDocMock).not.toHaveBeenCalled(); // não gera despesa de Acerto ao contestar
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].status).toBe("contested");
  });
});

describe("cancelSettlement", () => {
  const PENDING = {
    id: "s1",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    status: "pending" as const,
    proposedBy: "uid-ana",
    debtor: "B" as const,
    amount: 5000,
    snapshot: [],
    responses: [],
  };

  it("quem propôs pode cancelar a própria proposta", async () => {
    useStore.setState({ settlements: [PENDING as any], profile: PROFILE_ANA as any });
    await useStore.getState().cancelSettlement("s1");
    expect(updateDocMock.mock.calls[0][1].status).toBe("cancelled");
  });

  it("o outro membro NÃO pode cancelar a proposta de quem propôs", async () => {
    useStore.setState({ settlements: [PENDING as any], profile: PROFILE_BRUNO as any });
    await expect(useStore.getState().cancelSettlement("s1")).rejects.toThrow(/só quem propôs/i);
  });

  it("não permite cancelar uma proposta já fechada", async () => {
    useStore.setState({
      settlements: [{ ...PENDING, status: "closed" } as any],
      profile: PROFILE_ANA as any,
    });
    await expect(useStore.getState().cancelSettlement("s1")).rejects.toThrow(/já foi fechada/i);
  });
});

describe("Trava: despesa num período com acerto ativo não pode ser editada/excluída", () => {
  it("bloqueia updateExpense quando a despesa cai num período 'pending'", async () => {
    const e = expense({ id: "exp-1" }); // 10/nov/2026
    useStore.setState({
      expenses: [e],
      settlements: [
        {
          id: "s1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          status: "pending",
          proposedBy: "uid-ana",
          debtor: "B",
          amount: 5000,
          snapshot: [],
          responses: [],
        } as any,
      ],
    });

    await expect(
      useStore.getState().updateExpense("exp-1", { amount: 999 } as any)
    ).rejects.toThrow(/negociação ou já foi fechado/i);
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("bloqueia deleteExpense quando a despesa cai num período 'closed'", async () => {
    const e = expense({ id: "exp-1" });
    useStore.setState({
      expenses: [e],
      settlements: [
        {
          id: "s1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          status: "closed",
          proposedBy: "uid-ana",
          debtor: "B",
          amount: 5000,
          snapshot: [],
          responses: [],
        } as any,
      ],
    });

    await expect(useStore.getState().deleteExpense("exp-1")).rejects.toThrow(
      /negociação ou já foi fechado/i
    );
  });

  it("NÃO bloqueia quando o acerto do período foi cancelado", async () => {
    const e = expense({ id: "exp-1" });
    useStore.setState({
      expenses: [e],
      settlements: [
        {
          id: "s1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          status: "cancelled",
          proposedBy: "uid-ana",
          debtor: "B",
          amount: 5000,
          snapshot: [],
          responses: [],
        } as any,
      ],
    });

    await useStore.getState().updateExpense("exp-1", { amount: 999 } as any);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });

  it("NÃO bloqueia despesa de outro período (fora do range do acerto)", async () => {
    const e = expense({ id: "exp-1", date: Timestamp.fromDate(new Date(2026, 9, 15, 12)) }); // 15/out/2026
    useStore.setState({
      expenses: [e],
      settlements: [
        {
          id: "s1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          status: "pending",
          proposedBy: "uid-ana",
          debtor: "B",
          amount: 5000,
          snapshot: [],
          responses: [],
        } as any,
      ],
    });

    await useStore.getState().updateExpense("exp-1", { amount: 999 } as any);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });

  it("bloqueia addExpense (despesa NOVA) dentro de um período já em negociação/fechado", async () => {
    useStore.setState({
      settlements: [
        {
          id: "s1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          status: "pending",
          proposedBy: "uid-ana",
          debtor: "B",
          amount: 5000,
          snapshot: [],
          responses: [],
        } as any,
      ],
    });

    await expect(
      useStore.getState().addExpense({
        title: "Gasto novo",
        amount: 2000,
        paidBy: "A",
        date: new Date(2026, 10, 15), // 15/nov/2026, dentro do período travado
        category: "Outros",
        split: { a: 1, b: 1 },
      } as any)
    ).rejects.toThrow(/em negociação ou já foi fechado/i);
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it("NÃO bloqueia addExpense fora do período travado", async () => {
    useStore.setState({
      settlements: [
        {
          id: "s1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          status: "pending",
          proposedBy: "uid-ana",
          debtor: "B",
          amount: 5000,
          snapshot: [],
          responses: [],
        } as any,
      ],
    });

    await useStore.getState().addExpense({
      title: "Gasto de dezembro",
      amount: 2000,
      paidBy: "A",
      date: new Date(2026, 11, 5), // fora do período travado
      category: "Outros",
      split: { a: 1, b: 1 },
    } as any);

    expect(addDocMock).toHaveBeenCalledTimes(1);
  });
});

describe("Despesa de Acerto usa horário local seguro (meio-dia), não o instante exato do clique", () => {
  const PENDING = {
    id: "s1",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    status: "pending" as const,
    proposedBy: "uid-ana",
    debtor: "B" as const,
    amount: 5000,
    snapshot: [],
    responses: [],
  };

  it("concordar às 23h30 local não faz a despesa 'vazar' pro dia/mês seguinte", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 30, 23, 30)); // 30/nov/2026 23:30 local

    try {
      useStore.setState({ settlements: [PENDING as any], profile: PROFILE_BRUNO as any });
      await useStore.getState().respondSettlement("s1", "agree");

      const expensePayload = addDocMock.mock.calls[0][1];
      expect(expensePayload.ym).toBe("2026-11"); // não "2026-12"
    } finally {
      vi.useRealTimers();
    }
  });
});
