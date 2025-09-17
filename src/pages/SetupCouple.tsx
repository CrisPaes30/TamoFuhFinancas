// src/pages/SetupCouple.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useStore } from "@/store";
import Logo from "@/components/Logo";
import { joinCoupleWithCode } from "@/services/couple"; // ⬅️ IMPORTANTE

export default function SetupCouple() {
  const profile = useStore((s) => s.profile ?? null);
  const uid = useMemo(() => profile?.uid ?? auth.currentUser?.uid ?? null, [profile]);
  const displayName = profile?.displayName ?? auth.currentUser?.displayName ?? "";

  // passos/telas
  const [step, setStep] = useState<"cta" | "form">("cta");
  // modo dentro do form
  const [mode, setMode] = useState<"create" | "join">("create");

  // form "criar"
  const [nameA, setA] = useState("Você");
  const [nameB, setB] = useState("Parceiro(a)");
  const [currency, setCur] = useState<"BRL" | "USD" | "EUR">("BRL");

  // form "entrar"
  const [code, setCode] = useState("");

  const [savingForm, setSavingForm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const formCardRef = useRef<HTMLDivElement | null>(null);
  const inputARef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === "form") {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => inputARef.current?.focus(), 250);
    }
  }, [step]);

  if (!uid) {
    return <div className="p-4 text-sm opacity-70">Entre para criar seu casal.</div>;
  }

  async function linkUserToCouple(coupleId: string) {
    await updateDoc(doc(db, "users", uid), { coupleId, updatedAt: Date.now() });
  }

  async function createCouple(payload: {
    nameA: string;
    nameB: string;
    currency: "BRL" | "USD" | "EUR";
  }) {
    // (se preferir, troque por createCoupleFor(uid, payload) da sua service)
    const newCouple = await addDoc(collection(db, "couples"), {
      owner: uid,
      members: [uid],
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await linkUserToCouple(newCouple.id);
  }

  const handleGoToForm = () => {
    const first = (displayName || "").split(" ")[0] || "Você";
    if (!nameA || nameA === "Você") setA(first);
    setStep("form");
  };

  const handleSaveCreate = async () => {
    try {
      setSavingForm(true);
      setErr(null);
      await createCouple({
        nameA: (nameA || "").trim() || "Você",
        nameB: (nameB || "").trim() || "Parceiro(a)",
        currency,
      });
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao salvar casal.");
    } finally {
      setSavingForm(false);
    }
  };

  const handleJoin = async () => {
    try {
      setSavingForm(true);
      setErr(null);
      await joinCoupleWithCode(uid, code);
      // RequireAuth/onSnapshot assume a navegação
    } catch (e: any) {
      setErr(e?.message ?? "Não foi possível entrar com este código.");
    } finally {
      setSavingForm(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-8 py-10 sm:py-16">
      {/* ETAPA 1 — CTA centralizado */}
      {step === "cta" && (
        <section className="min-h-[40vh] flex items-center justify-center">
          <div className="relative w-full">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(600px 300px at 50% 20%, rgba(56,189,248,0.15), rgba(0,0,0,0))",
              }}
            />
            <div className="relative bg-slate-900/70 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/5 text-center">
              <div className="flex flex-col items-center">
                <Logo size={110} />
                <div className="mt-3 text-[11px] uppercase tracking-wider text-slate-400">
                  finanças em casal
                </div>
                <h2 className="mt-2 text-lg sm:text-xl font-semibold">Comece criando seu casal</h2>
                <p className="mt-1 text-sm opacity-80">
                  Vamos criar o espaço de vocês. Depois você convida sua/seu parceira(o) ou entra com um código.
                </p>

                {err && <div className="mt-3 text-red-400 text-xs">{err}</div>}

                <button
                  onClick={handleGoToForm}
                  className="mt-5 w-full px-4 py-3 rounded-md bg-emerald-600/90 hover:bg-emerald-600 text-slate-950 font-semibold"
                >
                  Avançar
                </button>

                <div className="mt-2 text-xs opacity-60">
                  Logado como <span className="opacity-90">{displayName || uid}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ETAPA 2 — FORM: abas Criar / Entrar */}
      {step === "form" && (
        <section ref={formCardRef} className="mt-4">
          <div className="bg-slate-900 p-5 sm:p-6 rounded-2xl shadow">
            {/* Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMode("create")}
                className={`px-3 py-2 rounded ${mode === "create" ? "bg-slate-800" : "bg-slate-700/50"}`}
              >
                Criar casal
              </button>
              <button
                onClick={() => setMode("join")}
                className={`px-3 py-2 rounded ${mode === "join" ? "bg-slate-800" : "bg-slate-700/50"}`}
              >
                Entrar com código
              </button>
            </div>

            {mode === "create" ? (
              <>
                <h3 className="text-lg font-semibold mb-3">Criar casal (personalizado)</h3>
                <div className="grid gap-3">
                  <input
                    ref={inputARef}
                    className="bg-slate-800 p-2 rounded placeholder-slate-400"
                    value={nameA}
                    onChange={(e) => setA(e.target.value)}
                    placeholder="Você"
                    autoComplete="name"
                  />
                  <input
                    className="bg-slate-800 p-2 rounded placeholder-slate-400"
                    value={nameB}
                    onChange={(e) => setB(e.target.value)}
                    placeholder="Parceiro(a)"
                    autoComplete="name"
                  />
                  <select
                    className="bg-slate-800 p-2 rounded"
                    value={currency}
                    onChange={(e) => setCur(e.target.value as any)}
                  >
                    <option>BRL</option>
                    <option>USD</option>
                    <option>EUR</option>
                  </select>

                  {err && <div className="text-red-400 text-xs">{err}</div>}

                  <button
                    className="bg-green-500 text-slate-950 font-semibold py-2 rounded disabled:opacity-60"
                    onClick={handleSaveCreate}
                    disabled={savingForm}
                  >
                    {savingForm ? "Salvando…" : "Salvar casal"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-3">Entrar em um casal</h3>
                <div className="grid gap-3">
                  <input
                    className="bg-slate-800 p-2 rounded uppercase tracking-[0.2em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="CÓDIGO (ex.: 7F3K9C)"
                    maxLength={12}
                  />
                  {err && <div className="text-red-400 text-xs">{err}</div>}
                  <button
                    className="bg-emerald-600/90 hover:bg-emerald-600 px-4 py-2 rounded text-slate-950 font-semibold disabled:opacity-60"
                    onClick={handleJoin}
                    disabled={savingForm || code.trim().length < 5}
                  >
                    {savingForm ? "Entrando…" : "Entrar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
