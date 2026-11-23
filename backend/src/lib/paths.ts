import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

export function workspaceDir(workspaceId: string): string {
  const safeId = crypto.createHash("sha256").update(workspaceId).digest("hex").slice(0, 16);
  return path.join(process.cwd(), "workspaces", safeId);
}

export function workspaceRepoDir(workspaceId: string): string {
  return path.join(workspaceDir(workspaceId), "temp_repo");
}

export function cliRepoDir(): string {
  return path.join(process.cwd(), "temp_repo");
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function removeRepoDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/** Resolve `relative` inside `root` and reject any attempt to escape it. */
export function resolveInside(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Path escapes the repository: ${relative}`);
  }
  return target;
}
