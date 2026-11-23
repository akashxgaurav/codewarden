import crypto from "node:crypto";
import { friendlyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { jobStore } from "./job-store.js";
import { activity } from "./activity.service.js";
import { buildIncidentRecord, resolveRepository, runAnalysis } from "./analysis.service.js";
import { saveIncident } from "./firebase.service.js";
import type { AnalysisJob, Severity } from "../types/index.js";

export interface StartIncidentInput {
  workspaceId: string;
  ownerUid?: string | null;
  errorReport: string;
  incidentId?: string;
  repoUrl?: string;
  branch?: string;
  installationId?: number;
  source?: "MANUAL" | "CLOUDWATCH";
  severity?: Severity;
  extraContext?: string;
  meta?: Record<string, unknown>;
}

export async function startIncidentAnalysis(input: StartIncidentInput): Promise<{
  job: AnalysisJob;
  incidentId: string;
  completion: Promise<void>;
}> {
  const incidentId = input.incidentId ?? crypto.randomUUID();
  const ownerUid = input.ownerUid ?? undefined;
  const job = jobStore.create({
    workspaceId: input.workspaceId,
    ownerUid: ownerUid,
    incidentId,
    meta: input.meta ?? {},
  });
  jobStore.update(job.id, { status: "running" });

  activity.publish({
    level: "info",
    category: "analysis",
    message: "Investigation started",
    active: true,
    ownerUid: ownerUid,
    workspaceId: input.workspaceId,
    jobId: job.id,
    incidentId,
    details: { source: input.source ?? "MANUAL", severity: input.severity ?? "UNKNOWN" },
  });

  const completion = (async (): Promise<void> => {
    try {
      const repository = await resolveRepository({
        workspaceId: input.workspaceId,
        ownerUid: ownerUid,
        repoUrl: input.repoUrl,
        branch: input.branch,
        installationId: input.installationId,
      });
      const { result } = await runAnalysis({
        workspaceId: input.workspaceId,
        ownerUid: ownerUid,
        jobId: job.id,
        incidentId,
        errorReport: input.errorReport,
        repository,
        severity: input.severity,
        source: input.source,
        extraContext: input.extraContext,
        onProgress: (message) => jobStore.appendProgress(job.id, message),
      });

      const record = buildIncidentRecord({
        incidentId,
        workspaceId: input.workspaceId,
        errorReport: input.errorReport,
        result,
        repository,
        severity: input.severity,
        source: input.source,
      });

      let persisted = true;
      try {
        await saveIncident(ownerUid ?? "", record);
      } catch (error) {
        persisted = false;
        activity.publish({
          level: "warning",
          category: "system",
          message: "The incident could not be saved to Firebase; the browser will store it locally",
          ownerUid: ownerUid,
          workspaceId: input.workspaceId,
          jobId: job.id,
          incidentId,
          details: { error: String(error) },
        });
      }

      jobStore.update(job.id, {
        status: "done",
        result: { ...result, incident: { ...record, persisted } },
      });
      activity.publish({
        level: result.status === "fixed" ? "success" : "warning",
        category: "analysis",
        message:
          result.status === "fixed"
            ? `Investigation finished: fix ready on ${result.branch ?? "a branch"}`
            : `Investigation finished with status ${result.status}`,
        ownerUid: ownerUid,
        workspaceId: input.workspaceId,
        jobId: job.id,
        incidentId,
        details: { status: result.status, branch: result.branch, pr: result.pr?.url },
      });
    } catch (error) {
      logger.error("investigation failed", {
        jobId: job.id,
        incidentId,
        workspaceId: input.workspaceId,
        name: error instanceof Error ? error.name : undefined,
        error: error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000),
        ...(error instanceof Error && error.stack ? { stack: error.stack.slice(0, 4000) } : {}),
      });
      const message = friendlyError(error);
      jobStore.update(job.id, { status: "failed", error: message });
      activity.publish({
        level: "error",
        category: "analysis",
        message: `Investigation failed: ${message}`,
        ownerUid: ownerUid,
        workspaceId: input.workspaceId,
        jobId: job.id,
        incidentId,
      });
    }
  })();

  return { job, incidentId, completion };
}
