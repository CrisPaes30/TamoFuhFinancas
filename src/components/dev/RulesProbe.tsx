// src/components/dev/RulesProbe.tsx
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function RulesProbe() {
  const [msg, setMsg] = useState<string>("");

  async function testar() {
    const uid = auth.currentUser?.uid;
    if (!uid) { setMsg("Sem usuário logado"); return; }

    try {
      const u = await getDoc(doc(db, "users", uid));
      if (!u.exists()) { setMsg("users/{uid} não existe (ok criar depois)"); return; }

      const user = u.data() as any;
      let out = `users/${uid}: OK\n` + JSON.stringify(user, null, 2);

      if (user?.coupleId) {
        const c = await getDoc(doc(db, "couples", user.coupleId));
        out += `\n\ncouples/${user.coupleId}: ${c.exists() ? "OK" : "NÃO ENCONTRADO"}`;
      } else {
        out += `\n\nSem coupleId no user (mostra SetupCouple depois).`;
      }
      setMsg(out);
    } catch (e: any) {
      setMsg("Falhou: " + (e?.code || e?.message));
      console.error(e);
    }
  }

  return (
    <div className="p-3 text-xs bg-slate-900/60 rounded-lg">
      <button className="px-2 py-1 rounded bg-emerald-600" onClick={testar}>
        Testar regras Firestore
      </button>
      {msg && <pre className="mt-2 whitespace-pre-wrap">{msg}</pre>}
    </div>
  );
}
