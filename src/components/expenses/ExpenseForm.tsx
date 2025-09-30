// src/components/expenses/ExpenseForm.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Timestamp,
  updateDoc,
  doc,
  arrayUnion,
} from "firebase/firestore";
import { useStore } from "@/store";
import { toCents } from "@/lib/currency";
import { db } from "@/lib/firebase";

type Props = { open: boolean; onClose: () => void; editing?: any | null };

// sentinel para mostrar input de categoria personalizada
const CUSTOM_CAT = "__custom__";

export default function ExpenseForm({ open, onClose, editing }: Props) {
  const { couple, addExpense, updateExpense } = useStore();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(""); // em reais
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState<"A" | "B">("A");
  const [splitA, setSplitA] = useState(1);
  const [splitB, setSplitB] = useState(1);

  // categoria + campos para “Outros (especificar…)”
  const [category, setCategory] = useState("Outros");
  const [customCat, setCustomCat] = useState("");
  const [saveAsCategory, setSaveAsCategory] = useState(false);

  const [isFixed, setIsFixed] = useState(false);
  const [fixedKind, setFixedKind] =
    useState<"Agua" | "Luz" | "Internet" | "Aluguel" | "Outros">("Outros");
  const [isCard, setIsCard] = useState(false);

  // parcelas como string (permite limpar o campo)
  const [installmentsStr, setInstallmentsStr] = useState("1");
  const installmentsN = useMemo(() => {
    const n = parseInt(installmentsStr, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.min(36, Math.max(1, n));
  }, [installmentsStr]);

  const [saving, setSaving] = useState(false);

  const totalSplit = useMemo(
    () => (Number(splitA) || 0) + (Number(splitB) || 0),
    [splitA, splitB]
  );

  const isSeriesOccurrence = !!editing?.groupId;
  const ruleKind = editing?.ruleKind as "fixed" | "installments" | undefined;

  const currency = (couple?.currency ?? "BRL") as "BRL" | "USD" | "EUR";
  const fmt = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
      (cents || 0) / 100
    );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title || "");
    setAmount(((editing.amount || 0) / 100).toFixed(2).replace(".", ","));

    const d: Date =
      editing.date && typeof editing.date?.toDate === "function"
        ? editing.date.toDate()
        : new Date();
    setDate(d.toISOString().slice(0, 10));

    setPaidBy(editing.paidBy || "A");
    setSplitA(editing?.split?.a ?? 1);
    setSplitB(editing?.split?.b ?? 1);

    // categoria: se não vier, “Outros”
    setCategory(editing.category || "Outros");
    setCustomCat("");
    setSaveAsCategory(false);

    setIsFixed(!!editing.isFixed);
    setFixedKind(editing.fixedKind || "Outros");
    setIsCard(!!editing.isCard);
    setInstallmentsStr(String(editing.installments || 1));
  }, [editing]);

  useEffect(() => {
    if (open && !editing) {
      setTitle("");
      setAmount("");
      setDate(new Date().toISOString().slice(0, 10));
      setPaidBy("A");
      setSplitA(1);
      setSplitB(1);
      setCategory("Outros");
      setCustomCat("");
      setSaveAsCategory(false);
      setIsFixed(false);
      setFixedKind("Outros");
      setIsCard(false);
      setInstallmentsStr("1");
    }
  }, [open, editing]);

  function addMonthsLabel(ym: string, delta: number) {
    const [Y, M] = ym.split("-").map(Number);
    const base = new Date(Y, M - 1 + delta, 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
  }

  const parcelsPreview = useMemo(() => {
    if (!isCard || installmentsN < 2) return null;
    const cents = toCents(amount);
    if (!Number.isFinite(cents) || cents <= 0) return null;

    const base = Math.floor(cents / installmentsN);
    const sobra = cents - base * installmentsN;
    const ymStart = date.slice(0, 7);
    const ymEnd = addMonthsLabel(ymStart, installmentsN - 1);
    return { base, sobra, total: installmentsN, ymStart, ymEnd, totalCents: cents };
  }, [isCard, installmentsN, amount, date]);

  if (!open) return null;

  // categorias base + personalizadas do casal
  const baseCategories = [
    "Alimentação",
    "Transporte",
    "Mercado",
    "Lazer",
    "Moradia",
    "Outros",
  ];
  const customCats = (couple?.categories ?? []).filter(Boolean) as string[];
  const categoryOptions: Array<{ label: string; value: string }> = [
    ...new Set([...customCats, ...baseCategories]),
  ].map((c) => ({ label: c, value: c }));
  // opção “Outros (especificar…)”
  categoryOptions.push({ label: "Outros (especificar…)", value: CUSTOM_CAT });

  async function persistNewCategoryIfNeeded(finalCategory: string) {
    if (!saveAsCategory) return;
    if (!couple?.id) return;
    try {
      await updateDoc(doc(db, "couples", couple.id), {
        categories: arrayUnion(finalCategory),
        updatedAt: Timestamp.now(),
      });
    } catch (e) {
      // não quebra o fluxo de salvar a despesa
      console.warn("[ExpenseForm] falha ao salvar nova categoria:", e);
    }
  }

  async function handleSave() {
    if (!couple) return;

    const cents = toCents(amount);
    if (!Number.isFinite(cents) || cents < 0) {
      console.warn("[ExpenseForm] amount inválido:", amount, "→", cents);
      return;
    }

    // Resolve categoria final
    const finalCategory =
      category === CUSTOM_CAT ? (customCat || "Outros").trim() : category;

    if (category === CUSTOM_CAT && !customCat.trim()) {
      // você pode trocar por um toast
      alert("Digite o nome da categoria em 'Outros (especificar)'.");
      return;
    }

    const payload = {
      title: title.trim(),
      amount: cents,
      paidBy,
      date: Timestamp.fromDate(new Date(date)),
      category: finalCategory,
      split: {
        a: Number.isFinite(splitA) ? Math.max(0, splitA) : 0,
        b: Number.isFinite(splitB) ? Math.max(0, splitB) : 0,
      },
      isFixed: isCard ? false : isFixed,
      fixedKind: isCard ? undefined : (isFixed ? fixedKind : undefined),
      isCard,
      installments: isCard ? installmentsN : 1,
    };

    try {
      setSaving(true);
      if (editing) await updateExpense(editing.id, payload as any);
      else await addExpense(payload as any);

      // persiste a nova categoria, se marcado
      await persistNewCategoryIfNeeded(finalCategory);

      onClose();
    } catch (e) {
      console.error("[ExpenseForm] erro ao salvar:", e);
    } finally {
      setSaving(false);
    }
  }

  function onToggleFixed(checked: boolean) {
    if (checked) {
      setIsFixed(true);
      setIsCard(false);
      setInstallmentsStr("1");
    } else setIsFixed(false);
  }
  function onToggleCard(checked: boolean) {
    if (checked) {
      setIsCard(true);
      setIsFixed(false);
    } else {
      setIsCard(false);
      setInstallmentsStr("1");
    }
  }

  const paidAName = couple?.nameA ?? "Pessoa A";
  const paidBName = couple?.nameB ?? "Pessoa B";

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
              placeholder="Ex.: Conta de água"
            />
            <input
              className="bg-slate-800 h-11 px-3 rounded"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Valor (ex.: 120,00)"
              inputMode="decimal"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="bg-slate-800 h-11 px-3 rounded"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />

              {/* Categoria com “Outros (especificar…)” */}
              <div className="flex flex-col gap-2">
                <select
                  className="bg-slate-800 h-11 px-3 rounded"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {category === CUSTOM_CAT && (
                  <div className="flex items-center gap-2">
                    <input
                      className="bg-slate-800 h-11 px-3 rounded w-full"
                      placeholder="Ex.: Compras do mês"
                      value={customCat}
                      onChange={(e) => setCustomCat(e.target.value)}
                      maxLength={40}
                    />
                    <label className="flex items-center gap-2 text-xs opacity-80 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={saveAsCategory}
                        onChange={(e) => setSaveAsCategory(e.target.checked)}
                      />
                      Salvar
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div className="bg-slate-800 rounded p-3">
                <div className="text-xs opacity-80 mb-2">Quem pagou</div>
                <select
                  className="bg-slate-700 h-10 px-3 rounded w-full"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value as "A" | "B")}
                >
                  <option value="A">{`Pagou: ${paidAName}`}</option>
                  <option value="B">{`Pagou: ${paidBName}`}</option>
                </select>

                <div className="text-xs opacity-80 mt-4 mb-2">Tipo e pagamento</div>

                {isSeriesOccurrence && (
                  <div className="text-[11px] p-2 rounded bg-amber-500/10 border border-amber-500/30 mb-2">
                    Esta é uma ocorrência da série
                    {ruleKind === "fixed"
                      ? " (fixa até dezembro)"
                      : ruleKind === "installments"
                      ? " (parcelado)"
                      : ""}
                    . Alterações aqui afetam apenas este mês.
                  </div>
                )}

                <label
                  className={`flex items-center gap-2 mb-2 ${
                    isSeriesOccurrence && ruleKind !== "fixed" ? "opacity-60" : ""
                  }`}
                  htmlFor="chk-fixed"
                >
                  <input
                    id="chk-fixed"
                    type="checkbox"
                    className="accent-green-500"
                    checked={isFixed}
                    onChange={(e) => onToggleFixed(e.target.checked)}
                    disabled={isSeriesOccurrence && ruleKind !== "fixed"}
                  />
                  <span className="text-sm select-none">
                    Despesa fixa (replicar até dezembro)
                  </span>
                </label>

                {isFixed && (
                  <div className="mb-3">
                    <select
                      className="bg-slate-700 h-10 px-3 rounded w-full"
                      value={fixedKind}
                      onChange={(e) => setFixedKind(e.target.value as any)}
                      disabled={isSeriesOccurrence && ruleKind !== "fixed"}
                    >
                      <option value="Agua">Água</option>
                      <option value="Luz">Luz</option>
                      <option value="Internet">Internet</option>
                      <option value="Aluguel">Aluguel</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                )}

                <label
                  className={`flex items-center gap-2 mb-2 ${
                    isSeriesOccurrence && ruleKind !== "installments"
                      ? "opacity-60"
                      : ""
                  }`}
                  htmlFor="chk-card"
                >
                  <input
                    id="chk-card"
                    type="checkbox"
                    className="accent-green-500"
                    checked={isCard}
                    onChange={(e) => onToggleCard(e.target.checked)}
                    disabled={isSeriesOccurrence && ruleKind !== "installments"}
                  />
                  <span className="text-sm select-none">
                    Compra no cartão de crédito (parcelado)
                  </span>
                </label>

                {isCard && (
                  <>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs opacity-80">Parcelas</span>
                      <input
                        className="bg-slate-700 w-20 h-9 p-1 rounded text-center
                                   [appearance:textfield]
                                   [&::-webkit-outer-spin-button]:appearance-none
                                   [&::-webkit-inner-spin-button]:appearance-none"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={installmentsStr}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "");
                          setInstallmentsStr(v);
                        }}
                        onBlur={() => {
                          if (!installmentsStr) setInstallmentsStr("1");
                          else setInstallmentsStr(String(installmentsN));
                        }}
                        disabled={isSeriesOccurrence && ruleKind !== "installments"}
                      />
                    </div>

                    {installmentsN > 1 && parcelsPreview && (
                      <div className="text-xs mt-2 p-2 rounded bg-slate-700/40">
                        <div>
                          Total: <b>{fmt(parcelsPreview.totalCents)}</b> em{" "}
                          <b>{parcelsPreview.total}x</b>
                        </div>
                        <div>
                          Cada parcela: <b>{fmt(parcelsPreview.base)}</b>
                          {parcelsPreview.sobra > 0 && (
                            <>
                              {" "}
                              — <b>{parcelsPreview.sobra}</b> parcela
                              {parcelsPreview.sobra > 1 ? "s" : ""} terão +{fmt(1)}
                            </>
                          )}
                        </div>
                        <div className="opacity-80">
                          Período: de <b>{parcelsPreview.ymStart}</b> até{" "}
                          <b>{parcelsPreview.ymEnd}</b> (meses consecutivos).
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="bg-slate-800 rounded p-3">
                <div className="text-xs opacity-80 mb-2">Divisão por pessoa</div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="text-xs opacity-80 truncate">{paidAName}</span>
                    <input
                      className="bg-slate-700 w-16 h-9 p-1 rounded text-center
                                      [appearance:textfield]
                                      [&::-webkit-outer-spin-button]:appearance-none
                                      [&::-webkit-inner-spin-button]:appearance-none"
                      type="number"
                      min={0}
                      value={splitA}
                      onChange={(e) =>
                        setSplitA(parseInt(e.target.value || "0", 10))
                      }
                    />
                  </label>
                  <span className="opacity-60">:</span>
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="text-xs opacity-80 truncate">{paidBName}</span>
                    <input
                      className="bg-slate-700 w-16 h-9 p-1 rounded text-center
                                      [appearance:textfield]
                                      [&::-webkit-outer-spin-button]:appearance-none
                                      [&::-webkit-inner-spin-button]:appearance-none"
                      type="number"
                      min={0}
                      value={splitB}
                      onChange={(e) =>
                        setSplitB(parseInt(e.target.value || "0", 10))
                      }
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
                    {paidAName} 100%
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 h-8 bg-slate-700 rounded text-xs"
                    onClick={() => {
                      setSplitA(0);
                      setSplitB(1);
                    }}
                  >
                    {paidBName} 100%
                  </button>
                </div>

                {totalSplit === 0 && (
                  <p className="text-xs text-slate-400 mt-2">
                    Divisão 0:0 → será registrado como <b>despesa pessoal de{" "}
                    {paidBy === "A" ? paidAName : paidBName}</b> (não altera o saldo).
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                className="px-4 h-11 bg-slate-800 rounded"
                onClick={onClose}
                disabled={saving}
              >
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
