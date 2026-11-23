import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const TEST_TIMEOUT_MS = 5 * 60_000;

export interface TestRun {
  command: string;
  passed: boolean;
  exitCode: number;
  durationMs: number;
  stdout?: string;
  stderr?: string;
  output?: string;
}

export interface TestCommand {
  command: string;
  args: string[];
  kind: "node" | "python" | "java" | "go" | "unknown";
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function isPlaceholderTestScript(script: string): boolean {
  return /no test specified/i.test(script) && /\bexit\s+1\b/i.test(script);
}

export async function detectTestRunner(repoDir: string): Promise<TestCommand | null> {
  const packageJsonPath = path.join(repoDir, "package.json");
  if (await exists(packageJsonPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
        scripts?: { test?: string };
        devDependencies?: Record<string, unknown>;
      };
      const testScript = pkg.scripts?.test;
      if (testScript && !isPlaceholderTestScript(testScript)) return { command: "npm", args: ["test"], kind: "node" };
      if (pkg.devDependencies?.jest) return { command: "npx", args: ["jest"], kind: "node" };
      if (pkg.devDependencies?.vitest) return { command: "npx", args: ["vitest", "run"], kind: "node" };
      if (pkg.devDependencies?.mocha) return { command: "npx", args: ["mocha"], kind: "node" };
    } catch {
      // fall through to the built-in runner
    }
    return { command: "node", args: ["--test"], kind: "node" };
  }

  for (const marker of ["pytest.ini", "tox.ini", "setup.cfg", "pyproject.toml"]) {
    if (await exists(path.join(repoDir, marker))) {
      return { command: "python3", args: ["-m", "pytest"], kind: "python" };
    }
  }
  if (await exists(path.join(repoDir, "pom.xml"))) {
    return { command: "mvn", args: ["test"], kind: "java" };
  }
  if ((await exists(path.join(repoDir, "build.gradle"))) || (await exists(path.join(repoDir, "build.gradle.kts")))) {
    return { command: "gradle", args: ["test"], kind: "java" };
  }
  if (await exists(path.join(repoDir, "go.mod"))) {
    return { command: "go", args: ["test", "./..."], kind: "go" };
  }
  return null;
}

function testPathArgs(command: TestCommand, testPath: string): string[] {
  if (command.kind === "go") return [];
  if (command.kind === "python") return [testPath];
  if (command.kind === "java") return [`-Dtest=${path.basename(testPath, path.extname(testPath))}`];
  return [testPath];
}

function cap(value: string, limit = 20_000): string {
  return value.length > limit ? value.slice(-limit) : value;
}

export async function runTestSuite(
  repoDir: string,
  options: { testPath?: string; command?: TestCommand } = {},
): Promise<TestRun> {
  const command = options.command ?? (await detectTestRunner(repoDir));
  if (!command) throw new Error("No test runner detected in the repository");

  const args = [
    ...command.args,
    ...(options.testPath ? testPathArgs(command, options.testPath) : []),
  ];
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command.command, args, {
      cwd: repoDir,
      timeout: TEST_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    return {
      command: [command.command, ...args].join(" "),
      passed: true,
      exitCode: 0,
      durationMs: Date.now() - started,
      stdout: cap(stdout),
      stderr: cap(stderr),
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      command: [command.command, ...args].join(" "),
      passed: false,
      exitCode: typeof err.code === "number" ? err.code : 1,
      durationMs: Date.now() - started,
      stdout: cap(err.stdout ?? ""),
      stderr: cap(err.stderr ?? ""),
      output: cap(`${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`),
    };
  }
}
