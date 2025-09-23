export const getCurrentYM = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  export const monthLabelPT = (ym: string) =>
    new Date(`${ym}-01T00:00:00`).toLocaleDateString('pt-BR', {month:'long', year:'numeric'});

  export function toYMD(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  
  export function toYM(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  
  export function addMonthsYM(ym: string, delta: number): string {
    const [Y, M] = ym.split("-").map(Number);
    const base = new Date(Y, (M - 1) + delta, 1);
    return toYM(base);
  }
  
  export function endOfYearMonthsFrom(ymStart: string): string[] {
    const [Y, M] = ymStart.split("-").map(Number);
    const arr: string[] = [];
    for (let i = 0; i <= (12 - M); i++) {
      arr.push(addMonthsYM(ymStart, i));
    }
    return arr;
  }
  
  export function monthsForward(ymStart: string, count: number): string[] {
    // inclui o mês inicial; count = total de meses
    return Array.from({ length: count }, (_, i) => addMonthsYM(ymStart, i));
  }
  