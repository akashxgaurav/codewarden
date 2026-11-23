import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  GitBranch,
  Loader2,
  Rocket,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { BranchPicker, RepoUrlField } from "@/components/onboarding/BranchPicker";
import { CloudWatchStep } from "@/components/onboarding/CloudWatchStep";
import { CloudFormationPanel } from "@/components/onboarding/CloudFormationPanel";
import {
  GitHubConnectPanel,
  type GitHubRepoSelection,
} from "@/components/github/GitHubConnectPanel";
import { CloudWatchStatus } from "@/components/onboarding/CloudWatchStatus";
import { emptyCloudWatchConnection } from "@/lib/cloudwatch";
import { isLikelyGithubUrl } from "@/lib/validate";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/context/workspace-context";
import { api, ApiError } from "@/lib/api/client";
import { isDemoMode } from "@/lib/env";
import type {
  CloudFormationTemplate,
  CloudWatchConnection,
  GitHubConnection,
  RepositorySummary,
} from "@/types";

const schema = z.object({
  name: z.string().min(2, "Give the workspace a name.").max(60, "That name is too long."),
  repoUrl: z
    .string()
    .min(1, "A repository is required.")
    .refine(isLikelyGithubUrl, "Enter a valid GitHub url, for example https://github.com/owner/repo."),
});

type OnboardingValues = z.infer<typeof schema>;

const STEPS = ["Workspace", "Branch", "CloudWatch", "Review"] as const;

