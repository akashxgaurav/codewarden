import { env } from "../../config/env.js";

export const CHROMA_DEFAULTS = {
  url: env.CHROMA_URL,
  tenant: env.CHROMA_TENANT,
  database: env.CHROMA_DATABASE,
  collectionPrefix: env.CHROMA_COLLECTION_PREFIX,
  embeddingModel: env.CHROMA_EMBEDDING_MODEL,
  enabled: env.CHROMA_ENABLED,
} as const;

export function collectionNameForRepo(repoId: string): string {
  return `${CHROMA_DEFAULTS.collectionPrefix}${repoId}`;
}

export function deriveRepoId(repoUrl: string): string {
  const slug = String(repoUrl ?? "")
    .trim()
    .toLowerCase()
    .replace(/^git\+/, "")
    .replace(/^(ssh|git|https?):\/\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/[?#].*$/, "")
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unknown-repo";
}
