// src/store/__tests__/addExpense.test.ts
//
// Testa a lógica REAL de src/store/index.tsx (addExpense/updateExpense/deleteExpense)
// contra um Firestore MOCK (sem tocar dados reais). Usa um "casal teste" fixture.

import { describe, it, expect, vi, beforeEach } from "vitest";

const addDocMock = vi.fn(async (_col: any, data: any) => ({
  id: `doc_${addDocMock.mock.calls.length}`,
}));
const updateDocMock = vi.fn(async (_ref: any, _data: any) => {});
const deleteDocMock = vi.fn(async (_ref: any) => {});
const docMock = vi.fn((...args: any[]) => ({ __path: args.filter((a) => typeof a === "string").join("/") }));
const collectionMock = vi.fn((...args: any[]) => ({ __path: args.filter((a) => typeof a === "string").join("/") }));
const arrayUnionMock = vi.fn((...values: any[]) => ({ __op: "arrayUnion", values }));
const serverTimestampMock = vi.fn(() => ({ __op: "serverTimestamp" }));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual, // mantém a classe real Timestamp (fromDate/toDate são lógica pura)
    addDoc: addDocMock,
    updateDoc: updateDocMock,
    deleteDoc: deleteDocMock,
    doc: docMock,
    collection: collectionMock,
    arrayUnion: arrayUnionMock,
    serverTimestamp: serverTimestampMock,
    onSnapshot: vi.fn(() => () => {}),
    query: vi.fn((...args: any[]) => args),
    orderBy: vi.fn(),
    getDoc: vi.fn(),
  };
});

// casal teste (fixture mock)
const CASAL_TESTE = {
  id: "casal-teste-1",
  nameA: "Ana",
  nameB: "Bruno",
  currency: "BRL" as const,
  categories: [] as string[],
};

// "Ana" é quem está logada por padrão nos testes (sessão ativa real).
const PROFILE_ANA = { uid: "uid-ana", displayName: "Ana", coupleId: CASAL_TESTE.id };
const PROFILE_BRUNO = { uid: "uid-bruno", displayName: "Bruno", coupleId: CASAL_TESTE.id };

let useStore: typeof import("@/store").useStore;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  ({ useStore } = await import("@/store"));
  useStore.setState({
    couple: CASAL_TESTE as any,
    expenses: [],
    incomes: [],
    profile: PROFILE_ANA as any,
  });
});

describe("Cenário #1 — Despesa simples 50/50", () => {
  it("grava amount em centavos e split 1:1", async () => {
    await useStore.getState().addExpense({
      title: "Mercado",
      amount: 12000,
      paidBy: "A",
      date: new Date(2026, 5, 15), // 15/jun/2026
      category: "Mercado",
      split: { a: 1, b: 1 },
    } as any);

    expect(addDocMock).toHaveBeenCalledTimes(1);
    const payload = addDocMock.mock.calls[0][1];
    expect(payload.title).toBe("Mercado");
    expect(payload.amount).toBe(12000);
    expect(payload.split).toEqual({ a: 1, b: 1 });
    expect(payload.ym).toBe("2026-06");
    expect(payload.groupId).toBeUndefined();
  });
});

describe("Cenário #2 — Pago 100% por uma pessoa", () => {
  it("split 1:0 é preservado", async () => {
    await useStore.getState().addExpense({
      title: "Internet",
      amount: 9990,
      paidBy: "A",
      date: new Date(2026, 5, 10),
      category: "Moradia",
      split: { a: 1, b: 0 },
    } as any);

    const payload = addDocMock.mock.calls[0][1];
    expect(payload.split).toEqual({ a: 1, b: 0 });
  });
});

describe("Cenário #3 — Despesa pessoal (split 0:0)", () => {
  it("salva normalmente com split zerado (não altera saldo do casal na UI)", async () => {
    await useStore.getState().addExpense({
      title: "Presente pessoal",
      amount: 5000,
      paidBy: "B",
      date: new Date(2026, 5, 20),
      category: "Outros",
      split: { a: 0, b: 0 },
    } as any);

    const payload = addDocMock.mock.calls[0][1];
    expect(payload.split).toEqual({ a: 0, b: 0 });
  });
});

