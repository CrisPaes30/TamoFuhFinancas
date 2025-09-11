import { useMemo, useState, useEffect } from "react";
import { Provider, useStore } from "./store";
import { fromCents, toCents, computeShares } from "./utils";
import "./index.css";
import Logo from "./components/Logo";
import { analyzeMonth, lastMonthsYM, sliceByMonth } from "./insights";

export default function AppRoot() {
  return (
    <Provider>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
        <div className="max-w-xl mx-auto">
          <Header />
          <Main />
        </div>
      </div>
    </Provider>
  );
}

// Helpers de mês
function getCurrentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabelPT(ym: string) {
  const d = new Date(`${ym}-01T00:00:00`);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function Header() {
  const { couple } = useStore();
  return (
    <header className="mb-4 flex items-center justify-between">
      <div className="leading-tight">
        <div className="text-xs uppercase tracking-wider text-slate-300">
          finanças em casal
        </div>
      </div>
      <span className="text-sm opacity-80">
        {couple ? `${couple.nameA} & ${couple.nameB}` : "sem casal"}
      </span>
    </header>
  );
}

function Main() {
  const { couple } = useStore();
  return couple ? <Dashboard /> : <SetupCouple />;
}

function SetupCouple() {
  const { setCouple } = useStore();
  const [nameA, setA] = useState("Você");
  const [nameB, setB] = useState("Parça");
  const [currency, setCur] = useState("BRL");

  return (
    <div className="bg-slate-900 p-5 rounded-2xl shadow">
      <div className="flex flex-col items-center gap-3 mb-4">
        <Logo size={140} />
        <p className="text-sm text-slate-300 text-center">
          Gerencie suas finanças de forma compartilhada
        </p>
      </div>

      <h2 className="text-xl font-semibold mb-3">Criar casal</h2>
      <div className="grid gap-3">
        <input
          className="bg-slate-800 p-2 rounded"
          value={nameA}
          onChange={(e) => setA(e.target.value)}
          placeholder="Nome A"
        />
        <input
          className="bg-slate-800 p-2 rounded"
          value={nameB}
          onChange={(e) => setB(e.target.value)}
          placeholder="Nome B"
        />
        <select
          className="bg-slate-800 p-2 rounded"
          value={currency}
          onChange={(e) => setCur(e.target.value)}
        >
          <option>BRL</option>
          <option>USD</option>
          <option>EUR</option>
        </select>
        <button
          className="bg-green-500 text-slate-950 font-semibold py-2 rounded"
          onClick={() =>
            setCouple({
              id: crypto.randomUUID(),
              nameA,
              nameB,
              currency,
              createdAt: Date.now(),
            })
          }
        >
          Salvar casal
        </button>
      </div>
    </div>
  );
}

function Dashboard() {
  const { couple, expenses } = useStore();
  const [openForm, setOpenForm] = useState(false);
  const [openIncome, setOpenIncome] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentYM());
  const [editing, setEditing] = useState<any | null>(null);

  const { saldoA } = useMemo(() => {
    if (!couple) return { saldoA: 0 };
    let sA = 0;
    for (const e of expenses.filter((e) => !e.deleted)) {
      const { Va, Vb } = computeShares(
        e.amount,
        e.split.a,
        e.split.b,
        e.paidBy
      );
      if (e.paidBy === "A") sA += e.amount - Va;
      else sA -= e.amount - Vb;
    }
    return { saldoA: sA };
  }, [expenses, couple]);

  const msg =
    saldoA >= 0
      ? `${couple!.nameB} deve ${fromCents(saldoA, couple!.currency)} para ${
          couple!.nameA
        }`
      : `${couple!.nameA} deve ${fromCents(-saldoA, couple!.currency)} para ${
          couple!.nameB
        }`;

  return (
    <div className="grid gap-4">
      <div className="bg-slate-900 p-4 rounded-2xl">
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

      {/* MODAIS */}
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

      {/* Filtro de mês para gráficos/análises e lista */}
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

      <ExpenseList ym={selectedMonth} onEdit={(exp) => setEditing(exp)} />
      <StatsSection ym={selectedMonth} />
      <InsightsSection ym={selectedMonth} />
    </div>
  );
}

