import { ChatGroq } from "@langchain/groq";
import { createMiddleware } from "langchain";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

export const DEFAULT_MODEL = env.CODEWARDEN_MODEL;
const TPM_LIMIT = env.CODEWARDEN_TPM_LIMIT;
const TPM_SAFETY_RATIO = 0.8;
const WINDOW_MS = 60_000;
const CHARS_PER_TOKEN = 3.5;

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxRetries?: number;
  reasoningEffort?: string;
}

export function createLLM(options: LLMOptions = {}): ChatGroq {
  return new ChatGroq({
    model: options.model ?? DEFAULT_MODEL,
    temperature: options.temperature ?? 0,
    maxTokens: undefined,
    maxRetries: options.maxRetries ?? 5,
    reasoningEffort: (options.reasoningEffort ?? env.CODEWARDEN_REASONING_EFFORT) as
      | "default"
      | "low"
      | "medium"
      | "high"
      | "none",
  });
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; response?: { status?: number }; message?: string };
  const status = candidate.status ?? candidate.response?.status;
  return status === 429 || /rate.?limit|429|too many requests|tokens per minute/i.test(candidate.message ?? "");
}

function isToolParseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; response?: { status?: number }; message?: string; code?: string; error?: { code?: string } };
  const status = candidate.status ?? candidate.response?.status;
  const message = candidate.message ?? "";
  const code = String(candidate.code ?? candidate.error?.code ?? "");
  return status === 400 && (/tool_use_failed/i.test(code) || /failed to parse tool call/i.test(message) || /tool_use_failed/i.test(message));
}

function isRetryableError(error: unknown): boolean {
  return isRateLimitError(error) || isToolParseError(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const { maxAttempts = 6, baseDelayMs = 5000, label = "LLM call" } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxAttempts) throw error;
      const rateLimited = isRateLimitError(error);
      const wait = rateLimited
        ? baseDelayMs * attempt + Math.floor(Math.random() * 2000)
        : 1000 + Math.floor(Math.random() * 1000);
      logger.warn(`${label}: retrying after transient error`, {
        waitMs: wait,
        attempt,
        maxAttempts,
        reason: rateLimited ? "rate_limit" : "tool_parse",
      });
      await sleep(wait);
    }
  }
  throw lastError;
}

export function estimateTokens(value: unknown): number {
  if (typeof value === "string") return Math.ceil(value.length / CHARS_PER_TOKEN);
  if (Array.isArray(value)) return value.reduce<number>((total, item) => total + estimateTokens(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce<number>((total, item) => total + estimateTokens(item), 0);
  }
  return 0;
}

interface TokenEvent {
  at: number;
  tokens: number;
}

export class TokenPacer {
  private readonly budget: number;
  private readonly events: TokenEvent[] = [];

  constructor(
    private readonly options: { limit?: number; safetyRatio?: number; windowMs?: number } = {},
  ) {
    this.budget = Math.floor((options.limit ?? TPM_LIMIT) * (options.safetyRatio ?? TPM_SAFETY_RATIO));
  }

  private prune(now = Date.now()): void {
    const window = this.options.windowMs ?? WINDOW_MS;
    while (this.events.length && now - this.events[0].at >= window) this.events.shift();
  }

  used(now = Date.now()): number {
    this.prune(now);
    return this.events.reduce((total, event) => total + event.tokens, 0);
  }

  record(tokens: number, now = Date.now()): void {
    if (tokens <= 0) return;
    this.events.push({ tokens, at: now });
    this.prune(now);
  }

  async wait(estimatedTokens = 0): Promise<void> {
    for (;;) {
      const now = Date.now();
      const used = this.used(now);
      if (used + estimatedTokens <= this.budget || this.events.length === 0) return;
      const oldest = this.events[0];
      const waitMs = Math.max(1000, oldest.at + (this.options.windowMs ?? WINDOW_MS) - now + 500);
      logger.warn("token pacer is waiting for quota", { used, budget: this.budget, waitMs });
      await sleep(waitMs);
    }
  }
}

export function createThrottleMiddleware(pacer: TokenPacer): ReturnType<typeof createMiddleware> {
  return createMiddleware({
    name: "codewarden-token-pacer",
    wrapModelCall: async (request: any, handler: any) => {
      const estimate =
        estimateTokens(request?.messages) + estimateTokens(request?.systemPrompt);
      await pacer.wait(estimate);
      const response = await handler(request);
      const usage = response?.usage_metadata as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      if (usage?.input_tokens) {
        pacer.record(usage.input_tokens + (usage.output_tokens ?? 0));
      }
      return response;
    },
  });
}

export { TPM_LIMIT };
