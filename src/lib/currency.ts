export const toCents = (s: string) => {
    if (!s) return 0;
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const v = Number.parseFloat(normalized);
    return Math.round((Number.isFinite(v) ? v : 0) * 100);
  };
  export const fromCents = (v: number, currency = 'BRL') =>
    new Intl.NumberFormat('pt-BR', { style:'currency', currency }).format(v/100);
  