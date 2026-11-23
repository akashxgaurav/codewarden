import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "../lib/paths.js";

const IGNORED_DIRS = new Set([
  "node_modules", "dist", "build", "coverage", ".git", ".next", ".cache",
  "venv", ".venv", "__pycache__", "target", ".idea", ".vscode", "vendor",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
  ".tar", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".wasm", ".lock",
]);

async function walk(root: string, maxDepth: number, onFile: (file: string, relative: string) => Promise<void> | void): Promise<void> {
  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await visit(full, depth + 1);
      } else if (entry.isFile()) {
        await onFile(full, path.relative(root, full));
      }
    }
  }
  await visit(root, 0);
}

function isBinary(relative: string, content: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(path.extname(relative).toLowerCase())) return true;
  return content.subarray(0, 8000).includes(0);
}

export async function listRepoFiles(repoDir: string): Promise<string[]> {
  const files: string[] = [];
  await walk(repoDir, 4, (_full, relative) => {
    if (files.length < 400) files.push(relative);
  });
  return files.sort();
}

export async function readRepoFile(repoDir: string, relative: string): Promise<string> {
  const target = resolveInside(repoDir, relative);
  const content = await fs.readFile(target);
  if (isBinary(relative, content)) return `[binary file: ${relative}]`;
  if (content.length > 400_000) return `[file too large: ${relative}]`;
  return content
    .toString("utf8")
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(4)} | ${line}`)
    .join("\n");
}

export async function searchRepo(repoDir: string, query: string): Promise<string[]> {
  const pattern = new RegExp(query, "i");
  const results: string[] = [];
  await walk(repoDir, 6, async (full, relative) => {
    if (results.length >= 60) return;
    let content: Buffer;
    try {
      content = await fs.readFile(full);
    } catch {
      return;
    }
    if (isBinary(relative, content) || content.length > 400_000) return;
    for (const [index, line] of content.toString("utf8").split("\n").entries()) {
      if (pattern.test(line)) results.push(`${relative}:${index + 1}: ${line.trim()}`);
      if (results.length >= 60) break;
    }
  });
  return results;
}

export interface RepoTools {
  listRepoFiles: () => Promise<string[]>;
  readRepoFile: (relative: string) => Promise<string>;
  searchRepo: (query: string) => Promise<string[]>;
}

export function createRepoTools(repoDir: string): RepoTools {
  return {
    listRepoFiles: () => listRepoFiles(repoDir),
    readRepoFile: (relative: string) => readRepoFile(repoDir, relative),
    searchRepo: (query: string) => searchRepo(repoDir, query),
  };
}
