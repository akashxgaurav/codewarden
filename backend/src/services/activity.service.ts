import crypto from "node:crypto";
import type { Response } from "express";
import { activityConfig } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { ActivityEvent, ActivityLevel } from "../types/index.js";

type ActivityInput = Omit<ActivityEvent, "id" | "at"> & { at?: string };
type Listener = (event: ActivityEvent) => void;

const INTERNAL_CATEGORIES = new Set<ActivityEvent["category"]>(["github-webhook"]);

type Filter = {
  ownerUid?: string | null;
  workspaceId?: string;
  jobId?: string;
};

class ActivityService {
  private events: ActivityEvent[] = [];
  private readonly listeners = new Set<{ listener: Listener; filter: Filter }>();
  private readonly startedAt = Date.now();

  publish(input: ActivityInput): ActivityEvent {
    const event: ActivityEvent = {
      id: crypto.randomUUID(),
      at: input.at ?? new Date().toISOString(),
      level: input.level,
      category: input.category,
      message: input.message,
      ownerUid: input.ownerUid,
      workspaceId: input.workspaceId,
      incidentId: input.incidentId,
      jobId: input.jobId,
      details: input.details,
      active: input.active,
    };

    const clientVisible = !INTERNAL_CATEGORIES.has(event.category);
    if (clientVisible) {
      this.events.push(event);
      this.prune();
    }

    logger.debug("activity", {
      activityId: event.id,
      level: event.level,
      category: event.category,
      message: event.message,
      workspaceId: event.workspaceId,
      jobId: event.jobId,
    });

    if (clientVisible) {
      for (const entry of this.listeners) {
        if (this.matches(event, entry.filter)) {
          try {
            entry.listener(event);
          } catch (error) {
            logger.warn("activity listener failed", { error: String(error) });
          }
        }
      }
    }
    return event;
  }

  list(filter: Filter = {}, limit = 100): ActivityEvent[] {
    return this.events
      .filter((event) => this.matches(event, filter))
      .slice(-Math.min(limit, activityConfig.maxEvents))
      .reverse();
  }

  subscribe(filter: Filter, listener: Listener): () => void {
    const entry = { listener, filter };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  /** Attach an SSE response to the activity stream and keep it alive. */
  stream(res: Response, filter: Filter, lastEventId?: string): () => void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

    if (lastEventId) {
      const index = this.events.findIndex((event) => event.id === lastEventId);
      if (index >= 0) {
        for (const event of this.events.slice(index + 1)) {
          if (this.matches(event, filter)) this.writeEvent(res, event);
        }
      }
    }

    const unsubscribe = this.subscribe(filter, (event) => this.writeEvent(res, event));
    const heartbeat = setInterval(() => {
      res.write(`: keep-alive ${Date.now()}\n\n`);
    }, 15_000);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    res.on("close", cleanup);
    reqClosed(res, cleanup);
    return cleanup;
  }

  private writeEvent(res: Response, event: ActivityEvent): void {
    res.write(`id: ${event.id}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`);
  }

  private matches(event: ActivityEvent, filter: Filter): boolean {
    if (filter.ownerUid && event.ownerUid && filter.ownerUid !== event.ownerUid) return false;
    if (filter.workspaceId && event.workspaceId && filter.workspaceId !== event.workspaceId) return false;
    if (filter.jobId && event.jobId && filter.jobId !== event.jobId) return false;
    return true;
  }

  private prune(): void {
    const cutoff = Date.now() - activityConfig.ttlMs;
    while (this.events.length && (Date.parse(this.events[0].at) < cutoff || this.events.length > activityConfig.maxEvents)) {
      this.events.shift();
    }
  }

  status(): { events: number; oldestAt: string | null; uptimeMs: number } {
    return {
      events: this.events.length,
      oldestAt: this.events[0]?.at ?? null,
      uptimeMs: Date.now() - this.startedAt,
    };
  }
}

function reqClosed(res: Response, cleanup: () => void): void {
  res.once("error", cleanup);
}

export const activity = new ActivityService();

/** A scope that stamps every event with the same owner/workspace/job context. */
export function activityScope(context: {
  ownerUid?: string | null;
  workspaceId?: string;
  jobId?: string;
  incidentId?: string;
  category: ActivityEvent["category"];
}) {
  const publish = (
    level: ActivityLevel,
    message: string,
    details?: Record<string, unknown>,
    active?: boolean,
  ): ActivityEvent =>
    activity.publish({
      level,
      category: context.category,
      message,
      ownerUid: context.ownerUid ?? undefined,
      workspaceId: context.workspaceId,
      jobId: context.jobId,
      incidentId: context.incidentId,
      details,
      active,
    });

  return {
    info: (message: string, details?: Record<string, unknown>): ActivityEvent =>
      publish("info", message, details),
    success: (message: string, details?: Record<string, unknown>): ActivityEvent =>
      publish("success", message, details),
    warn: (message: string, details?: Record<string, unknown>): ActivityEvent =>
      publish("warning", message, details),
    error: (message: string, details?: Record<string, unknown>): ActivityEvent =>
      publish("error", message, details),
    step: (message: string, details?: Record<string, unknown>): ActivityEvent =>
      publish("info", message, details, true),
    publish,
  };
}

export type ActivityScope = ReturnType<typeof activityScope>;
