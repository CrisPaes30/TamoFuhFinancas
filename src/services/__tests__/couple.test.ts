// src/services/__tests__/couple.test.ts
//
// Testa joinCoupleWithCode (src/services/couple.ts) contra Firestore MOCK.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getDocFromServerMock, updateDocMock, setDocMock, docMock } = vi.hoisted(() => ({
  getDocFromServerMock: vi.fn(),
  updateDocMock: vi.fn(async () => {}),
  setDocMock: vi.fn(async () => {}),
  docMock: vi.fn((..._args: any[]) => ({})),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { displayName: "Ana" } }),
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: docMock,
    getDoc: vi.fn(),
    getDocFromServer: getDocFromServerMock,
    getDocs: vi.fn(),
    setDoc: setDocMock,
    updateDoc: updateDocMock,
    collection: vi.fn(() => ({})),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    arrayUnion: vi.fn((v: any) => ({ __op: "arrayUnion", v })),
    serverTimestamp: vi.fn(() => ({ __op: "serverTimestamp" })),
  };
});

import { joinCoupleWithCode } from "@/services/couple";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("joinCoupleWithCode — validações", () => {
  it("rejeita código curto (<5 caracteres) sem tocar o Firestore", async () => {
    await expect(joinCoupleWithCode("uid-1", "AB")).rejects.toThrow("Código inválido.");
    expect(getDocFromServerMock).not.toHaveBeenCalled();
  });

  it("rejeita quando o convite não existe", async () => {
    getDocFromServerMock.mockResolvedValueOnce({ exists: () => false });
    await expect(joinCoupleWithCode("uid-1", "ABCDE")).rejects.toThrow("Convite inválido.");
  });

  it("rejeita convite desativado", async () => {
    getDocFromServerMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ active: false, coupleId: "casal-1" }),
    });
    await expect(joinCoupleWithCode("uid-1", "ABCDE")).rejects.toThrow("Convite desativado.");
  });

  it("rejeita convite expirado", async () => {
    getDocFromServerMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ active: true, coupleId: "casal-1", expiresAtMs: Date.now() - 1000 }),
    });
    await expect(joinCoupleWithCode("uid-1", "ABCDE")).rejects.toThrow("Convite expirado.");
  });

  it("rejeita convite com cota esgotada (maxJoins atingido)", async () => {
    getDocFromServerMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ active: true, coupleId: "casal-1", maxJoins: 2, joins: 2 }),
    });
    await expect(joinCoupleWithCode("uid-1", "ABCDE")).rejects.toThrow("Convite esgotado.");
  });

  it("caminho feliz: adiciona o uid ao casal e grava coupleId no usuário", async () => {
    getDocFromServerMock
      .mockResolvedValueOnce({
        // invites/{code}
        exists: () => true,
        data: () => ({ active: true, coupleId: "casal-1", joins: 0 }),
      })
      .mockResolvedValueOnce({
        // couples/{coupleId} após o self-join
        exists: () => true,
        data: () => ({ nameA: "", nameB: "Bruno" }),
      });

    const coupleId = await joinCoupleWithCode("uid-1", "abcde");
    expect(coupleId).toBe("casal-1");

    // self-join: members.{uid} = true
    expect(updateDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ "members.uid-1": true })
    );

    // nameA vazio é preenchido com o displayName do usuário que entrou
    const patchCall = updateDocMock.mock.calls.find((c) => "nameA" in (c[1] as any));
    expect(patchCall?.[1]).toMatchObject({ nameA: "Ana" });

    // vincula users/{uid}.coupleId
    expect(setDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ coupleId: "casal-1", role: "member" }),
      expect.objectContaining({ merge: true })
    );
  });
});
