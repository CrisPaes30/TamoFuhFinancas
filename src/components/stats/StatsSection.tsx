// src/components/stats/StatsSection.tsx
import { useMemo } from "react";
import { useStore } from "@/store";
import { fromCents } from "@/lib/currency";
import { monthLabelPT } from "@/lib/date";
import Bar from "@/components/stats/Bar";
import { toMonth, toMillis, toYMD } from "@/lib/dateFmt";

type Props = { ym: string };

export default function StatsSection({ ym }: Props) {
  const { expenses, couple } = useStore();

  // despesas do mês selecionado
  const monthItems = useMemo(
    () => expenses.filter((e) => !e.deleted && (toMonth(e.date) || "").startsWith(ym)),
    [expenses, ym]
  );

  const totalOut = monthItems.reduce((acc, e) => acc + e.amount, 0);

  // rendas do mês
  const incomes = (couple?.incomes || []).filter((i: any) => i.month === ym);
  const incomeA = incomes
    .filter((i: any) => i.person === "A")
    .reduce((s: number, i: any) => s + i.amount, 0);
  const incomeB = incomes
    .filter((i: any) => i.person === "B")
    .reduce((s: number, i: any) => s + i.amount, 0);
  const totalIn = incomeA + incomeB;
  const saved = totalIn - totalOut;

  // por categoria (top 5)
  const catMap = new Map<string, number>();
  for (const e of monthItems)
    catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount);
  const catList = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // quem pagou
  let paidA = 0,
    paidB = 0;
  for (const e of monthItems) {
    if (e.paidBy === "A") paidA += e.amount;
    else paidB += e.amount;
  }

  const maxBar = Math.max(totalIn, totalOut, 1);

  return (
    <div className="bg-slate-900 p-4 rounded-2xl grid gap-4">
      <h3 className="font-semibold">Visão do mês — {monthLabelPT(ym)}</h3>

      {/* Renda x Despesas */}
      <div>
        <div className="text-sm mb-2 opacity-80">Renda x Despesas</div>
        <div className="grid gap-2">
          <Bar
            label={`Renda ${couple?.nameA}`}
            value={incomeA}
            max={maxBar}
            color="bg-emerald-500"
            right={fromCents(incomeA, couple?.currency)}
          />
          <Bar
            label={`Renda ${couple?.nameB}`}
            value={incomeB}
            max={maxBar}
            color="bg-emerald-400"
            right={fromCents(incomeB, couple?.currency)}
          />
          <Bar
            label="Total de despesas"
            value={totalOut}
            max={maxBar}
            color="bg-rose-500"
            right={fromCents(totalOut, couple?.currency)}
          />
        </div>
        <div
          className={`mt-2 text-sm ${
            saved >= 0 ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {saved >= 0
            ? `Sobra: ${fromCents(saved, couple?.currency)}`
            : `Faltam: ${fromCents(-saved, couple?.currency)}`}
        </div>
      </div>

      {/* Gastos por categoria */}
      <div>
        <div className="text-sm mb-2 opacity-80">Gastos por categoria</div>
        {catList.length === 0 && (
          <p className="text-xs opacity-70">Sem gastos neste mês.</p>
        )}
        <div className="grid gap-2">
          {catList.map(([cat, v]) => (
            <Bar
              key={cat}
              label={cat}
              value={v}
              max={Math.max(catList[0][1], 1)}
              color="bg-sky-500"
              right={fromCents(v, couple?.currency)}
            />
          ))}
        </div>
      </div>

      {/* Quem pagou no mês */}
      <div>
        <div className="text-sm mb-2 opacity-80">Quem pagou no mês</div>
        <div className="grid gap-2">
          <Bar
            label={couple?.nameA || "Pessoa A"}
            value={paidA}
            max={Math.max(paidA, paidB, 1)}
            color="bg-indigo-500"
            right={fromCents(paidA, couple?.currency)}
          />
          <Bar
            label={couple?.nameB || "Pessoa B"}
            value={paidB}
            max={Math.max(paidA, paidB, 1)}
            color="bg-indigo-400"
            right={fromCents(paidB, couple?.currency)}
          />
        </div>
      </div>
    </div>
  );
}
