import fs from "node:fs/promises";
import path from "node:path";
import { env, apiConfig } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { Incident, Workspace } from "../types/index.js";

type AdminApp = { name?: string; delete?: () => Promise<void> };
type AdminDb = {
  ref: (path: string) => AdminRef;
};
type AdminRef = {
  set: (value: unknown) => Promise<unknown>;
  update: (value: unknown) => Promise<unknown>;
  get: () => Promise<{ val: () => unknown }>;
  remove: () => Promise<unknown>;
};
type AdminAuth = {
  verifyIdToken: (token: string) => Promise<{ uid: string; email?: string }>;
};

let adminApp: AdminApp | null = null;
let adminDb: AdminDb | null = null;
let authClient: AdminAuth | null = null;
let initError: string | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(env.FIREBASE_PROJECT_ID && (env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_BASE64 || env.FIREBASE_SERVICE_ACCOUNT_PATH));
}

export function getFirebaseInitError(): string | null {
  return initError;
}

async function readServiceAccount(): Promise<Record<string, unknown>> {
  let raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw && env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    raw = Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
  }

  if (!raw && env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const target = path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
    raw = await fs.readFile(target, "utf8");
  }

  if (!raw) {
    const fallback = path.resolve(process.cwd(), "service-account.json");
    try {
      raw = await fs.readFile(fallback, "utf8");
    } catch {
      throw new Error("Firebase service account is not configured");
    }
  }

  // return JSON.parse(raw) as Record<string, unknown>;
  return raw as unknown as Record<string, unknown>; // Return raw string as unknown to avoid JSON parsing
}

export async function getAdminDatabase(): Promise<AdminDb> {
  if (adminDb) return adminDb;
  if (initError) throw new Error(initError);

  try {
    const serviceAccount = await readServiceAccount();
    const accountProject = serviceAccount.project_id;
    if (accountProject && env.FIREBASE_PROJECT_ID && accountProject !== env.FIREBASE_PROJECT_ID) {
      throw new Error(
        `Firebase project mismatch: service account is for ${String(accountProject)}, FIREBASE_PROJECT_ID is ${env.FIREBASE_PROJECT_ID}`,
      );
    }
    const projectId = String(accountProject ?? env.FIREBASE_PROJECT_ID);
    const databaseURL =
      env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`;

    const { initializeApp, getApps, cert } = (await import("firebase-admin/app")) as {
      initializeApp: (options: Record<string, unknown>, name?: string) => AdminApp;
      getApps: () => AdminApp[];
      cert: (account: Record<string, unknown>) => unknown;
    };
    const { getDatabase } = (await import("firebase-admin/database")) as {
      getDatabase: (app?: AdminApp, url?: string) => AdminDb;
    };

    adminApp = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount), databaseURL });
    adminDb = getDatabase(adminApp, databaseURL);
    return adminDb;
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error);
    logger.error("firebase initialisation failed", { error: initError });
    throw error;
  }
}

export async function verifyIdToken(token: string): Promise<{ uid: string; email?: string }> {
  try {
    if (!authClient) {
      await getAdminDatabase();
      const authModule = (await import("firebase-admin/auth")) as {
        getAuth: (app?: AdminApp) => AdminAuth;
      };
      authClient = authModule.getAuth(adminApp ?? undefined);
    }
    return await authClient.verifyIdToken(token);
  } catch (error) {
    logger.warn("firebase token verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function userPath(ownerUid: string, suffix: string): string {
  return `/users/${ownerUid}/${suffix}`;
}

export async function saveIncident(ownerUid: string, incident: Incident): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = await getAdminDatabase();
  await db.ref(userPath(ownerUid, `incidents/${incident.id}`)).set(incident);
}

export async function listIncidents(ownerUid: string, workspaceId?: string): Promise<Incident[]> {
  if (!isFirebaseConfigured()) return [];
  const db = await getAdminDatabase();
  const snapshot = await db.ref(userPath(ownerUid, "incidents")).get();
  const value = (snapshot.val() ?? {}) as Record<string, Incident>;
  const incidents = Object.values(value);
  return workspaceId ? incidents.filter((incident) => incident.workspaceId === workspaceId) : incidents;
}

export async function getWorkspace(ownerUid: string, workspaceId: string): Promise<Workspace | null> {
  if (!isFirebaseConfigured()) return null;
  const db = await getAdminDatabase();
  const snapshot = await db.ref(userPath(ownerUid, `workspaces/${workspaceId}`)).get();
  return (snapshot.val() as Workspace | null) ?? null;
}

export async function patchWorkspace(
  ownerUid: string,
  workspaceId: string,
  patch: Partial<Workspace>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = await getAdminDatabase();
  await db.ref(userPath(ownerUid, `workspaces/${workspaceId}`)).update(patch);
}

export interface StoredRepoLink {
  owner: string;
  repo: string;
  workspaceId: string;
  installationId: number;
  ownerUid?: string;
}

function repoLinkKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}__${repo.toLowerCase()}`;
}

export async function saveRepoLink(link: StoredRepoLink): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = await getAdminDatabase();
  await db.ref(`/codewarden/repoLinks/${repoLinkKey(link.owner, link.repo)}`).set(link);
}

export async function listRepoLinks(): Promise<StoredRepoLink[]> {
  if (!isFirebaseConfigured()) return [];
  const db = await getAdminDatabase();
  const snapshot = await db.ref("/codewarden/repoLinks").get();
  const value = (snapshot.val() ?? {}) as Record<string, StoredRepoLink>;
  return Object.values(value);
}

export async function deleteRepoLink(owner: string, repo: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = await getAdminDatabase();
  await db.ref(`/codewarden/repoLinks/${repoLinkKey(owner, repo)}`).remove();
}

export async function markCloudWatchConnected(
  ownerUid: string,
  workspaceId: string,
  at: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = await getAdminDatabase();
  await db.ref(userPath(ownerUid, `workspaces/${workspaceId}/cloudWatch`)).update({
    connected: true,
    connectedAt: at,
  });
}

export function corsOriginAllowed(origin?: string | null): boolean {
  if (!origin || origin === "null") return true;
  if (apiConfig.corsOrigins.includes("*") || apiConfig.corsOrigins.includes(origin)) return true;
  if (!apiConfig.strictCors && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}
