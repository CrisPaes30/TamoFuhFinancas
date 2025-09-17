// src/components/incomes/IncomeForm.tsx
import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { fromCents } from "@/lib/currency";
import { toCents } from "@/utils";

type Props = { open: boolean; onClose(): void };

export default function IncomeForm({ open, onClose }: Props) {
  const { couple, setCouple } = useStore();

  const [idEditing, setIdEditing] = useState<string | null>(null);
  const [person, setPerson] = useState<"A" | "B">("A");
  const [source, setSource] = useState("Salário");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  type Income = {
    id: string;
    person: "A" | "B";
    source: string;
    amount: number; // cents
    month: string;  // YYYY-MM
  };

  const incomes = (couple?.incomes || []) as Income[];

  const monthList = incomes
    .filter((i) => i.month === month)
    .sort((a, b) => b.amount - a.amount);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setIdEditing(null);
    setPerson("A");
    setSource("Salário");
    setAmount("");
    const d = new Date();
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !couple) return null;

  function clearForm() {
    setIdEditing(null);
    setPerson("A");
    setSource("Salário");
    setAmount("");
  }

  function saveIncome() {
    const cents = toCents(amount);
    if (cents <= 0) return;

    const next = [...incomes];
    if (idEditing) {
      const idx = next.findIndex((i) => i.id === idEditing);
      if (idx >= 0) next[idx] = { ...next[idx], person, source, amount: cents, month };
    } else {
      next.push({
        id: crypto.randomUUID(),
        person,
        source: source.trim() || "Renda",
        amount: cents,
        month,
      });
    }
    setCouple({ ...couple, incomes: next, updatedAt: Date.now() });
    clearForm();
  }

  function editIncome(id: string) {
    const it = incomes.find((i) => i.id === id);
    if (!it) return;
    setIdEditing(it.id);
    setPerson(it.person);
    setSource(it.source);
    setAmount((it.amount / 100).toFixed(2).replace(".", ","));
    setMonth(it.month);
  }

  function removeIncome(id: string) {
    const ok = window.confirm("Excluir esta renda?");
    if (!ok) return;
    const next = incomes.filter((i) => i.id !== id);
    setCouple({ ...couple, incomes: next, updatedAt: Date.now() });
    if (idEditing === id) clearForm();
  }

  const totalMonth = monthList.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl mx-4">
        <div className="bg-slate-900 p-5 rounded-2xl shadow-xl">
          <h3 className="text-lg font-semibold mb-3">Rendas por mês</h3>

          {/* Filtro de mês */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm opacity-80">Mês</span>
            <input
              type="month"
              className="bg-slate-800 h-10 px-3 rounded"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <span className="ml-auto text-sm opacity-80">
              Total do mês: <b>{fromCents(totalMonth, couple.currency)}</b>
            </span>
          </div>

          {/* Formulário */}
          <div className="grid sm:grid-cols-4 gap-3">
            <select
              className="bg-slate-800 h-11 px-3 rounded"
              value={person}
              onChange={(e) => setPerson(e.target.value as "A" | "B")}
            >
              <option value="A">{couple.nameA}</option>
              <option value="B">{couple.nameB}</option>
            </select>

            <input
              className="bg-slate-800 h-11 px-3 rounded sm:col-span-2"
              placeholder="Fonte (ex.: Salário, Freela, Bônus...)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />

            <input
              className="bg-slate-800 h-11 px-3 rounded"
              placeholder="Valor (ex.: 2.500,00)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end mt-3">
            {idEditing && (
              <button className="px-3 h-10 bg-slate-800 rounded" onClick={clearForm}>
                Cancelar edição
              </button>
            )}
            <button className="px-4 h-10 bg-emerald-500 text-slate-950 font-semibold rounded" onClick={saveIncome}>
              {idEditing ? "Salvar alterações" : "Adicionar renda"}
            </button>
          </div>

          {/* Lista do mês selecionado */}
          <div className="mt-4">
            <div className="text-sm opacity-80 mb-2">Rendas deste mês</div>
            {monthList.length === 0 && (
              <p className="text-xs opacity-60">Nenhuma renda lançada para este mês.</p>
            )}
            <ul className="grid gap-2">
              {monthList.map((i) => (
                <li
                  key={i.id}
                  className="bg-slate-800 p-3 rounded flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {i.source} • {i.person === "A" ? couple.nameA : couple.nameB}
                    </div>
                    <div className="text-xs opacity-80">{i.month}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="font-semibold">
                      {fromCents(i.amount, couple.currency)}
                    </div>
                    <button
                      className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded"
                      onClick={() => editIncome(i.id)}
                    >
                      Editar
                    </button>
                    <button
                      className="text-xs bg-red-600/80 hover:bg-red-600 px-2 py-1 rounded text-white"
                      onClick={() => removeIncome(i.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end mt-4">
            <button className="px-4 h-11 bg-slate-800 rounded" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
