// Dashboard.tsx
import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { computeShares } from "@/utils";
import { fromCents } from "@/lib/currency";
import { getCurrentYM, monthLabelPT } from "@/lib/date";
import ExpenseForm from "@/components/expenses/ExpenseForm";
import ExpenseList from "@/components/expenses/ExpenseList";
import IncomeForm from "@/components/incomes/IncomeForm";
import StatsSection from "@/components/stats/StatsSection";
import InsightsSection from "@/components/stats/InsightsSection";
import ShareInviteBar from "@/components/invite/ShareInviteBar";

export default function Dashboard() {
  const couple = useStore((s) => s.couple);
  const expenses = useStore((s) => s.expenses ?? []);

  const [openForm, setOpenForm] = useState(false);
  const [openIncome, setOpenIncome] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentYM());
  const [editing, setEditing] = useState<any | null>(null);

  if (couple === undefined) {
    return <div className="p-4 text-sm text-slate-300">Carregando casal…</div>;
  }

  if (couple === null) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-300 mb-3">Você ainda não está em um casal.</p>
        <a
          href="/"
          className="inline-block bg-emerald-500 text-slate-950 font-semibold px-4 py-2 rounded"
        >
          Criar ou entrar em um casal
        </a>
        {/* DEBUG — remova depois */}
        <div className="bg-slate-900 p-3 rounded mt-4">
          <pre className="text-xs whitespace-pre-wrap">
            {JSON.stringify(couple, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  const { nameA = "Pessoa A", nameB = "Pessoa B", currency = "BRL" } = couple;

  const saldoA = useMemo(() => {
    let sA = 0;
    for (const e of (expenses ?? []).filter((e) => !e?.deleted)) {
      const { Va, Vb } = computeShares(
        e.amount ?? 0,
        e?.split?.a ?? 50,
        e?.split?.b ?? 50,
        e?.paidBy ?? "A"
      );
      if ((e?.paidBy ?? "A") === "A") sA += (e.amount ?? 0) - Va;
      else sA -= (e.amount ?? 0) - Vb;
    }
    return sA;
  }, [expenses]);

  const msg =
    saldoA >= 0
      ? `${nameB} deve ${fromCents(saldoA, currency)} para ${nameA}`
      : `${nameA} deve ${fromCents(-saldoA, currency)} para ${nameB}`;

  return (
    <div className="grid gap-4">
      {/* Barra com o código, fora do card */}
      <ShareInviteBar />
      {/* Card Saldo (único) com botão de convite à direita */}
      <div className="bg-slate-900 p-4 rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold mb-1">Saldo</h3>
            <p className="opacity-90">{msg}</p>
            <div className="mt-3 flex gap-2">
              <button className="bg-slate-800 px-3 py-2 rounded">
                Acertar agora
              </button>
              <button
                className="bg-emerald-600/90 hover:bg-emerald-600 px-3 py-2 rounded text-slate-950 font-semibold"
                onClick={() => setOpenIncome(true)}
              >
                + Rendas / salário
              </button>
            </div>
          </div>
        </div>
      </div>

      <ExpenseForm
        open={openForm || !!editing}
        editing={editing}
        onClose={() => {
          setOpenForm(false);
          setEditing(null);
        }}
      />
      <IncomeForm open={openIncome} onClose={() => setOpenIncome(false)} />

      <div className="flex justify-end">
        <button
          className="bg-green-500 text-slate-950 font-semibold px-4 py-2 rounded"
          onClick={() => {
            setEditing(null);
            setOpenForm(true);
          }}
        >
          + Adicionar despesa
        </button>
      </div>

      <div className="bg-slate-900 p-3 rounded-2xl flex items-center gap-3">
        <div className="text-sm opacity-80">Mês de análise</div>
        <input
          type="month"
          className="bg-slate-800 h-10 px-3 rounded"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        />
        <div className="ml-auto text-xs opacity-70">
          {monthLabelPT(selectedMonth)}
        </div>
      </div>

      <ExpenseList ym={selectedMonth} onEdit={setEditing} />
      <StatsSection ym={selectedMonth} />
      <InsightsSection ym={selectedMonth} />
    </div>
  );
}
