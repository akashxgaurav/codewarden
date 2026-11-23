import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { authAdapter } from "@/lib/adapters";
import { AuthContext, type AuthContextValue } from "./auth-context";
import type { AppUser } from "@/types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = authAdapter.subscribe((nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async (input) => {
    const created = await authAdapter.signUp(input);
    setUser(created);
    return created;
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (input) => {
    const signedIn = await authAdapter.signIn(input);
    setUser(signedIn);
    return signedIn;
  }, []);

  const signOut = useCallback(async () => {
    await authAdapter.signOut();
    setUser(null);
  }, []);

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!user) {
        throw new Error("You are not signed in.");
      }

      const updated = await authAdapter.updateDisplayName(user, displayName);
      setUser(updated);
    },
    [user],
  );

  const getIdToken = useCallback(() => authAdapter.getIdToken(), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      mode: authAdapter.mode,
      signUp,
      signIn,
      signOut,
      updateDisplayName,
      getIdToken,
    }),
    [user, loading, signUp, signIn, signOut, updateDisplayName, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
