// src/insights.ts
import { toMonth, toMillis, toYMD } from "@/lib/dateFmt";
export type Expense = {
    id: string;
    title: string;
    amount: number;      // cents
    date: string;        // YYYY-MM-DD
    category: string;
    paidBy: "A" | "B";
    split: { a: number; b: number };
    isFixed?: boolean;
    isCard?: boolean;
    installments?: number;
    deleted?: boolean;
    createdAt?: number;
  };
  
  export type Income = {
    id: string;
    person: "A" | "B";
    source: string;
    amount: number;      // cents
    month: string;       // YYYY-MM
  };
  
  type MonthSlice = {
    ym: string;              // YYYY-MM
    expenses: Expense[];
    incomes: Income[];
  };
  
  function toYM(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function sum(arr: number[]) { return arr.reduce((a,b)=>a+b,0); }
  
  export function sliceByMonth(expenses: Expense[], incomes: Income[], ym: string): MonthSlice {
    return {
      ym,
      expenses: expenses.filter(e => !e.deleted && (toMonth(e.date)||"").startsWith(ym)),
      incomes: incomes.filter(i => i.month === ym),
    };
  }
  
  export function lastMonthsYM(n: number, from = new Date()): string[] {
    const out: string[] = [];
    const d = new Date(from);
    for (let i = 0; i < n; i++) {
      out.push(toYM(new Date(d.getFullYear(), d.getMonth() - i, 1)));
    }
    return out;
  }
  
  /** Calcula métricas do mês e gera dicas */
  export function analyzeMonth(
    month: MonthSlice,
    coupleNames: { A: string; B: string },
    currency: string,
    history: MonthSlice[] // meses anteriores para comparação
  ) {
    const { expenses, incomes } = month;
    const totalOut = sum(expenses.map(e => e.amount));
    const totalIn  = sum(incomes.map(i => i.amount));
    const saved    = totalIn - totalOut;
  
    // por categoria
    const perCat = new Map<string, number>();
    for (const e of expenses) perCat.set(e.category, (perCat.get(e.category)||0) + e.amount);
    const topCat = [...perCat.entries()].sort((a,b)=>b[1]-a[1])[0];
  
    // maior item
    const topItem = [...expenses].sort((a,b)=>b.amount-a.amount)[0];
  
    // fixas vs variáveis
    const fixed = sum(expenses.filter(e=>e.isFixed).map(e=>e.amount));
    const variable = totalOut - fixed;
  
    // cartão / parcelas
    const cardTot = sum(expenses.filter(e=>e.isCard).map(e=>e.amount));
  
    // quem pagou
    const paidA = sum(expenses.filter(e=>e.paidBy==="A").map(e=>e.amount));
    const paidB = totalOut - paidA;
  
    // pessoais (0:0)
    const personal = sum(expenses.filter(e => (e.split?.a || 0) + (e.split?.b || 0) === 0).map(e => e.amount));
  
    // média 3 meses anteriores
    const prev = history.filter(h => h.ym !== month.ym);
    const prev3 = prev.slice(0,3);
    const avg3 = prev3.length ? sum(prev3.map(h => sum(h.expenses.map(e=>e.amount)))) / prev3.length : 0;
    const drift = avg3 ? (totalOut - avg3) / avg3 : 0; // +20% por ex.
  
    // dicas
    const tips: string[] = [];
  
    if (totalIn > 0) {
      if (saved < 0) tips.push(`🚨 Despesas superaram a renda do mês em ${fmt(Math.abs(saved), currency)}. Avalie cortar categorias não essenciais.`);
      else tips.push(`✅ Sobra de ${fmt(saved, currency)} neste mês. Considere reservar parte para uma meta de vocês.`);
    } else {
      tips.push(`ℹ️ Sem renda lançada neste mês. Adicione em “Rendas / salário” para análises mais precisas.`);
    }
  
    if (avg3 > 0 && Math.abs(drift) >= 0.15) {
      tips.push(drift > 0
        ? `⬆️ Gastos ${Math.round(drift*100)}% acima da média dos últimos 3 meses.`
        : `⬇️ Gastos ${Math.round(Math.abs(drift)*100)}% abaixo da média dos últimos 3 meses. Bom controle!`);
    }
  
    if (topCat && topCat[1] > totalOut * 0.3) {
      tips.push(`🎯 Categoria dominante: **${topCat[0]}** (${fmt(topCat[1], currency)} • ${Math.round(topCat[1]/totalOut*100)}%). Tente metas ou limites para ela.`);
    }
  
    if (topItem && topItem.amount > totalOut * 0.25) {
      tips.push(`🧾 Maior despesa: **${topItem.title}** (${fmt(topItem.amount, currency)}). Revejam se é pontual ou recorrente.`);
    }
  
    if (cardTot > 0 && cardTot/totalOut >= 0.5) {
      tips.push(`💳 Cartão concentra ${Math.round(cardTot/totalOut*100)}% dos gastos. Acompanhe parcelas para não estourar o próximo mês.`);
    }
  
    if (fixed > 0 && fixed/totalOut >= 0.6) {
      tips.push(`🏠 Fixas representam ${Math.round(fixed/totalOut*100)}% (${fmt(fixed, currency)}). Negociar contratos pode aliviar.`);
    }
  
    if (personal > 0) {
      tips.push(`👤 Encontramos ${fmt(personal, currency)} em despesas pessoais (0:0). Elas não entram no acerto entre o casal.`);
    }
  
    if (Math.abs(paidA - paidB) / (totalOut || 1) >= 0.3) {
      const who = paidA > paidB ? coupleNames.A : coupleNames.B;
      tips.push(`⚖️ ${who} pagou bem mais neste mês. Revejam a divisão e o acerto para equilibrar.`);
    }
  
    return {
      totals: { totalIn, totalOut, saved, fixed, variable, cardTot, paidA, paidB, personal },
      top: { topCat, topItem },
      tips
    };
  }
  
  function fmt(v: number, currency: string) {
    return new Intl.NumberFormat("pt-BR",{style:"currency",currency}).format(v/100);
  }
  