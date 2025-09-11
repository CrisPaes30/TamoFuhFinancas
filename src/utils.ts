export const toCents = (s: string) => {
  if (!s) return 0;
  const normalized = s.replace(".", "").replace(",", ".");
  const v = Number.parseFloat(normalized);
  return Math.round((Number.isFinite(v) ? v : 0) * 100);
};
export const fromCents = (v: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    v / 100
  );

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
