// src/lib/__tests__/utils.test.ts
import { describe, it, expect } from "vitest";
import { toCents, computeShares } from "@/utils";
import { toCents as toCentsLib } from "@/lib/currency";

describe("utils.toCents — mesma responsabilidade de lib/currency.toCents", () => {
  it("converte '120,00' corretamente", () => {
    expect(toCents("120,00")).toBe(12000);
  });

  // ⚠️ DIVERGÊNCIA ENCONTRADA ENTRE AS DUAS IMPLEMENTAÇÕES:
  // lib/currency.ts usa replace(/\./g, "") (remove TODOS os pontos).
  // utils.ts usa replace(".", "") (remove só o PRIMEIRO ponto).
  // Isso quebra valores de milhão com 2 separadores de milhar (ex.: salário
  // alto digitado como "1.234.567,89"), usado pelo IncomeForm via @/utils.
  it("BUG: '1.234.567,89' (dois separadores de milhar) diverge entre lib/currency e utils", () => {
    const viaLib = toCentsLib("1.234.567,89");
    const viaUtils = toCents("1.234.567,89");

    expect(viaLib).toBe(123456789); // implementação correta

    // Documenta o valor ERRADO hoje produzido por utils.toCents.
    // Se este teste começar a falhar, a divergência foi corrigida — ótimo!
    // Quando isso acontecer, troque o expect abaixo por
    // expect(viaUtils).toBe(123456789) e remova este comentário.
    expect(viaUtils).not.toBe(123456789);
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
