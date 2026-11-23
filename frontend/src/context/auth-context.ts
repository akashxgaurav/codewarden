import { createContext, useContext } from "react";
import type { AppUser } from "@/types";

export interface AuthContextValue {
  user: AppUser | null;
  /** True while the session is still being restored. */
  loading: boolean;
  mode: "firebase" | "demo";
  signUp(input: { email: string; password: string; displayName: string }): Promise<AppUser>;
  signIn(input: { email: string; password: string }): Promise<AppUser>;
  signOut(): Promise<void>;
  updateDisplayName(displayName: string): Promise<void>;
  getIdToken(): Promise<string | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }

  return context;
}
