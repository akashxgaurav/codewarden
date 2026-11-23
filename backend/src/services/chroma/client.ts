import { CHROMA_DEFAULTS } from "./config.js";

export type ChromaCollection = { id: string; name: string; metadata?: Record<string, unknown> };
export type ChromaQueryResult = {
  documents?: string[][];
  metadatas?: Record<string, unknown>[][];
  distances?: number[][];
};

export class ChromaError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ChromaError";
    this.status = status;
  }
}

function baseUrl(): string {
  const root = CHROMA_DEFAULTS.url.replace(/\/+$/, "");
  return `${root}/api/v2/tenants/${CHROMA_DEFAULTS.tenant}/databases/${CHROMA_DEFAULTS.database}/collections`;
}

async function request<T>(pathname: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}${pathname}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ChromaError(`ChromaDB request failed (${response.status}): ${text.slice(0, 400)}`, response.status);
  }
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function heartbeat(): Promise<unknown> {
  const response = await fetch(`${CHROMA_DEFAULTS.url.replace(/\/+$/, "")}/api/v2/heartbeat`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new ChromaError(`ChromaDB heartbeat failed (${response.status})`, response.status);
  return response.json();
}

export async function listCollections(): Promise<ChromaCollection[]> {
  const result = await request<unknown>("");
  return Array.isArray(result) ? (result as ChromaCollection[]) : [];
}

export async function getOrCreateCollection(
  name: string,
  metadata: Record<string, unknown> = {},
): Promise<ChromaCollection> {
  const collections = await listCollections();
  const existing = collections.find((collection) => collection.name === name);
  if (existing) return existing;
  const created = await request<ChromaCollection | null>("", {
    method: "POST",
    body: { name, metadata, embedding_function: null },
  });
  return created ?? collections.find((collection) => collection.name === name) ?? { id: name, name };
}

export async function addDocuments(
  collectionId: string,
  payload: { ids: string[]; documents: string[]; metadatas: Record<string, unknown>[]; embeddings: number[][] },
): Promise<void> {
  await request(`/${encodeURIComponent(collectionId)}/add`, { method: "POST", body: payload });
}

export async function queryCollection(
  collectionId: string,
  payload: {
    queryEmbeddings: number[][];
    nResults?: number;
    where?: Record<string, unknown>;
    include?: string[];
  },
): Promise<ChromaQueryResult> {
  return request<ChromaQueryResult>(`/${encodeURIComponent(collectionId)}/query`, {
    method: "POST",
    body: {
      query_embeddings: payload.queryEmbeddings,
      n_results: payload.nResults ?? 5,
      where: payload.where,
      include: payload.include ?? ["documents", "metadatas", "distances"],
    },
  });
}

export async function getDocuments(
  collectionId: string,
  payload: { where?: Record<string, unknown>; limit?: number } = {},
): Promise<{ documents?: string[]; metadatas?: Record<string, unknown>[] }> {
  return request(`/${encodeURIComponent(collectionId)}/get`, {
    method: "POST",
    body: {
      where: payload.where,
      limit: payload.limit ?? 100,
      include: ["documents", "metadatas"],
    },
  });
}

export async function deleteWhere(collectionId: string, where: Record<string, unknown>): Promise<void> {
  await request(`/${encodeURIComponent(collectionId)}/delete`, { method: "POST", body: { where } });
}