export function OnboardingPage() {
  const { user, loading, getIdToken } = useAuth();
  const { createWorkspace, onboardingComplete } = useWorkspace();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [repository, setRepository] = useState<RepositorySummary | null>(null);
  const [branch, setBranch] = useState("");
  const [installationId, setInstallationId] = useState<number | null>(null);
  const [github, setGithub] = useState<GitHubConnection | null>(null);
  const [cloudWatch, setCloudWatch] = useState<CloudWatchConnection>(
    emptyCloudWatchConnection(),
  );
  // The CloudWatch path needs a real server: it reads the workspace from the
  // Realtime Database and hands out a stack with the ingest key of the
  // workspace. In demo mode the whole app lives in the browser, so the
  // connection is not offered.
  const [useCloudWatch, setUseCloudWatch] = useState(!isDemoMode);
  const [template, setTemplate] = useState<CloudFormationTemplate | null>(null);
  // The id of the workspace that was created, needed to watch for the first
  // event of the log group.
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Creating the workspace marks the onboarding as done, which would send the
  // user to the dashboard. The CloudFormation template is still shown, so the
  // redirect waits for it.
  const [showTemplate, setShowTemplate] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", repoUrl: "" },
    mode: "onBlur",
  });

  const repoUrl = useWatch({ control, name: "repoUrl" });

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (!loading && onboardingComplete && !showTemplate) {
    return <Navigate to="/dashboard" replace />;
  }

  async function loadBranches(values: OnboardingValues) {
    setFormError(null);
    setLoadingBranches(true);

    try {
      const summary = await api.listBranches(values.repoUrl, { getIdToken }, installationId ?? undefined);

      setRepository({
        ...summary,
        private: github?.account ? true : undefined,
        installationId: installationId ?? undefined,
      });
      setBranch(summary.defaultBranch ?? summary.branches[0] ?? "");
      setStep(1);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "The repository could not be read. Check the url and try again.",
      );
    } finally {
      setLoadingBranches(false);
    }
  }

  function selectGithubRepository(selection: GitHubRepoSelection) {
    setInstallationId(selection.installationId);
    setGithub({
      installationId: selection.installationId,
      account: selection.owner,
      accountType: "User",
      suspended: false,
      repositorySelection: "all",
      htmlUrl: selection.repoUrl,
      connectedAt: new Date().toISOString(),
    });
    setValue("repoUrl", selection.repoUrl, { shouldValidate: true, shouldDirty: true });
    setFormError(null);
  }

  /**
   * Builds the CloudFormation stack for the workspace that was just created.
   *
   * The stack carries the ingest key of the workspace, so it is built by the
   * API and not in the browser.
   */
  async function buildTemplate(workspaceId: string) {
    if (!user) {
      return null;
    }

    setLoadingTemplate(true);
    setFormError(null);

    try {
      const result = await api.getCloudFormationTemplate(
        {
          workspaceId,
          ownerUid: user.uid,
          logGroupName: cloudWatch.logGroupName.trim(),
          filterPattern: cloudWatch.filterPattern.trim() || undefined,
        },
        { getIdToken },
      );

      setTemplate(result);

      return result;
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "The CloudFormation template could not be built.",
      );

      return null;
    } finally {
      setLoadingTemplate(false);
    }
  }

  async function createWorkspaceAndFinish() {
    if (!repository || !user) {
      return;
    }

    setFormError(null);
    setSubmitting(true);

    // Creating the workspace marks the onboarding as done, which sends the
    // user to the dashboard. When a template is coming, the redirect waits
    // for it.
    const wantsTemplate = useCloudWatch;

    if (wantsTemplate) {
      setShowTemplate(true);
    }

    try {
      const connection = wantsTemplate
        ? {
            ...cloudWatch,
            logGroupName: cloudWatch.logGroupName.trim(),
            filterPattern: cloudWatch.filterPattern.trim(),
            connected: false,
            connectedAt: null,
          }
        : null;

      const workspace = await createWorkspace({
        name: getValues("name").trim(),
        repoUrl: repository.repoUrl,
        displayUrl: repository.displayUrl,
        owner: repository.owner,
        repo: repository.repo,
        branch,
        defaultBranch: repository.defaultBranch,
        branches: repository.branches,
        cloudWatch: connection,
        github,
      });

      if (wantsTemplate) {
        setWorkspaceId(workspace.id);

        const built = await buildTemplate(workspace.id);

        if (!built) {
          return;
        }

        setStep(3);
        return;
      }

      navigate("/dashboard");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "The workspace could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid-noise min-h-dvh bg-canvas">
      <header className="border-b border-line px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Logo />
          <span className="text-xs text-ink-faint">Step {step + 1} of {STEPS.length}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <div
                className={
                  index <= step
                    ? "grid size-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-canvas"
                    : "grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-xs text-ink-faint"
                }
              >
                {index < step ? <CheckCircle2 className="size-4" /> : index + 1}
              </div>
              <span
                className={
                  index === step ? "text-sm font-medium text-ink" : "text-sm text-ink-faint"
                }
              >
                {label}
              </span>
              {index < STEPS.length - 1 ? (
                <div className="h-px flex-1 bg-line" />
              ) : null}
            </li>
          ))}
        </ol>

        <Card className="p-6 lg:p-8">
          {formError ? (
            <Alert tone="error" className="mb-6">
              {formError}
            </Alert>
          ) : null}

          {step === 0 ? (
            <form
              onSubmit={handleSubmit(loadBranches)}
              className="space-y-5"
              noValidate
            >
              <div>
                <h1 className="text-lg font-semibold text-ink">Set up your workspace</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  A workspace points at one repository and the branch you want to keep an eye on.
                </p>
              </div>

              <Input
                label="Workspace name"
                placeholder="Payments Platform"
                error={errors.name?.message}
                {...register("name")}
              />

              <GitHubConnectPanel compact onSelect={selectGithubRepository} />

              <RepoUrlField
                value={repoUrl}
                onChange={(value) => {
                  setInstallationId(null);
                  setGithub(null);
                  setValue("repoUrl", value, { shouldValidate: true, shouldDirty: true });
                }}
                error={errors.repoUrl?.message}
              />

              <div className="flex justify-end pt-2">
                <Button type="submit" loading={loadingBranches}>
                  {loadingBranches ? null : <ArrowRight className="size-4" />}
                  Load branches
                </Button>
              </div>
            </form>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-lg font-semibold text-ink">Pick the branch to monitor</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  The agent clones this branch, so it has to exist on the remote.
                </p>
              </div>

              <BranchPicker
                branches={repository?.branches ?? []}
                defaultBranch={repository?.defaultBranch ?? null}
                value={branch}
                onChange={setBranch}
              />

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft className="size-4" />
                  Back
                </Button>

                <Button onClick={() => setStep(2)} disabled={!branch}>
                  Continue
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              {useCloudWatch ? (
                <CloudWatchStep value={cloudWatch} onChange={setCloudWatch} />
              ) : (
                <div>
                  <h1 className="text-lg font-semibold text-ink">Report errors by hand</h1>
                  <p className="mt-1 text-sm text-ink-muted">
                    You paste the error in the dashboard and the agent investigates it. You can
                    connect CloudWatch later in the settings.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-3">
                <input
                  id="use-cloudwatch"
                  type="checkbox"
                  checked={useCloudWatch}
                  disabled={isDemoMode}
                  onChange={(event) => setUseCloudWatch(event.target.checked)}
                  className="size-4 rounded border-line bg-surface-2 accent-brand focus:ring-brand disabled:opacity-50"
                />
                <label htmlFor="use-cloudwatch" className="text-sm text-ink">
                  Read the errors from CloudWatch
                </label>
              </div>

              {isDemoMode ? (
                <Alert tone="warning">
                  The demo keeps everything in the browser, so CloudWatch is not available. Connect a
                  Firebase project to use it.
                </Alert>
              ) : null}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" />
                  Back
                </Button>

                <Button
                  onClick={() => setStep(3)}
                  disabled={useCloudWatch && cloudWatch.logGroupName.trim() === ""}
                >
                  Continue
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              {template ? (
                <>
                  <div>
                    <h1 className="text-lg font-semibold text-ink">
                      Create the stack in your AWS account
                    </h1>
                    <p className="mt-1 text-sm text-ink-muted">
                      This is the only step you have to do in AWS. The template connects{" "}
                      <span className="font-mono text-ink">{template.logGroupName}</span> to this
                      workspace.
                    </p>
                  </div>

                  <CloudFormationPanel
                    template={template}
                    stackName={template.stackName}
                    region={cloudWatch.region}
                    fileName={`codewarden-${template.stackName}`}
                  />

                  {user && workspaceId ? (
                    <CloudWatchStatus
                      workspaceId={workspaceId}
                      ownerUid={user.uid}
                      getIdToken={getIdToken}
                    />
                  ) : null}

                  <div className="flex justify-end pt-2">
                    <Button onClick={() => navigate("/dashboard")}>
                      <Rocket className="size-4" />
                      Finish
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h1 className="text-lg font-semibold text-ink">Review and start monitoring</h1>
                    <p className="mt-1 text-sm text-ink-muted">
                      This is how the workspace will look in the dashboard.
                    </p>
                  </div>

                  <dl className="divide-y divide-line rounded-lg border border-line bg-surface-2">
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-xs text-ink-faint">Workspace</dt>
                      <dd className="text-sm font-medium text-ink">{getValues("name")}</dd>
                    </div>

                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="flex items-center gap-1.5 text-xs text-ink-faint">
                        <GithubIcon className="size-3.5" />
                        Repository
                      </dt>
                      <dd className="truncate font-mono text-xs text-ink">
                        {repository?.displayUrl}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="flex items-center gap-1.5 text-xs text-ink-faint">
                        <GitBranch className="size-3.5" />
                        Branch
                      </dt>
                      <dd className="font-mono text-xs text-brand">{branch}</dd>
                    </div>

                    {useCloudWatch ? (
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <dt className="flex items-center gap-1.5 text-xs text-ink-faint">
                          <Cloud className="size-3.5" />
                          Log group
                        </dt>
                        <dd className="truncate font-mono text-xs text-ink">
                          {cloudWatch.logGroupName}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <Alert tone="info">
                    The workspace only stores the connection. The repository is cloned on the server
                    the first time an error is reported against it.
                  </Alert>

                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>

                    <Button
                      onClick={() => void createWorkspaceAndFinish()}
                      loading={submitting || loadingTemplate}
                    >
                      {submitting || loadingTemplate ? null : <Rocket className="size-4" />}
                      Start monitoring
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </Card>

        {loadingBranches ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint">
            <Loader2 className="size-3.5 animate-spin" />
            Asking GitHub for the branches of this repository
          </p>
        ) : null}
      </main>
    </div>
  );
}
