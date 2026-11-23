import { Router } from "express";
import { apiConfig, ingestConfig, isGithubAppConfigured } from "../../config/env.js";
import { HttpError } from "../../lib/errors.js";
import { getWorkspace, isFirebaseConfigured, markCloudWatchConnected } from "../../services/firebase.service.js";
import { activity } from "../../services/activity.service.js";
import { startIncidentAnalysis } from "../../services/incident.service.js";
import { buildCloudFormationTemplate } from "../../ingest/template.js";
import { deriveIngestKey, authenticate, readBatches, filterNewReports, rememberReports, recordIngest, reserveInFlight, lastIngest } from "../../ingest/service.js";
import type { Severity, Workspace } from "../../types/index.js";

export const ingestRouter = Router();

const DEFAULT_FILTER_PATTERN = "?ERROR ?Exception ?FATAL ?CRITICAL ?Uncaught";

async function resolveWorkspace(ownerUid: string, workspaceId: string): Promise<Workspace> {
  if (!isFirebaseConfigured()) throw new HttpError(503, "Firebase is not configured; workspace settings are unavailable.");
  const workspace = await getWorkspace(ownerUid, workspaceId);
  if (!workspace) throw new HttpError(404, "Workspace not found.");
  if (!workspace.repoUrl || !workspace.branch) {
    throw new HttpError(409, "The workspace has no repository and branch configured.");
  }
  return workspace;
}

function ownerFromRequest(req: import("express").Request): string | null {
  const queryValue = req.query.ownerUid;
  return req.user?.uid ?? (typeof queryValue === "string" ? queryValue : null);
}

ingestRouter.post("/cloudwatch", async (req, res) => {
  const workspaceId = String(req.get("x-codewarden-workspace") ?? (req.body?.workspaceId ?? ""));
  const ownerUid = String(req.get("x-codewarden-owner") ?? (req.body?.ownerUid ?? ""));
  const key = req.get("x-codewarden-ingest-key") ?? req.body?.ingestKey;

  authenticate({ secret: ingestConfig.secret, workspaceId, ownerUid, key });
  const workspace = await resolveWorkspace(ownerUid, workspaceId);
  const reports = readBatches(req.body);

  let started = 0;
  let skipped = 0;
  const handled: typeof reports = [];

  for (const report of reports) {
    const release = (() => {
      try {
        return reserveInFlight(workspaceId);
      } catch {
        return null;
      }
    })();
    if (!release) {
      skipped += reports.length - started;
      activity.publish({
        level: "warning",
        category: "ingest",
        message: "CloudWatch investigations paused: too many in flight",
        workspaceId,
        ownerUid,
      });
      break;
    }

    const isNew = filterNewReports(workspaceId, [report]).length > 0;
    if (!isNew) {
      skipped += 1;
      release();
      continue;
    }

    const { completion } = await startIncidentAnalysis({
      workspaceId,
      ownerUid,
      errorReport: report.message,
      source: "CLOUDWATCH",
      severity: report.severity as Severity,
      installationId: workspace.github?.installationId,
      meta: {
        logGroup: report.logGroup,
        logStream: report.logStream,
        fingerprint: report.fingerprint,
      },
    });
    void completion.then(release, release);
    recordIngest(workspaceId, report);
    void markCloudWatchConnected(ownerUid, workspaceId, new Date().toISOString()).catch(() => undefined);
    handled.push(report);
    started += 1;
  }

  rememberReports(workspaceId, handled);
  res.status(202).json({ ok: true, received: reports.length, started, skipped });
});

ingestRouter.get("/cloudwatch/template", async (req, res) => {
  const ownerUid = ownerFromRequest(req);
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
  const logGroupName = String(req.query.logGroupName ?? "").trim();
  if (!ownerUid) throw new HttpError(401, "Sign in to generate a CloudFormation template.");
  if (!workspaceId) throw new HttpError(400, "workspaceId is required.");
  if (!logGroupName) throw new HttpError(400, "logGroupName is required.");
  if (!ingestConfig.secret) throw new HttpError(503, "The server has no ingest secret. Run `npm run secret` in the backend folder and restart the API.");

  const workspace = await resolveWorkspace(ownerUid, workspaceId);
  const filterPattern = typeof req.query.filterPattern === "string" ? req.query.filterPattern : DEFAULT_FILTER_PATTERN;
  const apiUrl = apiConfig.publicApiUrl || `${req.protocol}://${req.get("host")}`;
  const { template, yaml } = buildCloudFormationTemplate({
    workspaceId,
    ownerUid,
    ingestKey: deriveIngestKey(ingestConfig.secret, workspaceId, ownerUid),
    apiUrl,
    repoUrl: workspace.repoUrl,
    branch: workspace.branch,
    logGroupName,
    filterPattern,
  });

  res.json({
    ok: true,
    template,
    yaml,
    stackName: `codewarden-${workspaceId}`.slice(0, 120),
    logGroupName,
    filterPattern,
    repoUrl: workspace.repoUrl,
    branch: workspace.branch,
    privateRepo: Boolean(workspace.github?.installationId),
    githubApp: isGithubAppConfigured(),
  });
});

ingestRouter.get("/cloudwatch/status", async (req, res) => {
  const ownerUid = ownerFromRequest(req);
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
  if (!ownerUid) throw new HttpError(401, "Sign in to check the connection status.");
  if (!workspaceId) throw new HttpError(400, "workspaceId is required.");

  const workspace = await resolveWorkspace(ownerUid, workspaceId).catch(() => null);
  const last = lastIngest(workspaceId);
  const logGroupName = workspace?.cloudWatch?.logGroupName ?? null;
  const region = workspace?.cloudWatch?.region ?? null;

  res.json({
    ok: true,
    connected: Boolean(last),
    lastEventAt: last?.at ?? null,
    lastSeverity: last?.severity ?? null,
    lastLogGroup: last?.logGroup ?? null,
    logGroupName,
    region,
    testCommand: buildTestCommand({ logGroupName, region }),
  });
});

export function buildTestCommand(options: { logGroupName: string | null; region: string | null }): string | null {
  if (!options.logGroupName) return null;
  const timestamp = Date.now();
  const message = "ERROR Codewarden test event, the connection works";
  const events = JSON.stringify([{ timestamp, message }]).replace(/'/g, "'\\''");
  return [
    `aws logs put-log-events \\`,
    `  --log-group-name '${options.logGroupName}' \\`,
    `  --log-stream-name 'codewarden-test' \\`,
    `  --log-events '${events}'${options.region ? ` \\\n  --region ${options.region}` : ""}`,
  ].join("\n");
}
