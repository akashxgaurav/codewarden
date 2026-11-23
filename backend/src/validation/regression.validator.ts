import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveInside, cliRepoDir } from "../lib/paths.js";
import { detectTestRunner, runTestSuite, type TestCommand, type TestRun } from "../tools/test.tool.js";
import type { FixProposal } from "../agents/diagnosis.agent.js";
import type { ValidationOutcome, ValidationStep } from "../types/index.js";

const execFileAsync = promisify(execFile);
const INSTALL_TIMEOUT_MS = 8 * 60_000;

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function runGit(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoDir,
    timeout: 120_000,
    maxBuffer: 20_000_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

export async function writeFile(repoDir: string, relativePath: string, content: string): Promise<void> {
  const target = resolveInside(repoDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

export async function resetWorkingTree(repoDir: string): Promise<void> {
  await runGit(repoDir, ["checkout", "--", "."]).catch(() => undefined);
  await runGit(repoDir, ["clean", "-fdq", "-e", "node_modules", "-e", "venv", "-e", ".venv"]).catch(() => undefined);
}

async function ensureDependencies(repoDir: string, runner: TestCommand | null) {
  if (!runner || runner.kind !== "node") return { installed: false, skipped: true };
  if (await exists(path.join(repoDir, "node_modules"))) return { installed: false, skipped: true };

  const hasLock =
    (await exists(path.join(repoDir, "package-lock.json"))) ||
    (await exists(path.join(repoDir, "yarn.lock"))) ||
    (await exists(path.join(repoDir, "pnpm-lock.yaml")));
  const args = hasLock ? ["ci", "--no-audit", "--no-fund"] : ["install", "--no-audit", "--no-fund"];
  try {
    await execFileAsync("npm", args, {
      cwd: repoDir,
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: 20_000_000,
      env: { ...process.env, CI: "1" },
    });
    return { installed: true, skipped: false, command: `npm ${args.join(" ")}` };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return { installed: false, skipped: false, error: String(err.stderr || err.message).slice(0, 2000) };
  }
}

export function summarize(result: TestRun): string {
  return [result.command, result.passed ? "PASSED" : "FAILED", `exit=${result.exitCode}`, result.output ?? result.stdout ?? ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function step(name: string, result: TestRun): ValidationStep {
  return {
    name,
    command: result.command,
    passed: result.passed,
    exitCode: result.exitCode,
    output: summarize(result),
  };
}

function stripNumberedPrefixes(content: string): string {
  const lines = content.split("\n");
  if (lines.length === 0) return content;
  const pattern = /^\s*\d+\s+\|\s?/;
  let matches = 0;
  for (const line of lines) {
    if (pattern.test(line)) matches += 1;
  }
  if (matches >= Math.max(1, Math.floor(lines.length * 0.8))) {
    return lines.map((line) => line.replace(pattern, "")).join("\n");
  }
  return content;
}

function failure(reason: string, steps: ValidationStep[], extra?: Partial<ValidationOutcome>): ValidationOutcome {
  return { validated: false, reason, steps, ...extra };
}

export async function validateProposal(
  proposal: FixProposal | null,
  options: { repoDir?: string; skipInstall?: boolean; onStep?: (message: string) => void } = {},
): Promise<ValidationOutcome> {
  const repoDir = options.repoDir ?? cliRepoDir();
  const steps: ValidationStep[] = [];
  const note = (message: string): void => {
    steps.push({ name: message, passed: true });
    options.onStep?.(message);
  };

  if (!proposal?.regressionTestContent || !proposal?.regressionTestPath) {
    return failure("The diagnosis did not include a regression test, so the fix could not be validated.", steps);
  }
  if (!proposal.fileChanges.length) {
    return failure("The diagnosis did not include any file changes, so the fix could not be validated.", steps);
  }

  const runner = await detectTestRunner(repoDir);
  if (!runner) {
    return failure("No test runner could be detected for this repository, so the fix could not be validated.", steps);
  }
  note(`Detected test runner: ${[runner.command, ...runner.args].join(" ")}`);

  await resetWorkingTree(repoDir);
  if (!options.skipInstall) {
    const install = await ensureDependencies(repoDir, runner);
    if (install.installed) note(`Installed dependencies (${install.command})`);
    else if (install.error) note(`Dependency install failed: ${install.error}`);
  }

  const testPath = proposal.regressionTestPath;
  await writeFile(repoDir, testPath, stripNumberedPrefixes(proposal.regressionTestContent));

  let before: TestRun;
  try {
    before = await runTestSuite(repoDir, { testPath, command: runner });
  } catch (error) {
    await resetWorkingTree(repoDir);
    return failure(`The regression test could not be executed: ${String(error)}`, steps);
  }
  steps.push(step("Regression test against unfixed code (must fail)", before));
  options.onStep?.(`Regression test on unfixed code: ${before.passed ? "PASSED" : "FAILED"}`);

  if (before.passed) {
    await resetWorkingTree(repoDir);
    return failure(
      "The regression test passed against the unfixed code, so it does not reproduce the reported error. The proposed fix was rejected.",
      steps,
      { before },
    );
  }

  for (const change of proposal.fileChanges) {
    await writeFile(repoDir, change.path, stripNumberedPrefixes(change.content));
  }

  let after: TestRun;
  try {
    after = await runTestSuite(repoDir, { testPath, command: runner });
  } catch (error) {
    await resetWorkingTree(repoDir);
    return failure(`The regression test could not be executed after applying the fix: ${String(error)}`, steps, { before });
  }
  steps.push(step("Regression test after applying the fix (must pass)", after));
  options.onStep?.(`Regression test with fix applied: ${after.passed ? "PASSED" : "FAILED"}`);

  if (!after.passed) {
    await resetWorkingTree(repoDir);
    return failure(
      "The regression test still failed after applying the proposed fix, so the fix does not resolve the issue. No branch was created.",
      steps,
      { before, after },
    );
  }

  let full: TestRun;
  try {
    full = await runTestSuite(repoDir, { command: runner });
  } catch (error) {
    await resetWorkingTree(repoDir);
    return failure(`The full test suite could not be executed: ${String(error)}`, steps, { before, after });
  }
  steps.push(step("Full test suite (must pass)", full));
  options.onStep?.(`Full test suite: ${full.passed ? "PASSED" : "FAILED"}`);

  if (!full.passed) {
    await resetWorkingTree(repoDir);
    return failure(
      "The full test suite failed after applying the fix, so the fix introduces a regression. No branch was created.",
      steps,
      { before, after, full },
    );
  }

  return {
    validated: true,
    reason: "The regression test fails on the unfixed code, passes with the fix applied, and the full suite still passes.",
    steps,
    before,
    after,
    full,
  };
}
