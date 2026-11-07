// src/lib/__tests__/currency.test.ts
import { describe, it, expect } from "vitest";
import { toCents, fromCents } from "@/lib/currency";

describe("toCents — Cenário #12 (valor com vírgula/milhar)", () => {
  it("converte '120,00' para 12000 centavos", () => {
    expect(toCents("120,00")).toBe(12000);
  });

  it("converte '1.234,56' (separador de milhar + vírgula) para 123456 centavos", () => {
    expect(toCents("1.234,56")).toBe(123456);
  });

  it("converte string vazia para 0", () => {
    expect(toCents("")).toBe(0);
  });

  it("converte texto não numérico para 0 (não lança exceção)", () => {
    expect(toCents("abc")).toBe(0);
  });

  it("arredonda centavos fracionários", () => {
    expect(toCents("10,005")).toBe(1001); // 10.005 * 100 = 1000.5 -> round
  });
});

describe("fromCents", () => {
  it("formata centavos como moeda BRL", () => {
    expect(fromCents(12000, "BRL")).toContain("120,00");
  });
});
