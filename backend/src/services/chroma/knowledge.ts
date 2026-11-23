import fs from "node:fs/promises";
import path from "node:path";
import { activity } from "../activity.service.js";
import { CHROMA_DEFAULTS, collectionNameForRepo, deriveRepoId } from "./config.js";
import {
  addDocuments,
  deleteWhere,
  getDocuments,
  getOrCreateCollection,
  heartbeat,
  listCollections,
  queryCollection,
} from "./client.js";
import { embedDocuments, embedQuery, isEmbeddingAvailable } from "./embeddings.js";

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "vendor", "dist", "build", "out", "coverage",
  ".next", "target", "venv", ".venv", "__pycache__", ".mypy_cache",
  ".pytest_cache", ".gradle", "bin", "obj",
]);
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".pdf", ".zip",
  ".gz", ".tar", ".jar", ".war", ".class", ".so", ".dll", ".exe", ".bin",
  ".mp3", ".mp4", ".woff", ".woff2", ".ttf", ".eot",
]);
const LANGUAGE_BY_EXT: Record<string, string> = {
  ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".py": "python", ".go": "go",
  ".java": "java", ".rb": "ruby", ".rs": "rust", ".php": "php", ".cs": "csharp",
  ".c": "c", ".h": "c", ".cpp": "cpp", ".json": "json", ".yaml": "yaml",
  ".yml": "yaml", ".toml": "toml", ".xml": "xml", ".sh": "shell", ".sql": "sql",
  ".html": "html", ".css": "css", ".md": "markdown",
};

const CHUNK_LINES = 60;
const MAX_FILE_BYTES = 200_000;

export interface CodeChunk {
  path: string;
  startLine: number;
  endLine: number;
  language: string;
  document: string;
}

export interface KnowledgeHit {
  document: string;
  metadata: Record<string, unknown>;
  distance: number | null;
  collection: string;
}

interface IdentityInput {
  repoId?: string;
  repoUrl?: string;
  repoDir?: string;
}

export async function resolveRepoIdentity(input: IdentityInput = {}): Promise<{ repoId: string; repoUrl: string }> {
  if (input.repoId) return { repoId: deriveRepoId(input.repoId), repoUrl: input.repoUrl ?? "" };
  let resolvedUrl = input.repoUrl ?? "";
  if (!resolvedUrl && input.repoDir) {
    try {
      const { getOriginUrl } = await import("../../tools/git.tool.js");
      resolvedUrl = getOriginUrl(input.repoDir);
    } catch {
      resolvedUrl = "";
    }
  }
  return { repoId: deriveRepoId(resolvedUrl), repoUrl: resolvedUrl };
}