function InsightsSection({ ym }: { ym: string }) {
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
          <li key={i} className="leading-snug">{t}</li>
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

function StatBox({
  label, value, currency, emphasis,
}: { label: string; value: number; currency?: string; emphasis?: boolean; }) {
  const cls = emphasis ? (value >= 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-200";
  return (
    <div className="bg-slate-800 rounded p-2">
      <div className="text-xs opacity-70">{label}</div>
      <div className={`font-semibold ${cls}`}>{fromCents(value, currency)}</div>
    </div>
  );
}

/* -------------------- FORM DESPESA (com edição) -------------------- */

function ExpenseForm({
  open, onClose, editing,
}: { open: boolean; onClose(): void; editing?: any | null }) {
  const { couple, addExpense, updateExpense } = useStore();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState<"A" | "B">("A");
  const [splitA, setSplitA] = useState(1);
  const [splitB, setSplitB] = useState(1);
  const [category, setCategory] = useState("Outros");

  const [isFixed, setIsFixed] = useState(false);
  const [fixedKind, setFixedKind] = useState<"Agua" | "Luz" | "Internet" | "Aluguel" | "Outros">("Outros");
  const [isCard, setIsCard] = useState(false);
  const [installments, setInstallments] = useState(1);

  // trava scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // pré-preenche ao entrar em modo edição
  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title || "");
    setAmount(((editing.amount || 0) / 100).toFixed(2).replace(".", ","));
    setDate(editing.date || new Date().toISOString().slice(0, 10));
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl mx-4">
        <div className="bg-slate-900 w-full p-5 rounded-2xl shadow-xl">
          <h3 className="text-lg font-semibold mb-3">
            {editing ? "Editar despesa" : "Nova despesa"}
          </h3>

          <div className="grid gap-3">
            <input className="bg-slate-800 h-11 px-3 rounded" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Bombom" />
            <input className="bg-slate-800 h-11 px-3 rounded" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Valor (ex.: 3,50)" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="bg-slate-800 h-11 px-3 rounded" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <select className="bg-slate-800 h-11 px-3 rounded" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option>Alimentação</option><option>Transporte</option><option>Mercado</option>
                <option>Lazer</option><option>Moradia</option><option>Outros</option>
              </select>
            </div>

            {/* Tipo/pagamento + divisão */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div className="bg-slate-800 rounded p-3">
                <div className="text-xs opacity-80 mb-2">Tipo e pagamento</div>

                <label className="flex items-center gap-2 mb-2">
                  <input type="checkbox" className="accent-green-500" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} />
                  <span className="text-sm">Despesa fixa</span>
                </label>

                {isFixed && (
                  <div className="mb-3">
                    <select className="bg-slate-700 h-10 px-3 rounded w-full" value={fixedKind} onChange={(e) => setFixedKind(e.target.value as any)}>
                      <option value="Agua">Água</option>
                      <option value="Luz">Luz</option>
                      <option value="Internet">Internet</option>
                      <option value="Aluguel">Aluguel</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                )}

                <label className="flex items-center gap-2 mb-2">
                  <input type="checkbox" className="accent-green-500" checked={isCard} onChange={(e) => setIsCard(e.target.checked)} />
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
                      type="number" min={1} value={installments}
                      onChange={(e) => setInstallments(Math.max(1, parseInt(e.target.value || "1")))}
                    />
                  </div>
                )}
              </div>

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
                      type="number" min={0} value={splitA}
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
                      type="number" min={0} value={splitB}
                      onChange={(e) => setSplitB(parseInt(e.target.value || "0"))}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" className="px-2 py-1 h-8 bg-slate-700 rounded text-xs" onClick={() => { setSplitA(1); setSplitB(1); }}>
                    50 / 50
                  </button>
                  <button type="button" className="px-2 py-1 h-8 bg-slate-700 rounded text-xs" onClick={() => { setSplitA(1); setSplitB(0); }}>
                    {couple?.nameA} 100%
                  </button>
                  <button type="button" className="px-2 py-1 h-8 bg-slate-700 rounded text-xs" onClick={() => { setSplitA(0); setSplitB(1); }}>
                    {couple?.nameB} 100%
                  </button>
                </div>

                {(Number(splitA) || 0) + (Number(splitB) || 0) === 0 && (
                  <p className="text-xs text-slate-400 mt-2">
                    Divisão 0:0 → será registrado como <b>despesa pessoal de {paidBy === "A" ? couple?.nameA : couple?.nameB}</b> (não altera o saldo).
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button className="px-4 h-11 bg-slate-800 rounded" onClick={onClose}>Cancelar</button>
              <button
                className="px-4 h-11 bg-green-500 text-slate-950 font-semibold rounded"
                onClick={async () => {
                  if (!couple) return;
                  const payload = {
                    coupleId: couple.id,
                    title: title.trim(),
                    amount: toCents(amount),
                    paidBy,
                    date,
                    category,
                    split: {
                      a: Number.isFinite(splitA) ? Math.max(0, splitA) : 0,
                      b: Number.isFinite(splitB) ? Math.max(0, splitB) : 0,
                    },
                    isFixed,
                    fixedKind,
                    isCard,
                    installments,
                    updatedAt: Date.now(),
                  };

                  if (editing) {
                    await updateExpense(editing.id, payload);
                  } else {
                    await addExpense({
                      id: crypto.randomUUID(),
                      ...payload,
                      createdAt: Date.now(),
                    });
                  }
                  onClose();
                }}
              >
                {editing ? "Salvar alterações" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- FORM RENDA -------------------- */

function IncomeForm({ open, onClose }: { open: boolean; onClose(): void }) {
  const { couple, setCouple } = useStore();

  const [idEditing, setIdEditing] = useState<string | null>(null);
  const [person, setPerson] = useState<"A" | "B">("A");
  const [source, setSource] = useState("Salário");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const incomes = (couple?.incomes || []) as Array<{
    id: string; person: "A" | "B"; source: string; amount: number; month: string;
  }>;

  const monthList = incomes.filter((i) => i.month === month).sort((a, b) => b.amount - a.amount);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setIdEditing(null); setPerson("A"); setSource("Salário"); setAmount("");
    const d = new Date();
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !couple) return null;

  function clearForm() {
    setIdEditing(null); setPerson("A"); setSource("Salário"); setAmount("");
  }

  function saveIncome() {
    const cents = toCents(amount);
    if (cents <= 0) return;

    const next = [...incomes];
    if (idEditing) {
      const idx = next.findIndex((i) => i.id === idEditing);
      if (idx >= 0) next[idx] = { ...next[idx], person, source, amount: cents, month };
    } else {
      next.push({ id: crypto.randomUUID(), person, source: source.trim() || "Renda", amount: cents, month });
    }
    setCouple({ ...couple, incomes: next, updatedAt: Date.now() });
    clearForm();
  }

  function editIncome(id: string) {
    const it = incomes.find((i) => i.id === id);
    if (!it) return;
    setIdEditing(it.id); setPerson(it.person); setSource(it.source);
    setAmount((it.amount / 100).toFixed(2).replace(".", ",")); setMonth(it.month);
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

          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm opacity-80">Mês</span>
            <input type="month" className="bg-slate-800 h-10 px-3 rounded" value={month} onChange={(e) => setMonth(e.target.value)} />
            <span className="ml-auto text-sm opacity-80">
              Total do mês: <b>{fromCents(totalMonth, couple.currency)}</b>
            </span>
          </div>

          <div className="grid sm:grid-cols-4 gap-3">
            <select className="bg-slate-800 h-11 px-3 rounded" value={person} onChange={(e) => setPerson(e.target.value as "A" | "B")}>
              <option value="A">{couple.nameA}</option>
              <option value="B">{couple.nameB}</option>
            </select>
            <input className="bg-slate-800 h-11 px-3 rounded sm:col-span-2" placeholder="Fonte (ex.: Salário, Freela, Bônus...)" value={source} onChange={(e) => setSource(e.target.value)} />
            <input className="bg-slate-800 h-11 px-3 rounded" placeholder="Valor (ex.: 2.500,00)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div className="flex gap-2 justify-end mt-3">
            {idEditing && <button className="px-3 h-10 bg-slate-800 rounded" onClick={clearForm}>Cancelar edição</button>}
            <button className="px-4 h-10 bg-emerald-500 text-slate-950 font-semibold rounded" onClick={saveIncome}>
              {idEditing ? "Salvar alterações" : "Adicionar renda"}
            </button>
          </div>

          <div className="mt-4">
            <div className="text-sm opacity-80 mb-2">Rendas deste mês</div>
            {monthList.length === 0 && <p className="text-xs opacity-60">Nenhuma renda lançada para este mês.</p>}
            <ul className="grid gap-2">
              {monthList.map((i) => (
                <li key={i.id} className="bg-slate-800 p-3 rounded flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.source} • {i.person === "A" ? couple.nameA : couple.nameB}</div>
                    <div className="text-xs opacity-80">{i.month}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="font-semibold">{fromCents(i.amount, couple.currency)}</div>
                    <button className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded" onClick={() => editIncome(i.id)}>Editar</button>
                    <button className="text-xs bg-red-600/80 hover:bg-red-600 px-2 py-1 rounded text-white" onClick={() => removeIncome(i.id)}>Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end mt-4">
            <button className="px-4 h-11 bg-slate-800 rounded" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- LISTA (com ver mais e editar) -------------------- */

function ExpenseList({ ym, onEdit }: { ym?: string; onEdit?: (e:any)=>void }) {
  const { expenses, removeExpense } = useStore();
  const [showAll, setShowAll] = useState(false);

  const monthFiltered = useMemo(() => {
    const arr = expenses.filter((e) => !e.deleted);
    return ym ? arr.filter((e) => (e.date || "").startsWith(ym)) : arr;
  }, [expenses, ym]);

  const items = useMemo(() => {
    return [...monthFiltered].sort((a, b) => {
      const da = new Date(a.date || 0).getTime() || a.createdAt || 0;
      const db = new Date(b.date || 0).getTime() || b.createdAt || 0;
      return db - da;
    });
  }, [monthFiltered]);

  const total = items.length;
  const visible = showAll ? items : items.slice(0, 5);
  const remaining = Math.max(0, total - 5);

  async function handleDelete(id: string, title: string) {
    const ok = window.confirm(`Excluir a despesa "${title}"?`);
    if (!ok) return;
    await removeExpense(id);
  }

  return (
    <div className="bg-slate-900 p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Despesas</h3>
        {total > 0 && (
          <span className="text-xs opacity-70">
            {showAll ? `${total} itens` : `${Math.min(5, total)} de ${total}`}
          </span>
        )}
      </div>

      <ul className="grid gap-2">
        {visible.map((e) => (
          <li key={e.id} className="bg-slate-800 p-3 rounded flex items-center gap-3 justify-between">
            <div className="min-w-0">
              <div className="font-medium truncate">{e.title}</div>
              <div className="text-xs opacity-80">
                {new Date(e.date).toLocaleDateString("pt-BR")} • {e.category}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="font-semibold">{fromCents(e.amount)}</div>

              {/* Editar */}
              <button
                onClick={() => onEdit?.(e)}
                className="inline-flex items-center justify-center rounded-md bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs font-semibold text-white"
                aria-label={`Editar ${e.title}`}
                title="Editar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                  className="h-4 w-4" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>

              {/* Excluir */}
              <button
                onClick={() => handleDelete(e.id, e.title)}
                className="inline-flex items-center justify-center rounded-md bg-red-600/80 hover:bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                aria-label={`Excluir ${e.title}`}
                title="Excluir"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                  className="h-4 w-4" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                  <path d="M10 11v6"></path>
                  <path d="M14 11v6"></path>
                  <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>

      {total === 0 && (
        <p className="opacity-70 mt-2">
          {ym ? "Sem despesas neste mês." : "Sem despesas ainda. Adicione a primeira! 🍫"}
        </p>
      )}

      {total > 5 && (
        <div className="flex justify-center mt-3">
          <button
            className="text-sm px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Mostrar menos" : `Ver mais ${remaining > 0 ? `(${remaining})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------- GRÁFICOS / INSIGHTS -------------------- */

function StatsSection({ ym }: { ym: string }) {
  const { expenses, couple } = useStore();

  const monthItems = useMemo(
    () => expenses.filter((e) => !e.deleted && (e.date || "").startsWith(ym)),
    [expenses, ym]
  );

  const totalOut = monthItems.reduce((acc, e) => acc + e.amount, 0);

  const incomes = (couple?.incomes || []).filter((i: any) => i.month === ym);
  const incomeA = incomes.filter((i: any) => i.person === "A").reduce((s: number, i: any) => s + i.amount, 0);
  const incomeB = incomes.filter((i: any) => i.person === "B").reduce((s: number, i: any) => s + i.amount, 0);
  const totalIn = incomeA + incomeB;
  const saved = totalIn - totalOut;

  const catMap = new Map<string, number>();
  for (const e of monthItems) catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount);
  const catList = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  let paidA = 0, paidB = 0;
  for (const e of monthItems) { if (e.paidBy === "A") paidA += e.amount; else paidB += e.amount; }

  const maxBar = Math.max(totalIn, totalOut, 1);

  return (
    <div className="bg-slate-900 p-4 rounded-2xl grid gap-4">
      <h3 className="font-semibold">Visão do mês — {monthLabelPT(ym)}</h3>

      <div>
        <div className="text-sm mb-2 opacity-80">Renda x Despesas</div>
        <div className="grid gap-2">
          <Bar label={`Renda ${couple?.nameA}`} value={incomeA} max={maxBar} color="bg-emerald-500" right={fromCents(incomeA, couple?.currency)} />
          <Bar label={`Renda ${couple?.nameB}`} value={incomeB} max={maxBar} color="bg-emerald-400" right={fromCents(incomeB, couple?.currency)} />
          <Bar label="Total de despesas" value={totalOut} max={maxBar} color="bg-rose-500" right={fromCents(totalOut, couple?.currency)} />
        </div>
        <div className={`mt-2 text-sm ${saved >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {saved >= 0 ? `Sobra: ${fromCents(saved, couple?.currency)}` : `Faltam: ${fromCents(-saved, couple?.currency)}`}
        </div>
      </div>

      <div>
        <div className="text-sm mb-2 opacity-80">Gastos por categoria</div>
        {catList.length === 0 && <p className="text-xs opacity-70">Sem gastos neste mês.</p>}
        <div className="grid gap-2">
          {catList.map(([cat, v]) => (
            <Bar key={cat} label={cat} value={v} max={Math.max(catList[0][1], 1)} color="bg-sky-500" right={fromCents(v, couple?.currency)} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm mb-2 opacity-80">Quem pagou no mês</div>
        <div className="grid gap-2">
          <Bar label={couple?.nameA || "Pessoa A"} value={paidA} max={Math.max(paidA, paidB, 1)} color="bg-indigo-500" right={fromCents(paidA, couple?.currency)} />
          <Bar label={couple?.nameB || "Pessoa B"} value={paidB} max={Math.max(paidA, paidB, 1)} color="bg-indigo-400" right={fromCents(paidB, couple?.currency)} />
        </div>
      </div>
    </div>
  );
}

function Bar({
  label, value, max, color, right,
}: { label: string; value: number; max: number; color: string; right?: string; }) {
  const pct = Math.max(4, Math.round((value / (max || 1)) * 100));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="opacity-80">{label}</span>
        {right && <span className="opacity-80">{right}</span>}
      </div>
      <div className="h-3 w-full rounded bg-slate-800 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
