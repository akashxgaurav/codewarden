import { CHROMA_DEFAULTS } from "./config.js";

type Pipeline = (text: string | string[], options: Record<string, unknown>) => Promise<{ tolist: () => number[][] }>;

let pipelinePromise: Promise<Pipeline> | null = null;
let unavailableReason: string | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (pipelinePromise) return pipelinePromise;
  if (unavailableReason) throw new Error(unavailableReason);

  pipelinePromise = (async () => {
    const transformers = (await import("@huggingface/transformers")) as {
      env: { allowLocalModels: boolean; useBrowserCache: boolean };
      pipeline: (task: string, model: string) => Promise<Pipeline>;
    };
    transformers.env.allowLocalModels = true;
    transformers.env.useBrowserCache = false;
    return transformers.pipeline("feature-extraction", CHROMA_DEFAULTS.embeddingModel);
  })().catch((error: unknown) => {
    unavailableReason = error instanceof Error ? error.message : String(error);
    pipelinePromise = null;
    throw error;
  });

  return pipelinePromise;
}

export async function isEmbeddingAvailable(): Promise<{ available: boolean; reason?: string; model?: string }> {
  try {
    await getPipeline();
    return { available: true, model: CHROMA_DEFAULTS.embeddingModel };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const pipeline = await getPipeline();
  const output = await pipeline(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedDocuments([text]);
  return embedding;
}
