import { appMode } from "@/lib/env";
import { demoAuthAdapter, demoDatabaseAdapter } from "./demo";
import { firebaseAuthAdapter, firebaseDatabaseAdapter } from "./firebase";
import type { AuthAdapter, DatabaseAdapter } from "./types";

/**
 * The active storage and authentication implementation.
 *
 * `appMode` decides which one is used: "firebase" when the Firebase
 * environment variables are present, "demo" otherwise.
 */
export const authAdapter: AuthAdapter = appMode === "demo" ? demoAuthAdapter : firebaseAuthAdapter;

export const databaseAdapter: DatabaseAdapter =
  appMode === "demo" ? demoDatabaseAdapter : firebaseDatabaseAdapter;

export { demoAuthAdapter, demoDatabaseAdapter, firebaseAuthAdapter, firebaseDatabaseAdapter };
export type { AuthAdapter, DatabaseAdapter, Profile } from "./types";
