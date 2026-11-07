// src/lib/__tests__/dateFmt.test.ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { toMillis, toYMD, toMonth, monthOf } from "@/lib/dateFmt";

describe("toYMD / toMonth — aceitam Timestamp, Date e string", () => {
  it("Timestamp do Firestore", () => {
    const ts = Timestamp.fromDate(new Date(2026, 5, 15)); // 15/jun/2026
    expect(toYMD(ts)).toBe("2026-06-15");
    expect(toMonth(ts)).toBe("2026-06");
  });

  it("objeto Date", () => {
    const d = new Date(2026, 11, 3); // 3/dez/2026
    expect(toMonth(d)).toBe("2026-12");
  });

  it("string YYYY-MM-DD", () => {
    expect(toYMD("2026-01-20")).toBe("2026-01-20");
    expect(toMonth("2026-01-20")).toBe("2026-01");
  });

  it("valor vazio/indefinido retorna string vazia (não lança exceção)", () => {
    expect(toYMD(null)).toBe("");
    expect(toYMD(undefined)).toBe("");
    expect(toMonth("")).toBe("");
  });
});

describe("toMillis", () => {
  it("funciona para Timestamp, Date e string", () => {
    const d = new Date(2026, 5, 15, 12, 0, 0);
    expect(toMillis(d)).toBe(d.getTime());
    expect(toMillis(Timestamp.fromDate(d))).toBe(d.getTime());
    expect(toMillis(d.toISOString())).toBe(d.getTime());
  });

  it("valor inválido retorna 0", () => {
    expect(toMillis(null)).toBe(0);
    expect(toMillis(undefined)).toBe(0);
  });
});

describe("monthOf — prioridade: ym > date > month (legado)", () => {
  it("usa 'ym' quando presente, ignorando 'date'", () => {
    const obj = { ym: "2026-03", date: new Date(2026, 5, 1) };
    expect(monthOf(obj)).toBe("2026-03");
  });

  it("cai para 'date' quando 'ym' não existe", () => {
    const obj = { date: new Date(2026, 7, 10) };
    expect(monthOf(obj)).toBe("2026-08");
  });

  it("cai para 'month' (legado) quando não há 'ym' nem 'date'", () => {
    const obj = { month: "2026-02" };
    expect(monthOf(obj)).toBe("2026-02");
  });

  it("objeto totalmente vazio retorna string vazia", () => {
    expect(monthOf({})).toBe("");
  });
});