export async function isChromaAvailable(): Promise<{ available: boolean; reason?: string; model?: string }> {
  if (!CHROMA_DEFAULTS.enabled) return { available: false, reason: "ChromaDB is disabled via CHROMA_ENABLED=0." };
  try {
    await heartbeat();
  } catch (error) {
    return {
      available: false,
      reason: `ChromaDB is not reachable at ${CHROMA_DEFAULTS.url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return isEmbeddingAvailable();
}

async function collectCodeChunks(repoDir: string): Promise<CodeChunk[]> {
  const chunks: CodeChunk[] = [];
  let filesSeen = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 6 || chunks.length >= 800 || filesSeen >= 400) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (chunks.length >= 800 || filesSeen >= 400) return;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      filesSeen += 1;
      const stats = await fs.stat(full).catch(() => null);
      if (!stats || stats.size > MAX_FILE_BYTES) continue;
      const content = await fs.readFile(full, "utf8").catch(() => "");
      const lines = content.split("\n");
      const relativePath = path.relative(repoDir, full);
      for (let start = 0; start < lines.length; start += CHUNK_LINES) {
        if (chunks.length >= 800) break;
        const end = Math.min(start + CHUNK_LINES, lines.length);
        chunks.push({
          path: relativePath,
          startLine: start + 1,
          endLine: end,
          language: LANGUAGE_BY_EXT[path.extname(relativePath).toLowerCase()] ?? "text",
          document: `File: ${relativePath} (lines ${start + 1}-${end})\n${lines.slice(start, end).join("\n")}`,
        });
      }
    }
  }

  await walk(repoDir, 0);
  return chunks;
}

async function ensureCollection(repoId: string): Promise<{ id: string; name: string; metadata?: Record<string, unknown> }> {
  return getOrCreateCollection(collectionNameForRepo(repoId), {
    purpose: "codewarden-repository",
    repoId,
  });
}

export async function indexRepository(options: IdentityInput & {
  branch?: string;
  commit?: string;
  reset?: boolean;
  workspaceId?: string;
}): Promise<{ collection: string; indexed: number; repoId: string }> {
  const { repoId } = await resolveRepoIdentity(options);
  const collection = await ensureCollection(repoId);
  if (options.reset) await deleteWhere(collection.id, { kind: "code" }).catch(() => undefined);

  const chunks = await collectCodeChunks(options.repoDir ?? "");
  activity.publish({
    level: "info",
    category: "chroma",
    message: `Indexed ${chunks.length} code chunks for ${repoId}`,
    workspaceId: options.workspaceId,
    details: { repoId, repository: options.repoUrl },
  });
  if (chunks.length === 0) return { collection: collection.name, indexed: 0, repoId };

  const embeddings = await embedDocuments(chunks.map((chunk) => chunk.document));
  await addDocuments(collection.id, {
    ids: chunks.map((chunk, index) => `${repoId}:${chunk.path}:${chunk.startLine}:${index}`),
    documents: chunks.map((chunk) => chunk.document),
    metadatas: chunks.map((chunk) => ({
      repoId,
      branch: options.branch ?? "",
      commit: options.commit ?? "",
      kind: "code",
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      language: chunk.language,
    })),
    embeddings,
  });
  return { collection: collection.name, indexed: chunks.length, repoId };
}

export async function recordIncident(options: IdentityInput & {
  incidentId?: string;
  title: string;
  errorMessage: string;
  severity?: string;
  source?: string;
  context?: unknown;
  workspaceId?: string;
}): Promise<{ collection: string; incidentId: string }> {
  const { repoId } = await resolveRepoIdentity(options);
  const collection = await ensureCollection(repoId);
  const incidentId = options.incidentId ?? `${repoId}-${Date.now()}`;
  const metadata = {
    kind: "incident",
    repoId,
    incidentId,
    path: `incidents/${incidentId}`,
    language: "text",
    startLine: 0,
    endLine: 0,
    severity: options.severity ?? "UNKNOWN",
  };
  const document = [
    `Incident: ${options.title}`,
    `Severity: ${metadata.severity}`,
    `Source: ${options.source ?? "MANUAL"}`,
    `Error message: ${options.errorMessage}`,
    `Context: ${typeof options.context === "string" ? options.context : JSON.stringify(options.context ?? {})}`,
  ].join("\n");
  const [embedding] = await embedDocuments([document]);
  await addDocuments(collection.id, {
    ids: [`incident:${incidentId}`],
    documents: [document],
    metadatas: [metadata],
    embeddings: [embedding],
  });

  const signature = `${options.title}\n${options.errorMessage}`;
  const [signatureEmbedding] = await embedDocuments([signature]);
  await addDocuments(collection.id, {
    ids: [`incident_signature:${incidentId}`],
    documents: [signature],
    metadatas: [{ ...metadata, kind: "error_signature" }],
    embeddings: [signatureEmbedding],
  });
  return { collection: collection.name, incidentId };
}

export async function recordSolution(options: IdentityInput & {
  incidentId: string;
  branch: string;
  regressionTestPath?: string;
  summary: string;
  rootCause?: string;
  workspaceId?: string;
}): Promise<{ collection: string; incidentId: string }> {
  const { repoId } = await resolveRepoIdentity(options);
  const collection = await ensureCollection(repoId);
  const document = [
    `Solved incident: ${options.incidentId}`,
    `Fix branch: ${options.branch}`,
    `Regression test: ${options.regressionTestPath ?? ""}`,
    `Summary: ${options.summary}`,
    options.rootCause ? `Root cause: ${options.rootCause}` : null,
  ].filter(Boolean).join("\n");
  const [embedding] = await embedDocuments([document]);
  await addDocuments(collection.id, {
    ids: [`solution:${options.incidentId}`],
    documents: [document],
    metadatas: [{
      kind: "solution",
      repoId,
      incidentId: options.incidentId,
      path: options.regressionTestPath ?? "",
      branch: options.branch,
      language: "text",
      startLine: 0,
      endLine: 0,
    }],
    embeddings: [embedding],
  });
  return { collection: collection.name, incidentId: options.incidentId };
}

async function search(queryText: string, kinds: string[], options: { nResults?: number; repoId?: string }): Promise<KnowledgeHit[]> {
  const nResults = options.nResults ?? 5;
  const repoId = options.repoId ? deriveRepoId(options.repoId) : undefined;
  const collections = (await listCollections()).filter((collection) => {
    if (!collection.name.startsWith(CHROMA_DEFAULTS.collectionPrefix)) return false;
    if (repoId && collection.metadata?.repoId && collection.metadata.repoId !== repoId) return false;
    return true;
  });
  if (collections.length === 0) return [];

  const embedding = await embedQuery(queryText);
  const results: KnowledgeHit[] = [];
  for (const collection of collections) {
    try {
      const response = await queryCollection(collection.id, {
        queryEmbeddings: [embedding],
        nResults,
        where: kinds.length === 1 && kinds[0] === "code" ? { kind: "code" } : { kind: { $in: kinds } },
      });
      const documents = response.documents?.[0] ?? [];
      const metadatas = response.metadatas?.[0] ?? [];
      const distances = response.distances?.[0] ?? [];
      documents.forEach((document, index) => {
        results.push({
          document,
          metadata: metadatas[index] ?? {},
          distance: distances[index] ?? null,
          collection: collection.name,
        });
      });
    } catch {
      // One unreachable collection must not break the whole lookup.
    }
  }
  return results
    .sort((left, right) => (left.distance ?? Infinity) - (right.distance ?? Infinity))
    .slice(0, nResults);
}

export function findSimilarKnowledge(
  queryText: string,
  options: { nResults?: number; repoId?: string } = {},
): Promise<KnowledgeHit[]> {
  return search(queryText, ["incident", "solution", "error_signature"], options);
}

export function findSimilarCode(
  queryText: string,
  options: { nResults?: number; repoId?: string } = {},
): Promise<KnowledgeHit[]> {
  return search(queryText, ["code"], options);
}
