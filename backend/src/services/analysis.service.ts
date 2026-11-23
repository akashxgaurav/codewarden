import { HttpError } from "../lib/errors.js";
import { removeRepoDir, workspaceDir, workspaceRepoDir } from "../lib/paths.js";
import { logger } from "../lib/logger.js";
import { createLLM } from "../llm.js";
import { analyzeAndFix } from "../workflow/fix.workflow.js";
import { cloneRepository, getDefaultBranch, parseGitHubUrl, validateRepoUrl } from "../tools/git.tool.js";
import { getWorkspace, isFirebaseConfigured } from "./firebase.service.js";
import { findInstallationForRepo, findRepoLink } from "./github-app.service.js";
import { isChromaAvailable, indexRepository } from "./chroma/knowledge.js";
import { activityScope } from "./activity.service.js";
import { env } from "../config/env.js";
import type { AnalysisResult, Incident, Severity } from "../types/index.js";

export interface ResolveRepositoryInput {
  workspaceId: string;
  ownerUid?: string | null;
  repoUrl?: string;
  branch?: string;
  installationId?: number;
}

export interface ResolvedRepository {
  repoUrl: string;
  displayUrl: string;
  owner: string;
  repo: string;
  branch: string;
  installationId?: number;
}

export async function resolveRepository(input: ResolveRepositoryInput): Promise<ResolvedRepository> {
  let repoUrl = input.repoUrl?.trim() ?? "";
  let branch = input.branch?.trim() ?? "";
  let installationId = input.installationId;

  if (!repoUrl || !branch) {
    if (!isFirebaseConfigured()) {
      throw new HttpError(409, "Firebase is not configured, so repoUrl and branch must be supplied with the error report.");
    }
    if (!input.ownerUid) throw new HttpError(401, "Sign in to analyse an error for a configured workspace.");
    const workspace = await getWorkspace(input.ownerUid, input.workspaceId);
    if (!workspace) throw new HttpError(404, "Workspace not found.");
    repoUrl = repoUrl || workspace.repoUrl;
    branch = branch || workspace.branch;
    installationId = installationId ?? workspace.github?.installationId;
  }

  const parsed = validateRepoUrl(repoUrl);
  if (!installationId) {
    installationId = findRepoLink(parsed.owner, parsed.repo)?.installationId ?? (await findInstallationForRepo(parsed.owner, parsed.repo).catch(() => null)) ?? undefined;
  }
  if (!branch) {
    try {
      branch = await getDefaultBranch(parsed, installationId);
    } catch (error) {
      throw new HttpError(400, `Could not determine the default branch: ${String(error)}`);
    }
  }

  return {
    repoUrl: parsed.cloneUrl,
    displayUrl: parsed.displayUrl,
    owner: parsed.owner,
    repo: parsed.repo,
    branch,
    ...(installationId ? { installationId } : {}),
  };
}

const workspaceQueues = new Map<string, Promise<unknown>>();

function enqueueForWorkspace<T>(workspaceId: string, operation: () => Promise<T>): Promise<T> {
  const previous = workspaceQueues.get(workspaceId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  workspaceQueues.set(
    workspaceId,
    next.catch(() => undefined).finally(() => {
      if (workspaceQueues.get(workspaceId) === next) workspaceQueues.delete(workspaceId);
    }),
  );
  return next;
}

export interface RunAnalysisInput {
  workspaceId: string;
  ownerUid?: string | null;
  jobId: string;
  incidentId: string;
  errorReport: string;
  repository: ResolvedRepository;
  severity?: Severity;
  source?: "MANUAL" | "CLOUDWATCH";
  extraContext?: string;
  onProgress?: (message: string) => void;
}

export async function runAnalysis(input: RunAnalysisInput): Promise<{ result: AnalysisResult; repository: ResolvedRepository }> {
  return enqueueForWorkspace(input.workspaceId, async () => {
    const scope = activityScope({
      category: "analysis",
      workspaceId: input.workspaceId,
      ownerUid: input.ownerUid,
      jobId: input.jobId,
      incidentId: input.incidentId,
    });
    const report = (message: string): void => {
      input.onProgress?.(message);
      scope.step(message);
    };

    const repoDir = workspaceRepoDir(input.workspaceId);
    try {
      const commit = await cloneRepository({
        repoUrl: input.repository.repoUrl,
        branch: input.repository.branch,
        targetDir: repoDir,
        installationId: input.repository.installationId,
        onProgress: report,
      });

      const availability = await isChromaAvailable();
      if (availability.available) {
        try {
          report("Indexing repository in the knowledge base");
          const indexed = await indexRepository({
            repoDir,
            repoUrl: input.repository.repoUrl,
            repoId: input.repository.repoUrl,
            branch: input.repository.branch,
            commit,
            reset: true,
            workspaceId: input.workspaceId,
          });
          report(`Knowledge base indexed ${indexed.indexed} code chunks`);
        } catch (error) {
          scope.warn(`Knowledge base indexing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        scope.warn(`Knowledge base unavailable: ${availability.reason ?? "unknown reason"}`);
      }

      report("Starting the diagnosis agent");
      const result = await analyzeAndFix(createLLM(), {
        repoDir,
        repoUrl: input.repository.repoUrl,
        workspaceId: input.workspaceId,
        ownerUid: input.ownerUid,
        jobId: input.jobId,
        incidentId: input.incidentId,
        errorReport: input.errorReport,
        severity: input.severity,
        source: input.source,
        push: env.CODEWARDEN_PUSH,
        skipInstall: env.CODEWARDEN_SKIP_INSTALL,
        installationId: input.repository.installationId,
        extraContext: input.extraContext,
        onProgress: report,
        onActivity: scope,
      });
      logger.info("analysis complete", { jobId: input.jobId, status: result.status });
      return { result, repository: input.repository };
    } finally {
      await removeRepoDir(workspaceDir(input.workspaceId)).catch((error) => {
        logger.warn("temporary checkout cleanup failed", {
          jobId: input.jobId,
          incidentId: input.incidentId,
          workspaceId: input.workspaceId,
          error: String(error),
        });
      });
    }
  });
}

export function buildIncidentRecord(options: {
  incidentId: string;
  workspaceId: string;
  errorReport: string;
  result: AnalysisResult;
  repository: ResolvedRepository;
  severity?: Severity;
  source?: "MANUAL" | "CLOUDWATCH";
}): Incident {
  const { incidentId, workspaceId, errorReport, result, repository } = options;
  const now = new Date().toISOString();
  const title = result.rootCause ? result.rootCause.slice(0, 140) : errorReport.slice(0, 140);
  return {
    id: incidentId,
    workspaceId,
    title,
    errorMessage: errorReport.slice(0, 5000),
    status: result.status,
    ...(result.confidence ? { confidence: result.confidence } : {}),
    ...(result.rootCause ? { rootCause: result.rootCause } : {}),
    ...(result.fixPlan ? { fixPlan: result.fixPlan } : {}),
    affectedFiles: result.affectedFiles,
    ...(result.branch ? { fixBranch: result.branch } : {}),
    ...(result.pr ? { prUrl: result.pr.url, prNumber: result.pr.number } : {}),
    pushed: Boolean(result.push),
    source: options.source ?? "MANUAL",
    severity: options.severity ?? "UNKNOWN",
    ...(result.regressionTest ? { regressionTest: result.regressionTest } : {}),
    ...(result.validation ? { validationReason: result.validation.reason } : {}),
    steps: result.steps,
    ...(result.priorsUsed ? { priorsUsed: result.priorsUsed } : {}),
    createdAt: now,
    updatedAt: now,
  };
}
