// src/dev/DevTools.tsx
import { auth, db, devNukeAll } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
} from "firebase/firestore";

/** 💥 Apaga TUDO do usuário atual no servidor:
 * - couples/{coupleId} + subcoleções expenses/* e incomes/*
 * - users/{uid}
 */
export async function devResetServerData() {
  const uid = auth.currentUser?.uid;
  if (!uid) { alert("Sem usuário logado."); return; }

  const uref = doc(db, "users", uid);
  const usnap = await getDoc(uref);
  const coupleId = usnap.exists() ? (usnap.data() as any)?.coupleId : null;

  if (coupleId) {
    // apaga subcoleções
    const expSnap = await getDocs(query(collection(db, "couples", coupleId, "expenses")));
    await Promise.all(expSnap.docs.map((d) => deleteDoc(doc(db, "couples", coupleId, "expenses", d.id))));

    const incSnap = await getDocs(query(collection(db, "couples", coupleId, "incomes")));
    await Promise.all(incSnap.docs.map((d) => deleteDoc(doc(db, "couples", coupleId, "incomes", d.id))));

    // apaga casal
    await deleteDoc(doc(db, "couples", coupleId));
  }

  // apaga user
  if (usnap.exists()) await deleteDoc(uref);

  alert("✅ Server reset: users/{uid}, couples/{id} e subcoleções apagados.");
}

/** ✏️ Renomeia o casal atual para valores neutros */
export async function devRenameCoupleNeutral() {
  const uid = auth.currentUser?.uid;
  if (!uid) { alert("Sem usuário logado."); return; }

  const uref = doc(db, "users", uid);
  const usnap = await getDoc(uref);
  const coupleId = usnap.exists() ? (usnap.data() as any)?.coupleId : null;
  if (!coupleId) { alert("Usuário sem coupleId."); return; }

  await updateDoc(doc(db, "couples", coupleId), {
    nameA: "Você",
    nameB: "Parceiro(a)",
    updatedAt: Date.now(),
  });

  alert("✅ Renomeado para 'Você' / 'Parceiro(a)'.");
}

/** UI simples para DEV */
export default function DevTools() {
  if (!import.meta.env.DEV) return null;

  const handleReset = async () => { try { await devResetServerData(); } catch (e) { console.error(e); } };
  const handleRename = async () => { try { await devRenameCoupleNeutral(); } catch (e) { console.error(e); } };
  const handleNuke = async () => { try { await devNukeAll(); } catch (e) { console.error(e); } };

  return (
    <div className="fixed bottom-3 left-3 z-50 flex gap-2">
      <button onClick={handleReset} className="px-3 py-2 text-xs rounded bg-red-600 text-white">
        💥 Reset servidor
      </button>
      <button onClick={handleRename} className="px-3 py-2 text-xs rounded bg-amber-600 text-white">
        ✏️ Renomear casal p/ neutro
      </button>
      <button onClick={handleNuke} className="px-3 py-2 text-xs rounded bg-slate-700 text-white">
        🧹 Nuke local (cache)
      </button>
    </div>
  );
}
