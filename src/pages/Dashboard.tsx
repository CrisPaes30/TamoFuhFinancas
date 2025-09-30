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
import { Timestamp } from "firebase/firestore";

export default function Dashboard() {
  const couple = useStore((s) => s.couple);
  const expenses = useStore((s) => s.expenses ?? []);
  const addExpense = useStore((s) => s.addExpense);
  const deleteExpense = useStore((s) => s.deleteExpense); // ✅

  const [openForm, setOpenForm] = useState(false);
  const [openIncome, setOpenIncome] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentYM());
  const [editing, setEditing] = useState<any | null>(null);

  const [showDetails, setShowDetails] = useState(false);
  const [settling, setSettling] = useState(false);

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
      </div>
    );
  }

  const { nameA = "Pessoa A", nameB = "Pessoa B", currency = "BRL" } = couple;

  function ymOf(e: any): string {
    if (e?.ym) return e.ym;
    try {
      const d =
        e?.date && typeof e.date?.toDate === "function"
          ? e.date.toDate()
          : new Date(e?.date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    } catch {
      return "";
    }
  }

  function toYMD(d: any): string {
    try {
      if (!d) return "";
      if (typeof d?.toDate === "function")
        return d.toDate().toISOString().slice(0, 10);
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      if (typeof d === "string") return d.slice(0, 10);
    } catch {}
    return "";
  }

  const monthExpenses = useMemo(
    () => (expenses ?? []).filter((e) => !e?.deleted && ymOf(e) === selectedMonth),
    [expenses, selectedMonth]
  );

  const saldoA = useMemo(() => {
    let sA = 0;
    for (const e of monthExpenses) {
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
  }, [monthExpenses]);

  const labelMes = monthLabelPT(selectedMonth);
  const msg =
    saldoA === 0
      ? `Sem diferenças entre ${nameA} e ${nameB} em ${labelMes}`
      : saldoA > 0
      ? `${nameB} deve ${fromCents(saldoA, currency)} para ${nameA} em ${labelMes}`
      : `${nameA} deve ${fromCents(-saldoA, currency)} para ${nameB} em ${labelMes}`;

  // Último acerto do mês
  const settlementExpense = useMemo(
    () =>
      monthExpenses
        .filter((e) => e.category === "Acerto")
        .sort(
          (a, b) =>
            new Date(b?.date?.toDate?.() ?? b.date).getTime() -
            new Date(a?.date?.toDate?.() ?? a.date).getTime()
        )[0] || null,
    [monthExpenses]
  );

  // 🔎 Itens que compõem o saldo (apenas a parcela que entra no saldo)
  const saldoItems = useMemo(() => {
    if (saldoA === 0) return [];
    const items: { e: any; delta: number }[] = [];

    for (const e of monthExpenses) {
      if (e?.deleted) continue;
      if ((e?.category ?? "") === "Acerto") continue; // ignora acertos

      const amount = e?.amount ?? 0;
      const a = e?.split?.a ?? 50;
      const b = e?.split?.b ?? 50;
      const paidBy = e?.paidBy ?? "A";

      const { Va, Vb } = computeShares(amount, a, b, paidBy);
      // contribuição desta despesa no saldo de A:
      // se A pagou -> Vb (A tem a receber de B)
      // se B pagou -> -Va (A tem a pagar a B)
      const delta = paidBy === "A" ? Vb : -Va;

      if (saldoA > 0 ? delta > 0 : delta < 0) {
        items.push({ e, delta });
      }
    }

    // ordena por contribuição absoluta (maior primeiro)
    items.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    return items;
  }, [monthExpenses, saldoA]);

  async function settleBalance() {
    if (settling || saldoA === 0) return;
    setSettling(true);
    try {
      const value = Math.abs(saldoA);
      const debtorIsB = saldoA > 0;

      const expense = {
        title: `Acerto — ${labelMes}`,
        amount: value,
        paidBy: debtorIsB ? "B" : "A",
        category: "Acerto",
        split: debtorIsB ? { a: 100, b: 0 } : { a: 0, b: 100 },
        date: Timestamp.now(),
        ym: selectedMonth,
        isFixed: false as const,
      };

      await addExpense(expense as any);
      setShowDetails(true);
    } finally {
      setSettling(false);
    }
  }

  async function undoSettlement() {
    if (!settlementExpense) return;
    try {
      await deleteExpense(settlementExpense.id);
      setShowDetails(false);
    } catch (err) {
      console.error("Erro ao desfazer acerto:", err);
      alert("Não foi possível desfazer o acerto.");
    }
  }

  return (
    <div className="grid gap-4">
      <ShareInviteBar />

      {/* Card Saldo */}
      <div className="bg-slate-900 p-4 rounded-2xl">
        <div className="flex items-start justify-between gap-4 w-full">
          <div className="w-full">
            <h3 className="font-semibold mb-1">Saldo — {labelMes}</h3>

            <button
              className="opacity-90 text-left underline underline-offset-2 decoration-slate-500 hover:decoration-emerald-500"
              onClick={() => setShowDetails((s) => !s)}
              title="Ver despesas que compõem o saldo"
            >
              {msg}
            </button>

            {showDetails && (
              <div className="mt-2 bg-slate-800/70 rounded-lg p-2">
                <ul className="text-sm divide-y divide-slate-700">
                  {saldoItems.length === 0 && (
                    <li className="py-2 text-xs opacity-70">
                      Não há parcelas de despesas compondo o saldo neste mês.
                    </li>
                  )}

                  {saldoItems.map(({ e, delta }) => (
                    <li key={e.id} className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {e.title || "(sem título)"}
                        </div>
                        <div className="text-xs opacity-70">
                          {toYMD(e.date)} • {e.category || "Outros"} • Pagou:{" "}
                          {(e?.paidBy ?? "A") === "A" ? nameA : nameB}
                        </div>
                      </div>
                      {/* Apenas a parcela que compõe o saldo */}
                      <div className="whitespace-nowrap font-semibold">
                        {fromCents(Math.abs(delta), currency)}
                      </div>
                    </li>
                  ))}

                  {saldoItems.length > 0 && (
                    <li className="pt-2 flex items-center justify-between text-xs opacity-80">
                      <span>Total</span>
                      <span className="font-semibold">
                        {fromCents(Math.abs(saldoA), currency)}
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                className="bg-slate-800 px-3 py-2 rounded disabled:opacity-50"
                disabled={saldoA === 0 || settling}
                onClick={settleBalance}
              >
                {settling ? "Acertando..." : "Acertar agora"}
              </button>

              {settlementExpense && (
                <button
                  className="bg-red-600/80 hover:bg-red-600 px-3 py-2 rounded text-slate-50 font-semibold"
                  onClick={undoSettlement}
                >
                  Desfazer acerto
                </button>
              )}

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
          onChange={(e) => {
            setSelectedMonth(e.target.value);
            setShowDetails(false);
          }}
        />
        <div className="ml-auto text-xs opacity-70">{labelMes}</div>
      </div>

      <ExpenseList ym={selectedMonth} onEdit={setEditing} />
      <StatsSection ym={selectedMonth} />
      <InsightsSection ym={selectedMonth} />
    </div>
  );
}
