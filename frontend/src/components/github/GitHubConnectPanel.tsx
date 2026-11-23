import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/context/workspace-context";
import { api, ApiError } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/format";
import type { Workspace } from "@/types";

export interface GitHubRepoSelection {
  owner: string;
  repo: string;
  repoUrl: string;
  installationId: number;
  private: boolean;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

function connectedAtMillis(value: string | number) {
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export function GitHubConnectPanel({
  workspace,
  onSelect,
  compact = false,
}: {
  workspace?: Workspace | null;
  onSelect?: (selection: GitHubRepoSelection) => void;
  compact?: boolean;
}) {
  const { user, getIdToken } = useAuth();
  const { activeWorkspace, updateWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const targetWorkspace = workspace ?? activeWorkspace;

  const [installationId, setInstallationId] = useState<number | null>(null);
  const [repoName, setRepoName] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">("success");

  const config = useQuery({
    queryKey: ["github-config"],
    queryFn: () => api.githubConfig({ getIdToken }),
    retry: false,
  });

  const installations = useQuery({
    queryKey: ["github-installations"],
    queryFn: () => api.githubInstallations({ getIdToken }),
    enabled: Boolean(config.data?.configured && user),
    retry: false,
  });

  const repositories = useQuery({
    queryKey: ["github-repositories", installationId],
    queryFn: () => api.githubRepositories(installationId as number, { getIdToken }),
    enabled: Boolean(config.data?.configured && installationId),
    retry: false,
  });

  const selectedRepo = repositories.data?.find((repo) => repo.full_name === repoName) ?? null;
  const connectedInstallation = installations.data?.find((item) => !item.suspended_at) ?? null;
  const isConnected = Boolean(targetWorkspace?.github || connectedInstallation);

  useEffect(() => {
    if (!config.data?.configured || !user) {
      return;
    }

    function refreshInstallations() {
      void queryClient.invalidateQueries({ queryKey: ["github-installations"] });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refreshInstallations();
      }
    }

    window.addEventListener("focus", refreshInstallations);
    window.addEventListener("pageshow", refreshInstallations);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshInstallations);
      window.removeEventListener("pageshow", refreshInstallations);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [config.data?.configured, user, queryClient]);

  const link = useMutation({
    mutationFn: (selection: GitHubRepoSelection) =>
      api.linkGithubRepo(
        {
          workspaceId: targetWorkspace?.id ?? "",
          ownerUid: user?.uid ?? "",
          owner: selection.owner,
          repo: selection.repo,
          installationId: selection.installationId,
        },
        { getIdToken },
      ),
    onSuccess: async (result) => {
      if (targetWorkspace) {
        await updateWorkspace(targetWorkspace.id, { github: result.github });
      }
      await queryClient.invalidateQueries({ queryKey: ["github-installations"] });
      setFeedback(`Connected ${selectedRepo?.full_name ?? "the repository"} to this workspace.`);
      setFeedbackTone("success");
    },
    onError: (error) => {
      setFeedback(errorMessage(error, "The repository could not be connected."));
      setFeedbackTone("error");
    },
  });

  function chooseRepository() {
    if (!selectedRepo || !installationId) {
      return;
    }

    const selection: GitHubRepoSelection = {
      owner: selectedRepo.full_name.split("/")[0],
      repo: selectedRepo.name,
      repoUrl: selectedRepo.html_url,
      installationId,
      private: selectedRepo.private,
    };

    setFeedback(null);
    onSelect?.(selection);

    if (targetWorkspace && user) {
      link.mutate(selection);
    } else {
      setFeedback(`Selected ${selectedRepo.full_name}. It will be saved with the workspace.`);
      setFeedbackTone("success");
    }
  }

  return (
    <div
      className={
        compact
          ? "space-y-3 rounded-lg border border-line bg-surface-2 p-4"
          : "space-y-4 rounded-xl border border-line bg-surface p-5"
      }
    >
      <div className="flex items-start gap-3">
        <GithubIcon className="mt-0.5 size-5 shrink-0 text-ink" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            GitHub App
            {isConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-positive/30 bg-positive-dim/40 px-2 py-0.5 text-[10px] text-positive">
                <CheckCircle2 className="size-3" />
                Connected
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Install the App on your account to let Codewarden clone private repositories and open
            pull requests.
          </p>
        </div>
      </div>

      {config.isPending ? (
        <p className="text-xs text-ink-faint">Checking the GitHub App configuration...</p>
      ) : null}

      {config.isError ? (
        <Alert tone="error" title="Configuration could not be read">
          {errorMessage(config.error, "The API could not load the GitHub App configuration.")}
        </Alert>
      ) : null}

      {config.data && !config.data.configured ? (
        <Alert tone="warning" title="GitHub App is not configured">
          Set `GITHUB_APP_ID`, `GITHUB_APP_SLUG` and `GITHUB_APP_PRIVATE_KEY` on the backend to
          enable private repositories.
        </Alert>
      ) : null}

      {config.data?.installationUrl && !connectedInstallation ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={config.data.installationUrl} target="_blank" rel="noreferrer">
            <Button type="button" variant="secondary" size="sm">
              <GithubIcon className="size-3.5" />
              Install GitHub App
              <ExternalLink className="size-3" />
            </Button>
          </a>
        </div>
      ) : null}

      {config.data?.configured && user ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            void installations.refetch();
          }}
          loading={installations.isFetching}
        >
          <RefreshCw className="size-3.5" />
          Refresh installations
        </Button>
      ) : null}

