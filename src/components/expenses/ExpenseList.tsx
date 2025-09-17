import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { fromCents } from "@/lib/currency";
import { toMonth, toMillis, toYMD } from "@/lib/dateFmt";

type ExpenseListProps = {
  ym?: string; // YYYY-MM para filtrar por mês
  onEdit?: (e: any) => void; // callback para abrir o modal em modo edição
};

export default function ExpenseList({ ym, onEdit }: ExpenseListProps) {
  const { expenses, removeExpense } = useStore();
  const [showAll, setShowAll] = useState(false);

  // filtra por mês, se informado
  const monthFiltered = useMemo(() => {
    const arr = expenses.filter((e) => !e.deleted);
    return ym ? arr.filter((e) => (toMonth(e.date) || "").startsWith(ym)) : arr;
  }, [expenses, ym]);

  // ordena por data (desc), com fallback em createdAt
  const items = useMemo(() => {
    return [...monthFiltered].sort((a, b) => {
      const da = toMillis(a.date) || toMillis(a.createdAt);
      const db = toMillis(b.date) || toMillis(b.createdAt);
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
          <li
            key={e.id}
            className="bg-slate-800 p-3 rounded flex items-center gap-3 justify-between"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">{e.title}</div>
              <div className="text-xs opacity-80">
                {toMillis(e.date)
                  ? new Date(toMillis(e.date)).toLocaleDateString("pt-BR")
                  : "—"}{" "}
                • {e.category}
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
          {ym
            ? "Sem despesas neste mês."
            : "Sem despesas ainda. Adicione a primeira! 🍫"}
        </p>
      )}

      {total > 5 && (
        <div className="flex justify-center mt-3">
          <button
            className="text-sm px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? "Mostrar menos"
              : `Ver mais ${remaining > 0 ? `(${remaining})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
