// src/components/expenses/ExpenseForm.tsx
import { useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useStore } from "@/store";
import { toCents } from "@/lib/currency";

type Props = {
  open: boolean;
  onClose: () => void;
  editing?: any | null;
};

export default function ExpenseForm({ open, onClose, editing }: Props) {
  const { couple, addExpense, updateExpense } = useStore();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(""); // em reais (string do input)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  const [paidBy, setPaidBy] = useState<"A" | "B">("A");
  const [splitA, setSplitA] = useState(1);
  const [splitB, setSplitB] = useState(1);
  const [category, setCategory] = useState("Outros");

  const [isFixed, setIsFixed] = useState(false);
  const [fixedKind, setFixedKind] =
    useState<"Agua" | "Luz" | "Internet" | "Aluguel" | "Outros">("Outros");
  const [isCard, setIsCard] = useState(false);
  const [installments, setInstallments] = useState(1);

  const [saving, setSaving] = useState(false);
  const totalSplit = useMemo(
    () => (Number(splitA) || 0) + (Number(splitB) || 0),
    [splitA, splitB]
  );

  // trava scroll quando o modal abre
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // pré-preenche ao editar
  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title || "");
    setAmount(((editing.amount || 0) / 100).toFixed(2).replace(".", ","));

    // date: Timestamp -> YYYY-MM-DD para o input
    const d: Date =
      editing.date && typeof editing.date?.toDate === "function"
        ? editing.date.toDate()
        : new Date();
    setDate(d.toISOString().slice(0, 10));

    setPaidBy(editing.paidBy || "A");
    setSplitA(editing?.split?.a ?? 1);
    setSplitB(editing?.split?.b ?? 1);
    setCategory(editing.category || "Outros");
    setIsFixed(!!editing.isFixed);
    setFixedKind(editing.fixedKind || "Outros");
    setIsCard(!!editing.isCard);
    setInstallments(editing.installments || 1);
  }, [editing]);

  if (!open) return null;

  async function handleSave() {
    if (!couple) return;

    // amount seguro
    const cents = toCents(amount);
    if (!Number.isFinite(cents) || cents < 0) {
      console.warn("[ExpenseForm] amount inválido:", amount, "→", cents);
      return;
    }

    const payload = {
      title: title.trim(),
      amount: cents, // centavos (number)
      paidBy,
      // YYYY-MM-DD -> Timestamp (new Date('YYYY-MM-DD') é UTC; ok se você trata como dia)
      date: Timestamp.fromDate(new Date(date)),
      category,
      split: {
        a: Number.isFinite(splitA) ? Math.max(0, splitA) : 0,
        b: Number.isFinite(splitB) ? Math.max(0, splitB) : 0,
      },
      isFixed,
      fixedKind,
      isCard,
      installments,
      // nada de coupleId aqui — o store usa get().couple?.id
    };

    console.log("[ExpenseForm] payload pronto:", payload);

    try {
      setSaving(true);
      if (editing) {
        await updateExpense(editing.id, payload as any);
      } else {
        await addExpense(payload as any); // store adiciona createdAt/updatedAt
      }
      onClose();
    } catch (e) {
      console.error("[ExpenseForm] erro ao salvar:", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl mx-4">
        <div className="bg-slate-900 w-full p-5 rounded-2xl shadow-xl">
          <h3 className="text-lg font-semibold mb-3">
            {editing ? "Editar despesa" : "Nova despesa"}
          </h3>

          <div className="grid gap-3">
            <input
              className="bg-slate-800 h-11 px-3 rounded"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Bombom"
            />

            <input
              className="bg-slate-800 h-11 px-3 rounded"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Valor (ex.: 3,50)"
              inputMode="decimal"
            />

            {/* data + categoria */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="bg-slate-800 h-11 px-3 rounded"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <select
                className="bg-slate-800 h-11 px-3 rounded"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>Alimentação</option>
                <option>Transporte</option>
                <option>Mercado</option>
                <option>Lazer</option>
                <option>Moradia</option>
                <option>Outros</option>
              </select>
            </div>

            {/* quem pagou + divisão */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              {/* Quem pagou */}
              <div className="bg-slate-800 rounded p-3">
                <div className="text-xs opacity-80 mb-2">Quem pagou</div>
                <select
                  className="bg-slate-700 h-10 px-3 rounded w-full"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value as "A" | "B")}
                >
                  <option value="A">{`Pagou: ${couple?.nameA ?? "A"}`}</option>
                  <option value="B">{`Pagou: ${couple?.nameB ?? "B"}`}</option>
                </select>

                {/* tipo / pagamento */}
                <div className="text-xs opacity-80 mt-4 mb-2">Tipo e pagamento</div>

                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    className="accent-green-500"
                    checked={isFixed}
                    onChange={(e) => setIsFixed(e.target.checked)}
                  />
                  <span className="text-sm">Despesa fixa</span>
                </label>

                {isFixed && (
                  <div className="mb-3">
                    <select
                      className="bg-slate-700 h-10 px-3 rounded w-full"
                      value={fixedKind}
                      onChange={(e) => setFixedKind(e.target.value as any)}
                    >
                      <option value="Agua">Água</option>
                      <option value="Luz">Luz</option>
                      <option value="Internet">Internet</option>
                      <option value="Aluguel">Aluguel</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                )}

                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    className="accent-green-500"
                    checked={isCard}
                    onChange={(e) => setIsCard(e.target.checked)}
                  />
                  <span className="text-sm">Compra no cartão de crédito</span>
                </label>

                {isCard && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs opacity-80">Parcelas</span>
                    <input
                      className="bg-slate-700 w-20 h-9 p-1 rounded text-center
                                 [appearance:textfield]
                                 [&::-webkit-outer-spin-button]:appearance-none
                                 [&::-webkit-inner-spin-button]:appearance-none"
                      type="number"
                      min={1}
                      value={installments}
                      onChange={(e) =>
                        setInstallments(Math.max(1, parseInt(e.target.value || "1")))
                      }
                    />
                  </div>
                )}
              </div>

              {/* Divisão por pessoa */}
              <div className="bg-slate-800 rounded p-3">
                <div className="text-xs opacity-80 mb-2">Divisão por pessoa</div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="text-xs opacity-80 truncate">{couple?.nameA}</span>
                    <input
                      className="bg-slate-700 w-16 h-9 p-1 rounded text-center
                                 [appearance:textfield]
                                 [&::-webkit-outer-spin-button]:appearance-none
                                 [&::-webkit-inner-spin-button]:appearance-none"
                      type="number"
                      min={0}
                      value={splitA}
                      onChange={(e) => setSplitA(parseInt(e.target.value || "0"))}
                    />
                  </label>

                  <span className="opacity-60">:</span>

                  <label className="flex items-center gap-2 min-w-0">
                    <span className="text-xs opacity-80 truncate">{couple?.nameB}</span>
                    <input
                      className="bg-slate-700 w-16 h-9 p-1 rounded text-center
                                 [appearance:textfield]
                                 [&::-webkit-outer-spin-button]:appearance-none
                                 [&::-webkit-inner-spin-button]:appearance-none"
                      type="number"
                      min={0}
                      value={splitB}
                      onChange={(e) => setSplitB(parseInt(e.target.value || "0"))}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    className="px-2 py-1 h-8 bg-slate-700 rounded text-xs"
                    onClick={() => {
                      setSplitA(1);
                      setSplitB(1);
                    }}
                  >
                    50 / 50
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 h-8 bg-slate-700 rounded text-xs"
                    onClick={() => {
                      setSplitA(1);
                      setSplitB(0);
                    }}
                  >
                    {couple?.nameA} 100%
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 h-8 bg-slate-700 rounded text-xs"
                    onClick={() => {
                      setSplitA(0);
                      setSplitB(1);
                    }}
                  >
                    {couple?.nameB} 100%
                  </button>
                </div>

                {totalSplit === 0 && (
                  <p className="text-xs text-slate-400 mt-2">
                    Divisão 0:0 → será registrado como{" "}
                    <b>despesa pessoal de {paidBy === "A" ? couple?.nameA : couple?.nameB}</b>{" "}
                    (não altera o saldo).
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button className="px-4 h-11 bg-slate-800 rounded" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button
                className="px-4 h-11 bg-green-500 text-slate-950 font-semibold rounded disabled:opacity-60"
                onClick={handleSave}
                disabled={saving || !title.trim()}
              >
                {saving ? "Salvando..." : editing ? "Salvar alterações" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
