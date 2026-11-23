import { apiBaseUrl } from "@/lib/env";
import type {
  ActivityEvent,
  AnalysisJob,
  CloudFormationTemplate,
  GitHubConfig,
  GitHubConnection,
  GitHubInstallation,
  GithubRepository,
  Incident,
  RepositorySummary,
} from "@/types";

/**
 * Thin client for the Codewarden API.
 *
 * Every call carries the Firebase ID token when one is available, so the API
 * can resolve the caller even if the browser is the only thing that knows who
 * the user is.
 */

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiContext {
  getIdToken?: () => Promise<string | null>;
}

async function request<T>(path: string, init: RequestInit = {}, context?: ApiContext): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = await context?.getIdToken?.().catch(() => null);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  } catch (error) {
    throw new ApiError(
      `Could not reach the Codewarden API at ${apiBaseUrl}. ${error instanceof Error ? error.message : "Is the backend running?"}`,
      0,
    );
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const message = (payload.error as string) ?? `The API responded with ${response.status}.`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

/** The API writes ISO timestamps; the UI works with epoch milliseconds. */
function asMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function normalizeIncident(incident: Incident | undefined): Incident | undefined {
  if (!incident) return incident;
  return {
    ...incident,
    createdAt: asMillis(incident.createdAt as unknown),
    updatedAt: asMillis(incident.updatedAt as unknown),
  };
}

function normalizeJob(job: AnalysisJob): AnalysisJob {
  return {
    ...job,
    createdAt: asMillis(job.createdAt as unknown),
    updatedAt: asMillis(job.updatedAt as unknown),
    progress: job.progress.map((entry) => ({
      ...entry,
      at: asMillis(entry.at as unknown),
    })),
    result: job.result
      ? {
          ...job.result,
          push:
            typeof job.result.push === "boolean"
              ? { pushed: job.result.push }
              : job.result.push,
          incident: normalizeIncident(job.result.incident),
        }
      : null,
  };
}

export const api = {
  health(context?: ApiContext) {
    return request<{ ok: boolean; service: string; firebase: boolean }>("/api/health", {}, context);
  },

  async validateRepository(repoUrl: string, context?: ApiContext) {
    const result = await request<{
      ok: boolean;
      error?: string;
      repoUrl: string;
      displayUrl: string;
      owner: string;
      repo: string;
    }>(
      "/api/repos/validate",
      { method: "POST", body: JSON.stringify({ repoUrl }) },
      context,
    );

    return result;
  },

  async listBranches(
    repoUrl: string,
    context?: ApiContext,
    installationId?: number,
  ): Promise<RepositorySummary> {
    const result = await request<{
      ok: boolean;
      error?: string;
      repoUrl: string;
      displayUrl: string;
      owner: string;
      repo: string;
      defaultBranch: string | null;
      branches: string[];
    }>(
      `/api/repos/branches?repoUrl=${encodeURIComponent(repoUrl)}${
        installationId ? `&installationId=${installationId}` : ""
      }`,
      {},
      context,
    );

    return {
      repoUrl: result.repoUrl,
      displayUrl: result.displayUrl,
      owner: result.owner,
      repo: result.repo,
      defaultBranch: result.defaultBranch,
      branches: result.branches ?? [],
    };
  },

  async startAnalysis(
    payload: {
      workspaceId: string;
      repoUrl: string;
      branch: string;
      errorReport: string;
      ownerUid: string;
      source?: string;
      installationId?: number;
    },
    context?: ApiContext,
  ) {
    return request<{ ok: boolean; jobId: string; incidentId: string; status: string }>(
      "/api/incidents/analyze",
      { method: "POST", body: JSON.stringify(payload) },
      context,
    );
  },

  async getJob(jobId: string, context?: ApiContext) {
    const result = await request<{ ok: boolean; job: AnalysisJob }>(
      `/api/incidents/jobs/${jobId}`,
      {},
      context,
    );

    return normalizeJob(result.job);
  },

  async listIncidents(workspaceId: string, ownerUid: string, context?: ApiContext) {
    const result = await request<{ ok: boolean; incidents: Incident[] }>(
      `/api/incidents?workspaceId=${encodeURIComponent(workspaceId)}&ownerUid=${encodeURIComponent(ownerUid)}`,
      {},
      context,
    );

    return result.incidents ?? [];
  },

  /**
   * Builds the CloudFormation stack that forwards the log events of a log
   * group to the API.
   *
   * The stack is built for one workspace and carries its ingest key, so it is
   * created by the API and not by the browser.
   */
  async getCloudFormationTemplate(
    params: {
      workspaceId: string;
      ownerUid: string;
      logGroupName: string;
      filterPattern?: string;
    },
    context?: ApiContext,
  ): Promise<CloudFormationTemplate> {
    const query = new URLSearchParams({
      workspaceId: params.workspaceId,
      ownerUid: params.ownerUid,
      logGroupName: params.logGroupName,
    });

    if (params.filterPattern) {
      query.set("filterPattern", params.filterPattern);
    }

    const result = await request<CloudFormationTemplate>(
      `/api/ingest/cloudwatch/template?${query.toString()}`,
      {},
      context,
    );

    return result;
  },

  /**
   * Asks whether the log group of a workspace is really connected.
   *
   * The customer creates the stack in their own account, so the only proof
   * that it works is an event that arrived.
   */
  async getCloudWatchStatus(
    params: { workspaceId: string; ownerUid: string },
    context?: ApiContext,
  ) {
    const query = new URLSearchParams({
      workspaceId: params.workspaceId,
      ownerUid: params.ownerUid,
    });

    const result = await request<{
      ok: boolean;
      connected: boolean;
      lastEventAt: number | null;
      lastSeverity: string | null;
      lastLogGroup: string | null;
      logGroupName: string | null;
      region: string | null;
      testCommand: string | null;
    }>(`/api/ingest/cloudwatch/status?${query.toString()}`, {}, context);

    return result;
  },

  githubConfig(context?: ApiContext) {
    return request<GitHubConfig>("/api/github/config", {}, context);
  },

  async githubInstallations(context?: ApiContext) {
    const result = await request<{ ok: boolean; installations: GitHubInstallation[] }>(
      "/api/github/installations",
      {},
      context,
    );
    return result.installations ?? [];
  },

  async githubRepositories(installationId: number, context?: ApiContext) {
    const result = await request<{ ok: boolean; repositories: GithubRepository[] }>(
      `/api/github/repositories?installationId=${installationId}`,
      {},
      context,
    );
    return result.repositories ?? [];
  },

  linkGithubRepo(
    payload: {
      workspaceId: string;
      ownerUid: string;
      owner: string;
      repo: string;
      installationId: number;
    },
    context?: ApiContext,
  ) {
    return request<{ ok: boolean; github: GitHubConnection }>("/api/github/link", {
      method: "POST",
      body: JSON.stringify(payload),
    }, context);
  },

  createPullRequest(
    payload: {
      workspaceId?: string;
      ownerUid: string;
      owner: string;
      repo: string;
      head: string;
      base: string;
      title: string;
      body: string;
      installationId: number;
      comment?: string;
    },
    context?: ApiContext,
  ) {
    return request<{ ok: boolean; url: string; number: number }>(
      "/api/github/pull-request",
      { method: "POST", body: JSON.stringify(payload) },
      context,
    );
  },

  async listActivity(
    params: { ownerUid?: string; workspaceId?: string; jobId?: string; limit?: number },
    context?: ApiContext,
  ) {
    const query = new URLSearchParams();
    if (params.ownerUid) query.set("ownerUid", params.ownerUid);
    if (params.workspaceId) query.set("workspaceId", params.workspaceId);
    if (params.jobId) query.set("jobId", params.jobId);
    if (params.limit) query.set("limit", String(params.limit));
    const result = await request<{ ok: boolean; events: ActivityEvent[] }>(
      `/api/activity?${query.toString()}`,
      {},
      context,
    );
    return result.events ?? [];
  },

  activityStreamUrl(params: { ownerUid?: string; workspaceId?: string; jobId?: string }): string {
    const query = new URLSearchParams();
    if (params.ownerUid) query.set("ownerUid", params.ownerUid);
    if (params.workspaceId) query.set("workspaceId", params.workspaceId);
    if (params.jobId) query.set("jobId", params.jobId);
    return `${apiBaseUrl}/api/activity/stream?${query.toString()}`;
  },
};
