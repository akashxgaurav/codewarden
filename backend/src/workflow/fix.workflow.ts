import { createLLM } from "../llm.js";
import { diagnoseError, type FixProposal } from "../agents/diagnosis.agent.js";
import { validateProposal, resetWorkingTree, writeFile } from "../validation/regression.validator.js";
import { createBranchWithFix } from "../tools/git.tool.js";
import { createPullRequest } from "../services/github-app.service.js";
import { recordIncident, recordSolution, isChromaAvailable } from "../services/chroma/knowledge.js";
import { activityScope, type ActivityScope } from "../services/activity.service.js";
import { logger } from "../lib/logger.js";
import type { AnalysisResult, Confidence, ValidationStep } from "../types/index.js";

export interface AnalysisWorkflowOptions {
  repoDir: string;
  repoUrl: string;
  workspaceId: string;
  ownerUid?: string | null;
  jobId?: string;
  incidentId: string;
  errorReport: string;
  severity?: string;
  source?: string;
  push?: boolean;
  skipInstall?: boolean;
  installDeps?: boolean;
  installationId?: number;
  extraContext?: string;
  onProgress?: (message: string) => void;
  onActivity?: ActivityScope;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function buildBranchName(proposal: FixProposal, baseBranch: string): string {
  return `fix/${slugify(baseBranch)}-${slugify(proposal.fixPlan || "production-error")}` || "fix/production-error";
}

async function safeChroma<T>(operation: () => Promise<T>, scope: ActivityScope, label: string): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    scope.warn(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function analyzeAndFix(
  model: ReturnType<typeof createLLM>,
  options: AnalysisWorkflowOptions,
): Promise<AnalysisResult> {
  const scope = options.onActivity ?? activityScope({
    category: "analysis",
    workspaceId: options.workspaceId,
    ownerUid: options.ownerUid,
    jobId: options.jobId,
    incidentId: options.incidentId,
  });
  const report = (message: string): void => {
    options.onProgress?.(message);
    scope.step(message);
  };

  report("Agent is investigating the repository");
  const diagnosis = await diagnoseError(model, options.errorReport, {
    repoDir: options.repoDir,
    repoUrl: options.repoUrl,
    extraContext: options.extraContext,
  });

  const priorsUsed = diagnosis.priors.length;
  report(diagnosis.priorsAvailable ? `Consulted ${priorsUsed} similar past incidents` : "Knowledge base unavailable; investigating from code alone");

  const proposal = diagnosis.proposal;
  if (!proposal) {
    scope.error("The agent could not produce a diagnosis");
    return {
      status: "no_diagnosis",
      affectedFiles: [],
      incidentId: options.incidentId,
      priorsUsed,
      steps: [],
    };
  }

  report(`Root cause identified: ${proposal.rootCause.slice(0, 180)}`);

  if (await isChromaAvailable().then((result) => result.available)) {
    await safeChroma(
      () => recordIncident({
        repoId: options.repoUrl,
        repoUrl: options.repoUrl,
        incidentId: options.incidentId,
        title: proposal.rootCause.slice(0, 140),
        errorMessage: options.errorReport,
        severity: options.severity ?? "UNKNOWN",
        source: options.source ?? "MANUAL",
        workspaceId: options.workspaceId,
      }),
      scope,
      "Recording incident in knowledge base",
    );
  }

  if (!proposal.fixable) {
    scope.warn("The defect is not fixable in this repository");
    return {
      status: "not_fixable",
      rootCause: proposal.rootCause,
      confidence: proposal.confidence as Confidence,
      fixPlan: proposal.fixPlan,
      affectedFiles: [],
      incidentId: options.incidentId,
      priorsUsed,
      steps: [],
    };
  }

  report("Validating the proposed fix with a regression test");
  const validation = await validateProposal(proposal, {
    repoDir: options.repoDir,
    skipInstall: options.skipInstall,
    onStep: report,
  });

  if (!validation.validated) {
    scope.error(`Fix rejected: ${validation.reason}`);
    return {
      status: "validation_failed",
      rootCause: proposal.rootCause,
      confidence: proposal.confidence as Confidence,
      fixPlan: proposal.fixPlan,
      affectedFiles: proposal.fileChanges.map((change) => change.path),
      regressionTest: {
        path: proposal.regressionTestPath,
        description: proposal.regressionTestDescription,
      },
      validation,
      incidentId: options.incidentId,
      priorsUsed,
      steps: validation.steps,
    };
  }

  report("Validation passed; applying the fix and creating a branch");
  await resetWorkingTree(options.repoDir);
  await writeFile(options.repoDir, proposal.regressionTestPath, proposal.regressionTestContent);
  for (const change of proposal.fileChanges) {
    await writeFile(options.repoDir, change.path, change.content);
  }

  const [owner, repo] = options.repoUrl
    .replace(/\.git$/, "")
    .split("github.com/")[1]
    ?.split("/") ?? [];
  const baseBranch = await import("../tools/git.tool.js").then((mod) => mod.currentBranch(options.repoDir));
  const branchName = buildBranchName(proposal, baseBranch);
  const commitMessage = [
    `fix: ${proposal.fixPlan.slice(0, 120)}`,
    "",
    `Root cause: ${proposal.rootCause.slice(0, 500)}`,
    `Regression test: ${proposal.regressionTestPath}`,
  ].join("\n");

  const committed = await createBranchWithFix({
    repoDir: options.repoDir,
    branchName,
    message: commitMessage,
    push: options.push,
    owner,
    repo,
    installationId: options.installationId,
  });
  report(`Created branch ${committed.branch} at ${committed.commit}`);

  let pr: { url: string; number: number } | undefined;
  if (options.push && options.installationId && owner && repo) {
    try {
      report("Opening a pull request through the GitHub App");
      pr = await createPullRequest({
        owner,
        repo,
        installationId: options.installationId,
        head: branchName,
        base: baseBranch,
        title: `fix: ${proposal.fixPlan.slice(0, 120)}`,
        body: [
          "## Root cause",
          proposal.rootCause,
          "",
          "## Proposed fix",
          proposal.fixPlan,
          "",
          "## Validation",
          validation.reason,
          "",
          `Regression test: \`${proposal.regressionTestPath}\``,
          "",
          "Automatically generated by Codewarden 2.",
        ].join("\n"),
      });
      scope.success(`Pull request #${pr.number} is ready`, { url: pr.url });
    } catch (error) {
      scope.error(`The branch was pushed but the pull request could not be created: ${String(error)}`);
      logger.warn("pull request creation failed", { error: String(error) });
    }
  } else if (options.push) {
    scope.info("Branch pushed with ambient git credentials; no GitHub App installation was linked");
  }

  await safeChroma(
    () => recordSolution({
      repoId: options.repoUrl,
      repoUrl: options.repoUrl,
      incidentId: options.incidentId,
      branch: committed.branch,
      regressionTestPath: proposal.regressionTestPath,
      summary: proposal.fixPlan,
      rootCause: proposal.rootCause,
      workspaceId: options.workspaceId,
    }),
    scope,
    "Recording solution in knowledge base",
  );

  scope.success(`Fix ready on ${committed.branch}`);
  return {
    status: "fixed",
    rootCause: proposal.rootCause,
    confidence: proposal.confidence as Confidence,
    fixPlan: proposal.fixPlan,
    affectedFiles: proposal.fileChanges.map((change) => change.path),
    regressionTest: {
      path: proposal.regressionTestPath,
      description: proposal.regressionTestDescription,
    },
    branch: committed.branch,
    commit: committed.commit,
    push: options.push,
    ...(pr ? { pr } : {}),
    validation,
    incidentId: options.incidentId,
    priorsUsed,
    steps: validation.steps as ValidationStep[],
  };
}
