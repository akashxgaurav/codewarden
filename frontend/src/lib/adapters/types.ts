import type { AppUser, Incident, Workspace } from "@/types";

/**
 * Storage and authentication are accessed through these two interfaces so the
 * UI never talks to a concrete SDK.
 *
 * Two implementations exist:
 *   - the Firebase adapter (Auth + Realtime Database), used in production
 *   - the demo adapter, an in-browser emulation used when no Firebase project
 *     is configured
 *
 * Keeping the surface small means the pages never need to know which one is
 * active.
 */

export interface AuthAdapter {
  readonly mode: "firebase" | "demo";
  subscribe(listener: (user: AppUser | null) => void): () => void;
  signUp(input: { email: string; password: string; displayName: string }): Promise<AppUser>;
  signIn(input: { email: string; password: string }): Promise<AppUser>;
  signOut(): Promise<void>;
  updateDisplayName(user: AppUser, displayName: string): Promise<AppUser>;
  /** ID token used to authenticate calls to the Codewarden API. */
  getIdToken(): Promise<string | null>;
}

export interface DatabaseAdapter {
  subscribeWorkspaces(userId: string, listener: (workspaces: Workspace[]) => void): () => void;
  saveWorkspace(userId: string, workspace: Workspace): Promise<void>;
  deleteWorkspace(userId: string, workspaceId: string): Promise<void>;
  setActiveWorkspace(userId: string, workspaceId: string): Promise<void>;
  subscribeIncidents(userId: string, listener: (incidents: Incident[]) => void): () => void;
  saveIncident(userId: string, incident: Incident): Promise<void>;
  deleteIncident(userId: string, incidentId: string): Promise<void>;
  readProfile(userId: string): Promise<Profile | null>;
  writeProfile(userId: string, patch: Partial<Profile>): Promise<void>;
}

export interface Profile {
  displayName: string;
  activeWorkspaceId: string | null;
  onboarded: boolean;
}
