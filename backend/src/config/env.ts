import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .enum(["0", "1", "true", "false", "TRUE", "FALSE"])
  .default("0")
  .transform((value) => value === "1" || value.toLowerCase() === "true");

const optionalString = z.string().trim().optional().default("");

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CODEWARDEN_API_HOST: z.string().default("0.0.0.0"),
  CODEWARDEN_CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173"),
  CODEWARDEN_STRICT_CORS: booleanFromString,
  CODEWARDEN_PUBLIC_API_URL: optionalString,

  GROQ_API_KEY: optionalString,
  CODEWARDEN_MODEL: z.string().default("openai/gpt-oss-20b"),
  CODEWARDEN_REASONING_EFFORT: z.string().default("low"),
  CODEWARDEN_TPM_LIMIT: z.coerce.number().int().positive().default(8000),

  CODEWARDEN_PUSH: booleanFromString,
  CODEWARDEN_SKIP_INSTALL: booleanFromString,

  GITHUB_APP_ID: optionalString,
  GITHUB_APP_SLUG: optionalString,
  GITHUB_APP_PRIVATE_KEY: optionalString,
  GITHUB_APP_PRIVATE_KEY_PATH: optionalString,
  GITHUB_APP_WEBHOOK_SECRET: optionalString,
  GITHUB_APP_INSTALL_ACCOUNT: optionalString,

  CHROMA_ENABLED: z
    .enum(["0", "1"])
    .default("1")
    .transform((value) => value === "1"),
  CHROMA_URL: z.string().default("http://localhost:8000"),
  CHROMA_TENANT: z.string().default("default_tenant"),
  CHROMA_DATABASE: z.string().default("default_database"),
  CHROMA_COLLECTION_PREFIX: z.string().default("cw_repo_"),
  CHROMA_EMBEDDING_MODEL: z
    .string()
    .default("Xenova/all-MiniLM-L6-v2"),

  FIREBASE_PROJECT_ID: optionalString,
  FIREBASE_DATABASE_URL: optionalString,
  FIREBASE_SERVICE_ACCOUNT_JSON: optionalString,
  FIREBASE_SERVICE_ACCOUNT_BASE64: optionalString,
  FIREBASE_SERVICE_ACCOUNT_PATH: optionalString,

  CODEWARDEN_INGEST_SECRET: optionalString,
  CODEWARDEN_INGEST_DEDUPE_MS: z.coerce.number().int().positive().default(600000),

  ACTIVITY_TTL_MS: z.coerce.number().int().positive().default(3600000),
  ACTIVITY_MAX_EVENTS: z.coerce.number().int().positive().default(1000),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid backend configuration: ${details}`);
}

export const env: Env = parsed.data;

export const apiConfig = {
  port: env.PORT,
  host: env.CODEWARDEN_API_HOST,
  corsOrigins: env.CODEWARDEN_CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  strictCors: env.CODEWARDEN_STRICT_CORS,
  publicApiUrl: env.CODEWARDEN_PUBLIC_API_URL.replace(/\/+$/, ""),
  maxErrorReportChars: 20_000,
  jobTtlMs: 3_600_000,
  maxJobs: 200,
} as const;

export const githubConfig = {
  appId: env.GITHUB_APP_ID,
  slug: env.GITHUB_APP_SLUG,
  privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
  privateKeyPath: env.GITHUB_APP_PRIVATE_KEY_PATH,
  webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET,
  installAccount: env.GITHUB_APP_INSTALL_ACCOUNT,
} as const;

export function isGithubAppConfigured(): boolean {
  return Boolean(githubConfig.appId && (githubConfig.privateKey || githubConfig.privateKeyPath));
}

export const ingestConfig = {
  secret: env.CODEWARDEN_INGEST_SECRET,
  dedupeWindowMs: env.CODEWARDEN_INGEST_DEDUPE_MS,
  clusterWindowMs: 60_000,
  maxErrorsPerBatch: 5,
  maxInFlightPerWorkspace: 3,
} as const;

export const activityConfig = {
  ttlMs: env.ACTIVITY_TTL_MS,
  maxEvents: env.ACTIVITY_MAX_EVENTS,
} as const;
