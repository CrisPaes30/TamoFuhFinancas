// src/components/settlement/SettleRangeModal.tsx
//
// Popup para PROPOR um acerto de período (substitui o antigo "Acertar agora"
// que fechava o mês na hora). Mostra preview ao vivo via previewSettlement
// (não grava nada) e só envia a proposta ao confirmar.

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { fromCents } from "@/lib/currency";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultStart: string; // YYYY-MM-DD
  defaultEnd: string; // YYYY-MM-DD
};

export default function SettleRangeModal({
  open,
  onClose,
  defaultStart,
  defaultEnd,
}: Props) {
  const couple = useStore((s) => s.couple);
  // seleciona expenses só pra forçar recálculo do preview quando a lista mudar
  // (previewSettlement lê get().expenses internamente, não é reativo sozinho)
  const expenses = useStore((s) => s.expenses);
  const previewSettlement = useStore((s) => s.previewSettlement);
  const proposeSettlement = useStore((s) => s.proposeSettlement);

  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPeriodStart(defaultStart);
    setPeriodEnd(defaultEnd);
  }, [open, defaultStart, defaultEnd]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const currency = (couple?.currency ?? "BRL") as "BRL" | "USD" | "EUR";
  const nameA = couple?.nameA ?? "Pessoa A";
  const nameB = couple?.nameB ?? "Pessoa B";

  const preview = useMemo(
    () => previewSettlement(periodStart, periodEnd),
    [previewSettlement, periodStart, periodEnd, expenses]
  );

  if (!open) return null;

  const debtorName =
    preview.debtor === "A" ? nameA : preview.debtor === "B" ? nameB : null;
  const creditorName =
    preview.debtor === "A" ? nameB : preview.debtor === "B" ? nameA : null;

  async function handleSubmit() {
    if (sending || preview.debtor === null) return;
    setSending(true);
    try {
      await proposeSettlement({ periodStart, periodEnd });
      onClose();
    } catch (e: any) {
      alert(e?.message || "Não foi possível enviar a proposta de acerto.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-xl mx-4">
        <div className="bg-slate-900 w-full p-5 rounded-2xl shadow-xl">
          <h3 className="text-lg font-semibold mb-1">Propor acerto</h3>
          <p className="text-xs opacity-70 mb-3">
            Seu parceiro(a) vai receber a proposta e precisa concordar antes de
            fechar.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs opacity-80">
              Início
              <input
                className="bg-slate-800 h-11 px-3 rounded"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs opacity-80">
              Fim
              <input
                className="bg-slate-800 h-11 px-3 rounded"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4">
            {preview.debtor === null ? (
              <p className="text-sm text-slate-400">
                Não há diferença a acertar neste período.
              </p>
            ) : (
              <p className="text-sm">
                <b>{debtorName}</b> deve {fromCents(preview.amount, currency)}{" "}
                para <b>{creditorName}</b>
              </p>
            )}

            {preview.items.length > 0 && (
              <div className="mt-2 bg-slate-800/70 rounded-lg p-2">
                <ul className="text-sm divide-y divide-slate-700">
                  {preview.items.map((item) => (
                    <li
                      key={item.expenseId}
                      className="py-2 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {item.title}
                        </div>
                        <div className="text-xs opacity-70">
                          {item.date} • {item.category}
                        </div>
                      </div>
                      <div className="whitespace-nowrap font-semibold">
                        {fromCents(item.amount, currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button
              className="px-4 h-11 bg-slate-800 rounded"
              onClick={onClose}
              disabled={sending}
            >
              Cancelar
            </button>
            <button
              className="px-4 h-11 bg-emerald-600 text-slate-950 font-semibold rounded disabled:opacity-60"
              onClick={handleSubmit}
              disabled={sending || preview.debtor === null}
            >
              {sending ? "Enviando..." : "Enviar proposta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
