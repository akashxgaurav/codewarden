import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Bug,
  CheckCircle2,
  FileCode2,
  GitBranch,
  GitPullRequest,
  PlusCircle,
  ShieldQuestion,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBreakdownChart, TrendChart } from "@/components/dashboard/Charts";
import { StatusBadge } from "@/components/incidents/StatusBadge";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useWorkspace } from "@/context/workspace-context";
import { branchSummary, comparePeriods, dailySeries, topFailingFiles } from "@/lib/stats";
import { formatPercent, formatRelativeTime, truncate } from "@/lib/format";
import { cn } from "@/lib/cn";

const RANGES = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
] as const;

export function DashboardPage() {
  const { activeWorkspace, incidents, loading } = useWorkspace();
  const [range, setRange] = useState<number>(7);

  const workspaceIncidents = useMemo(
    () =>
      activeWorkspace
        ? incidents.filter((incident) => incident.workspaceId === activeWorkspace.id)
        : [],
    [incidents, activeWorkspace],
  );

  const comparison = useMemo(
    () => comparePeriods(workspaceIncidents, range),
    [workspaceIncidents, range],
  );

  // The chart shows twice the selected window: the first half is the previous
  // period and the second half the current one, so the two can be compared
  // directly on the same axis.
  const series = useMemo(
    () => dailySeries(workspaceIncidents, range * 2),
    [workspaceIncidents, range],
  );

  const failingFiles = useMemo(() => topFailingFiles(workspaceIncidents), [workspaceIncidents]);

  const branches = useMemo(() => branchSummary(workspaceIncidents), [workspaceIncidents]);

  const breakdown = [
    {
      label: "Fixed",
      value: comparison.current.fixed,
      color: "var(--color-positive)",
    },
    {
      label: "Not fixable",
      value: comparison.current.notFixable,
      color: "var(--color-warning)",
    },
    {
      label: "Validation failed",
      value: comparison.current.validationFailed,
      color: "var(--color-critical)",
    },
    {
      label: "No diagnosis",
      value: comparison.current.undiagnosed,
      color: "var(--color-ink-faint)",
    },
    {
      label: "In progress",
      value: comparison.current.pending,
      color: "var(--color-brand)",
    },
  ];

  const recent = workspaceIncidents.slice(0, 6);
  const highlightFrom = range;

  const periodLabel =
    range === 1
      ? "today"
      : `the last ${range} days`;

  const previousLabel =
    range === 1 ? "yesterday" : `the ${range} days before that`;

  if (!activeWorkspace) {
    return (
      <AppShell title="Dashboard" description="No workspace selected">
        <EmptyState
          icon={<Bug className="size-8" />}
          title="No workspace yet"
          description="Create a workspace to start monitoring a repository."
          action={
            <Link to="/onboarding">
              <Button>Set up a workspace</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Dashboard"
      description={`${activeWorkspace.owner}/${activeWorkspace.repo} · branch ${activeWorkspace.branch}`}
      actions={
        <>
          <div className="hidden items-center gap-1 rounded-lg border border-line bg-surface p-1 sm:flex">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  range === option.value
                    ? "bg-surface-3 text-ink"
                    : "text-ink-faint hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Link to="/incidents/new">
            <Button size="sm">
              <PlusCircle className="size-4" />
              Report error
            </Button>
          </Link>
        </>
      }
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))
          ) : (
            <>
              <StatCard
                label={`Errors in ${periodLabel}`}
                value={comparison.current.total}
                delta={comparison.totalDelta}
                deltaLabel={`vs ${previousLabel}`}
                invertDelta
                icon={<AlertCircle className="size-4" />}
                tone={comparison.current.total > 0 ? "critical" : "positive"}
              />

              <StatCard
                label="Fixed with a branch"
                value={comparison.current.fixed}
                delta={comparison.current.fixed - comparison.previous.fixed}
                deltaLabel={`vs ${previousLabel}`}
                icon={<CheckCircle2 className="size-4" />}
                tone="positive"
              />

              <StatCard
                label="Fix rate"
                value={formatPercent(comparison.current.fixRate)}
                delta={Math.round(comparison.fixRateDelta * 100)}
                deltaLabel={`vs ${previousLabel}`}
                icon={<ShieldQuestion className="size-4" />}
                tone="brand"
              />

              <StatCard
                label="Branches ready to review"
                value={branches.total}
                hint={`${branches.pushed} pushed · ${branches.localOnly} local only`}
                icon={<GitPullRequest className="size-4" />}
                tone="neutral"
              />
            </>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader
              title="Error volume"
              description={`The highlighted bars are ${periodLabel}, the muted ones are ${previousLabel}.`}
            />
            <CardBody>
              {loading ? (
                <Skeleton className="h-64" />
              ) : workspaceIncidents.length === 0 ? (
                <EmptyState
                  icon={<Bug className="size-7" />}
                  title="No errors reported yet"
                  description="Report an error to see how the trend develops."
                />
              ) : (
                <TrendChart points={series} highlightFrom={highlightFrom} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Status of the current period"
              description={`Distribution over ${periodLabel}.`}
            />
            <CardBody>
              {loading ? (
                <Skeleton className="h-64" />
              ) : (
                <StatusBreakdownChart data={breakdown} />
              )}
            </CardBody>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader
              title="Latest errors"
              description="The most recent reports of this workspace."
              action={
                <Link
                  to="/incidents"
                  className="flex items-center gap-1 text-xs text-brand hover:underline"
                >
                  View all
                  <ArrowRight className="size-3" />
                </Link>
              }
            />
            <CardBody className="p-0">
              {loading ? (
                <div className="space-y-2 p-5">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : recent.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Bug className="size-7" />}
                    title="Nothing here yet"
                    description="Report your first error to see the diagnosis and the generated branch."
                    action={
                      <Link to="/incidents/new">
                        <Button size="sm">Report an error</Button>
                      </Link>
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.map((incident) => (
                    <li key={incident.id}>
                      <Link
                        to={`/incidents?incident=${incident.id}`}
                        className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{incident.title}</p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">
                            {incident.repoDisplayUrl} · {incident.branch}
                          </p>
                        </div>

                        <div className="hidden shrink-0 sm:block">
                          <StatusBadge status={incident.status} />
                        </div>

                        <span className="w-24 shrink-0 text-right text-[11px] text-ink-faint">
                          {formatRelativeTime(incident.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Files that break the most"
              description="Files touched by the generated fixes."
            />
            <CardBody>
              {loading ? (
                <Skeleton className="h-40" />
              ) : failingFiles.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-faint">
                  No files were touched by a fix yet.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {failingFiles.map((entry) => (
                    <li key={entry.file} className="flex items-center gap-3">
                      <FileCode2 className="size-3.5 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-muted">
                        {entry.file}
                      </span>
                      <span className="shrink-0 text-xs text-ink-faint">{entry.count}x</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </section>

        <Card>
          <CardHeader
            title="Live activity"
            description="What the backend is doing right now."
            action={
              <Link
                to="/activity"
                className="flex items-center gap-1 text-xs text-brand hover:underline"
              >
                View all
                <ArrowRight className="size-3" />
              </Link>
            }
          />
          <CardBody>
            <ActivityFeed workspaceId={activeWorkspace.id} compact limit={10} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Current period against the previous one"
            description={`${periodLabel} compared with ${previousLabel}.`}
          />
          <CardBody className="p-0">
            <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                  Current · {periodLabel}
                </p>
                <p className="mt-2 text-3xl font-semibold text-ink">{comparison.current.total}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {comparison.current.fixed} fixed · {comparison.current.unresolved} unresolved ·{" "}
                  {formatPercent(comparison.current.fixRate)} fix rate
                </p>
              </div>

              <div className="px-5 py-4">
                <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                  Previous · {previousLabel}
                </p>
                <p className="mt-2 text-3xl font-semibold text-ink-muted">
                  {comparison.previous.total}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {comparison.previous.fixed} fixed · {comparison.previous.unresolved} unresolved ·{" "}
                  {formatPercent(comparison.previous.fixRate)} fix rate
                </p>
              </div>
            </div>

            <div className="border-t border-line px-5 py-4">
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <GitBranch className="size-4 shrink-0 text-brand" />
                {comparison.current.total === comparison.previous.total ? (
                  <span>The number of errors did not change.</span>
                ) : comparison.current.total > comparison.previous.total ? (
                  <span>
                    <span className="text-critical">
                      {comparison.totalDelta} more error
                      {Math.abs(comparison.totalDelta) === 1 ? "" : "s"}
                    </span>{" "}
                    than in the previous period.
                  </span>
                ) : (
                  <span>
                    <span className="text-positive">
                      {Math.abs(comparison.totalDelta)} fewer error
                      {Math.abs(comparison.totalDelta) === 1 ? "" : "s"}
                    </span>{" "}
                    than in the previous period.
                  </span>
                )}
              </p>
            </div>
          </CardBody>
        </Card>

        {workspaceIncidents.length > 0 ? (
          <p className="pb-4 text-center text-xs text-ink-faint">
            Showing {workspaceIncidents.length} error
            {workspaceIncidents.length === 1 ? "" : "s"} of{" "}
            {truncate(activeWorkspace.repoDisplayUrl, 60)} on branch{" "}
            {activeWorkspace.branch}.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