describe("Cenário #5 — Despesa fixa criada em junho (replica até dezembro)", () => {
  it("gera 7 ocorrências (jun..dez), mesmo groupId, só a 1ª com generated=false", async () => {
    await useStore.getState().addExpense({
      title: "Água",
      amount: 8000,
      paidBy: "A",
      date: new Date(2026, 5, 5), // jun/2026
      category: "Moradia",
      split: { a: 1, b: 1 },
      isFixed: true,
      fixedKind: "Agua",
    } as any);

    expect(addDocMock).toHaveBeenCalledTimes(7);
    const docs = addDocMock.mock.calls.map((c) => c[1]);
    const yms = docs.map((d) => d.ym);
    expect(yms).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    ]);

    const groupIds = new Set(docs.map((d) => d.groupId));
    expect(groupIds.size).toBe(1);
    expect(docs[0].groupId).toBeDefined();

    expect(docs[0].generated).toBe(false);
    expect(docs.slice(1).every((d) => d.generated === true)).toBe(true);
    expect(docs.every((d) => d.ruleKind === "fixed")).toBe(true);
    expect(docs.every((d) => d.isFixed === true && d.isCard === false)).toBe(true);
  });
});

describe("Cenário #6 — Despesa fixa criada em dezembro (borda de virada de ano)", () => {
  it("gera só 1 ocorrência (não deve vazar para o ano seguinte)", async () => {
    await useStore.getState().addExpense({
      title: "Aluguel",
      amount: 150000,
      paidBy: "A",
      date: new Date(2026, 11, 3), // dez/2026
      category: "Moradia",
      split: { a: 1, b: 1 },
      isFixed: true,
      fixedKind: "Aluguel",
    } as any);

    expect(addDocMock).toHaveBeenCalledTimes(1);
    expect(addDocMock.mock.calls[0][1].ym).toBe("2026-12");
  });
});

