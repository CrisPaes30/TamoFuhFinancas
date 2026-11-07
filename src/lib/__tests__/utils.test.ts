// src/lib/__tests__/utils.test.ts
import { describe, it, expect } from "vitest";
import { toCents, computeShares } from "@/utils";
import { toCents as toCentsLib } from "@/lib/currency";

describe("utils.toCents — unificado com lib/currency.toCents", () => {
  // utils.ts tinha seu próprio toCents, divergente de lib/currency.toCents
  // para valores com 2+ separadores de milhar. Unificado: agora @/utils
  // reexporta a implementação de @/lib/currency, então devem ser a mesma
  // função e produzir resultados idênticos em qualquer entrada.
  it("é a mesma função (reexport), não uma cópia", () => {
    expect(toCents).toBe(toCentsLib);
  });

  it("converte '120,00' corretamente", () => {
    expect(toCents("120,00")).toBe(12000);
  });

  it("'1.234.567,89' (dois separadores de milhar) não diverge mais", () => {
    expect(toCents("1.234.567,89")).toBe(123456789);
    expect(toCents("1.234.567,89")).toBe(toCentsLib("1.234.567,89"));
  });
});

describe("computeShares", () => {
  it("50/50: divide o valor igualmente, ajustando o resto na pessoa B", () => {
    const { Va, Vb } = computeShares(10000, 1, 1);
    expect(Va + Vb).toBe(10000);
    expect(Va).toBe(5000);
    expect(Vb).toBe(5000);
  });

  it("divisão desigual (2:1) é proporcional e soma exata", () => {
    const { Va, Vb } = computeShares(10000, 2, 1);
    expect(Va + Vb).toBe(10000);
    expect(Va).toBe(6667); // round(10000 * 2/3)
    expect(Vb).toBe(3333);
  });

  it("split 0:0 com paidBy='A' vira 100% de A (despesa pessoal)", () => {
    const { Va, Vb } = computeShares(5000, 0, 0, "A");
    expect(Va).toBe(5000);
    expect(Vb).toBe(0);
  });

  it("split 0:0 com paidBy='B' vira 100% de B (despesa pessoal)", () => {
    const { Va, Vb } = computeShares(5000, 0, 0, "B");
    expect(Va).toBe(0);
    expect(Vb).toBe(5000);
  });

  it("split 100% A (1:0)", () => {
    const { Va, Vb } = computeShares(8000, 1, 0);
    expect(Va).toBe(8000);
    expect(Vb).toBe(0);
  });
});
