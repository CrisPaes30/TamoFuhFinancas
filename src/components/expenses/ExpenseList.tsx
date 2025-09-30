// src/components/expenses/ExpenseList.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store";
import { fromCents } from "@/lib/currency";
import { monthLabelPT } from "@/lib/date";
import { Pencil, Trash2 } from "lucide-react"; // ✅ ícones

type Props = {
  ym: string; // YYYY-MM
  onEdit?: (e: any) => void;
};

function normalize(s: any): string {
  if (s == null) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toYMD(d: any): string {
  try {
    if (!d) return "";
    if (typeof d?.toDate === "function") return d.toDate().toISOString().slice(0, 10);
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    if (typeof d === "string") return d.slice(0, 10);
  } catch {}
  return "";
}

export default function ExpenseList({ ym, onEdit }: Props) {
  const currency = useStore((s) => s.couple?.currency ?? "BRL");
  const expenses = useStore((s) => s.expenses ?? []);
  const deleteExpense = useStore((s) => s.deleteExpense);

  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // atalho: "/" foca o campo
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if (
        ev.key === "/" &&
        document.activeElement !== inputRef.current &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        ev.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const totalDoMes = useMemo(
    () =>
      expenses.filter(
        (e: any) => !e?.deleted && (e?.ym || toYMD(e?.date).slice(0, 7)) === ym
      ),
    [expenses, ym]
  );

  const filtered = useMemo(() => {
    const nq = normalize(q);
    if (!nq) return totalDoMes;

    return totalDoMes.filter((e: any) => {
      const title = normalize(e?.title);
      const cat = normalize(e?.category);
      const val = normalize((e?.amount ?? 0) / 100);
      const d = normalize(toYMD(e?.date));
      return title.includes(nq) || cat.includes(nq) || val.includes(nq) || d.includes(nq);
    });
  }, [q, totalDoMes]);

  const clear = () => setQ("");

  return (
    <div className="bg-slate-900 rounded-2xl">
      {/* Cabeçalho com busca */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") clear();
              }}
              placeholder="Pesquisar despesa… ( / )"
              className="w-full bg-slate-800/80 rounded px-3 py-2 pr-16 outline-none focus:ring-2 focus:ring-emerald-600/50"
            />
            {q && (
              <button
                onClick={clear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 bg-slate-700 rounded hover:bg-slate-600"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        <div className="text-xs opacity-70 whitespace-nowrap">
          {filtered.length} de {totalDoMes.length}
        </div>
      </div>

      {/* Lista */}
      <ul className="divide-y divide-slate-800">
        {filtered.map((e: any) => (
          <li key={e.id} className="px-3 py-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium">{e.title || "(sem título)"}</div>
              <div className="text-xs opacity-70">
                {toYMD(e.date)} • {e.category || "Outros"}
              </div>
            </div>

            <div className="text-right font-semibold">
              {fromCents(e.amount ?? 0, currency)}
            </div>

            <div className="flex gap-2">
              {/* Botão editar */}
              <button
                className="p-1 rounded hover:bg-slate-700"
                onClick={() => onEdit?.(e)}
                title="Editar"
              >
                <Pencil size={16} />
              </button>

              {/* Botão excluir */}
              <button
                className="p-1 rounded hover:bg-red-700 text-red-400"
                onClick={async () => {
                  const ok = window.confirm(
                    `Excluir a despesa "${e.title || "(sem título)"}"?`
                  );
                  if (!ok) return;
                  try {
                    await deleteExpense(e.id);
                  } catch (err) {
                    console.error(err);
                    alert("Não foi possível excluir a despesa.");
                  }
                }}
                title="Excluir"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm opacity-70">
            Nenhuma despesa encontrada em {monthLabelPT(ym)} para “{q}”.
          </li>
        )}
      </ul>
    </div>
  );
}
