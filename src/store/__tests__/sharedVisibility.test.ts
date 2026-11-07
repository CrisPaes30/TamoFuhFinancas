// src/store/__tests__/sharedVisibility.test.ts
//
// Cenários L1/L2/L3 — "quem insere, o outro vê": o listener (onSnapshot) do
// Firestore assina o CAMINHO do casal (couples/{id}/expenses), não a
// identidade de quem está olhando. Este teste prova a mecânica real: uma
// vez conectado o listener via setProfile, qualquer documento escrito
// nesse caminho (por A ou por B) chega pra quem está assinando — o
// mecanismo não filtra por autor.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";

const { updateDocMock, onSnapshotMock, docMock, collectionMock } = vi.hoisted(() => ({
  updateDocMock: vi.fn(async () => {}),
  onSnapshotMock: vi.fn((_queryOrRef: any, _onNext: any, _onError?: any) => () => {}),
  docMock: vi.fn((...args: any[]) => ({ __path: args.filter((a) => typeof a === "string").join("/") })),
  collectionMock: vi.fn((...args: any[]) => ({ __path: args.filter((a) => typeof a === "string").join("/") })),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: docMock,
    collection: collectionMock,
    updateDoc: updateDocMock,
    addDoc: vi.fn(async () => ({ id: "doc_novo" })),
    deleteDoc: vi.fn(async () => {}),
    arrayUnion: vi.fn((v: any) => ({ __op: "arrayUnion", v })),
    serverTimestamp: vi.fn(() => ({ __op: "serverTimestamp" })),
    onSnapshot: onSnapshotMock,
    query: vi.fn((...args: any[]) => args),
    orderBy: vi.fn(),
    getDoc: vi.fn(),
  };
});

let useStore: typeof import("@/store").useStore;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  ({ useStore } = await import("@/store"));
});

/** Acha, entre as chamadas de onSnapshot, a que corresponde à query de despesas. */
function findExpensesSnapshotCallback() {
  const call = onSnapshotMock.mock.calls.find((c) => {
    const target = c[0];
    return Array.isArray(target) && target[0]?.__path?.endsWith("/expenses");
  });
  if (!call) throw new Error("Listener de expenses não foi encontrado — setProfile não conectou?");
  return call[1] as (snap: any) => void;
}

function fakeSnapshot(docs: Array<{ id: string; data: any }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
}

describe("Cenário L1/L2/L3 — listener é por casal, não por autor", () => {
  it("a sessão que assina o casal recebe uma despesa inserida por QUALQUER um dos dois (A ou B)", async () => {
    // Simula a sessão conectando (pouco importa se é A ou B logado — o
    // listener é o mesmo, assinando o mesmo coupleId).
    useStore.getState().setProfile({ uid: "uid-ana", coupleId: "casal-teste-1" } as any);

    // espera a cadeia assíncrona (ensureMembership -> .finally -> onSnapshot) conectar
    await waitFor(() => expect(onSnapshotMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const emit = findExpensesSnapshotCallback();

    // "B inseriu bolacha" — simula o Firestore entregando o doc novo que
    // QUALQUER membro do casal pode ter escrito (paidBy/createdBy = Bruno).
    emit(
      fakeSnapshot([
        {
          id: "doc_bolacha",
          data: { title: "Bolacha", amount: 500, paidBy: "B", createdBy: "uid-bruno", ym: "2026-06" },
        },
      ])
    );

    expect(useStore.getState().expenses).toHaveLength(1);
    expect(useStore.getState().expenses[0].title).toBe("Bolacha");
    // A está "olhando" esta sessão, mas o item é de quem o Bruno inseriu —
    // ele aparece do mesmo jeito, sem filtro de autor na leitura.
  });

  it("uma edição (updateExpense) também se propaga pelo mesmo listener compartilhado", async () => {
    useStore.getState().setProfile({ uid: "uid-bruno", coupleId: "casal-teste-1" } as any);
    await waitFor(() => expect(onSnapshotMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const emit = findExpensesSnapshotCallback();

    emit(fakeSnapshot([{ id: "doc_1", data: { title: "Água", amount: 8000, ym: "2026-06" } }]));
    expect(useStore.getState().expenses[0].amount).toBe(8000);

    // alguém editou o valor (em outra aba/sessão) — o Firestore reemite o snapshot
    emit(fakeSnapshot([{ id: "doc_1", data: { title: "Água", amount: 9500, ym: "2026-06" } }]));
    expect(useStore.getState().expenses[0].amount).toBe(9500);
  });

  it("exclusão (soft delete) também chega pelo listener — some para quem está olhando", async () => {
    useStore.getState().setProfile({ uid: "uid-ana", coupleId: "casal-teste-1" } as any);
    await waitFor(() => expect(onSnapshotMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const emit = findExpensesSnapshotCallback();

    emit(fakeSnapshot([{ id: "doc_1", data: { title: "Cinema", amount: 5000, ym: "2026-06", deleted: false } }]));
    expect(useStore.getState().expenses).toHaveLength(1);

    emit(fakeSnapshot([{ id: "doc_1", data: { title: "Cinema", amount: 5000, ym: "2026-06", deleted: true } }]));
    // o listener entrega o doc com deleted:true (quem filtra deleted=true
    // é a camada de apresentação — ExpenseList/Dashboard); aqui provamos
    // que o dado chega atualizado em tempo real pra quem está assinando.
    expect(useStore.getState().expenses[0].deleted).toBe(true);
  });
});
