import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createLLM } from "../llm.js";
import { analyzeAndFix } from "../workflow/fix.workflow.js";
import { cloneRepository } from "../tools/git.tool.js";
import { cliRepoDir, removeRepoDir } from "../lib/paths.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const repoUrl = process.argv[2] ?? (await rl.question("GitHub repository URL: ")).trim();
  const branch = process.argv[3] ?? ((await rl.question("Branch [main]: ")).trim() || "main");
  const errorReport =
    process.argv[4] ??
    (await rl.question("Paste the error report (one line): ")).trim();
  rl.close();

  if (!repoUrl || !errorReport) {
    throw new Error("A repository URL and an error report are required");
  }

  const workspaceId = `cli-${Buffer.from(repoUrl).toString("base64url").slice(0, 12)}`;
  const repoDir = cliRepoDir();
  try {
    await cloneRepository({
      repoUrl,
      branch,
      targetDir: repoDir,
      onProgress: (message) => logger.info(message),
    });

    const result = await analyzeAndFix(createLLM(), {
      repoDir,
      repoUrl,
      workspaceId,
      incidentId: `cli-${Date.now()}`,
      errorReport,
      push: env.CODEWARDEN_PUSH,
      skipInstall: env.CODEWARDEN_SKIP_INSTALL,
      onProgress: (message) => logger.info(message),
    });

    logger.info("analysis finished", { status: result.status, branch: result.branch });
    if (result.rootCause) logger.info("root cause", { rootCause: result.rootCause });
    if (result.validation) logger.info("validation", { reason: result.validation.reason });
  } finally {
    await removeRepoDir(repoDir).catch((error) => {
      logger.warn("cli temporary checkout cleanup failed", { error: String(error) });
    });
  }
}

main().catch((error: unknown) => {
  logger.error("cli failed", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
