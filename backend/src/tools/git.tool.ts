import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { authenticatedCloneUrl } from "../services/github-app.service.js";
import type { RepositorySummary } from "../types/index.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 5 * 60_000;
const CLONE_TIMEOUT_MS = 10 * 60_000;

export interface ParsedRepo {
  owner: string;
  repo: string;
  displayUrl: string;
  cloneUrl: string;
}

function stripCredentials(value: string): string {
  return value.replace(/https:\/\/[^/@\s]+@github\.com/gi, "https://github.com");
}

export function parseGitHubUrl(value: string): ParsedRepo {
  const input = String(value ?? "").trim();
  let slug = input
    .replace(/^git\+/, "")
    .replace(/^(ssh|git|https?):\/\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^github\.com[/:]/i, "")
    .replace(/\.git$/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/$/, "");

  const parts = slug.split("/").filter(Boolean);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new HttpError(400, "Enter a GitHub repository URL like https://github.com/owner/repo");
  }
  const [owner, repo] = parts;
  slug = `${owner}/${repo}`;
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
    throw new HttpError(400, "The GitHub owner or repository name contains invalid characters");
  }
  if (slug.includes("..") || slug.includes(".") && repo.startsWith(".")) {
    throw new HttpError(400, "Invalid GitHub repository URL");
  }

  return {
    owner,
    repo,
    displayUrl: `https://github.com/${owner}/${repo}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

export function assertValidBranchName(branch: string): string {
  const value = String(branch ?? "").trim();
  if (!value || value.length > 255) throw new HttpError(400, "Invalid branch name");
  if (!/^[A-Za-z0-9._+/-]+$/.test(value)) throw new HttpError(400, "Invalid branch name");
  if (value.startsWith("-") || value.startsWith("/") || value.endsWith("/")) {
    throw new HttpError(400, "Invalid branch name");
  }
  if (value.includes("//") || value.includes("..") || value.includes("@{") || value.endsWith(".lock")) {
    throw new HttpError(400, "Invalid branch name");
  }
  return value;
}

export function validateRepoUrl(value: string): ParsedRepo {
  const parsed = parseGitHubUrl(value);
  if (!/^github\.com$/i.test(new URL(parsed.displayUrl).hostname)) {
    throw new HttpError(400, "Only GitHub repositories are supported");
  }
  return parsed;
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "echo",
    GCM_INTERACTIVE: "never",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
}

async function runGit(
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: options.cwd,
      env: gitEnv(),
      timeout: options.timeout ?? GIT_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const message = stripCredentials(
      `${err.stderr ?? ""}\n${err.stdout ?? ""}\n${err.message ?? ""}`.trim(),
    );
    throw new Error(message || "git command failed");
  }
}

function cloneTarget(owner: string, repo: string, installationId?: number): Promise<string> {
  if (installationId) return authenticatedCloneUrl(owner, repo, installationId);
  return Promise.resolve(`https://github.com/${owner}/${repo}.git`);
}

export async function listRemoteBranches(parsed: ParsedRepo, installationId?: number): Promise<string[]> {
  const url = await cloneTarget(parsed.owner, parsed.repo, installationId);
  const output = await runGit(["ls-remote", "--heads", url], { timeout: 60_000 });
  const branches = output
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace("refs/heads/", ""))
    .filter((branch): branch is string => Boolean(branch));
  return [...new Set(branches)].sort((a, b) => a.localeCompare(b));
}

export async function getDefaultBranch(parsed: ParsedRepo, installationId?: number): Promise<string> {
  const url = await cloneTarget(parsed.owner, parsed.repo, installationId);
  const output = await runGit(["ls-remote", "--symref", url, "HEAD"], { timeout: 60_000 });
  const symref = output.match(/ref:\s+refs\/heads\/([^\s]+)/);
  return symref?.[1] ?? "main";
}

export async function branchExistsOnRemote(
  parsed: ParsedRepo,
  branch: string,
  installationId?: number,
): Promise<boolean> {
  assertValidBranchName(branch);
  const url = await cloneTarget(parsed.owner, parsed.repo, installationId);
  const output = await runGit(
    ["ls-remote", "--heads", url, `refs/heads/${branch}`],
    { timeout: 60_000 },
  );
  return Boolean(output.trim());
}

export async function repoSummary(
  repoUrl: string,
  installationId?: number,
): Promise<RepositorySummary> {
  const parsed = validateRepoUrl(repoUrl);
  const [branches, defaultBranch] = await Promise.all([
    listRemoteBranches(parsed, installationId).catch(() => [] as string[]),
    getDefaultBranch(parsed, installationId).catch(() => "main"),
  ]);
  const unique = [...new Set([defaultBranch, ...branches])].filter(Boolean).sort();
  return {
    repoUrl: parsed.cloneUrl,
    displayUrl: parsed.displayUrl,
    owner: parsed.owner,
    repo: parsed.repo,
    defaultBranch,
    branches: unique,
    private: Boolean(installationId),
    ...(installationId ? { installationId } : {}),
  };
}

export function getOriginUrl(repoDir: string): string {
  try {
    return stripCredentials(
      execFileSync("git", ["config", "--get", "remote.origin.url"], {
        cwd: repoDir,
        encoding: "utf8",
        env: gitEnv(),
      }).trim(),
    );
  } catch {
    return "";
  }
}

