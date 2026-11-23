import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  GitBranch,
  GitPullRequest,
  Loader2,
  Play,
  Terminal,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge, ConfidenceBadge } from "@/components/incidents/StatusBadge";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/context/workspace-context";
import { api, ApiError } from "@/lib/api/client";
import type { AnalysisJob, Incident } from "@/types";

export function NewErrorPage() {
  const { user, getIdToken } = useAuth();
  const { workspaces, activeWorkspace, saveIncident } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [workspaceIdOverride, setWorkspaceIdOverride] = useState<string | null>(null);
  const [errorReport, setErrorReport] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const workspaceId = workspaceIdOverride ?? activeWorkspace?.id ?? "";

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );


  const startMutation = useMutation({
    mutationFn: async () => {
      if (!workspace) {
        throw new Error("Select a workspace first.");
      }

      if (!user) {
        throw new Error("You are not signed in.");
      }

      return api.startAnalysis(
        {
          workspaceId: workspace.id,
          repoUrl: workspace.repoUrl,
          branch: workspace.branch,
          errorReport,
          ownerUid: user.uid,
          installationId: workspace.github?.installationId,
        },
        { getIdToken },
      );
    },
    onSuccess: (result) => {
      setJobId(result.jobId);
    },
  });

  const jobQuery = useQuery({
    queryKey: ["analysis-job", jobId],
    queryFn: () => api.getJob(jobId as string, { getIdToken }),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "queued" ? 2000 : false;
    },
  });

  const job: AnalysisJob | undefined = jobQuery.data;

  // The API returns the incident record it built, so the browser only has to
  // persist it in the Realtime Database.
  const persistMutation = useMutation({
    mutationFn: (record: Incident) => saveIncident(record),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  useEffect(() => {
    if (job?.status !== "done" || persistMutation.isPending || persistMutation.isSuccess) {
      return;
    }

    const record = job.result?.incident;

    if (record) {
      persistMutation.mutate(record);
    }
    // The mutation owns its own state, so the effect only triggers it once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, persistMutation.isPending, persistMutation.isSuccess]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.progress.length]);

  const isRunning = job?.status === "running" || job?.status === "queued";
  const canSubmit = Boolean(workspace) && errorReport.trim().length > 10 && !isRunning;

  const result = job?.result;

  return (
    <AppShell
      title="Report an error"
      description="Paste the stack trace or log output. The agent finds the cause in the code."
    >
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader
            title="The error"
            description="The more context you give, the more precise the diagnosis."
          />
          <CardBody className="space-y-5">
            {workspaces.length === 0 ? (
              <Alert tone="warning" title="No workspace yet">
                Create a workspace first, so the agent knows which repository to inspect.{" "}
                <Link to="/onboarding" className="text-brand underline">
                  Set up a workspace
                </Link>
              </Alert>
            ) : null}

            <Select
              label="Workspace"
              value={workspaceId}
              onChange={(event) => setWorkspaceIdOverride(event.target.value)}
              disabled={isRunning}
              hint={
                workspace
                  ? `${workspace.repoDisplayUrl} · branch ${workspace.branch}`
                  : "The repository and branch the agent will work on."
              }
            >
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.owner}/{item.repo})
                </option>
              ))}
            </Select>

            <Textarea
              label="Error report"
              value={errorReport}
              onChange={(event) => setErrorReport(event.target.value)}
              disabled={isRunning}
              rows={12}
              spellCheck={false}
              placeholder={"TypeError: Cannot read properties of undefined (reading 'x')\n    at handler (src/handler.js:42:18)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)"}
              hint="A stack trace, a log excerpt or the exact message the user saw."
              className="font-mono text-xs"
            />

            {startMutation.isError ? (
              <Alert tone="error" title="The analysis could not be started">
                {startMutation.error instanceof ApiError
                  ? startMutation.error.message
                  : "The request failed. Check that the backend is running."}
              </Alert>
            ) : null}

            {job?.status === "failed" ? (
              <Alert tone="error" title="The analysis failed">
                {job.error ?? "The agent could not finish the investigation."}
              </Alert>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <Button
                onClick={() => startMutation.mutate()}
                disabled={!canSubmit}
                loading={startMutation.isPending}
              >
                {isRunning ? null : <Play className="size-4" />}
                {isRunning ? "Analysing..." : "Start the analysis"}
              </Button>

              {job?.status === "done" ? (
                <Button variant="ghost" onClick={() => navigate("/incidents")}>
                  See the history
                  <ArrowRight className="size-4" />
                </Button>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Investigation"
            description="The agent clones the repository, searches the code and validates the fix."
            action={
              job ? (
                <StatusBadge
                  status={
                    job.status === "done"
                      ? (result?.status ?? "fixed")
                      : job.status === "failed"
                        ? "failed"
                        : "running"
                  }
                />
              ) : null
            }
          />

          <CardBody className="flex-1 space-y-4">
            {!job ? (
              <p className="py-10 text-center text-sm text-ink-faint">
                Start an analysis to see the live progress here.
              </p>
            ) : (
              <>
                <div
                  ref={logRef}
                  className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3"
                >
                  {job.progress.length === 0 ? (
                    <p className="text-xs text-ink-faint">Waiting for the first step...</p>
                  ) : null}

                  {job.progress.map((entry, index) => (
                    <p key={`${entry.at}-${index}`} className="flex gap-2 text-xs text-ink-muted">
                      <span className="shrink-0 text-positive">
                        {isRunning ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3" />
                        )}
                      </span>
                      <span>{entry.message}</span>
                    </p>
                  ))}
                </div>

                {jobId ? (
                  <div className="border-t border-line pt-4">
                    <ActivityFeed
                      workspaceId={workspace?.id}
                      jobId={jobId}
                      compact
                      limit={20}
                    />
                  </div>
                ) : null}

                {job.status === "done" && result ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-line bg-surface-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={result.status} />
                        <ConfidenceBadge confidence={result.confidence} />
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                        {result.rootCause}
                      </p>

                      {result.fixPlan ? (
                        <p className="mt-2 text-xs text-ink-faint">
                          <span className="text-ink-muted">Fix:</span> {result.fixPlan}
                        </p>
                      ) : null}
                    </div>

                    {result.branch ? (
                      <div className="rounded-lg border border-positive/25 bg-positive-dim/30 p-4">
                        <p className="flex items-center gap-2 text-xs font-medium text-positive">
                          <GitBranch className="size-3.5" />
                          {result.branch}
                        </p>

                        {result.regressionTest?.path ? (
                          <p className="mt-2 flex items-center gap-2 font-mono text-xs text-ink-muted">
                            <Terminal className="size-3.5" />
                            {result.regressionTest.path}
                          </p>
                        ) : null}

                        {result.commit ? (
                          <p className="mt-2 text-[11px] text-ink-faint">
                            Commit {result.commit.slice(0, 7)} ·{" "}
                            {result.push?.pushed ? "pushed to origin" : "created locally"}
                          </p>
                        ) : null}

                        {result.pr?.url ? (
                          <a
                            href={result.pr.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 flex items-center gap-1.5 text-xs text-brand hover:underline"
                          >
                            <GitPullRequest className="size-3.5" />
                            Open pull request #{result.pr.number}
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    {persistMutation.isSuccess ? (
                      <p className="flex items-center gap-2 text-xs text-positive">
                        <CircleDashed className="size-3.5" />
                        Saved to your error history.
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 text-xs text-ink-faint">
                        <Loader2 className="size-3.5 animate-spin" />
                        Saving to your error history...
                      </p>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