describe("Cenário #7 — Compra parcelada no cartão (5x, divisão exata)", () => {
  it("gera 5 docs consecutivos cuja soma bate com o total", async () => {
    await useStore.getState().addExpense({
      title: "Geladeira",
      amount: 50000,
      paidBy: "A",
      date: new Date(2026, 5, 1),
      category: "Moradia",
      split: { a: 1, b: 1 },
      isCard: true,
      installments: 5,
    } as any);

    expect(addDocMock).toHaveBeenCalledTimes(5);
    const docs = addDocMock.mock.calls.map((c) => c[1]);
    const soma = docs.reduce((acc, d) => acc + d.amount, 0);
    expect(soma).toBe(50000);
    expect(docs.every((d) => d.amount === 10000)).toBe(true);
    expect(docs.map((d) => d.installmentNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(docs.map((d) => d.ym)).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });
});

describe("Cenário #8 — Parcelado com resto (divisão não exata)", () => {
  it("R$100,00 em 3x: 1 parcela de 3334 + 2 de 3333 (soma = 10000)", async () => {
    await useStore.getState().addExpense({
      title: "Presente",
      amount: 10000,
      paidBy: "A",
      date: new Date(2026, 5, 1),
      category: "Outros",
      split: { a: 1, b: 1 },
      isCard: true,
      installments: 3,
    } as any);

    const docs = addDocMock.mock.calls.map((c) => c[1]);
    const amounts = docs.map((d) => d.amount);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(amounts).toEqual([3334, 3333, 3333]); // 1ª parcela absorve o resto
  });
});

describe("Cenário #10 — Cartão com 1 parcela não deve virar série", () => {
  it("salva como despesa única (sem groupId/ruleKind)", async () => {
    await useStore.getState().addExpense({
      title: "Compra única no cartão",
      amount: 4000,
      paidBy: "A",
      date: new Date(2026, 5, 1),
      category: "Outros",
      split: { a: 1, b: 1 },
      isCard: true,
      installments: 1,
    } as any);

    expect(addDocMock).toHaveBeenCalledTimes(1);
    const payload = addDocMock.mock.calls[0][1];
    expect(payload.groupId).toBeUndefined();
    expect(payload.installments).toBe(1);
  });
});

describe("Cenário #16 — Editar uma ocorrência de série", () => {
  it("updateExpense altera só o doc daquele id (não toca os irmãos da série)", async () => {
    await useStore.getState().updateExpense("doc_jul_2026", { amount: 9000 } as any);

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [ref, payload] = updateDocMock.mock.calls[0];
    expect(ref.__path).toContain("doc_jul_2026");
    expect(payload.amount).toBe(9000);
    // nenhum outro doc foi tocado
    expect(addDocMock).not.toHaveBeenCalled();
    expect(deleteDocMock).not.toHaveBeenCalled();
  });
});

describe("Cenário #17 — Exclusão", () => {
  it("soft delete: marca deleted=true em vez de apagar o doc", async () => {
    await useStore.getState().deleteExpense("doc_x");
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].deleted).toBe(true);
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it("hard delete: remove o doc de fato quando opts.hard=true", async () => {
    await useStore.getState().deleteExpense("doc_y", { hard: true });
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock).not.toHaveBeenCalled();
  });
});

describe("Cenário — createdBy é carimbado em quem criou (autoria)", () => {
  it("despesa simples grava createdBy com o uid de quem está logado", async () => {
    await useStore.getState().addExpense({
      title: "Bolacha",
      amount: 1200,
      paidBy: "A",
      date: new Date(2026, 5, 10),
      category: "Mercado",
      split: { a: 1, b: 1 },
    } as any);

    expect(addDocMock.mock.calls[0][1].createdBy).toBe("uid-ana");
  });

  it("série fixa e série parcelada carimbam createdBy em TODAS as ocorrências", async () => {
    await useStore.getState().addExpense({
      title: "Água",
      amount: 8000,
      paidBy: "A",
      date: new Date(2026, 5, 5),
      category: "Moradia",
      split: { a: 1, b: 1 },
      isFixed: true,
      fixedKind: "Agua",
    } as any);

    const docs = addDocMock.mock.calls.map((c) => c[1]);
    expect(docs.every((d) => d.createdBy === "uid-ana")).toBe(true);
  });

  it("muda quem está logado (Bruno) → a próxima despesa criada é carimbada com o uid do Bruno", async () => {
    useStore.setState({ profile: PROFILE_BRUNO as any });

    await useStore.getState().addExpense({
      title: "Cinema",
      amount: 5000,
      paidBy: "B",
      date: new Date(2026, 5, 12),
      category: "Lazer",
      split: { a: 1, b: 1 },
    } as any);

    expect(addDocMock.mock.calls[0][1].createdBy).toBe("uid-bruno");
  });
});

describe("Cenário — só o autor pode editar/excluir (assertIsAuthor)", () => {
  it("Bruno NÃO pode editar uma despesa que a Ana criou", async () => {
    useStore.setState({
      expenses: [{ id: "doc_1", createdBy: "uid-ana" } as any],
      profile: PROFILE_BRUNO as any,
    });

    await expect(
      useStore.getState().updateExpense("doc_1", { amount: 999 } as any)
    ).rejects.toThrow(/apenas quem criou/i);
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("Bruno NÃO pode excluir uma despesa que a Ana criou", async () => {
    useStore.setState({
      expenses: [{ id: "doc_1", createdBy: "uid-ana" } as any],
      profile: PROFILE_BRUNO as any,
    });

    await expect(useStore.getState().deleteExpense("doc_1")).rejects.toThrow(
      /apenas quem criou/i
    );
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it("Ana PODE editar/excluir a própria despesa", async () => {
    useStore.setState({
      expenses: [{ id: "doc_1", createdBy: "uid-ana" } as any],
      profile: PROFILE_ANA as any,
    });

    await useStore.getState().updateExpense("doc_1", { amount: 999 } as any);
    expect(updateDocMock).toHaveBeenCalledTimes(1);

    await useStore.getState().deleteExpense("doc_1");
    expect(updateDocMock).toHaveBeenCalledTimes(2); // soft delete também é updateDoc
  });

  it("dado legado sem createdBy não bloqueia ninguém (fail-open)", async () => {
    useStore.setState({
      expenses: [{ id: "doc_legado" } as any], // sem createdBy
      profile: PROFILE_BRUNO as any,
    });

    await useStore.getState().updateExpense("doc_legado", { amount: 10 } as any);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });
});
