// src/components/invite/ShareInviteBar.tsx
import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { getOrCreateInviteCode } from "@/services/couple";

export default function ShareInviteBar() {
  const couple  = useStore((s) => s.couple);
  const profile = useStore((s) => s.profile);
  const coupleId = couple?.id;
  const uid      = profile?.uid;

  const [code, setCode]       = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  useEffect(() => {
    if (!coupleId || !uid) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const c = await getOrCreateInviteCode(coupleId, uid);
        setCode(c);
      } catch (e: any) {
        setErr(e?.message ?? "Falha ao obter código.");
      } finally {
        setLoading(false);
      }
    })();
  }, [coupleId, uid]);

  if (!coupleId || !uid) return null;

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="flex flex-wrap items-center gap-2 justify-end text-xs mb-2">
      <span className="opacity-70">CÓDIGO COMPARTILHADO:</span>
      <code className="bg-slate-800/80 px-2 py-1 rounded font-mono tracking-wider min-w-[4.5rem] text-center">
        {loading ? "..." : (code ?? "—")}
      </code>
      <button
        onClick={handleCopy}
        disabled={!code || loading}
        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-60"
      >
        {copied ? "Copiado!" : "Copiar"}
      </button>
      {err && <div className="text-rose-400 ml-2">{err}</div>}
    </div>
  );
}
