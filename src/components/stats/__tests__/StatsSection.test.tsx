// src/components/stats/__tests__/StatsSection.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { storeState } = vi.hoisted(() => ({
  storeState: {
    expenses: [] as any,
    incomes: [] as any,
    couple: null as any,
  },
}));

vi.mock("@/store", () => ({
  useStore: (selector?: (s: any) => any) => {
    const state = { ...storeState };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

import StatsSection from "@/components/stats/StatsSection";
import { fromCents } from "@/lib/currency";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// getByText normaliza (colapsa) espaços — inclusive NBSP — do texto do DOM,
// mas não normaliza o padrão passado; por isso recriamos o mesmo espaço
// "normalizado" aqui e escapamos caracteres especiais de regex (ex.: "R$").
function money(cents: number, currency?: string) {
  return escapeRegExp(fromCents(cents, currency).replace(/\s+/g, " "));
}

const YM = "2026-06";

function expense(partial: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Despesa",
    amount: 1000,
    category: "Outros",
    paidBy: "A",
    split: { a: 1, b: 1 },
    ym: YM,
    ...partial,
  };
}

function income(partial: Partial<any> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    person: "A",
    source: "Salário",
    amount: 1000,
    ym: YM,
    ...partial,
  };
}

function rendaDespesasFills(container: HTMLElement) {
  const sections = container.querySelectorAll(".grid.gap-2");
  const renda = sections[0];
  return Array.from(renda.querySelectorAll(".overflow-hidden > div")).map(
    (el) => (el as HTMLElement).style.width
  );
}

function categoriaSection(container: HTMLElement) {
  return container.querySelectorAll(".grid.gap-2")[1];
}

function quemPagouFills(container: HTMLElement) {
  const sections = container.querySelectorAll(".grid.gap-2");
  const quemPagou = sections[2];
  return Array.from(quemPagou.querySelectorAll(".overflow-hidden > div")).map(
    (el) => (el as HTMLElement).style.width
  );
}

beforeEach(() => {
  storeState.expenses = [];
  storeState.incomes = [];
  storeState.couple = { id: "casal-1", nameA: "Ana", nameB: "Bruno", currency: "BRL" };
});

describe("Cenário 1 — estado vazio total", () => {
  it("mostra 'Sem gastos neste mês.', sobra verde R$0,00 e não quebra", () => {
    const { container } = render(<StatsSection ym={YM} />);

    expect(screen.getByText("Sem gastos neste mês.")).toBeInTheDocument();

    const sobra = screen.getByText(new RegExp(`Sobra: ${money(0)}`));
    expect(sobra.className).toContain("text-emerald-400");

    expect(rendaDespesasFills(container)).toEqual(["0%", "0%", "0%"]);
    // gap apontado pelo QA: "quem pagou" também precisa ficar 0%/0%
    // (ninguém pagou nada) em vez do antigo piso de 4%/4%.
    expect(quemPagouFills(container)).toEqual(["0%", "0%"]);
  });
});

describe("Cenário 1b — categoria com valor 0 (borda secundária do fix)", () => {
  it("categoria de valor 0 renderiza barra em 0% (não mais 4%)", () => {
    storeState.expenses = [expense({ category: "Zerada", amount: 0 })];

    const { container } = render(<StatsSection ym={YM} />);
    const section = categoriaSection(container);
    const fill = section.querySelector(".overflow-hidden > div") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });
});

describe("Cenário 2 — só renda, sem despesa", () => {
  it("sobra verde = totalIn, categorias 'Sem gastos'", () => {
    storeState.incomes = [income({ person: "A", amount: 5000 }), income({ person: "B", amount: 3000 })];

    render(<StatsSection ym={YM} />);

    const sobra = screen.getByText(new RegExp(`Sobra: ${money(8000)}`));
    expect(sobra.className).toContain("text-emerald-400");
    expect(screen.getByText("Sem gastos neste mês.")).toBeInTheDocument();
  });
});

describe("Cenário 3 — só despesa, sem renda", () => {
  it("faltam vermelho = totalOut", () => {
    storeState.expenses = [expense({ amount: 4000 })];

    render(<StatsSection ym={YM} />);

    const faltam = screen.getByText(new RegExp(`Faltam: ${money(4000)}`));
    expect(faltam.className).toContain("text-rose-400");
  });
});

describe("Cenário 4 — saved===0 exato", () => {
  it("cai no branch >=0, mostra Sobra verde (não Faltam)", () => {
    storeState.incomes = [income({ amount: 5000 })];
    storeState.expenses = [expense({ amount: 5000 })];

    render(<StatsSection ym={YM} />);

    const sobra = screen.getByText(new RegExp(`Sobra: ${money(0)}`));
    expect(sobra.className).toContain("text-emerald-400");
    expect(screen.queryByText(/Faltam:/)).not.toBeInTheDocument();
  });
});

describe("Cenário 5 — top 5 categorias com exatamente 5", () => {
  it("todas aparecem, ordenadas desc", () => {
    storeState.expenses = [
      expense({ category: "Cat3", amount: 3000 }),
      expense({ category: "Cat1", amount: 5000 }),
      expense({ category: "Cat5", amount: 1000 }),
      expense({ category: "Cat2", amount: 4000 }),
      expense({ category: "Cat4", amount: 2000 }),
    ];

    const { container } = render(<StatsSection ym={YM} />);
    const section = categoriaSection(container);
    const labels = Array.from(section.querySelectorAll(".opacity-80"))
      .map((el) => el.textContent)
      .filter((t): t is string => !!t && t.startsWith("Cat"));

    expect(labels).toEqual(["Cat1", "Cat2", "Cat3", "Cat4", "Cat5"]);
  });
});

describe("Cenário 6 — mais de 5 categorias (7)", () => {
  it("só as 5 maiores aparecem, as 2 menores somem", () => {
    storeState.expenses = [
      expense({ category: "Top1", amount: 7000 }),
      expense({ category: "Top2", amount: 6000 }),
      expense({ category: "Top3", amount: 5000 }),
      expense({ category: "Top4", amount: 4000 }),
      expense({ category: "Top5", amount: 3000 }),
      expense({ category: "Low1", amount: 2000 }),
      expense({ category: "Low2", amount: 1000 }),
    ];

    render(<StatsSection ym={YM} />);

    for (const cat of ["Top1", "Top2", "Top3", "Top4", "Top5"]) {
      expect(screen.getByText(cat)).toBeInTheDocument();
    }
    expect(screen.queryByText("Low1")).not.toBeInTheDocument();
    expect(screen.queryByText("Low2")).not.toBeInTheDocument();
  });
});

describe("Cenário 7 — categoria única", () => {
  it("barra ocupa escala máxima (100%)", () => {
    storeState.expenses = [expense({ category: "Solo", amount: 3000 })];

    const { container } = render(<StatsSection ym={YM} />);
    const section = categoriaSection(container);
    const fill = section.querySelector(".overflow-hidden > div") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });
});

describe("Cenário 8 — paidBy ausente/inválido", () => {
  it("cai inteiro em B, sem crash", () => {
    storeState.expenses = [expense({ amount: 1000, paidBy: undefined })];

    const { container } = render(<StatsSection ym={YM} />);
    const fills = quemPagouFills(container);
    // ordem: [Pessoa A, Pessoa B] — paidBy inválido (nem "A" nem "B") soma tudo em B
    expect(fills[0]).toBe("0%");
    expect(fills[1]).toBe("100%");
  });
});

describe("Cenário 9 — um lado zero, outro não (após fix do piso 4%)", () => {
  it("incomeA=0 renderiza 0% (não mais 4%)", () => {
    storeState.incomes = [income({ person: "B", amount: 5000 })];

    const { container } = render(<StatsSection ym={YM} />);
    const fills = rendaDespesasFills(container);
    // ordem: [incomeA, incomeB, totalOut]
    expect(fills[0]).toBe("0%");
    expect(fills[1]).toBe("100%");
  });
});

describe("Cenário 10 — filtragem por mês", () => {
  it("despesas de outro mês e deleted:true não entram no total", () => {
    storeState.expenses = [
      expense({ amount: 1000, ym: YM }),
      expense({ amount: 9000, ym: "2026-05" }),
      expense({ amount: 9000, ym: YM, deleted: true }),
    ];

    render(<StatsSection ym={YM} />);

    expect(screen.getByText(new RegExp(`Faltam: ${money(1000)}`))).toBeInTheDocument();
  });
});

describe("Cenário 11 — fallback sem couple", () => {
  it("usa 'Pessoa A'/'Pessoa B', moeda BRL, sem crash", () => {
    storeState.couple = null;
    storeState.incomes = [income({ person: "A", amount: 1000 })];

    render(<StatsSection ym={YM} />);

    expect(screen.getByText(/Renda Pessoa A/)).toBeInTheDocument();
    expect(screen.getByText(/Renda Pessoa B/)).toBeInTheDocument();
    expect(screen.getByText("Pessoa A")).toBeInTheDocument();
    expect(screen.getByText("Pessoa B")).toBeInTheDocument();
  });
});

describe("Cenário 12 — expenses/incomes undefined na store", () => {
  it("renderiza estado vazio, sem crash", () => {
    storeState.expenses = undefined;
    storeState.incomes = undefined;

    render(<StatsSection ym={YM} />);

    expect(screen.getByText("Sem gastos neste mês.")).toBeInTheDocument();
  });
});

describe("Cenário 13 — escala relativa Renda x Despesas", () => {
  it("maxBar = max(totalIn, totalOut, 1) compartilhado pelas 3 barras", () => {
    storeState.incomes = [income({ person: "A", amount: 10000 })];
    storeState.expenses = [expense({ amount: 4000 })];

    const { container } = render(<StatsSection ym={YM} />);
    const fills = rendaDespesasFills(container);
    // maxBar = max(10000, 4000, 1) = 10000
    expect(fills[0]).toBe("100%"); // incomeA
    expect(fills[1]).toBe("0%"); // incomeB
    expect(fills[2]).toBe("40%"); // totalOut
  });
});

describe("Cenário 14 — soma correta por categoria com múltiplas despesas", () => {
  it("soma despesas da mesma categoria", () => {
    storeState.expenses = [
      expense({ category: "Mercado", amount: 1000 }),
      expense({ category: "Mercado", amount: 2000 }),
      expense({ category: "Mercado", amount: 3000 }),
    ];

    const { container } = render(<StatsSection ym={YM} />);

    expect(screen.getByText("Mercado")).toBeInTheDocument();
    const section = categoriaSection(container);
    const right = section.querySelectorAll(".opacity-80")[1] as HTMLElement;
    expect(right.textContent).toBe(fromCents(6000));
  });
});