async function originSlug(targetDir: string): Promise<string | null> {
  try {
    const url = await runGit(["config", "--get", "remote.origin.url"], { cwd: targetDir });
    const parsed = parseGitHubUrl(stripCredentials(url));
    return `${parsed.owner}/${parsed.repo}`.toLowerCase();
  } catch {
    return null;
  }
}

export interface CloneOptions {
  repoUrl: string;
  branch: string;
  targetDir: string;
  installationId?: number;
  onProgress?: (message: string) => void;
}

export async function cloneRepository(options: CloneOptions): Promise<string> {
  const parsed = validateRepoUrl(options.repoUrl);
  const branch = assertValidBranchName(options.branch);
  await fs.mkdir(path.dirname(options.targetDir), { recursive: true });
  const url = await cloneTarget(parsed.owner, parsed.repo, options.installationId);
  const slug = `${parsed.owner}/${parsed.repo}`.toLowerCase();

  let exists = false;
  try {
    const stat = await fs.stat(path.join(options.targetDir, ".git"));
    exists = stat.isDirectory();
  } catch {
    exists = false;
  }

  if (exists && (await originSlug(options.targetDir)) === slug) {
    options.onProgress?.("Reusing existing checkout; fetching latest changes");
    await runGit(["fetch", "--prune", "origin"], { cwd: options.targetDir, timeout: CLONE_TIMEOUT_MS });
  } else {
    if (exists || (await fs.stat(options.targetDir).catch(() => null))) {
      options.onProgress?.("Removing stale checkout for this workspace");
      await fs.rm(options.targetDir, { recursive: true, force: true });
    }
    options.onProgress?.(`Cloning ${parsed.owner}/${parsed.repo} at ${branch}`);
    const existsOnRemote = await branchExistsOnRemote(parsed, branch, options.installationId);
    if (!existsOnRemote) {
      throw new HttpError(400, `Branch "${branch}" does not exist on the remote repository`);
    }
    await runGit(["clone", "--branch", branch, url, options.targetDir], {
      timeout: CLONE_TIMEOUT_MS,
    });
  }

  if (!options.installationId) {
    await runGit(["remote", "set-url", "origin", parsed.cloneUrl], { cwd: options.targetDir });
  }

  const remoteBranchExists = await branchExistsOnRemote(parsed, branch, options.installationId);
  if (!remoteBranchExists) {
    throw new HttpError(400, `Branch "${branch}" does not exist on the remote repository`);
  }
  await runGit(["reset", "--hard", `origin/${branch}`], { cwd: options.targetDir });
  await runGit(["clean", "-fdq"], { cwd: options.targetDir });
  await runGit(["checkout", "-B", branch, `origin/${branch}`], { cwd: options.targetDir });
  await runGit(["pull", "--ff-only", "origin", branch], { cwd: options.targetDir });

  const head = await runGit(["rev-parse", "--short", "HEAD"], { cwd: options.targetDir });
  const files = await runGit(["ls-files"], { cwd: options.targetDir });
  options.onProgress?.(`Checkout ready at ${head} (${files.split("\n").filter(Boolean).length} tracked files)`);
  return head;
}

async function withAuthenticatedRemote<T>(
  repoDir: string,
  owner: string,
  repo: string,
  installationId: number | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  if (!installationId) return operation();
  const original = await runGit(["config", "--get", "remote.origin.url"], { cwd: repoDir });
  const authenticated = await authenticatedCloneUrl(owner, repo, installationId);
  await runGit(["remote", "set-url", "origin", authenticated], { cwd: repoDir });
  try {
    return await operation();
  } finally {
    await runGit(["remote", "set-url", "origin", original], { cwd: repoDir }).catch(() => undefined);
  }
}

export interface CommitOptions {
  repoDir: string;
  branchName: string;
  message: string;
  push?: boolean;
  owner?: string;
  repo?: string;
  installationId?: number;
}

export async function createBranchWithFix(options: CommitOptions): Promise<{ branch: string; commit: string; pushOutput?: string }> {
  const branchName = assertValidBranchName(options.branchName);
  await runGit(["checkout", "-B", branchName], { cwd: options.repoDir });
  await runGit(["add", "-A"], { cwd: options.repoDir });
  await runGit(["commit", "-m", options.message], { cwd: options.repoDir });
  const commit = await runGit(["rev-parse", "--short", "HEAD"], { cwd: options.repoDir });

  let pushOutput: string | undefined;
  if (options.push) {
    if (!options.owner || !options.repo) {
      throw new HttpError(400, "Repository identity is required to push");
    }
    pushOutput = await withAuthenticatedRemote(
      options.repoDir,
      options.owner,
      options.repo,
      options.installationId,
      () => runGit(["push", "-u", "origin", branchName], { cwd: options.repoDir, timeout: CLONE_TIMEOUT_MS }),
    );
  }
  return { branch: branchName, commit, ...(pushOutput ? { pushOutput } : {}) };
}

export async function currentBranch(repoDir: string): Promise<string> {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoDir });
}

export async function repoHasChanges(repoDir: string): Promise<boolean> {
  return Boolean(await runGit(["status", "--porcelain"], { cwd: repoDir }));
}

export function logGitFailure(message: string): string {
  return stripCredentials(message).slice(0, 2000);
}
