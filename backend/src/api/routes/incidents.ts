import crypto from "node:crypto";
import { Router } from "express";
import { HttpError } from "../../lib/errors.js";
import { jobStore } from "../../services/job-store.js";
import { listIncidents } from "../../services/firebase.service.js";
import { startIncidentAnalysis } from "../../services/incident.service.js";
import type { Severity } from "../../types/index.js";

export const incidentsRouter = Router();

incidentsRouter.post("/analyze", async (req, res) => {
  const body = req.body ?? {};
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const errorReport = typeof body.errorReport === "string" ? body.errorReport : "";
  if (!workspaceId) throw new HttpError(400, "workspaceId is required");
  if (errorReport.trim().length < 10) {
    throw new HttpError(400, "Please describe the error in at least 10 characters");
  }

  const ownerUid = req.user?.uid ?? (typeof body.ownerUid === "string" ? body.ownerUid : null);
  if (!ownerUid) throw new HttpError(401, "Sign in before starting an investigation");

  const { job, incidentId, completion } = await startIncidentAnalysis({
    workspaceId,
    ownerUid,
    errorReport: errorReport.slice(0, 20_000),
    incidentId: crypto.randomUUID(),
    ...(typeof body.repoUrl === "string" ? { repoUrl: body.repoUrl } : {}),
    ...(typeof body.branch === "string" ? { branch: body.branch } : {}),
    ...(Number.isInteger(Number(body.installationId)) && Number(body.installationId) > 0
      ? { installationId: Number(body.installationId) }
      : {}),
    source: "MANUAL",
    ...(body.severity ? { severity: body.severity as Severity } : {}),
    meta: { source: "MANUAL" },
  });
  void completion;

  res.status(202).json({ ok: true, jobId: job.id, incidentId, status: "running" });
});

incidentsRouter.get("/jobs/:jobId", (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) throw new HttpError(404, "Job not found or expired");
  res.json({ ok: true, job: jobStore.toPublic(job) });
});

incidentsRouter.get("/", async (req, res) => {
  const ownerUid = req.user?.uid ?? (typeof req.query.ownerUid === "string" ? req.query.ownerUid : null);
  if (!ownerUid) throw new HttpError(401, "ownerUid is required");
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  res.json({ ok: true, incidents: await listIncidents(ownerUid, workspaceId) });
});
