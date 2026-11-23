import crypto from "node:crypto";
import { apiConfig } from "../config/env.js";
import type { AnalysisJob, JobStatus } from "../types/index.js";

interface CreateJobInput {
  workspaceId: string;
  meta?: Record<string, unknown>;
  incidentId?: string;
  ownerUid?: string | null;
}

export class JobStore {
  private readonly jobs = new Map<string, AnalysisJob>();

  constructor(
    private readonly ttlMs = apiConfig.jobTtlMs,
    private readonly maxJobs = apiConfig.maxJobs,
  ) {}

  create(input: CreateJobInput): AnalysisJob {
    const now = new Date().toISOString();
    const job: AnalysisJob = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      status: "queued",
      progress: [],
      meta: {
        ...input.meta,
        ...(input.incidentId ? { incidentId: input.incidentId } : {}),
        ...(input.ownerUid ? { ownerUid: input.ownerUid } : {}),
      },
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    this.prune();
    return job;
  }

  get(id: string): AnalysisJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (Date.now() - Date.parse(job.updatedAt) > this.ttlMs) {
      this.jobs.delete(id);
      return undefined;
    }
    return job;
  }

  update(id: string, patch: Partial<Pick<AnalysisJob, "status" | "result" | "error">>): AnalysisJob | undefined {
    const job = this.get(id);
    if (!job) return undefined;
    job.status = (patch.status ?? job.status) as JobStatus;
    if (patch.result !== undefined) job.result = patch.result;
    if (patch.error !== undefined) job.error = patch.error;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  appendProgress(id: string, message: string): void {
    const job = this.get(id);
    if (!job) return;
    job.progress.push({ message, at: new Date().toISOString() });
    job.updatedAt = job.progress[job.progress.length - 1].at;
  }

  prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      if (Date.parse(job.updatedAt) < cutoff) this.jobs.delete(id);
    }
    while (this.jobs.size > this.maxJobs) {
      const oldest = [...this.jobs.entries()].sort(
        (a, b) => Date.parse(a[1].createdAt) - Date.parse(b[1].createdAt),
      )[0];
      if (!oldest) break;
      this.jobs.delete(oldest[0]);
    }
  }

  toPublic(job: AnalysisJob): AnalysisJob {
    return structuredClone(job);
  }
}

export const jobStore = new JobStore();