      {installations.isError ? (
        <Alert tone="error" title="Installations could not be loaded">
          {errorMessage(installations.error, "The GitHub App installations could not be read.")}
        </Alert>
      ) : null}

      {installations.data?.length === 0 ? (
        <p className="text-xs text-ink-faint">
          No installation found yet. Install the App, then refresh this list.
        </p>
      ) : null}

      {installations.data && installations.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-muted">Installation</span>
            <select
              value={installationId ?? ""}
              onChange={(event) => {
                const next = event.target.value ? Number(event.target.value) : null;
                setInstallationId(next);
                setRepoName("");
              }}
              className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              <option value="">Select an account</option>
              {installations.data.map((installation) => (
                <option key={installation.id} value={installation.id}>
                  {installation.account.login}
                  {installation.suspended_at ? " (suspended)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-muted">Repository</span>
            <select
              value={repoName}
              onChange={(event) => setRepoName(event.target.value)}
              disabled={!installationId || repositories.isPending}
              className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50"
            >
              <option value="">
                {repositories.isPending
                  ? "Loading repositories..."
                  : installationId
                    ? "Select a repository"
                    : "Select an account first"}
              </option>
              {repositories.data?.map((repo) => (
                <option key={repo.id} value={repo.full_name}>
                  {repo.private ? "Private: " : ""}
                  {repo.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {repositories.isError ? (
        <Alert tone="error" title="Repositories could not be loaded">
          {errorMessage(repositories.error, "The repositories of this installation could not be read.")}
        </Alert>
      ) : null}

      {selectedRepo?.private ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <LockKeyhole className="size-3.5" />
          Private repository. The agent will use an installation token to clone it.
        </p>
      ) : null}

      {feedback ? (
        <Alert tone={feedbackTone} title={feedbackTone === "success" ? "Connected" : "Connection failed"}>
          {feedback}
        </Alert>
      ) : null}

      {targetWorkspace?.github ? (
        <p className="text-[11px] text-ink-faint">
          Connected as {targetWorkspace.github.account} · installed{" "}
          {formatRelativeTime(connectedAtMillis(targetWorkspace.github.connectedAt))}
        </p>
      ) : connectedInstallation ? (
        <p className="text-[11px] text-ink-faint">
          Connected as {connectedInstallation.account.login}
        </p>
      ) : null}

      {!config.data?.webhookConfigured && config.data?.configured ? (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          Webhook secret is not configured, so installation changes will not be pushed to the app.
        </p>
      ) : null}

      {onSelect ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={chooseRepository}
            disabled={!selectedRepo || link.isPending}
            loading={link.isPending}
          >
            Use this repository
          </Button>
        </div>
      ) : null}
    </div>
  );
}
