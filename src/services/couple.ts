// src/services/couple.ts
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  limit,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";

function randomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/I/1
  return Array.from({ length: len }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
}

/** Cria casal + cria convite em invites/{code} e aponta user para o casal */
export async function createCoupleFor(
  uid: string,
  profile: { nameA: string; nameB: string; currency: string }
) {
  const coupleRef = doc(collection(db, "couples"));

  await setDoc(coupleRef, {
    ...profile,
    createdBy: uid,                 // útil p/ auditoria
    members: { [uid]: true },       // padronizado como MAP
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, "users", uid),
    { coupleId: coupleRef.id, role: "owner", updatedAt: serverTimestamp() },
    { merge: true }
  );

  // cria convite único em invites/{code}
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = randomCode();
    const iref = doc(db, "invites", code);
    const exists = (await getDocFromServer(iref)).exists();
    if (!exists) {
      await setDoc(iref, {
        coupleId: coupleRef.id,
        active: true,
        createdBy: uid,
        createdAt: serverTimestamp(),
        expiresAtMs: Date.now() + 1000 * 60 * 60 * 48, // 48h
        joins: 0,
        maxJoins: 5,
      } as any);
      break;
    }
  }
  if (!code) throw new Error("Falha ao gerar código.");

  return { coupleId: coupleRef.id, inviteCode: code };
}

/** Pega ou cria novo código de convite para o casal */
export async function getOrCreateInviteCode(coupleId: string, createdByUid: string) {
  const now = Date.now();

  try {
    const q = query(
      collection(db, "invites"),
      where("coupleId", "==", coupleId),
      where("active", "==", true),
      limit(1)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      const d = snap.docs[0];
      const inv = d.data() as any;
      const notExpired = !inv.expiresAtMs || now < inv.expiresAtMs;
      const hasQuota = !inv.maxJoins || (inv.joins || 0) < inv.maxJoins;
      if (notExpired && hasQuota) return d.id as string;
    }
  } catch {
    // Se erro → gera novo abaixo
  }

  const { inviteCode } = await regenerateInvite(coupleId, createdByUid);
  return inviteCode;
}

/** Entra usando invites/{code}, adiciona user ao casal e aponta users/{uid} */
export async function joinCoupleWithCode(uid: string, codeInput: string) {
  const code = (codeInput || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 5) throw new Error("Código inválido.");

  const iref = doc(db, "invites", code);
  const isnap = await getDocFromServer(iref);
  if (!isnap.exists()) throw new Error("Convite inválido.");
  const invite = isnap.data() as any;

  if (invite.active === false) throw new Error("Convite desativado.");
  if (invite.expiresAtMs && Date.now() > invite.expiresAtMs) throw new Error("Convite expirado.");
  if (invite.maxJoins && (invite.joins || 0) >= invite.maxJoins) throw new Error("Convite esgotado.");

  const coupleId = invite.coupleId as string;
  const cRef = doc(db, "couples", coupleId);

  // 1) SELF-JOIN: tente adicionar o usuário SEM ler o casal antes
  try {
    // tente map (padrão atual):
    await updateDoc(cRef, {
      [`members.${uid}`]: true,
      updatedAt: serverTimestamp(),
    } as any);
  } catch (e: any) {
    // se o casal usa ARRAY legado, use arrayUnion
    try {
      await updateDoc(cRef, {
        members: arrayUnion(uid),
        updatedAt: serverTimestamp(),
      } as any);
    } catch (e2: any) {
      // falhou mesmo assim (pode ser casal inexistente ou regras) -> propaga
      throw e2;
    }
  }

  // 2) Agora você já é membro -> pode LER e completar nomes
  const cSnap = await getDocFromServer(cRef);
  if (!cSnap.exists()) throw new Error("Casal não encontrado.");

  const data = cSnap.data() as any;
  const auth = getAuth();
  const displayName = auth.currentUser?.displayName || "";

  const nameAEmpty = !data?.nameA || String(data.nameA).trim() === "";
  const nameBEmpty = !data?.nameB || String(data.nameB).trim() === "";

  const patch: any = { updatedAt: serverTimestamp() };
  if (displayName) {
    if (nameAEmpty) patch.nameA = displayName;
    else if (nameBEmpty) patch.nameB = displayName;
    patch[`memberNames.${uid}`] = displayName;
  }
  if (Object.keys(patch).length > 1) {
    await updateDoc(cRef, patch);
  }

  // 3) Atualiza users/{uid}
  await setDoc(
    doc(db, "users", uid),
    { coupleId, role: "member", updatedAt: serverTimestamp() },
    { merge: true }
  );

  // 4) Contabiliza uso do convite (best effort)
  try {
    await updateDoc(iref, { joins: (invite.joins || 0) + 1 });
  } catch {}

  return coupleId;
}

/** Gera novo código para um casal (invites/{code}). Opcional: desativar códigos antigos. */
export async function regenerateInvite(coupleId: string, createdByUid: string) {
  // (opcional) desativar convites antigos
  // const qOld = query(collection(db,"invites"), where("coupleId","==",coupleId), where("active","==",true));
  // const old = await getDocs(qOld);
  // await Promise.all(old.docs.map(d => updateDoc(d.ref, {active:false})));

  let code = "";
  for (let i = 0; i < 5; i++) {
    code = randomCode();
    const iref = doc(db, "invites", code);
    const exists = (await getDocFromServer(iref)).exists();
    if (!exists) {
      await setDoc(iref, {
        coupleId,
        active: true,
        createdBy: createdByUid,
        createdAt: serverTimestamp(),
        expiresAtMs: Date.now() + 1000 * 60 * 60 * 48,
        joins: 0,
        maxJoins: 5,
      } as any);
      return { inviteCode: code };
    }
  }
  throw new Error("Falha ao gerar convite.");
}

/** Conveniência: pega coupleId do usuário */
export async function getCoupleIdFor(uid: string) {
  const u = await getDoc(doc(db, "users", uid));
  return (u.data()?.coupleId as string) ?? null;
}
