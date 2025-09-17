// src/dev/DebugCouple.tsx
import { auth, db } from "@/lib/firebase";
import { doc, getDocFromServer } from "firebase/firestore";
import { useEffect, useState } from "react";

export default function DebugCouple() {
  if (!import.meta.env.DEV) return null;
  const [out, setOut] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) { setOut("sem usuário"); return; }

        const uref = doc(db, "users", uid);
        const u = await getDocFromServer(uref); // <-- BYPASS cache
        const udata = u.exists() ? u.data() : null;
        const cid = (udata as any)?.coupleId ?? null;

        let cdata: any = null;
        if (cid) {
          const cref = doc(db, "couples", cid);
          const c = await getDocFromServer(cref); // <-- BYPASS cache
          cdata = c.exists() ? c.data() : null;
        }
        setOut(JSON.stringify({
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          uid, user: udata, coupleId: cid, couple: cdata
        }, null, 2));
      } catch (e:any) {
        setOut("erro: " + (e?.message||e));
      }
    })();
  }, []);

  return (
    <div style={{position:"fixed",bottom:12,right:12,zIndex:50,maxWidth:420}}
         className="bg-slate-900/90 text-xs p-3 rounded shadow">
      <div className="font-semibold mb-1">DEBUG (server)</div>
      <pre className="whitespace-pre-wrap">{out}</pre>
    </div>
  );
}
