// src/components/auth/Auth.tsx (SEM context/provider)
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { auth, watchAuth } from "@/lib/firebase";

export function useAuthUser(): { user: User | null; loading: boolean } {
  const initialUser = auth.currentUser;
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState<boolean>(!initialUser);

  useEffect(() => {
    const off = watchAuth((u) => {
      setUser(u);
      setLoading(false);
    });
    return off;
  }, []);

  return { user, loading };
}
