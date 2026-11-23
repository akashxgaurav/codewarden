import { useState } from "react";
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  GitBranch,
  Loader2,
  Pencil,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Modal } from "@/components/ui/Overlay";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { CloudFormationPanel } from "@/components/onboarding/CloudFormationPanel";
import { GitHubConnectPanel } from "@/components/github/GitHubConnectPanel";
import { CloudWatchStatus } from "@/components/onboarding/CloudWatchStatus";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/context/workspace-context";
import { api } from "@/lib/api/client";
import { appMode } from "@/lib/env";
import { formatDate, formatRelativeTime } from "@/lib/format";
import type { CloudFormationTemplate, Workspace } from "@/types";

export function SettingsPage() {
  const { user, updateDisplayName, getIdToken } = useAuth();
  const { workspaces, incidents, activeWorkspace, deleteWorkspace, updateWorkspace } = useWorkspace();

  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBranch, setEditBranch] = useState("");
  const [editBranches, setEditBranches] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [cloudWatchId, setCloudWatchId] = useState<string | null>(null);
  const [cloudWatchTemplate, setCloudWatchTemplate] = useState<CloudFormationTemplate | null>(null);
  const [cloudWatchError, setCloudWatchError] = useState<string | null>(null);
  const [cloudWatchLoading, setCloudWatchLoading] = useState(false);
  const [editingLogGroupId, setEditingLogGroupId] = useState<string | null>(null);
  const [logGroupDraft, setLogGroupDraft] = useState("");

  const displayName = nameDraft ?? user?.displayName ?? "";

  async function saveProfile() {
    setProfileMessage(null);
    setProfileError(null);

    try {
      await updateDisplayName(displayName);
      setNameDraft(null);
      setProfileMessage("Your profile was updated.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "The profile could not be saved.");
    }
  }

  async function openEditor(workspaceId: string) {
    const workspace = workspaces.find((item) => item.id === workspaceId);

    if (!workspace) {
      return;
    }

    setEditingId(workspaceId);
    setEditBranch(workspace.branch);
    setEditBranches(workspace.branches);
    setEditLoading(true);

    try {
      const summary = await api.listBranches(
        workspace.repoUrl,
        { getIdToken },
        workspace.github?.installationId,
      );
      setEditBranches(summary.branches);
    } catch {
      // Keep the branches that were stored during onboarding.
    } finally {
      setEditLoading(false);
    }
  }

  async function saveBranch() {
    if (!editingId) {
      return;
    }

    await updateWorkspace(editingId, { branch: editBranch });
    setEditingId(null);
  }

  async function removeWorkspace(workspaceId: string) {
    const workspace = workspaces.find((item) => item.id === workspaceId);

    if (
      !workspace ||
      !window.confirm(
        `Delete "${workspace.name}" and every error that belongs to it? This cannot be undone.`,
      )
    ) {
      return;
    }

    await deleteWorkspace(workspaceId);
  }

  /**
   * Builds the CloudFormation stack for a workspace.
   *
   * The stack carries the ingest key of the workspace, so it is built by the
   * API. It is needed again whenever the customer changes the log group or
   * has to recreate the stack.
   */
  async function openCloudWatch(workspace: Workspace) {
    setCloudWatchId(workspace.id);
    setCloudWatchTemplate(null);
    setCloudWatchError(null);
    setCloudWatchLoading(true);

    try {
      const template = await api.getCloudFormationTemplate(
        {
          workspaceId: workspace.id,
          ownerUid: user?.uid ?? "",
          logGroupName: workspace.cloudWatch?.logGroupName ?? "",
          filterPattern: workspace.cloudWatch?.filterPattern ?? undefined,
        },
        { getIdToken },
      );

      setCloudWatchTemplate(template);
    } catch (error) {
      setCloudWatchError(
        error instanceof Error
          ? error.message
          : "The CloudFormation template could not be built.",
      );
    } finally {
      setCloudWatchLoading(false);
    }
  }

  /**
   * Changes the log group of a workspace.
   *
   * The stack reads one log group, so a change means a new stack. The
   * template is handed out again right after the change, so the customer
   * knows what to do.
   */
  async function saveLogGroup(workspaceId: string, logGroupName: string) {
    const current = workspaces.find((item) => item.id === workspaceId);

    if (!current) {
      return;
    }

    await updateWorkspace(workspaceId, {
      cloudWatch: {
        ...(current.cloudWatch ?? {
          region: "eu-west-1",
          filterPattern: "",
          connected: false,
          connectedAt: null,
        }),
        logGroupName: logGroupName.trim(),
        connected: false,
        connectedAt: null,
      },
    });
  }

  /**
   * Opens the editor of the log group of a workspace.
   */
  function openLogGroupEditor(workspaceId: string) {
    const workspace = workspaces.find((item) => item.id === workspaceId);

    if (!workspace) {
      return;
    }

    setEditingLogGroupId(workspaceId);
    setLogGroupDraft(workspace.cloudWatch?.logGroupName ?? "");
  }

  async function submitLogGroup() {
    if (!editingLogGroupId) {
      return;
    }

    await saveLogGroup(editingLogGroupId, logGroupDraft);
    setEditingLogGroupId(null);

    // The stack reads the log group, so a new stack is needed.
    const workspace = workspaces.find((item) => item.id === editingLogGroupId);

    if (workspace) {
      await openCloudWatch({ ...workspace, cloudWatch: { ...workspace.cloudWatch, logGroupName: logGroupDraft.trim() } as Workspace["cloudWatch"] });
    }
  }

  const cloudWatchWorkspace = workspaces.find((item) => item.id === cloudWatchId) ?? null;

  return (
    <AppShell title="Settings" description="Your account, your workspaces and the connection to the API.">
      <div className="mx-auto max-w-4xl space-y-6">
        <Card>
          <CardHeader title="Profile" description="How you appear in the workspace." />
          <CardBody className="space-y-4">
            {profileMessage ? <Alert tone="success">{profileMessage}</Alert> : null}
            {profileError ? <Alert tone="error">{profileError}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Display name"
                value={displayName}
                onChange={(event) => setNameDraft(event.target.value)}
              />
              <Input label="Email" value={user?.email ?? ""} disabled hint="Managed by Firebase Authentication." />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => void saveProfile()}>Save profile</Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="GitHub App"
            description="Private repository access and pull request permissions for the active workspace."
          />
          <CardBody>
            {activeWorkspace ? (
              activeWorkspace.github ? (
                <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-5">
                  <GithubIcon className="mt-0.5 size-5 shrink-0 text-ink" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      GitHub App
                      <Badge tone="positive">
                        <CheckCircle2 className="size-3" />
                        Connected
                      </Badge>
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Connected as {activeWorkspace.github.account} ·{" "}
                      {formatRelativeTime(new Date(activeWorkspace.github.connectedAt).getTime())}
                    </p>
                  </div>
                </div>
              ) : (
                <GitHubConnectPanel workspace={activeWorkspace} />
              )
            ) : (
              <p className="text-sm text-ink-faint">Select a workspace to connect a GitHub App installation.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Workspaces"
            description="Every repository you monitor, with the branch that is inspected."
            action={
              <Link to="/onboarding">
                <Button variant="secondary" size="sm">
                  <PlusCircle className="size-4" />
                  Add
                </Button>
              </Link>
            }
          />
          <CardBody className="p-0">
            {workspaces.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-faint">
                You have no workspace yet.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {workspaces.map((workspace) => {
                  const count = incidents.filter(
                    (incident) => incident.workspaceId === workspace.id,
                  ).length;

                  return (
                    <li
                      key={workspace.id}
                      className="flex flex-wrap items-center gap-4 px-5 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{workspace.name}</p>
                        <a
                          href={workspace.repoDisplayUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-xs text-ink-muted hover:text-brand"
                        >
                          <GithubIcon className="size-3.5 shrink-0" />
                          {workspace.repoDisplayUrl}
                          <ExternalLink className="size-3" />
                        </a>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint">
                          <GitBranch className="size-3" />
                          {workspace.branch} · {count} error{count === 1 ? "" : "s"} · added{" "}
                          {formatDate(workspace.createdAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void openEditor(workspace.id)}
                        >
                          <Pencil className="size-3.5" />
                          Branch
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void removeWorkspace(workspace.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="CloudWatch"
            description="The log groups that feed the agent with errors, and the stack that connects them."
          />
          <CardBody className="p-0">
            {appMode === "demo" ? (
              <p className="px-5 py-10 text-center text-sm text-ink-faint">
                The demo keeps everything in the browser, so CloudWatch is not available. Connect a
                Firebase project to use it.
              </p>
            ) : workspaces.filter((workspace) => workspace.cloudWatch).length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-faint">
                No workspace reads a log group yet.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {workspaces
                  .filter((workspace) => workspace.cloudWatch)
                  .map((workspace) => (
                    <li
                      key={workspace.id}
                      className="flex flex-wrap items-center gap-4 px-5 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium text-ink">
                          <Cloud className="size-3.5 shrink-0 text-ink-faint" />
                          {workspace.name}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">
                          {workspace.cloudWatch?.logGroupName} · {workspace.cloudWatch?.region}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-faint">
                          {workspace.cloudWatch?.connected
                            ? `Connected ${formatDate(workspace.cloudWatch.connectedAt ?? 0)}`
                            : "The stack has not been created yet."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {workspace.cloudWatch?.connected ? (
                          <span className="flex items-center gap-1.5 text-xs text-positive">
                            <CheckCircle2 className="size-3.5" />
                            Connected
                          </span>
                        ) : null}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void openLogGroupEditor(workspace.id)}
                        >
                          <Pencil className="size-3.5" />
                          Log group
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void openCloudWatch(workspace)}
                        >
                          <ExternalLink className="size-3.5" />
                          Stack
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* <Card>
          <CardHeader
            title="Connections"
            description="The backend API and the database that stores your data."
          />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Plug className="size-4 text-ink-faint" />
                <div>
                  <p className="text-sm text-ink">Codewarden API</p>
                  <p className="font-mono text-[11px] text-ink-faint">{apiBaseUrl}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {health.isPending ? (
                  <span className="flex items-center gap-1.5 text-ink-faint">
                    <Loader2 className="size-3.5 animate-spin" />
                    Checking
                  </span>
                ) : health.isError ? (
                  <span className="flex items-center gap-1.5 text-critical">
                    <XCircle className="size-3.5" />
                    Unreachable
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-positive">
                    <CheckCircle2 className="size-3.5" />
                    Connected
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Database className="size-4 text-ink-faint" />
                <div>
                  <p className="text-sm text-ink">
                    {mode === "demo" ? "Local storage (demo)" : "Firebase Realtime Database"}
                  </p>
                  <p className="text-[11px] text-ink-faint">
                    {mode === "demo"
                      ? "Connect a Firebase project to store your workspaces and errors in the cloud."
                      : "Workspaces and errors are stored under /users/{uid}."}
                  </p>
                </div>
              </div>

              <span
                className={
                  mode === "demo"
                    ? "rounded-full border border-warning/30 bg-warning-dim/40 px-2.5 py-0.5 text-[11px] text-warning"
                    : "rounded-full border border-positive/30 bg-positive-dim/40 px-2.5 py-0.5 text-[11px] text-positive"
                }
              >
                {appMode === "demo" ? "Demo mode" : "Firebase"}
              </span>
            </div>
          </CardBody>
        </Card> */}
      </div>

      <Modal
        open={Boolean(editingId)}
        onClose={() => setEditingId(null)}
        title="Change the monitored branch"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveBranch()} disabled={!editBranch}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            The agent will clone this branch the next time an error is reported.
          </p>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-muted">Branch</span>
            <select
              value={editBranch}
              onChange={(event) => setEditBranch(event.target.value)}
              disabled={editLoading}
              className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              {editBranches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>

            {editLoading ? (
              <p className="text-xs text-ink-faint">Loading the branches of the repository...</p>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(editingLogGroupId)}
        onClose={() => setEditingLogGroupId(null)}
        title="Change the log group"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingLogGroupId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitLogGroup()}
              disabled={logGroupDraft.trim() === ""}
            >
              Save and get the stack
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            The stack reads one log group, so changing it means creating the stack again. The new
            stack is shown right after the change.
          </p>

          <Input
            label="CloudWatch log group"
            value={logGroupDraft}
            onChange={(event) => setLogGroupDraft(event.target.value)}
            placeholder="/aws/lambda/payments-api"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(cloudWatchId)}
        onClose={() => setCloudWatchId(null)}
        title="Connect your CloudWatch logs"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloudWatchId(null)}>
              Close
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {cloudWatchError ? (
            <Alert tone="error" title="The template could not be built">
              {cloudWatchError}
            </Alert>
          ) : null}

          {cloudWatchLoading ? (
            <p className="flex items-center gap-2 text-sm text-ink-faint">
              <Loader2 className="size-4 animate-spin" />
              Building the CloudFormation stack...
            </p>
          ) : null}

          {cloudWatchTemplate && cloudWatchWorkspace ? (
            <>
              <p className="text-sm text-ink-muted">
                This stack forwards the errors of{" "}
                <span className="font-mono text-ink">
                  {cloudWatchTemplate.logGroupName}
                </span>{" "}
                to Codewarden. Create it in your own AWS account.
              </p>

              <CloudFormationPanel
                template={cloudWatchTemplate}
                stackName={cloudWatchTemplate.stackName}
                region={cloudWatchWorkspace.cloudWatch?.region ?? "eu-west-1"}
                fileName={`codewarden-${cloudWatchTemplate.stackName}`}
              />

              {user ? (
                <CloudWatchStatus
                  workspaceId={cloudWatchWorkspace.id}
                  ownerUid={user.uid}
                  getIdToken={getIdToken}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </Modal>
    </AppShell>
  );
}
