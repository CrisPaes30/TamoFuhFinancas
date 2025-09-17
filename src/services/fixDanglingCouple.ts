import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function fixDanglingCoupleId(uid: string) {
  const uref = doc(db, "users", uid);
  const usnap = await getDoc(uref);
  if (!usnap.exists()) return;

  const coupleId = usnap.data()?.coupleId as string | undefined;
  if (!coupleId) return;

  const cref = doc(db, "couples", coupleId);
  const csnap = await getDoc(cref);

  if (!csnap.exists()) {
    // casal foi apagado: limpa ponteiro
    await updateDoc(uref, { coupleId: null, role: null });
  }
}
