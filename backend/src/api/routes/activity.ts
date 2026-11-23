import { Router } from "express";
import { activity } from "../../services/activity.service.js";

export const activityRouter = Router();

function stringQuery(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

activityRouter.get("/", (req, res) => {
  const filter = {
    ownerUid: req.user?.uid ?? stringQuery(req.query.ownerUid) ?? null,
    workspaceId: stringQuery(req.query.workspaceId),
    jobId: stringQuery(req.query.jobId),
  };
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 1000);
  res.json({ ok: true, events: activity.list(filter, limit), status: activity.status() });
});

activityRouter.get("/stream", (req, res) => {
  const filter = {
    ownerUid: req.user?.uid ?? stringQuery(req.query.ownerUid) ?? null,
    workspaceId: stringQuery(req.query.workspaceId),
    jobId: stringQuery(req.query.jobId),
  };
  activity.stream(res, filter, req.get("last-event-id") ?? undefined);
});
