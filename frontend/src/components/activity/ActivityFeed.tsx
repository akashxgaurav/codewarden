import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Radio,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/format";
import { useAuth } from "@/context/auth-context";
import type { ActivityCategory, ActivityEvent, ActivityLevel } from "@/types";

const LEVEL_STYLE: Record<ActivityLevel, { icon: typeof Info; className: string; label: string }> = {
  info: { icon: Info, className: "text-brand", label: "Info" },
  success: { icon: CheckCircle2, className: "text-positive", label: "Success" },
  warning: { icon: AlertTriangle, className: "text-warning", label: "Warning" },
  error: { icon: AlertCircle, className: "text-critical", label: "Error" },
};

const CATEGORIES: ActivityCategory[] = [
  "analysis",
  "github",
  "ingest",
  "chroma",
  "system",
  "auth",
];

function eventTime(event: ActivityEvent) {
  const parsed = Date.parse(event.at);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function detailText(event: ActivityEvent) {
  if (!event.details || Object.keys(event.details).length === 0) {
    return null;
  }
  return Object.entries(event.details)
    .slice(0, 4)
    .map(([key, value]) => {
      const rendered = typeof value === "string" ? value : JSON.stringify(value);
      return `${key}: ${rendered}`.length > 100
        ? `${key}: ${rendered.slice(0, 97)}...`
        : `${key}: ${rendered}`;
    })
    .join(" · ");
}

export function ActivityFeed({
  workspaceId,
  jobId,
  limit = 50,
  compact = false,
  filterable = false,
}: {
  workspaceId?: string;
  jobId?: string;
  limit?: number;
  compact?: boolean;
  filterable?: boolean;
}) {
  const { user, getIdToken } = useAuth();
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<ActivityLevel | "all">("all");
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");

  const queryKey = useMemo(
    () => ["activity", user?.uid ?? "", workspaceId ?? "", jobId ?? "", limit],
    [user?.uid, workspaceId, jobId, limit],
  );

  const events = useQuery({
    queryKey,
    queryFn: () =>
      api.listActivity(
        { ownerUid: user?.uid, workspaceId, jobId, limit },
        { getIdToken },
      ),
    enabled: Boolean(user),
    refetchOnWindowFocus: false,
  });

  const status = user ? connection : "offline";

  useEffect(() => {
    if (!user) {
      return;
    }

    const source = new EventSource(
      api.activityStreamUrl({ ownerUid: user.uid, workspaceId, jobId }),
    );

    source.onopen = () => setConnection("connecting");

    source.addEventListener("ready", () => setConnection("live"));

    source.addEventListener("activity", (message) => {
      setConnection("live");

      try {
        const event = JSON.parse((message as MessageEvent<string>).data) as ActivityEvent;

        queryClient.setQueryData<ActivityEvent[]>(queryKey, (current = []) => {
          if (current.some((item) => item.id === event.id)) {
            return current;
          }
          return [event, ...current].slice(0, limit);
        });
      } catch {
        return;
      }
    });

    source.onerror = () => setConnection("offline");

    return () => source.close();
  }, [user, workspaceId, jobId, queryClient, queryKey, limit]);

  const filtered = useMemo(() => {
    return (events.data ?? []).filter((event) => {
      if (level !== "all" && event.level !== level) return false;
      if (category !== "all" && event.category !== category) return false;
      return true;
    });
  }, [events.data, level, category]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-brand" />
          <span className="text-xs font-medium text-ink">
            {status === "live" ? "Live backend activity" : "Backend activity"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
              status === "live"
                ? "border-positive/30 bg-positive-dim/40 text-positive"
                : status === "connecting"
                  ? "border-brand/30 bg-brand-dim/40 text-brand"
                  : "border-warning/30 bg-warning-dim/40 text-warning",
            )}
          >
            {status === "live" ? (
              <Radio className="size-3" />
            ) : (
              <WifiOff className="size-3" />
            )}
            {status === "live" ? "Streaming" : status === "connecting" ? "Connecting" : "Retrying"}
          </span>
        </div>

        {filterable ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as ActivityLevel | "all")}
              className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-ink focus:border-brand focus:outline-none"
            >
              <option value="all">All levels</option>
              {(Object.keys(LEVEL_STYLE) as ActivityLevel[]).map((item) => (
                <option key={item} value={item}>
                  {LEVEL_STYLE[item].label}
                </option>
              ))}
            </select>

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ActivityCategory | "all")}
              className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-ink focus:border-brand focus:outline-none"
            >
              <option value="all">All sources</option>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {events.isPending ? (
        <p className="py-6 text-center text-xs text-ink-faint">Loading activity...</p>
      ) : events.isError ? (
        <p className="py-6 text-center text-xs text-critical">
          {events.error instanceof Error ? events.error.message : "The activity feed is unavailable."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-faint">
          No activity has been recorded yet.
        </p>
      ) : (
        <ul className={compact ? "space-y-2" : "divide-y divide-line"}>
          {filtered.slice(0, compact ? 5 : limit).map((event) => {
            const style = LEVEL_STYLE[event.level] ?? LEVEL_STYLE.info;
            const Icon = style.icon;
            const details = detailText(event);

            return (
              <li
                key={event.id}
                className={cn(
                  "flex gap-3",
                  compact
                    ? "rounded-lg border border-line bg-surface-2 px-3 py-2"
                    : "py-3 first:pt-0 last:pb-0",
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", style.className)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-ink">{event.message}</p>
                    <span className="shrink-0 text-[10px] text-ink-faint">
                      {formatRelativeTime(eventTime(event))}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-ink-faint">
                    {event.category}
                    {event.active ? " · in progress" : ""}
                    {details ? ` · ${details}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
