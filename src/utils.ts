// toCents/fromCents viviam duplicados aqui e em @/lib/currency, com uma
// divergência sutil (esta versão só removia o 1º separador de milhar,
// quebrando valores como "1.234.567,89"). Unificado: @/lib/currency é a
// implementação canônica; reexportamos para não quebrar quem importa daqui.
export { toCents, fromCents } from "@/lib/currency";

export const computeShares = (
  amount: number,
  a: number,
  b: number,
  paidBy?: "A" | "B"
) => {
  const total = (a || 0) + (b || 0);

  // 0:0 => despesa pessoal de quem pagou (não gera acerto)
  if (total <= 0) {
    if (paidBy === "B") return { Va: 0, Vb: amount }; // 100% B
    return { Va: amount, Vb: 0 }; // 100% A
  }

  const Va = Math.round(amount * (a / total));
  const Vb = amount - Va; // garante soma exata
  return { Va, Vb };
};
