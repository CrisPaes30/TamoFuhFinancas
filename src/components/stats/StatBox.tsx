// src/components/stats/StatBox.tsx
import { fromCents } from "@/lib/currency";

type Props = {
  label: string;
  value: number;
  currency?: string;
  emphasis?: boolean;
};

export default function StatBox({ label, value, currency, emphasis }: Props) {
  const cls = emphasis
    ? value >= 0
      ? "text-emerald-300"
      : "text-rose-300"
    : "text-slate-200";

  return (
    <div className="bg-slate-800 rounded p-2">
      <div className="text-xs opacity-70">{label}</div>
      <div className={`font-semibold ${cls}`}>{fromCents(value, currency)}</div>
    </div>
  );
}
