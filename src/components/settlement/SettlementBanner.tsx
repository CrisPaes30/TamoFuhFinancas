// src/components/settlement/SettlementBanner.tsx
//
// Lista TODAS as propostas de acerto ativas (status "pending"/"contested") do
// casal, qualquer período. Quem propôs vê "aguardando"/"contestado" + Cancelar;
// quem recebeu vê o detalhamento + Concordar/Contestar. Não há mapeamento
// uid->"A"/"B" no modelo de dados, então "o outro" nunca é tratado por nome
// A/B aqui — só por proposedByName (denormalizado) ou um genérico "seu
// parceiro(a)" quando não disponível.

import { useState } from "react";
import { useStore } from "@/store";
import { fromCents } from "@/lib/currency";

function formatPeriod(start: string, end: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  };
  return `${fmt(start)} a ${fmt(end)}`;
}

export default function SettlementBanner() {
  const settlements = useStore((s) => s.settlements ?? []);
  const couple = useStore((s) => s.couple);
  const profile = useStore((s) => s.profile);
  const respondSettlement = useStore((s) => s.respondSettlement);
  const cancelSettlement = useStore((s) => s.cancelSettlement);

  const [contestingId, setContestingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const myUid = profile?.uid;
  const nameA = couple?.nameA ?? "Pessoa A";
  const nameB = couple?.nameB ?? "Pessoa B";
  const currency = (couple?.currency ?? "BRL") as "BRL" | "USD" | "EUR";

  const active = settlements.filter(
    (s) => s.status === "pending" || s.status === "contested"
  );

  if (active.length === 0) return null;

  async function handleAgree(id: string) {
    setBusyId(id);
    try {
      await respondSettlement(id, "agree");
    } catch (e: any) {
      alert(e?.message || "Não foi possível concordar com o acerto.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleContest(id: string) {
    const note = (noteDrafts[id] || "").trim();
    setBusyId(id);
    try {
      await respondSettlement(id, "contest", note || undefined);
      setContestingId(null);
      setNoteDrafts((d) => ({ ...d, [id]: "" }));
    } catch (e: any) {
      alert(e?.message || "Não foi possível contestar o acerto.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: string) {
    setBusyId(id);
    try {
      await cancelSettlement(id);
    } catch (e: any) {
      alert(e?.message || "Não foi possível cancelar a proposta.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-3">
      {active.map((s) => {
        const mine = s.proposedBy === myUid;
        const debtorName = s.debtor === "A" ? nameA : nameB;
        const creditorName = s.debtor === "A" ? nameB : nameA;
        const lastContest = [...s.responses]
          .reverse()
          .find((r) => r.action === "contest");
        const busy = busyId === s.id;

        return (
          <div
            key={s.id}
            className="bg-slate-900 border border-indigo-500/30 p-4 rounded-2xl"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wide opacity-60">
                  Acerto proposto
                </div>
                <div className="font-semibold">
                  {formatPeriod(s.periodStart, s.periodEnd)}
                </div>
              </div>
              {s.status === "contested" && (
                <span className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Contestado
                </span>
              )}
            </div>

            <p className="text-sm mt-2">
              <b>{debtorName}</b> deve {fromCents(s.amount, currency)} para{" "}
              <b>{creditorName}</b>
            </p>

            {mine ? (
              <>
                <p className="text-sm opacity-80 mt-1">
                  {s.status === "pending"
                    ? "Aguardando confirmação de seu parceiro(a)."
                    : "Seu parceiro(a) contestou esta proposta."}
                </p>

                {s.status === "contested" && lastContest?.note && (
                  <div className="mt-2 bg-slate-800/70 rounded-lg p-2 text-sm">
                    <span className="opacity-70">Nota da contestação: </span>
                    {lastContest.note}
                  </div>
                )}

                <div className="mt-3">
                  <button
                    className="bg-red-600/80 hover:bg-red-600 px-3 py-2 rounded text-slate-50 font-semibold disabled:opacity-50"
                    onClick={() => handleCancel(s.id)}
                    disabled={busy}
                  >
                    {busy ? "Cancelando..." : "Cancelar proposta"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs opacity-70 mt-1">
                  Proposto por {s.proposedByName || "seu parceiro(a)"}
                </p>

                {s.snapshot.length > 0 && (
                  <div className="mt-2 bg-slate-800/70 rounded-lg p-2">
                    <ul className="text-sm divide-y divide-slate-700">
                      {s.snapshot.map((item) => (
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

                {s.status === "contested" && lastContest?.note && (
                  <div className="mt-2 bg-slate-800/70 rounded-lg p-2 text-sm">
                    <span className="opacity-70">
                      Sua contestação anterior:{" "}
                    </span>
                    {lastContest.note}
                  </div>
                )}

                <div className="mt-3 flex gap-2 flex-wrap items-start">
                  <button
                    className="bg-emerald-600/90 hover:bg-emerald-600 px-3 py-2 rounded text-slate-950 font-semibold disabled:opacity-50"
                    onClick={() => handleAgree(s.id)}
                    disabled={busy}
                  >
                    {busy ? "Processando..." : "Concordar"}
                  </button>

                  {contestingId === s.id ? (
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                      <textarea
                        className="bg-slate-800 px-3 py-2 rounded text-sm w-full sm:w-64"
                        placeholder="Explique o motivo da contestação (opcional)"
                        value={noteDrafts[s.id] || ""}
                        onChange={(e) =>
                          setNoteDrafts((d) => ({
                            ...d,
                            [s.id]: e.target.value,
                          }))
                        }
                      />
                      <div className="flex gap-2">
                        <button
                          className="bg-rose-600/90 hover:bg-rose-600 px-3 py-2 rounded text-slate-50 font-semibold disabled:opacity-50"
                          onClick={() => handleContest(s.id)}
                          disabled={busy}
                        >
                          Enviar contestação
                        </button>
                        <button
                          className="bg-slate-800 px-3 py-2 rounded"
                          onClick={() => setContestingId(null)}
                          disabled={busy}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="bg-rose-600/80 hover:bg-rose-600 px-3 py-2 rounded text-slate-50 font-semibold"
                      onClick={() => setContestingId(s.id)}
                      disabled={busy}
                    >
                      Contestar
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
