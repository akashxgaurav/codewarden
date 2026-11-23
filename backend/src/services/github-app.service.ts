import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { githubConfig, isGithubAppConfigured } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { activity } from "./activity.service.js";
import { deleteRepoLink, listRepoLinks, patchWorkspace, saveRepoLink } from "./firebase.service.js";

const GITHUB_API = "https://api.github.com";

export interface GithubInstallationSummary {
  id: number;
  account: { login: string; type: string; html_url: string };
  repository_selection: "all" | "selected";
  suspended_at: string | null;
  html_url: string;
}

export interface GithubRepoSummary {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  archived: boolean;
  permissions?: { push?: boolean; pull?: boolean };
}

interface InstallationToken {
  token: string;
  expiresAt: number;
}

interface RepoLink {
  ownerUid?: string;
  workspaceId: string;
  installationId: number;
  owner: string;
  repo: string;
}

const tokenCache = new Map<number, InstallationToken>();
const repoLinks = new Map<string, RepoLink>();

function repoKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function installationUrl(account?: string, state?: string): string {
  if (!githubConfig.slug) {
    throw new HttpError(503, "GITHUB_APP_SLUG is not configured");
  }
  const url = new URL(`https://github.com/apps/${encodeURIComponent(githubConfig.slug)}/installations/new`);
  const target = account || githubConfig.installAccount;
  if (target) url.searchParams.set("account", target);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

async function privateKey(): Promise<string> {
  if (githubConfig.privateKey) return githubConfig.privateKey;
  if (githubConfig.privateKeyPath) {
    return fs.readFile(path.resolve(process.cwd(), githubConfig.privateKeyPath), "utf8");
  }
  throw new HttpError(503, "GitHub App private key is not configured");
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

async function appJwt(): Promise<string> {
  if (!isGithubAppConfigured()) throw new HttpError(503, "GitHub App is not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: githubConfig.appId }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(await privateKey()).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

interface GithubRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  token: string;
  body?: unknown;
  accept?: string;
}

async function githubRequest<T>(apiPath: string, options: GithubRequestOptions): Promise<T> {
  const response = await fetch(`${GITHUB_API}${apiPath}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: options.accept ?? "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "codewarden-2",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.warn("github api request failed", {
      path: apiPath,
      status: response.status,
      body: text.slice(0, 500),
    });
    throw new HttpError(response.status, `GitHub API ${response.status}: ${text.slice(0, 300)}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listInstallations(): Promise<GithubInstallationSummary[]> {
  return githubRequest<GithubInstallationSummary[]>("/app/installations", {
    token: await appJwt(),
  });
}

export async function getInstallation(installationId: number): Promise<GithubInstallationSummary> {
  return githubRequest<GithubInstallationSummary>(`/app/installations/${installationId}`, {
    token: await appJwt(),
  });
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) return cached.token;

  const result = await githubRequest<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    { method: "POST", token: await appJwt() },
  );
  tokenCache.set(installationId, {
    token: result.token,
    expiresAt: Date.parse(result.expires_at) - 60_000,
  });
  return result.token;
}

export async function findInstallationForRepo(owner: string, repo: string): Promise<number | null> {
  try {
    const result = await githubRequest<{ installation: { id: number } }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`,
      { token: await appJwt() },
    );
    return result.installation.id;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

export async function listInstallationRepos(installationId: number): Promise<GithubRepoSummary[]> {
  const token = await getInstallationToken(installationId);
  const all: GithubRepoSummary[] = [];
  let page = 1;
  while (page <= 10) {
    const result = await githubRequest<{ repositories: GithubRepoSummary[]; total_count: number }>(
      `/installation/repositories?per_page=100&page=${page}`,
      { token },
    );
    all.push(...result.repositories);
    if (all.length >= result.total_count || result.repositories.length < 100) break;
    page += 1;
  }
  return all.filter((repo) => !repo.archived);
}

/** Clone URL for private repositories. Never log the returned value. */
export async function authenticatedCloneUrl(
  owner: string,
  repo: string,
  installationId: number,
): Promise<string> {
  const token = await getInstallationToken(installationId);
  return `https://x-access-token:${token}@github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git`;
}

export interface PullRequestInput {
  owner: string;
  repo: string;
  installationId: number;
  head: string;
  base: string;
  title: string;
  body: string;
  draft?: boolean;
}

export async function createPullRequest(input: PullRequestInput): Promise<{ url: string; number: number }> {
  const token = await getInstallationToken(input.installationId);
  const existing = await githubRequest<{ html_url: string; number: number }[]>(
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls?state=open&head=${encodeURIComponent(`${input.owner}:${input.head}`)}&base=${encodeURIComponent(input.base)}`,
    { token },
  );
  if (existing[0]) return { url: existing[0].html_url, number: existing[0].number };

  const created = await githubRequest<{ html_url: string; number: number }>(
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls`,
    {
      method: "POST",
      token,
      body: {
        title: input.title,
        head: input.head,
        base: input.base,
        body: input.body,
        draft: input.draft ?? false,
      },
    },
  );
  activity.publish({
    level: "success",
    category: "github",
    message: `Opened pull request #${created.number} in ${input.owner}/${input.repo}`,
    details: { url: created.html_url, head: input.head, base: input.base },
  });
  return { url: created.html_url, number: created.number };
}

export async function addPullRequestComment(
  owner: string,
  repo: string,
  installationId: number,
  pullNumber: number,
  body: string,
): Promise<void> {
  const token = await getInstallationToken(installationId);
  await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${pullNumber}/comments`,
    { method: "POST", token, body: { body } },
  );
}

export function verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!githubConfig.webhookSecret || !signatureHeader) return false;
  const expected = `sha256=${crypto
    .createHmac("sha256", githubConfig.webhookSecret)
    .update(rawBody)
    .digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function linkRepo(input: RepoLink): void {
  repoLinks.set(repoKey(input.owner, input.repo), input);
  void saveRepoLink(input).catch((error: unknown) => {
    logger.warn("could not persist GitHub repo link", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function loadRepoLinks(): Promise<void> {
  try {
    for (const link of await listRepoLinks()) linkRepo(link);
  } catch (error) {
    logger.warn("could not load GitHub repo links", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function findRepoLink(owner: string, repo: string): RepoLink | undefined {
  return repoLinks.get(repoKey(owner, repo));
}

export async function applyInstallationWebhook(
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const installation = payload.installation as
    | { id: number; account?: { login?: string; type?: string; html_url?: string }; html_url?: string; repository_selection?: string; suspended_at?: string | null }
    | undefined;
  if (!installation?.id) return;

  const installationId = installation.id;
  if (action === "created" || action === "suspended" || action === "unsuspended") {
    tokenCache.delete(installationId);
    activity.publish({
      level: action === "suspended" ? "warning" : "success",
      category: "github-webhook",
      message: `GitHub App installation ${action} for ${installation.account?.login ?? installationId}`,
      details: { installationId },
    });

    const account = installation.account?.login;
    if (account) {
      for (const link of repoLinks.values()) {
        if (link.installationId === installationId && link.ownerUid) {
          await patchWorkspace(link.ownerUid, link.workspaceId, {
            github: {
              installationId,
              account,
              accountType: installation.account?.type === "Organization" ? "Organization" : "User",
              suspended: action === "suspended",
              repositorySelection: installation.repository_selection === "selected" ? "selected" : "all",
              htmlUrl: installation.html_url ?? "",
              connectedAt: new Date().toISOString(),
            },
          });
        }
      }
    }
  }

  if (action === "deleted") {
    tokenCache.delete(installationId);
    for (const [key, link] of repoLinks) {
      if (link.installationId === installationId) {
        repoLinks.delete(key);
        void deleteRepoLink(link.owner, link.repo);
      }
    }
    activity.publish({
      level: "warning",
      category: "github-webhook",
      message: `GitHub App installation ${installationId} was removed`,
      details: { installationId },
    });
  }
}

export async function applyRepositoryWebhook(
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const installation = payload.installation as { id?: number } | undefined;
  const repositories = (payload.repositories_added ?? payload.repositories_removed ?? []) as {
    full_name?: string;
  }[];
  if (!installation?.id) return;
  if (action === "added") linkRepoFromFullName(repositories, installation.id);
  activity.publish({
    level: "info",
    category: "github-webhook",
    message: `GitHub App repository access ${action} (${repositories.length} repositories)`,
    details: { installationId: installation.id },
  });
}

function linkRepoFromFullName(repos: { full_name?: string }[], installationId: number): void {
  for (const repo of repos) {
    const [owner, name] = (repo.full_name ?? "").split("/");
    if (owner && name) linkRepo({ owner, repo: name, workspaceId: "", installationId });
  }
}

export function handleGenericWebhook(event: string, payload: Record<string, unknown>): void {
  if (event === "push") {
    const repo = (payload.repository ?? {}) as { full_name?: string };
    const ref = typeof payload.ref === "string" ? payload.ref.replace("refs/heads/", "") : "unknown";
    activity.publish({
      level: "info",
      category: "github-webhook",
      message: `Push to ${ref} in ${repo.full_name ?? "connected repository"}`,
      details: { ref, repository: repo.full_name },
    });
    return;
  }
  if (event === "pull_request") {
    const pr = (payload.pull_request ?? {}) as { number?: number; html_url?: string; merged?: boolean; title?: string };
    const action = String(payload.action ?? "updated");
    activity.publish({
      level: pr.merged ? "success" : "info",
      category: "github-webhook",
      message: `Pull request #${pr.number ?? "?"} ${action}${pr.merged ? " and merged" : ""}`,
      details: { url: pr.html_url, title: pr.title, action },
    });
  }
}
