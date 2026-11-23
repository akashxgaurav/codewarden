import { HttpError } from "../lib/errors.js";
import { ingestConfig } from "../config/env.js";
import { activity } from "../services/activity.service.js";
import { verifyIngestKey, deriveIngestKey } from "./keys.js";
import { DedupeStore } from "./dedupe.js";
import { buildErrorReports, fingerprint, mergeEvents, type ErrorReport, type LogEvent } from "./cloudwatch.js";

const dedupeStore = new DedupeStore({ ttlMs: ingestConfig.dedupeWindowMs });
const lastSeen = new Map<string, { at: number; severity: string; logGroup: string | null; logStream: string | null }>();
const inFlight = new Map<string, number>();

function countInFlight(workspaceId: string): number {
  return inFlight.get(workspaceId) ?? 0;
}

export function recordIngest(workspaceId: string, report?: Partial<ErrorReport>): void {
  lastSeen.set(workspaceId, {
    at: Date.now(),
    severity: report?.severity ?? "UNKNOWN",
    logGroup: report?.logGroup ?? null,
    logStream: report?.logStream ?? null,
  });
  activity.publish({
    level: "info",
    category: "ingest",
    message: `CloudWatch error received${report?.severity ? ` (${report.severity})` : ""}`,
    workspaceId,
    details: { logGroup: report?.logGroup, logStream: report?.logStream },
  });
}

export function lastIngest(workspaceId: string): { at: number; severity: string; logGroup: string | null; logStream: string | null } | null {
  return lastSeen.get(workspaceId) ?? null;
}

export function authenticate(input: { secret: string; workspaceId?: string; ownerUid?: string; key?: unknown }): void {
  if (!input.secret) {
    throw new HttpError(503, "The server has no ingest secret. Run `npm run secret` in the backend folder and restart the API.");
  }
  if (!input.workspaceId || !input.ownerUid) {
    throw new HttpError(400, "The workspace and the owner are required.");
  }
  if (!verifyIngestKey(input.secret, input.workspaceId, input.ownerUid, input.key)) {
    throw new HttpError(401, "The ingest key is not valid for this workspace.");
  }
}

export function readBatches(payload: unknown): ErrorReport[] {
  const batches = Array.isArray((payload as { batches?: unknown })?.batches)
    ? ((payload as { batches: Record<string, unknown>[] }).batches)
    : [];
  const reports: ErrorReport[] = [];
  for (const batch of batches) {
    const events = mergeEvents((batch.events as LogEvent[]) ?? [], (batch.context as LogEvent[]) ?? []);
    const found = buildErrorReports(events, {
      clusterWindowMs: ingestConfig.clusterWindowMs,
      maxReports: ingestConfig.maxErrorsPerBatch,
    });
    for (const report of found) {
      reports.push({
        ...report,
        fingerprint: fingerprint(report),
        logGroup: (batch.logGroup as string | undefined) ?? null,
        logStream: (batch.logStream as string | undefined) ?? null,
      });
    }
  }
  return reports;
}

export function filterNewReports(workspaceId: string, reports: ErrorReport[]): ErrorReport[] {
  return reports.filter((report) => !dedupeStore.seen(workspaceId, fingerprint(report)));
}

export function rememberReports(workspaceId: string, reports: ErrorReport[]): void {
  for (const report of reports) {
    if (report.fingerprint) dedupeStore.remember(workspaceId, report.fingerprint);
  }
}

export function reserveInFlight(workspaceId: string): () => void {
  if (countInFlight(workspaceId) >= ingestConfig.maxInFlightPerWorkspace) {
    throw new HttpError(429, "Too many errors are being investigated for this workspace already.");
  }
  inFlight.set(workspaceId, countInFlight(workspaceId) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = countInFlight(workspaceId) - 1;
    if (next <= 0) inFlight.delete(workspaceId);
    else inFlight.set(workspaceId, next);
  };
}

export function inFlightCount(workspaceId: string): number {
  return countInFlight(workspaceId);
}

export { deriveIngestKey };
