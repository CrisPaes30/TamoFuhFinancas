// src/components/stats/InsightsSection.tsx
import { useStore } from "@/store";
import { analyzeMonth, lastMonthsYM, sliceByMonth } from "@/insights";
import { fromCents } from "@/lib/currency";
import { monthLabelPT } from "@/lib/date";
import StatBox from "@/components/stats/StatBox";

type Props = {
  ym: string;
};

export default function InsightsSection({ ym }: Props) {
  const { expenses, couple } = useStore();

  const baseDate = new Date(`${ym}-01T00:00:00`);
  const months = lastMonthsYM(4, baseDate);
  const incomes = (couple?.incomes || []) as any[];

  const slices = months.map((m) => sliceByMonth(expenses, incomes, m));
  const current = slices[0];

  const a = analyzeMonth(
    current,
    { A: couple?.nameA || "Pessoa A", B: couple?.nameB || "Pessoa B" },
    couple?.currency || "BRL",
    slices
  );

  return (
    <div className="bg-slate-900 p-4 rounded-2xl grid gap-3">
      <h3 className="font-semibold">Análises e dicas — {monthLabelPT(ym)}</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        <StatBox label="Renda" value={a.totals.totalIn} currency={couple?.currency} />
        <StatBox label="Despesas" value={a.totals.totalOut} currency={couple?.currency} />
        <StatBox label="Sobra/Falta" value={a.totals.saved} currency={couple?.currency} emphasis />
        <StatBox label="Fixas" value={a.totals.fixed} currency={couple?.currency} />
        <StatBox label="Variáveis" value={a.totals.variable} currency={couple?.currency} />
        <StatBox label="Cartão" value={a.totals.cardTot} currency={couple?.currency} />
      </div>

      <ul className="list-disc pl-5 grid gap-1 text-sm">
        {a.tips.map((t, i) => (
          <li key={i} className="leading-snug">
            {t}
          </li>
        ))}
      </ul>

      <div className="text-sm mt-2">
        {a.top.topCat && (
          <div className="opacity-80">
            Maior categoria: <b>{a.top.topCat[0]}</b> ({fromCents(a.top.topCat[1], couple?.currency)})
          </div>
        )}
        {a.top.topItem && (
          <div className="opacity-80">
            Maior item: <b>{a.top.topItem.title}</b> ({fromCents(a.top.topItem.amount, couple?.currency)})
          </div>
        )}
      </div>
    </div>
  );
}
